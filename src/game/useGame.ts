/** 对战状态容器（本地 / CPU）。计时器与 CPU 调度放在 `useGameLoop` 里。
 *
 * 联机（M8）会把同一份 `GameState` 走传输层同步：所以这里所有动作都是"纯 reducer 的薄封装"，
 * 不直接碰 DOM 或计时器。
 *
 * 随机数（D104）：本 store 是**主机权威**动作的入口，种子一律向 `useSeeds` 要 ——
 * 权威端现抽（`draw`），客户端（`replica`）拿不到种子，于是"本地先掷一次、再被快照覆盖"的
 * 两边不一致窗口被彻底去掉 ✗→✓。
 */
import { create } from "zustand";

import { createRng, type Rng, type SeedLabel } from "../rng";
import { useSeeds } from "../store/seeds";
import type { CardInfo, GameState, MatchMode, PlayerIndex, SongConflicts } from "./types";
import { emptyState, slotCount } from "./types";
import * as rules from "./rules";
import { DEFAULT_CPU_SETTINGS, planCpuPick, type CpuPlan, type CpuSettings } from "./cpu";

/** 权威端现抽一个"本次动作专用"的随机数句柄；副本端返回 null（客户端不掷骰子，等主机快照）。 */
function authorityRng(label: SeedLabel, ...labels: SeedLabel[]): Rng | null {
  const seed = useSeeds.getState().draw(label, ...labels);
  return seed === null ? null : createRng(seed);
}

/** 两端由**已同步**字段各自派生出同一结果时用它（不消耗 nonce，副本端也合法）。 */
function derivedRng(label: SeedLabel, ...labels: SeedLabel[]): Rng {
  return createRng(useSeeds.getState().derive(label, ...labels));
}

/** 「按卡组筛选音乐」开关**开着**时，按**当前卡槽**重筛一遍（口径与 `setFilterByDeck` 同源：
 *  单人/电脑看自己一方、多人看双方）；**关着**则原样返回（完整轮播）。
 *
 *  开关说"按卡组筛"，那卡组一变筛选就得跟着变 —— 否则开关显示与实际轮播分叉 ✗（见 D124）。 */
function refilterByDeck(state: GameState, myIndex: PlayerIndex): GameState {
  if (!state.filterByDeck) return state;
  return rules.filterMusicByDeck(state, state.mode === "multi" ? null : myIndex);
}

interface GameSlice {
  game: GameState;
  /** 可入牌库的卡池（角色 × 卡面） */
  pool: CardInfo[];
  /** 曲目互斥表（D108）：由界面按数据 + 音乐模式派生，两端各自算同一张表，不进快照 */
  conflicts: SongConflicts;
  cpu: CpuSettings;
  /** 本地玩家在牌桌上的位置（本地/CPU 模式是 0） */
  myIndex: PlayerIndex;

  init: (pool: CardInfo[], conflicts?: SongConflicts) => void;
  setMode: (mode: MatchMode) => void;
  setTraditional: (traditional: boolean) => void;
  setCpu: (patch: Partial<CpuSettings>) => void;
  resize: (rows: number, columns: number) => void;
  fill: (player: PlayerIndex) => void;
  clear: (player: PlayerIndex) => void;
  shuffle: (player: PlayerIndex) => void;
  /** 自定义卡组：放一张卡进牌库（`slot` 省略则取第一个空位） */
  addCard: (player: PlayerIndex, card: CardInfo, slot?: number) => void;
  /** 自定义卡组：把牌库里某张卡拿出来 */
  removeCard: (player: PlayerIndex, slot: number) => void;
  start: () => void;
  stop: () => void;
  /** 倒计时结束 → 进入当前回合 */
  advanceCountdown: () => void;
  /** 抢拍：`player` 是**点牌的人**，`side`/`slot` 是被点的那张牌**实际所在**的位置。
   *  上游语义：抢到的牌归点牌的人，牌本身可能躺在对手的牌库里（`GameTab.tsx` 的 `PickEvent`）。 */
  pick: (player: PlayerIndex, side: 0 | 1, slot: number, timestamp?: number) => void;
  /** CPU 规划一次抢拍（返回 null 表示无法出手） */
  planCpu: (cpuPlayer: PlayerIndex) => CpuPlan | null;
  /** 灌入轮播顺序（角色 key） */
  setOrder: (order: string[]) => void;
  /** 手动交牌：把一张牌从 `fromPlayer` 的槽位移到 `toPlayer` 的空槽 */
  moveCard: (fromPlayer: PlayerIndex, fromSlot: number, toPlayer: PlayerIndex, toSlot: number) => void;
  /** 拖动放置：挪动/交换牌位（可以跨牌库） */
  moveDeckCard: (fromPlayer: PlayerIndex, fromSlot: number, toPlayer: PlayerIndex, toSlot: number) => void;
  /** 手动交牌（指定牌）：移动 + `givesLeft` 往 0 推一格 */
  giveCard: (fromPlayer: PlayerIndex, fromSlot: number, toPlayer: PlayerIndex, toSlot: number) => void;
  /** 交牌 + 推进到下一回合 */
  next: () => void;
  give: () => void;
  /** 「按卡组筛选音乐」开关：开 = 轮播只留卡槽里还有牌的角色；关 = 恢复完整轮播（清掉临时禁用）。 */
  setFilterByDeck: (enabled: boolean) => void;
  markPlayed: (trackId: string) => void;
}

export const useGame = create<GameSlice>((set, get) => {
  /** 改卡组的动作统一从这两个 helper 落地：**选牌阶段**若开关开着，就按新卡槽重筛一遍
   *  （`syncDeck` 只算新状态 —— 需要跟别的字段一起原子落地时用它；`commitDeck` 直接 set）。
   *
   *  开局之后**不**自动重筛 —— 那时轮播是本局的快照（抢牌 / 交牌都不重排），
   *  只有"转满一圈但还有牌"的兜底（`reshuffleIfWrapped`）会重筛 ✓。 */
  const syncDeck = (game: GameState): GameState =>
    (game.state === "selecting" ? refilterByDeck(game, get().myIndex) : game);
  const commitDeck = (game: GameState): void => set({ game: syncDeck(game) });

  return {
    game: emptyState(),
    pool: [],
    conflicts: {},
    cpu: DEFAULT_CPU_SETTINGS,
    myIndex: 0,

    init(pool, conflicts = {}) {
      const game = get().game;
      const sized = rules.adjustDeckSize(game, game.deckRows, game.deckColumns);
      const players = sized.players.map((player, index) => ({ ...player, name: index === 0 ? "You" : "Opponent" }));
      set({ pool, conflicts, game: syncDeck({ ...sized, players }) });
    },

    setMode(mode) {
      // 开关的口径跟着模式走（单人/电脑看自己一方、多人看双方），所以换模式也要重筛
      commitDeck({ ...get().game, mode });
    },

    setTraditional(traditional) {
      set({ game: rules.switchTraditional(get().game, traditional) });
    },

    setCpu(patch) {
      set({ cpu: { ...get().cpu, ...patch } });
    },

    resize(rows, columns) {
      // 缩小牌库会丢掉放不下的卡 → 也算"卡组变了"
      commitDeck(rules.adjustDeckSize(get().game, rows, columns));
    },

    fill(player) {
      const rng = authorityRng("fill", player);
      if (!rng) return;
      commitDeck(rules.randomFill(get().game, player, get().pool, rng, get().conflicts));
    },

    clear(player) {
      commitDeck(rules.clearDeck(get().game, player));
    },

    shuffle(player) {
      const rng = authorityRng("shuffle", player);
      if (!rng) return;
      commitDeck(rules.shuffleDeck(get().game, player, rng));
    },

    addCard(player, card, slot) {
      commitDeck(rules.addCard(get().game, player, card, slot, get().conflicts));
    },

    removeCard(player, slot) {
      commitDeck(rules.removeCard(get().game, player, slot));
    },

    start() {
      const rng = authorityRng("start");
      if (!rng) return;
      const { game, myIndex } = get();
      const ordered = game.order.length > 0 ? game.order : [];
      // 开局会重洗轮播并清掉临时禁用 —— 开关**还开着**就立刻按当前卡槽重筛一遍：
      // 开关是玩家的设定，不能被"开局重置"悄悄丢掉（否则开关说谎、点一下还没反应 ✗，见 D124）
      const started = rules.startGame({ ...game, order: ordered }, rng);
      set({ game: refilterByDeck(started, myIndex) });
    },

    stop() {
      set({ game: rules.stopGame(get().game) });
    },

    advanceCountdown() {
      const game = get().game;
      if (game.state !== "countdown") return;
      set({ game: rules.countdownFinished(game) });
    },

    pick(player, side, slot, at) {
      const game = get().game;
      if (game.state !== "turnStart") return;
      const card = game.players[side]?.deck[slot];
      if (!card) return;
      // 显式传入的时间戳（联机时由抢拍方给出）只允许落在这个回合内
      const elapsed = Math.max(0, Date.now() - game.turnStartTimestamp);
      const timestamp = at === undefined ? elapsed : Math.min(Math.max(0, at), elapsed);
      const result = rules.notifyPickEvent(game, { timestamp, player, card, side, slot });
      if (result.accepted) set({ game: result.state });
    },

    planCpu(cpuPlayer) {
      // 同一回合 + 同一种子 → 同一套规划（不消耗 nonce，重复规划结果稳定）
      return planCpuPick(get().game, cpuPlayer, get().cpu, derivedRng("cpu", get().game.turnSeq));
    },

    setOrder(order) {
      // 轮播顺序换了，开关开着就按它重筛一遍（换数据集 / 换音乐模式时两者会一起变）
      commitDeck({ ...get().game, order });
    },

    moveCard(fromPlayer, fromSlot, toPlayer, toSlot) {
      const game = get().game;
      const card = game.players[fromPlayer]?.deck[fromSlot];
      const target = game.players[toPlayer]?.deck[toSlot];
      if (!card || target !== null) return;
      const players = game.players.map((player) => ({ ...player, deck: player.deck.slice() }));
      players[fromPlayer]!.deck[fromSlot] = null;
      players[toPlayer]!.deck[toSlot] = card;
      commitDeck({ ...game, players });
    },

    moveDeckCard(fromPlayer, fromSlot, toPlayer, toSlot) {
      commitDeck(rules.moveDeckCard(get().game, fromPlayer, fromSlot, toPlayer, toSlot));
    },

    giveCard(fromPlayer, fromSlot, toPlayer, toSlot) {
      set({ game: rules.giveCard(get().game, fromPlayer, fromSlot, toPlayer, toSlot) });
    },

    next() {
      let game = get().game;
      if (game.state === "turnStart") {
        // 超时：静默移除当前角色的卡并结算罚牌
        const { state, advance } = rules.finishTurn(game);
        if (advance) {
          set({ game: rules.beginCountdown(state) });
          return;
        }
        game = state;
      }
      if (game.state !== "turnWinner") return;
      // 本地/CPU 模式由本机自动交牌（联机时由主机结算）
      if (game.givesLeft !== 0) {
        const rng = authorityRng("give", game.turnSeq);
        if (!rng) return;                       // 副本端：等主机结算并下发快照
        game = rules.giveCardsRandomly(game, rng);
      }
      set({ game: reshuffleIfWrapped(rules.beginCountdown(rules.detectFinish(game)), get().myIndex) });
    },

    give() {
      const game = get().game;
      if (game.givesLeft === 0) return;
      const rng = authorityRng("give", game.turnSeq);
      if (!rng) return;
      set({ game: rules.giveCardsRandomly(game, rng) });
    },

    /** 记下本回合实际播出的曲目（两端各自按同一确定性结果追加 → 天然同步 ✓，见 D103） */
    markPlayed(trackId: string) {
      const game = get().game;
      if (game.playedTracks.includes(trackId)) return;
      set({ game: { ...game, playedTracks: [...game.playedTracks, trackId] } });
    },

    setFilterByDeck(enabled) {
      const { game, myIndex } = get();
      if (enabled) {
        // 单人/电脑：只看自己这一方的卡槽；多人：双方都算（用户口径，见 rules.filterMusicByDeck）。
        // 先落下开关位再交给同一个 helper 筛，保证"开"的口径只有一处（D124）
        set({ game: refilterByDeck({ ...game, filterByDeck: true }, myIndex) });
        return;
      }
      // 关掉 = 恢复完整轮播：清掉筛选写下的临时禁用，开关位落回 false
      set({ game: { ...game, temporaryDisabled: {}, filterByDeck: false } });
    },
  };
});

// 开发/E2E 调试钩子（仅 dev 构建挂到 window，生产构建里不存在）
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __TMC_GAME__?: unknown }).__TMC_GAME__ = useGame;
}

export { slotCount };

/** 兜底（用户指出的 bug）：轮播转满一圈但**卡槽里还有牌** ✗ → 把轮播重设成"剩余卡牌的角色" ✓。
 *  语义与"按卡组筛选"一致（单人/电脑只看自己一方 ✓，多人看双方 ✓），两端同源 ✓。
 *  这里同时把 `filterByDeck` 置 true：兜底确实把轮播收窄了，开关要如实显示，否则界面会撒谎。 */
function reshuffleIfWrapped(state: GameState, viewpoint: PlayerIndex): GameState {
  // "又转满一圈" = 从上次重设到现在走过的回合数 ≥ 当前轮播长度（turnSeq 只增不减 ✓）
  const wrapped = state.turnSeq - state.reshuffledAtTurn >= Math.max(1, state.order.length);
  const cardsLeft = state.players.some((player) => player.deck.some((card) => card !== null));
  if (!wrapped || !cardsLeft || state.state === "finished") return state;
  // 兜底确实把轮播收窄了 → 开关也要如实显示（先置位再走同一个筛选 helper）
  const reshuffled = refilterByDeck({ ...state, filterByDeck: true }, viewpoint);
  return { ...reshuffled, reshuffledAtTurn: state.turnSeq };
}
