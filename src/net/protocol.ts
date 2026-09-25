/** 联机协议：主机权威 + 快照同步。
 *
 * 与上游（事件回放 + 增量事件）的差别：这里主机在**每次接受动作后广播完整快照**并带自增 `seq`。
 * 状态很小（几百字节到几 KB），换来的是"任意时刻都能收敛、重连只要一份快照、无需处理丢事件"，
 * 直接满足"必须保证多人模式同步"的硬要求。协议版本与数据哈希在握手时校验，不一致就拒绝开局。
 *
 * 种子（D104）：随机数一律由**主机**决定，客户端只接收主机配置（`SessionConfigWire`）——
 * 不再有"两端各自 `Math.random` 近似一下"的空间。
 */
import type { CardInfo, GameState, MatchMode } from "../game/types";
import type { Seed } from "../rng";

/** 4：数据按音乐模式分成两份数据集 ⇒ 握手要交换**两个**数据哈希（契约 `docs/otomads-separation-v1.md` §6 C3）。
 *  3：`SessionConfig`（音乐模式 + 会话种子）替代原来的 `musicMode` 字段；新增 `rerollQueue` 意图。 */
export const PROTOCOL_VERSION = 4;

/** 两个模式各自的数据哈希：任一不同都拒绝，且都在**握手期**拒（D107 §6 的初衷）。 */
export interface DataHashes {
  originals: string;
  otomads: string;
}

/** 主机下发的会话配置：客户端**采用**它，而不是自己决定这些值。 */
export interface SessionConfigWire {
  /** 音乐模式：两端不同的话"当前模式下可用"的判定会分叉 */
  musicMode: MusicModeWire;
  /** 会话种子：主机生成（`useSeeds`），客户端采用后两端派生结果一致 */
  sessionSeed: Seed;
}

export interface PeerInfo {
  index: number;
  name: string;
  isObserver: boolean;
  isHost: boolean;
  /** 该端的静态数据哈希：**一个模式一个**（`public/data/index.json` 与 `public/data/otomads/index.json`） */
  dataHash: DataHashes;
}

/** 客户端 → 主机的意图（主机负责校验与落地）。 */
export type ClientIntent =
  | { kind: "hello"; name: string; isObserver: boolean; dataHash: DataHashes; protocol: number }
  | { kind: "pick"; side: 0 | 1; slot: number; timestamp: number }
  | { kind: "confirmStart" }
  | { kind: "confirmNext" }
  | { kind: "give" }
  | { kind: "chat"; text: string }
  | { kind: "addCard"; player: number; card: CardInfo; slot?: number }
  | { kind: "removeCard"; player: number; slot: number }
  | { kind: "clearDeck"; player: number }
  | { kind: "fillDeck"; player: number }
  | { kind: "shuffleDeck"; player: number }
  | { kind: "moveDeckCard"; player: number; fromSlot: number; toPlayer: number; toSlot: number }
  | { kind: "giveCard"; fromSlot: number; toSlot: number }
  | { kind: "adjustDeckSize"; rows: number; columns: number }
  | { kind: "setMode"; mode: MatchMode }
  | { kind: "setTraditional"; traditional: boolean }
  /** 「按卡组筛选音乐」开关：开 = 轮播只留卡槽里还有牌的角色；关 = 恢复完整轮播 */
  | { kind: "filterMusicByDeck"; enabled: boolean }
  /** 重新抽选轮播：换种子是主机的事，客户端只能请求（D104） */
  | { kind: "rerollQueue" }
  | { kind: "requestSync" };

/** 主机 → 客户端。 */
export type HostMessage =
  | {
    kind: "welcome"; yourIndex: number; peers: PeerInfo[]; state: GameState; seq: number;
    melee: boolean; config?: SessionConfigWire;
  }
  | { kind: "snapshot"; state: GameState; seq: number; config?: SessionConfigWire }
  | { kind: "peers"; peers: PeerInfo[] }
  | { kind: "chat"; from: number; text: string; system?: boolean }
  | { kind: "reject"; reason: "protocol" | "data" | "full"; detail: string }
  | { kind: "goodbye"; reason: string };

/** 音乐模式（原曲 / 音MAD）的协议表示：与 `src/music/mode.ts` 的 `MusicMode` 同形，
 *  但协议层不 import UI 模块，避免耦合。 */
type MusicModeWire = "originals" | "otomads";

export type Message = ClientIntent | HostMessage;

/** 状态摘要：用于两端一致性自检（角色 / 牌库 / 收集 / 回合）。 */
export function stateDigest(state: GameState): string {
  const parts: string[] = [
    `st=${state.state}`,
    `turn=${state.turnSeq}`,
    `cur=${state.currentKey ?? "-"}`,
    `gives=${state.givesLeft}`,
    `winner=${state.winner ?? "-"}`,
    `mode=${state.mode}`,
    `seed=${state.gameSeed}`,
    `filter=${state.filterByDeck ? 1 : 0}`,
    `rows=${state.deckRows}x${state.deckColumns}`,
  ];
  state.players.forEach((player, index) => {
    const deck = player.deck.map((card) => (card ? `${card.characterKey}:${card.cardIndex}` : "-")).join(",");
    const collected = player.collected.map((card) => `${card.characterKey}:${card.cardIndex}`).join(",");
    parts.push(`p${index}[${deck}|${collected}]`);
  });
  // 抢拍记录也是状态的一部分（决定谁抢到、卡片染色），必须进摘要
  const picks = state.pickEvents
    .map((event) => `${event.player}@${event.side}:${event.slot}:${event.card.characterKey}`)
    .join(",");
  parts.push(`picks=${picks}`);
  return parts.join(" ");
}

/** 两个模式各比一次：**任一模式的数据不同就拒绝**（不等到切模式才发现）。 */
export function dataHashMismatch(a: DataHashes, b: DataHashes): boolean {
  return a.originals.slice(0, 12) !== b.originals.slice(0, 12)
    || a.otomads.slice(0, 12) !== b.otomads.slice(0, 12);
}
