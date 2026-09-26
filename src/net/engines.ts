/** 主机 / 客户端引擎：把传输层消息接到对局状态上。
 *
 * 主机权威：客户端只发**意图**，主机校验后落进自己的 `useGame` 状态，再把完整快照广播出去。
 * 这样任意时刻两端都能收敛，重连也只要一份快照。
 */
import type { GameState } from "../game/types";
import {
  PROTOCOL_VERSION, type ClientIntent, type DataHashes, type HostMessage, type PeerInfo, type SessionConfigWire,
  dataHashMismatch, mismatchDetail,
} from "./protocol";
import type { Transport } from "./transport";

interface EngineDeps {
  /** 主机：读取/覆盖本地权威状态；客户端：只覆盖 */
  getState: () => GameState;
  applyState: (state: GameState) => void;
  /** 客户端：采用主机下发的会话配置（D104） */
  applyConfig?: (config: SessionConfigWire) => void;
  /** 主机：把客户端意图落到本地 store（复用 UI 用的那些动作） */
  applyIntent?: (intent: ClientIntent, from: number) => void;
  /** 静态数据哈希（两端必须一致） */
  dataHash: DataHashes;
  selfName: string;
  onChat?: (from: number, text: string, isSystem: boolean) => void;
  onError?: (message: string) => void;
  onPeers?: (peers: PeerInfo[]) => void;
  /** 客户端：主机说"数据不同"时**顺便给过来的**自定义源链接（F3）——
   *  "本地空就自动采用、本地有别的值就问用户"这两条路都由调用方（`useNet`）决定。 */
  onCustomSourceHint?: (url: string, detail: string) => void;
}

/** 主机引擎的依赖：比客户端多一项"**读**会话配置" —— 快照要带着它下发（音乐模式 + 会话种子，D104）。
 *
 * 配置的流向是**主机读、客户端采用**，所以 `getConfig` 只属于这里：
 * 客户端引擎拿不到（也不该拿到）它，写错了就是编译错误 ✓。
 */
interface HostEngineDeps extends EngineDeps {
  getConfig: () => SessionConfigWire;
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

export function createHostEngine(transport: Transport, deps: HostEngineDeps): HostEngine {
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
    // 会话配置随快照下发：音乐模式两端不同 → "当前模式下可用"的判定分叉；
    // 会话种子两端不同 → 派生出来的曲目/CPU 决策分叉（D104）
    transport.broadcast({ kind: "snapshot", state: deps.getState(), seq, config: deps.getConfig() });
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
          // 人话：指明是哪个模式的数据不同（两个模式都不同就都列出来）
          const detail = mismatchDetail(intent.dataHash, deps.dataHash);
          // 模式 3 的数据由使用者自己托管 ⇒ 光说"不一致"没法自救：主机**自己有源**时把它一起发过去
          // （客户端本地空就自动采用、有别的值就问用户，F3）。别的模式没有这回事 ⇒ 不带这个字段。
          const config = deps.getConfig();
          const ownSource = config.musicMode === "custom" ? (config.customSourceUrl ?? "") : "";
          transport.sendTo(from, {
            kind: "reject", reason: "data", detail,
            ...(ownSource ? { customSourceUrl: ownSource } : {}),
          });
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
          config: deps.getConfig(),
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
        transport.sendTo(from, { kind: "snapshot", state: deps.getState(), seq, config: deps.getConfig() });
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
        if (host.config) deps.applyConfig?.(host.config);
        deps.onPeers?.(host.peers);
        return;
      }
      case "snapshot": {
        if (host.seq < lastSeq) return;   // 旧快照忽略（乱序保护）
        lastSeq = host.seq;
        deps.applyState(host.state);
        if (host.config) deps.applyConfig?.(host.config);
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
          ? `静态数据不一致：${host.detail}（两端的 public/data 或自定义源必须相同）`
          : host.reason === "protocol" ? `协议版本不一致：${host.detail}` : `无法加入：${host.detail}`);
        // 主机给了它自己的自定义源 ⇒ 交给调用方决定"自动采用"还是"问用户"（F3）
        if (host.reason === "data" && host.customSourceUrl) {
          deps.onCustomSourceHint?.(host.customSourceUrl, host.detail);
        }
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

export function helloIntent(
  name: string, isObserver: boolean, dataHash: DataHashes, customSourceUrl = "",
): ClientIntent {
  return {
    kind: "hello", name, isObserver, dataHash, protocol: PROTOCOL_VERSION,
    // 空串不发：主机据此判"对面还没配源"（F3 的自动采用那条路）
    ...(customSourceUrl ? { customSourceUrl } : {}),
  };
}
