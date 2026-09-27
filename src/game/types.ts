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
  /** 「按卡组筛选音乐」开关：开 = 轮播只留卡槽里还有牌的角色（temporaryDisabled 生效）；
   *  关 = 恢复完整轮播。它是开关的显示态，随快照同步（联机两端开关外观一致）。
   *
   *  **开着的口径是"按当前卡槽"**（D124）：选牌阶段卡组一变就重筛、开局重洗后也立刻重筛；
   *  开局之后轮播是本局的**快照**（抢牌 / 交牌不自动重筛，只有转满一圈的兜底会重筛）。 */
  filterByDeck: boolean;
  temporaryDisabled: Record<string, boolean>;
  currentKey: string | null;
  /** 这一局的牌面**是不是按曲目给的**（音MAD 的 B 站封面集：一张卡 = 一首曲目，D153）。
   *
   *  由建卡池的那一端在 `init` 时写进状态（`usesPerTrackFaces(cardSet)`），随快照同步 ——
   *  它决定两件事（D168）：
   *  1. 回合要不要记 `currentCardIndex`（牌面按曲目给时才记）；
   *  2. 客人端画不画**源封面**：主机那一局的牌不是按曲目发的（比如主机用原版立绘）⇒
   *     "封面 = 曲目"在这副牌上不成立，源封面图集回落成原版立绘（只影响渲染与卡池）。 */
  perTrackFaces: boolean;
  /** 本回合**答案卡**的卡序（`currentKey` 那张牌在牌库里的 `cardIndex`）—— 音频要放它的那一首（D168）。
   *
   *  为什么记在状态里、而不是渲染时现算：
   *  * **回合中途必须不变**：抢中的牌会离开牌库，现算会让曲子在中途换一首 ✗；
   *  * **两端必须一致**：它是"这一回合放哪一首"的唯一依据，写进状态就自动同步（不用加协议字段）。
   *
   *  `null` = 这一局不按曲目给卡面（各端按种子取一首，与加这条规则之前逐字一致），
   *  或这个角色的牌不在场上（没人持有 ⇒ 没有卡面要对应）。
   *  一局里同一角色最多一张牌（D108 的自链接）⇒ 这张牌唯一。 */
  currentCardIndex: number | null;
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
    filterByDeck: false,
    temporaryDisabled: {},
    currentKey: null,
    perTrackFaces: false,
    currentCardIndex: null,
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
