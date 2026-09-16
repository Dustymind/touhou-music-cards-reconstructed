/** 对战状态容器（本地 / CPU）。计时器与 CPU 调度放在 `useGameLoop` 里。
 *
 * 联机（M8）会把同一份 `GameState` 走传输层同步：所以这里所有动作都是"纯 reducer 的薄封装"，
 * 不直接碰 DOM 或计时器。
 */
import { create } from "zustand";

import type { CardInfo, GameState, MatchMode, PlayerIndex } from "./types";
import { emptyState, slotCount } from "./types";
import * as rules from "./rules";
import { DEFAULT_CPU_SETTINGS, planCpuPick, type CpuPlan, type CpuSettings } from "./cpu";

export interface GameSlice {
  game: GameState;
  /** 可入牌库的卡池（角色 × 卡面） */
  pool: CardInfo[];
  cpu: CpuSettings;
  /** 本地玩家在牌桌上的位置（本地/CPU 模式是 0） */
  myIndex: PlayerIndex;

  init: (pool: CardInfo[]) => void;
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
  /** 交牌 + 推进到下一回合 */
  next: () => void;
  give: () => void;
  filterByDeck: () => void;
}

export const useGame = create<GameSlice>((set, get) => ({
  game: emptyState(),
  pool: [],
  cpu: DEFAULT_CPU_SETTINGS,
  myIndex: 0,

  init(pool) {
    const game = get().game;
    const sized = rules.adjustDeckSize(game, game.deckRows, game.deckColumns);
    const players = sized.players.map((player, index) => ({ ...player, name: index === 0 ? "You" : "Opponent" }));
    set({ pool, game: { ...sized, players } });
  },

  setMode(mode) {
    set({ game: { ...get().game, mode } });
  },

  setTraditional(traditional) {
    set({ game: rules.switchTraditional(get().game, traditional) });
  },

  setCpu(patch) {
    set({ cpu: { ...get().cpu, ...patch } });
  },

  resize(rows, columns) {
    set({ game: rules.adjustDeckSize(get().game, rows, columns) });
  },

  fill(player) {
    set({ game: rules.randomFill(get().game, player, get().pool) });
  },

  clear(player) {
    set({ game: rules.clearDeck(get().game, player) });
  },

  shuffle(player) {
    set({ game: rules.shuffleDeck(get().game, player) });
  },

  addCard(player, card, slot) {
    set({ game: rules.addCard(get().game, player, card, slot) });
  },

  removeCard(player, slot) {
    set({ game: rules.removeCard(get().game, player, slot) });
  },

  start() {
    const { game } = get();
    const ordered = game.order.length > 0 ? game.order : [];
    set({ game: rules.startGame({ ...game, order: ordered }) });
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
    return planCpuPick(get().game, cpuPlayer, get().cpu);
  },

  setOrder(order) {
    set({ game: { ...get().game, order } });
  },

  moveCard(fromPlayer, fromSlot, toPlayer, toSlot) {
    const game = get().game;
    const card = game.players[fromPlayer]?.deck[fromSlot];
    const target = game.players[toPlayer]?.deck[toSlot];
    if (!card || target !== null) return;
    const players = game.players.map((player) => ({ ...player, deck: player.deck.slice() }));
    players[fromPlayer]!.deck[fromSlot] = null;
    players[toPlayer]!.deck[toSlot] = card;
    set({ game: { ...game, players } });
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
    if (game.givesLeft !== 0) game = rules.giveCardsRandomly(game);
    set({ game: rules.beginCountdown(rules.detectFinish(game)) });
  },

  give() {
    const game = get().game;
    if (game.givesLeft === 0) return;
    set({ game: rules.giveCardsRandomly(game) });
  },

  filterByDeck() {
    set({ game: rules.filterMusicByDeck(get().game) });
  },
}));

// 开发/E2E 调试钩子（仅 dev 构建挂到 window，生产构建里不存在）
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __TMC_GAME__?: unknown }).__TMC_GAME__ = useGame;
}

export { slotCount };
