/** 对战规则：纯函数 reducer（改状态一律返回新对象，便于快照/联机/测试）。
 *
 * 语义来源：上游 `GameJudge` 的规则语义（开工前的研读笔记 `.ref/notes/A-game-core-spec.md` §4 是当时的依据，
 * 那个目录**不进版本库**）；结论、逐条差异与后来的改动见 `docs/DECISIONS.md` D9。
 * 与上游的**有意差异**：真正进入 `finished` 并算出胜者（上游从不进入 `GameFinished`，只能手动 Stop），
 * 见 `docs/DECISIONS.md` D9。
 */
import { SEED_MAX, deriveSeed, shuffleWithSeed, type Rng } from "../rng";
import {
  type CardInfo, type GameState, type PickEvent, type PlayerIndex, type PlayerState, type Slot,
  type SongConflicts,
  cardKey, emptySlots, filledSlots, makePlayer, sameCard, slotCount,
} from "./types";

/** 随机来源一律**显式传入**（D104）：这里不再有 `Math.random` 默认值。
 *  权威端现抽用 `useSeeds.draw(...)`，两端要各自算出同一结果时用 `useSeeds.derive(...)`。 */

const clone = (state: GameState): GameState => ({
  ...state,
  players: state.players.map((player) => ({ ...player, deck: player.deck.slice(), collected: player.collected.slice() })),
  temporaryDisabled: { ...state.temporaryDisabled },
  pickEvents: state.pickEvents.slice(),
});

function withPlayer(state: GameState, index: PlayerIndex, patch: Partial<PlayerState>): GameState {
  const players = state.players.map((player, i) => (i === index ? { ...player, ...patch } : player));
  return { ...state, players };
}

// ---------------------------------------------------------------- 牌库编辑

export function adjustDeckSize(state: GameState, rows: number, columns: number): GameState {
  const safeRows = Math.min(5, Math.max(1, Math.floor(rows)));
  const safeColumns = Math.min(15, Math.max(1, Math.floor(columns)));
  const total = safeRows * safeColumns;
  const players = state.players.map((player) => {
    const deck = player.deck.slice(0, total);
    while (deck.length < total) deck.push(null);
    return { ...player, deck };
  });
  return { ...state, deckRows: safeRows, deckColumns: safeColumns, players };
}

export function setCard(state: GameState, playerIndex: PlayerIndex, slot: number, card: Slot): GameState {
  const player = state.players[playerIndex];
  if (!player || slot < 0 || slot >= player.deck.length) return state;
  const deck = player.deck.slice();
  deck[slot] = card;
  return withPlayer(state, playerIndex, { deck });
}

// ---------------------------------------------------------------- 曲目互斥（D108）
//
// 一场对局里同一首歌只能对应一个角色（含"一个 key 多张卡面其实多个角色"的情况），
// 否则会同时出现两张都"听起来对"的卡。互斥表由 `src/music/songConflicts.ts` 从数据本地派生，
// 这里只做**判定**：新角色进场的入口只有 `addCard` 与 `randomFill` 两个，所以约束放在这两处
// 就足够（`moveDeckCard` / `giveCard` / `giveCardsRandomly` 只搬场上的牌，不会引入新角色）。

/** 场上（双方牌库 + 收集区）已有的角色 key。 */
function charactersInPlay(state: GameState): Set<string> {
  const keys = new Set<string>();
  for (const player of state.players) {
    for (const card of player.deck) if (card) keys.add(card.characterKey);
    for (const card of player.collected) keys.add(card.characterKey);
  }
  return keys;
}

/** 这张卡的**角色**是否与场上某个角色互斥（同一角色的另一张卡面也算，见互斥表里的自链接）。 */
function conflictsWithPlay(
  card: CardInfo,
  inPlay: ReadonlySet<string>,
  conflicts?: SongConflicts,
): boolean {
  const related = conflicts?.[card.characterKey];
  if (!related) return false;
  return related.some((key) => inPlay.has(key));
}

/** 当前**不能**放进牌库的卡面（`角色-卡序`）：与场上角色共用曲目，或同角色已有别的卡面。
 *  选牌阶段给"未使用卡牌"置灰用（只按互斥表判定；"这张卡面已经在场上"由未使用区自己排除）。 */
export function blockedCardKeys(
  state: GameState,
  pool: readonly CardInfo[],
  conflicts?: SongConflicts,
): Set<string> {
  const inPlay = charactersInPlay(state);
  const blocked = new Set<string>();
  for (const card of pool) {
    if (conflictsWithPlay(card, inPlay, conflicts)) blocked.add(cardKey(card));
  }
  return blocked;
}

/** 某张卡面现在在谁手里（牌库或收集区）；没有则 null。 */
export function holderOf(state: GameState, card: CardInfo): { player: PlayerIndex; slot: number } | null {
  for (let index = 0; index < state.players.length; index += 1) {
    const slot = state.players[index]!.deck.findIndex((entry) => sameCard(entry, card));
    if (slot >= 0) return { player: index, slot };
    if (state.players[index]!.collected.some((entry) => sameCard(entry, card))) {
      return { player: index, slot: -1 };
    }
  }
  return null;
}

/** 自定义卡组：把一张卡放进取牌库（`slot` 指定槽位，否则第一个空位）。
 *  每个卡面在整局里只能存在一份，所以场上已有就直接拒绝（对齐上游 `addToDeck`）；
 *  传入 `conflicts` 时，与场上角色共用曲目 / 同角色已有别的卡面也一并拒绝（D108）。 */
export function addCard(
  state: GameState,
  playerIndex: PlayerIndex,
  card: CardInfo,
  slot?: number,
  conflicts?: SongConflicts,
): GameState {
  const player = state.players[playerIndex];
  if (!player) return state;
  if (holderOf(state, card) !== null) return state;
  if (conflictsWithPlay(card, charactersInPlay(state), conflicts)) return state;
  const target = slot !== undefined && player.deck[slot] === null
    ? slot
    : player.deck.findIndex((entry) => entry === null);
  if (target < 0) return state;
  return setCard(state, playerIndex, target, card);
}

/** 自定义卡组：把一张卡从牌库里拿出来（回到"未使用卡牌"区）。 */
export function removeCard(state: GameState, playerIndex: PlayerIndex, slot: number): GameState {
  const player = state.players[playerIndex];
  if (!player || player.deck[slot] === null || player.deck[slot] === undefined) return state;
  return setCard(state, playerIndex, slot, null);
}

/** 拖动放置：把一张卡挪到另一个槽位；目标槽位有卡就**交换**（可以跨牌库，对齐上游拖拽）。 */
export function moveDeckCard(
  state: GameState,
  fromPlayer: PlayerIndex,
  fromSlot: number,
  toPlayer: PlayerIndex,
  toSlot: number,
): GameState {
  const from = state.players[fromPlayer];
  const to = state.players[toPlayer];
  if (!from || !to) return state;
  if (fromPlayer === toPlayer && fromSlot === toSlot) return state;
  const card = from.deck[fromSlot];
  if (card === null || card === undefined) return state;
  const occupant = to.deck[toSlot] ?? null;
  let next = state;
  if (fromPlayer === toPlayer) {
    const deck = from.deck.slice();
    deck[fromSlot] = occupant;
    deck[toSlot] = card;
    next = withPlayer(next, fromPlayer, { deck });
    return next;
  }
  // 跨牌库：源槽位放对方的卡（交换），两边都换好
  next = withPlayer(next, toPlayer, {
    deck: to.deck.map((entry, index) => (index === toSlot ? card : entry)),
  });
  next = withPlayer(next, fromPlayer, {
    deck: from.deck.map((entry, index) => (index === fromSlot ? occupant : entry)),
  });
  return next;
}

/**
 * 交牌（手动）：把 `fromPlayer` 的一张卡放到 `toPlayer` 的空槽位，并把 `givesLeft` 往 0 推一格。
 *
 * 上游是"`moveCard` + 一个 `give` 事件"两步（`GameJudge` 的 `case "give"`）；这里合成一次原子操作，
 * 顺带修掉"手动交牌后 `givesLeft` 不减、界面一直提示还要交牌"的问题。
 */
export function giveCard(
  state: GameState,
  fromPlayer: PlayerIndex,
  fromSlot: number,
  toPlayer: PlayerIndex,
  toSlot: number,
): GameState {
  const from = state.players[fromPlayer];
  const to = state.players[toPlayer];
  if (!from || !to || fromPlayer === toPlayer) return state;
  const card = from.deck[fromSlot];
  if (card === null || card === undefined) return state;
  if ((to.deck[toSlot] ?? null) !== null) return state;
  // 谁欠牌谁才能交：givesLeft > 0 是 0 号交，< 0 是 1 号交
  const owes = state.givesLeft > 0 ? 0 : state.givesLeft < 0 ? 1 : null;
  if (owes !== fromPlayer) return state;
  const moved = moveDeckCard(state, fromPlayer, fromSlot, toPlayer, toSlot);
  const step = Math.sign(state.givesLeft);
  return { ...moved, givesLeft: state.givesLeft - step };
}

/** 未使用卡牌：卡池里既不在任何牌库、也不在任何收集区的卡（上游 `GameUnusedCards`）。 */
export function unusedCards(state: GameState, pool: readonly CardInfo[]): CardInfo[] {
  return pool.filter((card) => holderOf(state, card) === null);
}

export function clearDeck(state: GameState, playerIndex: PlayerIndex): GameState {
  const player = state.players[playerIndex];
  if (!player) return state;
  return withPlayer(state, playerIndex, { deck: player.deck.map(() => null) });
}

/** 随机补满：排除场上（任何玩家牌库与收集区）已有的卡面，以及共用曲目的角色（D108）。
 *
 * 互斥是**逐张**判定的：放下一张就把它的角色记进 `inPlay`，后面每一张都要重新过一遍，
 * 所以一次补满不会抽出"同一首歌的两个角色"。随机数消耗与不带互斥时**完全一致**
 * （仍是每个空槽一次 `intBelow`），只是候选集合收窄了。 */
export function randomFill(
  state: GameState,
  playerIndex: PlayerIndex,
  pool: readonly CardInfo[],
  rng: Rng,
  conflicts?: SongConflicts,
): GameState {
  const player = state.players[playerIndex];
  if (!player) return state;
  const inPlay = charactersInPlay(state);
  const used = new Set<string>();
  for (const other of state.players) {
    for (const card of [...other.deck, ...other.collected]) {
      if (card) used.add(cardKey(card));
    }
  }
  const available = pool.filter((card) => !used.has(cardKey(card)));
  const deck = player.deck.slice();
  for (let slot = 0; slot < deck.length; slot += 1) {
    if (deck[slot] !== null) continue;
    const candidates = available.filter((card) => !conflictsWithPlay(card, inPlay, conflicts));
    if (candidates.length === 0) break;
    const card = candidates[rng.intBelow(candidates.length)]!;
    available.splice(available.indexOf(card), 1);
    inPlay.add(card.characterKey);
    deck[slot] = card;
  }
  return withPlayer(state, playerIndex, { deck });
}

export function shuffleDeck(state: GameState, playerIndex: PlayerIndex, rng: Rng): GameState {
  const player = state.players[playerIndex];
  if (!player) return state;
  return withPlayer(state, playerIndex, { deck: rng.shuffle(player.deck) });
}

// ---------------------------------------------------------------- 开局

export function switchTraditional(state: GameState, traditional: boolean): GameState {
  return { ...state, traditional };
}

/** 确认开局：全员确认后**由权威端给种子**开一局（D104：随机来源显式传入，不再从函数内部取）。 */
export function confirmStart(state: GameState, playerIndex: PlayerIndex, rng: Rng): GameState {
  const next = withPlayer(state, playerIndex, { confirmStart: true });
  return allConfirmed(next, "confirmStart") ? startGame(next, rng) : next;
}

function allConfirmed(state: GameState, field: "confirmStart" | "confirmNext"): boolean {
  const active = state.players.filter((player) => !player.isObserver);
  if (active.length === 0) return false;
  return active.every((player) => player[field]);
}

/**
 * 开局：**洗牌轮播顺序**并记下本局种子，当前角色取最后一个
 * （上游语义：首次 `nextTurn` 会落到洗好的第 0 个）。
 *
 * 上游 `handleGameStart` 就是 `createPlayingOrder(..., true)`（洗牌）→ 每局从哪个角色开始是随机的；
 * 种子由**主机**现抽并随快照同步，所以两端洗出同一个顺序、每回合也选到同一首（D104）。
 */
export function startGame(state: GameState, rng: Rng): GameState {
  const gameSeed = rng.intBelow(SEED_MAX);
  const order = shuffleWithSeed(state.order, gameSeed, "order");
  const players = state.players.map((player) => ({
    ...player, collected: [], confirmStart: false, confirmNext: false,
  }));
  return {
    ...state,
    order,
    gameSeed,
    players,
    melee: players.filter((player) => !player.isObserver).length > 2,
    currentKey: order[order.length - 1] ?? null,
    temporaryDisabled: {},
    playedTracks: [],
    reshuffledAtTurn: 0,
    turnSeq: 0,
    pickEvents: [],
    turnWinner: null,
    givesLeft: 0,
    winner: null,
    state: "countdown",
    turnStartTimestamp: 0,
  };
}

/** 倒计时结束：推进到下一回合。 */
export function countdownFinished(state: GameState, now = Date.now()): GameState {
  return nextTurn(state, now);
}

/** 环形推进，跳过临时禁用的角色（upstream `nextTurn`）。 */
export function nextTurn(state: GameState, now = Date.now()): GameState {
  const { order, currentKey, temporaryDisabled } = state;
  const count = order.length;
  let found: string | null = null;
  if (count > 0) {
    const currentIndex = currentKey === null ? -1 : order.indexOf(currentKey);
    const startId = (currentIndex + 1) % count;
    for (let offset = startId; offset < startId + count; offset += 1) {
      const key = order[offset % count]!;
      if (!temporaryDisabled[key]) {
        found = key;
        break;
      }
    }
  }
  return {
    ...state,
    currentKey: found,
    turnSeq: state.turnSeq + 1,
    state: found === null ? "finished" : "turnStart",
    turnStartTimestamp: now,
    pickEvents: [],
    turnWinner: null,
    givesLeft: 0,
    winner: found === null ? state.winner : null,
  };
}

// ---------------------------------------------------------------- 判定

/** 排序 + 按角色去重（同一角色只保留最早的一次抢拍）。 */
export function sortPickEvents(events: readonly PickEvent[]): PickEvent[] {
  const sorted = events.slice().sort((a, b) => a.timestamp - b.timestamp);
  const seen = new Set<string>();
  const out: PickEvent[] = [];
  for (const event of sorted) {
    if (seen.has(event.card.characterKey)) continue;
    seen.add(event.card.characterKey);
    out.push(event);
  }
  return out;
}

interface PickResult {
  state: GameState;
  accepted: boolean;
}

/** 记录一次抢拍；抢中当前角色时结算回合。 */
export function notifyPickEvent(state: GameState, event: PickEvent): PickResult {
  if (state.state !== "turnStart") return { state, accepted: false };
  const pickEvents = sortPickEvents([...state.pickEvents, event]);
  const correct = pickEvents.find((entry) => entry.card.characterKey === state.currentKey);
  if (!correct) return { state: { ...state, pickEvents }, accepted: true };

  let next = clone(state);
  next.pickEvents = pickEvents;
  next.turnWinner = correct.player;

  // 赢家收牌
  const winner = next.players[correct.player]!;
  if (!winner.collected.some((card) => sameCard(card, correct.card))) {
    next = withPlayer(next, correct.player, { collected: [...winner.collected, correct.card] });
  }

  // 找出这张卡实际所在的牌库与槽位（不一定在抢拍者手里）
  let holder: PlayerIndex | null = null;
  let holderSlot = -1;
  for (let index = 0; index < next.players.length; index += 1) {
    const slot = next.players[index]!.deck.findIndex((card) => sameCard(card, correct.card));
    if (slot >= 0) {
      holder = index;
      holderSlot = slot;
      break;
    }
  }

  // 同一个角色卡在别人收集区里要被移除（混战换手）
  for (let index = 0; index < next.players.length; index += 1) {
    if (index === correct.player) continue;
    const collected = next.players[index]!.collected.filter(
      (card) => card.characterKey !== correct.card.characterKey);
    if (collected.length !== next.players[index]!.collected.length) {
      next = withPlayer(next, index, { collected });
    }
  }

  if (holder !== null && holderSlot >= 0) next = setCard(next, holder, holderSlot, null);

  next.givesLeft = calculateGives(next, correct.side);
  next.state = "turnWinner";
  next = detectFinish(next);
  return { state: next, accepted: true };
}

/** 罚牌计算与夹紧（upstream `calculateGivesFromPickEvents`）。 */
export function calculateGives(state: GameState, correctSide: 0 | 1): number {
  if (state.mode === "solo" || !state.traditional || state.melee) return 0;
  let net = 0;
  for (const event of state.pickEvents) {
    const isCorrect = event.card.characterKey === state.currentKey;
    if (!isCorrect) {
      if (event.player === 0) net -= 1;
      else if (event.player === 1) net += 1;
      continue;
    }
    if (event.player === 0 && correctSide === 1) net += 1;
    if (event.player === 1 && correctSide === 0) net -= 1;
  }
  const deck0 = state.players[0]?.deck ?? [];
  const deck1 = state.players[1]?.deck ?? [];
  if (net > 0) net = Math.min(net, emptySlots(deck1), filledSlots(deck0));
  if (net < 0) net = Math.max(net, -emptySlots(deck0), -filledSlots(deck1));
  // 夹紧可能产生 -0（Math.max(-1, -0)）；归一成 0，避免 Object.is 之类的诡异比较
  return net === 0 ? 0 : net;
}

/** 超时（没人抢中）：静默移除当前角色的卡，按规则算罚牌；返回是否可以直接进入下一回合。 */
export function finishTurn(state: GameState): { state: GameState; advance: boolean } {
  if (state.state !== "turnStart") return { state, advance: false };
  let next = clone(state);
  let correctSide: 0 | 1 = 0;
  for (let index = 0; index < next.players.length; index += 1) {
    const slot = next.players[index]!.deck.findIndex(
      (card) => card !== null && card.characterKey === state.currentKey);
    if (slot >= 0) {
      next = setCard(next, index, slot, null);
      correctSide = index === 0 ? 0 : 1;
      break;
    }
  }
  next.givesLeft = calculateGives(next, correctSide);
  if (next.givesLeft === 0) return { state: next, advance: true };
  next.state = "turnWinner";
  next.turnWinner = null;
  next = detectFinish(next);
  return { state: next, advance: false };
}

/** 回合确认：全员确认后推进。 */
export function confirmNext(state: GameState, playerIndex: PlayerIndex): GameState {
  const next = withPlayer(state, playerIndex, { confirmNext: true });
  if (!allConfirmed(next, "confirmNext")) return next;
  return beginCountdown(next);
}

/** 交牌（随机）：把交牌方的随机一张移到接收方的空格。 */
export function giveCardsRandomly(state: GameState, rng: Rng): GameState {
  let next = clone(state);
  if (next.givesLeft === 0) return next;
  const giver = next.givesLeft > 0 ? 0 : 1;
  const receiver = next.givesLeft > 0 ? 1 : 0;
  for (let i = 0; i < Math.abs(state.givesLeft); i += 1) {
    const from = next.players[giver]!.deck
      .map((card, slot) => ({ card, slot }))
      .filter((entry): entry is { card: CardInfo; slot: number } => entry.card !== null);
    const to = next.players[receiver]!.deck
      .map((card, slot) => ({ card, slot }))
      .filter((entry) => entry.card === null);
    if (from.length === 0 || to.length === 0) break;
    const source = from[rng.intBelow(from.length)]!;
    const target = to[rng.intBelow(to.length)]!;
    next = setCard(next, giver, source.slot, null);
    next = setCard(next, receiver, target.slot, source.card);
  }
  next.givesLeft = 0;
  return detectFinish(next);
}

/** 一回合收尾：清确认状态 → 检测终局 → 进入下一个 3 秒倒计时。 */
export function beginCountdown(state: GameState): GameState {
  const cleared = state.players.map((player) => ({ ...player, confirmNext: false }));
  const next = detectFinish({ ...state, players: cleared });
  if (next.state === "finished") return next;
  return { ...next, state: "countdown" };
}

// ---------------------------------------------------------------- 终局

/** 上游只用于 UI 的判断；这里既判断也在状态里落 `finished` + 胜者。 */
export function isGameFinished(state: GameState): boolean {
  const deck0 = state.players[0]?.deck ?? [];
  const deck1 = state.players[1]?.deck ?? [];
  if (state.mode === "solo" || state.melee) return emptySlots(deck0) === deck0.length;
  if (state.traditional) return state.givesLeft === 0 && (filledSlots(deck0) === 0 || filledSlots(deck1) === 0);
  return state.givesLeft === 0 && filledSlots(deck0) === 0 && filledSlots(deck1) === 0;
}

function winnerOf(state: GameState): PlayerIndex | null {
  const deck0 = state.players[0]?.deck ?? [];
  const deck1 = state.players[1]?.deck ?? [];
  if (state.melee || state.mode === "solo") return filledSlots(deck0) === 0 ? 0 : null;
  if (state.traditional) {
    if (filledSlots(deck0) === 0) return 0;
    if (filledSlots(deck1) === 0) return 1;
    return null;
  }
  const collected0 = state.players[0]?.collected.length ?? 0;
  const collected1 = state.players[1]?.collected.length ?? 0;
  if (collected0 === collected1) return null;
  return collected0 > collected1 ? 0 : 1;
}

export function detectFinish(state: GameState): GameState {
  if (!isGameFinished(state)) return state;
  return { ...state, state: "finished", winner: winnerOf(state), givesLeft: 0 };
}

export function stopGame(state: GameState): GameState {
  return {
    ...state,
    state: "selecting",
    players: state.players.map((player) => ({
      ...player, collected: [], confirmStart: false, confirmNext: false,
    })),
    pickEvents: [],
    turnWinner: null,
    givesLeft: 0,
    winner: null,
    turnSeq: 0,
  };
}

/**
 * 一回合的选曲种子：由**已同步**的 `(gameSeed, turnSeq, currentKey)` 派生，两端算出来必然相同。
 *
 * 上游由主机每个回合随机一个种子再下发；这里用纯函数从快照里派生，省掉一个同步字段，
 * 效果一样（同一回合两端选同一首），而且重放/重连也不会变。
 *
 * 派生走 `deriveSeed`（`docs/rng-v1.md` 的混淆 + 移位落位），不是"哈希后取模"这类近似做法（D104）。
 */
export function turnSeed(gameSeed: number, turnSeq: number, key: string | null): number {
  return deriveSeed(gameSeed, "turn", turnSeq, key ?? "-");
}

/** 按牌库收窄轮播：只保留**卡槽里还有牌**的角色，其余标记为临时禁用。
 *
 * 用户口径（2026-09 修正）：
 * * 只看**卡槽里的牌**（`deck`）✓ —— 已经收进"已得"的牌不算 ✗（之前把 `collected` 也算进去了 ✗）；
 * * **单人/电脑**只按**自己这一方**的卡槽筛 ✓；**多人**按**双方**的卡槽筛 ✓。
 *
 * 另外 `order` 要补上"有牌但不在轮播里"的角色：`order` 来自播放页的可用角色
 * （受预设 / 音乐模式 / 单曲停用影响），可能**不包含**某个还有牌的角色；
 * 只标记禁用的话，轮播数会小于剩余卡牌数（只剩最后一张时待播列表会变空）。
 *
 * @param viewpoint 以谁的视角看：单人/电脑传入自己那一方；多人传 `null` = 双方都算
 */
export function filterMusicByDeck(state: GameState, viewpoint: PlayerIndex | null = null): GameState {
  const sides = viewpoint === null ? state.players : [state.players[viewpoint]];
  const present = new Set<string>();
  for (const player of sides) {
    for (const card of player?.deck ?? []) if (card) present.add(card.characterKey);
  }
  const order = [...state.order];
  for (const key of present) if (!order.includes(key)) order.push(key);
  const temporaryDisabled: Record<string, boolean> = {};
  for (const key of order) if (!present.has(key)) temporaryDisabled[key] = true;
  return { ...state, order, temporaryDisabled };
}

export { makePlayer, slotCount };
