/** 联机协议：主机权威 + 快照同步。
 *
 * 与上游（事件回放 + 增量事件）的差别：这里主机在**每次接受动作后广播完整快照**并带自增 `seq`。
 * 状态很小（几百字节到几 KB），换来的是"任意时刻都能收敛、重连只要一份快照、无需处理丢事件"，
 * 直接满足"必须保证多人模式同步"的硬要求。协议版本与数据哈希在握手时校验，不一致就拒绝开局。
 */
import type { CardInfo, GameState, MatchMode } from "../game/types";

/** 2：`GameState` 加了 `gameSeed`（开局洗牌/选曲种子）。 */
export const PROTOCOL_VERSION = 2;

export interface PeerInfo {
  index: number;
  name: string;
  isObserver: boolean;
  isHost: boolean;
  /** 该端的静态数据哈希（`public/data/index.json` 的 contentHash） */
  dataHash: string;
}

/** 客户端 → 主机的意图（主机负责校验与落地）。 */
export type ClientIntent =
  | { kind: "hello"; name: string; isObserver: boolean; dataHash: string; protocol: number }
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
  | { kind: "filterMusicByDeck" }
  | { kind: "requestSync" };

/** 主机 → 客户端。 */
export type HostMessage =
  | { kind: "welcome"; yourIndex: number; peers: PeerInfo[]; state: GameState; seq: number; melee: boolean }
  | { kind: "snapshot"; state: GameState; seq: number }
  | { kind: "peers"; peers: PeerInfo[] }
  | { kind: "chat"; from: number; text: string; system?: boolean }
  | { kind: "reject"; reason: "protocol" | "data" | "full"; detail: string }
  | { kind: "goodbye"; reason: string };

export type Message = ClientIntent | HostMessage;

export function isHostMessage(message: Message): message is HostMessage {
  return ["welcome", "snapshot", "peers", "reject", "goodbye"].includes(message.kind);
}

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

export function dataHashMismatch(a: string, b: string): boolean {
  return a.slice(0, 12) !== b.slice(0, 12);
}
