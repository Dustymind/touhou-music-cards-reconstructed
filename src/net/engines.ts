/** 主机 / 客户端引擎：把传输层消息接到对局状态上。
 *
 * 主机权威：客户端只发**意图**，主机校验后落进自己的 `useGame` 状态，再把完整快照广播出去。
 * 这样任意时刻两端都能收敛，重连也只要一份快照。
 */
import type { GameState } from "../game/types";
import {
  PROTOCOL_VERSION, type ClientIntent, type HostMessage, type MusicModeWire, type PeerInfo,
  dataHashMismatch,
} from "./protocol";
import type { Transport } from "./transport";

interface EngineDeps {
  /** 主机：读取/覆盖本地权威状态；客户端：只覆盖 */
  getState: () => GameState;
  applyState: (state: GameState) => void;
  /** 音乐模式：主机读取 / 客户端采用（缺字段时保持本地不动，与 v2 的 d7f4ad4 一致） */
  getMusicMode?: () => MusicModeWire;
  applyMusicMode?: (mode: MusicModeWire) => void;
  /** 主机：把客户端意图落到本地 store（复用 UI 用的那些动作） */
  applyIntent?: (intent: ClientIntent, from: number) => void;
  /** 静态数据哈希（两端必须一致） */
  dataHash: string;
  selfName: string;
  onChat?: (from: number, text: string, isSystem: boolean) => void;
  onError?: (message: string) => void;
  onPeers?: (peers: PeerInfo[]) => void;
}

export interface HostEngine {
  dispose: () => void;
  broadcastSnapshot: () => void;
  peers: () => PeerInfo[];
}

interface ClientEngine {
  dispose: () => void;
  requestSync: () => void;
  myIndex: () => number | null;
}

function nextFreeIndex(used: Set<number>): number {
  let index = 1;
  while (used.has(index)) index += 1;
  return index;
}

export function createHostEngine(transport: Transport, deps: EngineDeps): HostEngine {
  const indexByFrom = new Map<number, number>();
  const infoByFrom = new Map<number, PeerInfo>();
  let seq = 0;

  const peerList = (): PeerInfo[] => [
    { index: 0, name: deps.selfName, isObserver: false, isHost: true, dataHash: deps.dataHash },
    ...[...infoByFrom.entries()]
      .sort((a, b) => (indexByFrom.get(a[0]) ?? 0) - (indexByFrom.get(b[0]) ?? 0))
      .map(([, info]) => info),
  ];

  const publishPeers = (): void => {
    const peers = peerList();
    deps.onPeers?.(peers);
    transport.broadcast({ kind: "peers", peers });
  };

  const broadcastSnapshot = (): void => {
    seq += 1;
    // 音乐模式随快照下发：两端模式不同的话，"当前模式下可用"的判定会不同 → 轮换分叉
    transport.broadcast({ kind: "snapshot", state: deps.getState(), seq, musicMode: deps.getMusicMode?.() });
  };

  const off = transport.onMessage((from, message) => {
    const intent = message as ClientIntent;
    switch (intent.kind) {
      case "hello": {
        if (intent.protocol !== PROTOCOL_VERSION) {
          transport.sendTo(from, { kind: "reject", reason: "protocol", detail: `protocol ${intent.protocol}` });
          return;
        }
        if (dataHashMismatch(intent.dataHash, deps.dataHash)) {
          transport.sendTo(from, { kind: "reject", reason: "data", detail: "static data hash mismatch" });
          return;
        }
        const used = new Set(indexByFrom.values());
        const index = indexByFrom.get(from) ?? nextFreeIndex(used);
        indexByFrom.set(from, index);
        infoByFrom.set(from, {
          index, name: intent.name, isObserver: intent.isObserver, isHost: false,
          dataHash: intent.dataHash,
        });
        transport.sendTo(from, {
          kind: "welcome",
          yourIndex: index,
          peers: peerList(),
          state: deps.getState(),
          seq,
          musicMode: deps.getMusicMode?.(),
          melee: infoByFrom.size + 1 > 2,
        });
        deps.onChat?.(index, `${intent.name} connected`, true);
        publishPeers();
        return;
      }
      case "chat": {
        const index = indexByFrom.get(from) ?? 0;
        transport.broadcast({ kind: "chat", from: index, text: intent.text }, from);
        deps.onChat?.(index, intent.text, false);
        return;
      }
      case "requestSync": {
        transport.sendTo(from, { kind: "snapshot", state: deps.getState(), seq });
        return;
      }
      default: {
        const index = indexByFrom.get(from);
        if (index === undefined) {
          // 还没握手就发意图：拒绝并提示重连
          transport.sendTo(from, { kind: "goodbye", reason: "not welcomed" });
          return;
        }
        deps.applyIntent?.(intent, index);
        broadcastSnapshot();
      }
    }
  });

  const offLeave = transport.onPeerLeave((from) => {
    const info = infoByFrom.get(from);
    if (!info) return;
    indexByFrom.delete(from);
    infoByFrom.delete(from);
    deps.onChat?.(info.index, `${info.name} disconnected`, true);
    publishPeers();
  });

  return {
    dispose: () => {
      off();
      offLeave();
    },
    broadcastSnapshot,
    peers: peerList,
  };
}

export function createClientEngine(transport: Transport, deps: EngineDeps): ClientEngine {
  let lastSeq = -1;
  let myIndex: number | null = null;

  const off = transport.onMessage((_from, message) => {
    const host = message as HostMessage;
    switch (host.kind) {
      case "welcome": {
        myIndex = host.yourIndex;
        lastSeq = host.seq;
        deps.applyState(host.state);
        if (host.musicMode) deps.applyMusicMode?.(host.musicMode);
        deps.onPeers?.(host.peers);
        return;
      }
      case "snapshot": {
        if (host.seq < lastSeq) return;   // 旧快照忽略（乱序保护）
        lastSeq = host.seq;
        deps.applyState(host.state);
        if (host.musicMode) deps.applyMusicMode?.(host.musicMode);
        return;
      }
      case "peers": {
        deps.onPeers?.(host.peers);
        return;
      }
      case "chat": {
        deps.onChat?.(host.from, host.text, Boolean(host.system));
        return;
      }
      case "reject": {
        deps.onError?.(host.reason === "data"
          ? "静态数据不一致（两端的 public/data 必须相同）"
          : host.reason === "protocol" ? `协议版本不一致：${host.detail}` : `无法加入：${host.detail}`);
        return;
      }
      case "goodbye": {
        deps.onError?.(`与主机断开：${host.reason}`);
        return;
      }
    }
  });

  return {
    dispose: off,
    requestSync: () => transport.sendToHost({ kind: "requestSync" }),
    myIndex: () => myIndex,
  };
}

export function helloIntent(name: string, isObserver: boolean, dataHash: string): ClientIntent {
  return { kind: "hello", name, isObserver, dataHash, protocol: PROTOCOL_VERSION };
}
