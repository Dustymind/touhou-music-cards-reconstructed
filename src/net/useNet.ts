/** 联机 React 层：把传输层 + 引擎接到对局 store 与界面上。
 *
 * 角色分工：
 * - 主机：本地动作直接改 `useGame`；store 变化后自动广播快照（订阅式，永远不会漏发）；
 * - 客户端：本地动作改发**意图**，状态只由主机快照覆盖。
 */
import { create } from "zustand";

import { useGame } from "../game/useGame";
import { useSession } from "../store/session";
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

/** `?peerhost=127.0.0.1&peerport=9100&peerpath=/&peersecure=0` 指向自建信令服务器。 */
export function peerServerOptions(search = typeof window === "undefined" ? "" : window.location.search) {
  const params = new URLSearchParams(search);
  const port = params.get("peerport");
  return {
    host: params.get("peerhost") ?? undefined,
    port: port ? Number(port) : undefined,
    path: params.get("peerpath") ?? undefined,
    secure: params.get("peersecure") === undefined ? undefined : params.get("peersecure") !== "0",
  };
}

/** 链接里带了 `?peerhost=` / `?peerport=` / `?peer=1` 时，默认勾选"跨机器联机（PeerJS）"，
 *  这样分享出去带信令参数的链接打开即可直接开房/加入。 */
export function peerModeFromSearch(
  search = typeof window === "undefined" ? "" : window.location.search,
): boolean {
  const params = new URLSearchParams(search);
  return params.has("peerhost") || params.has("peerport") || params.get("peer") === "1";
}

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
  if (mode === "peer") return new PeerTransport(role, roomId, peerServerOptions());
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
        // 音乐模式随快照下发：两端必须同模式，否则"当前模式下可用"的判定会分叉
        getMusicMode: () => useSession.getState().musicMode,
        applyMusicMode: (mode) => useSession.getState().setMusicMode(mode),
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
        getMusicMode: () => useSession.getState().musicMode,
        applyMusicMode: (mode) => useSession.getState().setMusicMode(mode),
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

// 开发/E2E 调试钩子（仅 dev 构建挂到 window，生产构建里不存在）
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __TMC_NET__?: unknown }).__TMC_NET__ = useNet;
}

/** 主机侧把意图落到本地 store（复用规则层）。 */
export function applyIntentLocally(intent: ClientIntent, from: number): void {
  const game = useGame.getState();
  switch (intent.kind) {
    case "pick": {
      // 抢拍者永远是意图的发送方，客户端自报的 player 不可信
      game.pick(from, intent.side, intent.slot, intent.timestamp);
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
    // 牌组编辑（自定义卡组 / 补满 / 打乱 / 清空）：只有主机能改别人的牌库，
    // 客户端只能动自己那一份（`from` 是发送方下标，不可信的自报字段一律不用）
    // 指定交牌：交牌方就是发送方（规则层再校验"只有欠牌的人才能交"）
    case "giveCard": {
      game.giveCard(from, intent.fromSlot, from === 0 ? 1 : 0, intent.toSlot);
      return;
    }
    case "moveDeckCard": {
      // 客户端只能挪自己那张（可以挪到对手牌库，与拖拽语义一致）
      if (from !== 0 && intent.player !== from) return;
      game.moveDeckCard(intent.player, intent.fromSlot, intent.toPlayer, intent.toSlot);
      return;
    }
    case "addCard":
    case "removeCard":
    case "clearDeck":
    case "fillDeck":
    case "shuffleDeck": {
      if (from !== 0 && intent.player !== from) return;
      switch (intent.kind) {
        case "addCard": {
          game.addCard(intent.player, intent.card, intent.slot);
          return;
        }
        case "removeCard": {
          game.removeCard(intent.player, intent.slot);
          return;
        }
        case "clearDeck": {
          game.clear(intent.player);
          return;
        }
        case "fillDeck": {
          game.fill(intent.player);
          return;
        }
        case "shuffleDeck": {
          game.shuffle(intent.player);
          return;
        }
      }
      return;
    }
    default:
      void from;
  }
}
