/** 对战数据结构（对齐上游 `GameJudge.ts`，字段名沿用其语义）。 */

export type PlayerIndex = number;

export interface CardInfo {
  characterKey: string;
  cardIndex: number;
}

/** 卡面的稳定键：`角色-卡序`（牌桌槽位、选卡区、互斥判定共用一套写法）。 */
export function cardKey(card: CardInfo): string {
  return `${card.characterKey}-${card.cardIndex}`;
}

/** 曲目互斥表：角色 key → 与它互斥的角色 key（**含自身**：同一角色的第二张卡面也不允许）。
 *
 * 由 `src/music/songConflicts.ts` 从数据本地派生（两端同一份 bundle → 同一张表），
 * 所以它**不进快照、不进协议**；`GameState` 里也不放它。
 */
export type SongConflicts = Readonly<Record<string, readonly string[]>>;

/** 牌库槽位：`null` 表示空格子。 */
export type Slot = CardInfo | null;

export interface PickEvent {
  /** 反应时间（毫秒，越小越早） */
  timestamp: number;
  player: PlayerIndex;
  card: CardInfo;
  /** 该卡所在的一侧（0 = 我方视角的上方，1 = 下方） */
  side: 0 | 1;
  slot: number;
}

export interface PlayerState {
  name: string;
  isObserver: boolean;
  deck: Slot[];
  collected: CardInfo[];
  confirmStart: boolean;
  confirmNext: boolean;
}

/** 玩家可选的对局模式：单人（只看自己）/ 电脑（有对手棋盘 + 可调电脑卡组）/ 多人（联机）。 */
export type MatchMode = "solo" | "cpu" | "multi";

export type JudgeState = "selecting" | "countdown" | "turnStart" | "turnWinner" | "finished";

export interface GameState {
  mode: MatchMode;
  players: PlayerState[];
  deckRows: number;
  deckColumns: number;
  /** 经典模式：抢错/从对方托盘抢到要交牌；休闲模式：忽略罚牌 */
  traditional: boolean;
  /** 混战（>2 名非观察者）时罚牌与终局规则不同 */
  melee: boolean;
  /** 轮播顺序（角色 key）；开局时由主机洗牌，随快照同步 */
  order: string[];
  /** 本局**已经播过的曲目**（trackId）。对局里选曲会排除它们，避免同一首重复出现；
   *  两端由同一批 intent 推出，所以放状态里就自动同步 ✓（见 D103）。 */
  playedTracks: string[];
  /** 上次"轮播走完但还有牌 → 重设成剩余卡牌"发生在第几回合（`turnSeq`）。
   *  没有它的话，`turnSeq` 只增不减 → 重设后每回合都会再重设一次 ✗（见 D103 遗留①） */
  reshuffledAtTurn: number;
  /** 本局的开局随机种子（主机抽、随快照同步）：决定洗牌结果与每回合选哪首 */
  gameSeed: number;
  temporaryDisabled: Record<string, boolean>;
  currentKey: string | null;
  /** 回合序号：联机时作为事件幂等键与快照标识 */
  turnSeq: number;
  state: JudgeState;
  turnStartTimestamp: number;
  pickEvents: PickEvent[];
  turnWinner: PlayerIndex | null;
  /** >0：玩家 0 需给玩家 1 交牌；<0：玩家 1 需给玩家 0 交牌 */
  givesLeft: number;
  winner: PlayerIndex | null;
}

export function emptyState(overrides: Partial<GameState> = {}): GameState {
  return {
    mode: "solo",
    players: [makePlayer("Player 1"), makePlayer("Player 2")],
    deckRows: 3,
    deckColumns: 8,
    traditional: true,
    melee: false,
    order: [],
    playedTracks: [],
    reshuffledAtTurn: 0,
    gameSeed: 0,
    temporaryDisabled: {},
    currentKey: null,
    turnSeq: 0,
    state: "selecting",
    turnStartTimestamp: 0,
    pickEvents: [],
    turnWinner: null,
    givesLeft: 0,
    winner: null,
    ...overrides,
  };
}

export function makePlayer(name: string, isObserver = false): PlayerState {
  return { name, isObserver, deck: [], collected: [], confirmStart: false, confirmNext: false };
}

export function slotCount(state: Pick<GameState, "deckRows" | "deckColumns">): number {
  return state.deckRows * state.deckColumns;
}

export function filledSlots(deck: readonly Slot[]): number {
  return deck.filter((slot) => slot !== null).length;
}

export function emptySlots(deck: readonly Slot[]): number {
  return deck.filter((slot) => slot === null).length;
}

export function sameCard(a: CardInfo | null, b: CardInfo | null): boolean {
  if (a === null || b === null) return a === b;
  return a.characterKey === b.characterKey && a.cardIndex === b.cardIndex;
}
