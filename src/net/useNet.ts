/** 联机 React 层：把传输层 + 引擎接到对局 store 与界面上。
 *
 * 角色分工：
 * - 主机：本地动作直接改 `useGame`；store 变化后自动广播快照（订阅式，永远不会漏发）；
 * - 客户端：本地动作改发**意图**，状态只由主机快照覆盖。
 */
import { create } from "zustand";

import { useGame } from "../game/useGame";
import type { MatchMode } from "../game/types";
import { createClientEngine, createHostEngine, helloIntent, type HostEngine } from "./engines";
import { PeerTransport } from "./peer";
import { stateDigest, type ClientIntent, type PeerInfo } from "./protocol";
import { BroadcastChannelTransport, BusHub, supportsBroadcastChannel, type Role, type Transport } from "./transport";

export type NetStatus = "offline" | "hosting" | "connected" | "error";

export interface ChatLine {
  from: string;
  text: string;
  system: boolean;
}

export interface NetApi {
  status: NetStatus;
  role: Role | null;
  myIndex: number;
  roomId: string;
  shareCode: string | null;
  peers: PeerInfo[];
  chat: ChatLine[];
  error: string | null;
  digest: string;
  sendChat: (text: string) => void;
  host: (options?: { roomId?: string; name?: string; peer?: boolean }) => Promise<string>;
  join: (options: { roomId: string; name?: string; observer?: boolean; peer?: boolean }) => void;
  leave: () => void;
  /** 把本地动作包成"主机直接执行 / 客户端发意图" */
  intent: (intent: ClientIntent) => void;
}

/** 测试与"同页多实例"用：可替换传输工厂。 */
export type TransportMode = "local" | "peer";

export let transportFactory: (role: Role, roomId: string, mode: TransportMode) => Transport =
  defaultTransportFactory;
export function __setTransportFactory(factory: typeof transportFactory): void {
  transportFactory = factory;
}

const hubForTests = new BusHub();
export function __busHub(): BusHub {
  return hubForTests;
}

function defaultTransportFactory(role: Role, roomId: string, mode: TransportMode): Transport {
  if (mode === "peer") return new PeerTransport(role, roomId);
  if (supportsBroadcastChannel()) {
    return new BroadcastChannelTransport(role, role === "host" ? 0 : Math.floor(Math.random() * 100000) + 1, roomId);
  }
  return hubForTests.connect(role);
}

let transport: Transport | null = null;
let hostEngine: HostEngine | null = null;
let unsubscribeStore: (() => void) | null = null;
let disposeEngine: (() => void) | null = null;
const disposeMessage: Array<() => void> = [];

function resetConnection(): void {
  for (const off of disposeMessage.splice(0)) off();
  disposeEngine?.();
  disposeEngine = null;
  unsubscribeStore?.();
  unsubscribeStore = null;
  hostEngine = null;
  transport?.close();
  transport = null;
}

export const useNet = create<NetApi>((set, get) => {
  const pushChat = (line: ChatLine) => set((state) => ({ chat: [...state.chat, line].slice(-200) }));

  const dataHash = (): string =>
    (window as unknown as { __TMC_DATA_HASH__?: string }).__TMC_DATA_HASH__ ?? "";

  return {
    status: "offline",
    role: null,
    myIndex: 0,
    roomId: "",
    shareCode: null,
    peers: [],
    chat: [],
    error: null,
    digest: "",

    sendChat(text) {
      if (!transport || !text.trim()) return;
      if (get().role === "host") {
        pushChat({ from: "You", text, system: false });
        transport.broadcast({ kind: "chat", from: 0, text });
      } else {
        transport.sendToHost({ kind: "chat", text });
      }
    },

    async host(options = {}) {
      resetConnection();
      const roomId = options.roomId ?? Math.random().toString(36).slice(2, 8);
      const name = options.name ?? "Host";
      transport = transportFactory("host", roomId, options.peer ? "peer" : "local");
      set({ status: "hosting", role: "host", myIndex: 0, roomId, shareCode: roomId, error: null });

      hostEngine = createHostEngine(transport, {
        getState: () => useGame.getState().game,
        applyState: (state) => useGame.setState({ game: state }),
        applyIntent: (intent, from) => applyIntentLocally(intent, from),
        dataHash: dataHash(),
        selfName: name,
        onChat: (from, text, system) => pushChat({ from: from === 0 ? name : `P${from}`, text, system }),
        onError: (message) => set({ error: message }),
        onPeers: (peers) => set({ peers }),
      });

      // 主机状态一变就广播快照（订阅式，不依赖每个动作手动调用）
      let lastDigest = "";
      unsubscribeStore = useGame.subscribe((slice) => {
        const digest = stateDigest(slice.game);
        if (digest === lastDigest) return;
        lastDigest = digest;
        set({ digest });
        hostEngine?.broadcastSnapshot();
      });
      set({ digest: stateDigest(useGame.getState().game) });
      return roomId;
    },

    join(options) {
      resetConnection();
      const { roomId } = options;
      const name = options.name ?? "Guest";
      transport = transportFactory("client", roomId, options.peer ? "peer" : "local");
      set({ status: "connected", role: "client", roomId, shareCode: null, error: null, myIndex: 1 });

      const engine = createClientEngine(transport, {
        getState: () => useGame.getState().game,
        applyState: (state) => {
          useGame.setState({ game: state });
          set({ digest: stateDigest(state) });
        },
        dataHash: dataHash(),
        selfName: name,
        onChat: (from, text, system) => pushChat({ from: `P${from}`, text, system }),
        onError: (message) => set({ error: message, status: "error" }),
        onPeers: (peers) => set({ peers }),
      });
      disposeEngine = engine.dispose;
      transport.sendToHost(helloIntent(name, Boolean(options.observer), dataHash()));
    },

    leave() {
      resetConnection();
      set({ status: "offline", role: null, peers: [], shareCode: null, error: null, digest: "" });
    },

    intent(intent) {
      const role = get().role;
      if (role === "host" || role === null) {
        applyIntentLocally(intent, 0);
        return;
      }
      if (role === "client") transport?.sendToHost(intent);
    },
  };
});

/** 主机侧把意图落到本地 store（复用规则层）。 */
export function applyIntentLocally(intent: ClientIntent, from: number): void {
  const game = useGame.getState();
  switch (intent.kind) {
    case "pick": {
      game.pick(intent.side, intent.slot);
      return;
    }
    case "confirmStart": {
      useGame.setState({ game: useGame.getState().game });
      game.start();
      return;
    }
    case "confirmNext": {
      game.next();
      return;
    }
    case "give": {
      game.give();
      return;
    }
    case "adjustDeckSize": {
      game.resize(intent.rows, intent.columns);
      return;
    }
    case "setMode": {
      game.setMode(intent.mode as MatchMode);
      return;
    }
    case "setTraditional": {
      game.setTraditional(intent.traditional);
      return;
    }
    case "filterMusicByDeck": {
      game.filterByDeck();
      return;
    }
    case "addCard":
    case "removeCard":
    case "clearDeck": {
      if (intent.kind === "clearDeck") game.clear(intent.player);
      return;
    }
    default:
      void from;
  }
}
