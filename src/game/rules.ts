/** 对战规则：纯函数 reducer（改状态一律返回新对象，便于快照/联机/测试）。
 *
 * 语义来源：`.ref/notes/A-game-core-spec.md` §4（回合推进、判定、罚牌夹紧、牌库转移、终局）。
 * 与上游的**有意差异**：真正进入 `finished` 并算出胜者（上游从不进入 `GameFinished`，只能手动 Stop），
 * 见 `docs/DECISIONS.md` D9。
 */
import {
  type CardInfo, type GameState, type PickEvent, type PlayerIndex, type PlayerState, type Slot,
  emptySlots, filledSlots, makePlayer, sameCard, slotCount,
} from "./types";

export type Rng = () => number;

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

export function addCard(state: GameState, playerIndex: PlayerIndex, card: CardInfo, slot?: number): GameState {
  const player = state.players[playerIndex];
  if (!player) return state;
  const target = slot !== undefined && player.deck[slot] === null
    ? slot
    : player.deck.findIndex((entry) => entry === null);
  if (target < 0) return state;
  return setCard(state, playerIndex, target, card);
}

export function clearDeck(state: GameState, playerIndex: PlayerIndex): GameState {
  const player = state.players[playerIndex];
  if (!player) return state;
  return withPlayer(state, playerIndex, { deck: player.deck.map(() => null) });
}

/** 随机补满：排除场上（任何玩家牌库与收集区）已有的卡面。 */
export function randomFill(
  state: GameState,
  playerIndex: PlayerIndex,
  pool: readonly CardInfo[],
  rng: Rng = Math.random,
): GameState {
  const used = new Set<string>();
  for (const player of state.players) {
    for (const card of [...player.deck, ...player.collected]) {
      if (card) used.add(`${card.characterKey}-${card.cardIndex}`);
    }
  }
  const available = pool.filter((card) => !used.has(`${card.characterKey}-${card.cardIndex}`));
  const player = state.players[playerIndex];
  if (!player) return state;
  const deck = player.deck.slice();
  for (let slot = 0; slot < deck.length; slot += 1) {
    if (deck[slot] !== null) continue;
    if (available.length === 0) break;
    const pick = Math.floor(rng() * available.length);
    deck[slot] = available.splice(pick, 1)[0]!;
  }
  return withPlayer(state, playerIndex, { deck });
}

export function shuffleDeck(state: GameState, playerIndex: PlayerIndex, rng: Rng = Math.random): GameState {
  const player = state.players[playerIndex];
  if (!player) return state;
  const deck = player.deck.slice();
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = deck[i]!;
    deck[i] = deck[j]!;
    deck[j] = a;
  }
  return withPlayer(state, playerIndex, { deck });
}

// ---------------------------------------------------------------- 开局

export function switchTraditional(state: GameState, traditional: boolean): GameState {
  return { ...state, traditional };
}

export function confirmStart(state: GameState, playerIndex: PlayerIndex): GameState {
  const next = withPlayer(state, playerIndex, { confirmStart: true });
  return allConfirmed(next, "confirmStart") ? startGame(next) : next;
}

function allConfirmed(state: GameState, field: "confirmStart" | "confirmNext"): boolean {
  const active = state.players.filter((player) => !player.isObserver);
  if (active.length === 0) return false;
  return active.every((player) => player[field]);
}

/** 开局：洗牌轮播顺序，当前角色取最后一个（上游语义：首次 nextTurn 落到第 0 个）。 */
export function startGame(state: GameState, shuffleOrder?: (order: readonly string[]) => string[]): GameState {
  const order = shuffleOrder ? shuffleOrder(state.order) : state.order.slice();
  const players = state.players.map((player) => ({
    ...player, collected: [], confirmStart: false, confirmNext: false,
  }));
  return {
    ...state,
    order,
    players,
    melee: players.filter((player) => !player.isObserver).length > 2,
    currentKey: order[order.length - 1] ?? null,
    temporaryDisabled: {},
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

export interface PickResult {
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
export function giveCardsRandomly(state: GameState, rng: Rng = Math.random): GameState {
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
    const source = from[Math.floor(rng() * from.length)]!;
    const target = to[Math.floor(rng() * to.length)]!;
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
 * 一回合的选曲种子：由**已同步**的 `(turnSeq, currentKey)` 派生，两端算出来必然相同。
 *
 * 上游由主机每个回合随机一个种子再下发；这里用纯函数从快照里派生，省掉一个同步字段，
 * 效果一样（同一回合两端选同一首），而且重放/重连也不会变。
 */
export function turnSeed(turnSeq: number, key: string | null): number {
  const text = `${turnSeq}\u0000${key ?? ""}`;
  let hash = 2166136261;                     // FNV-1a
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 2147483647;
}

/** 按牌库收窄轮播：把不在任何牌库/收集区里的角色标记为临时禁用。 */
export function filterMusicByDeck(state: GameState): GameState {
  const present = new Set<string>();
  for (const player of state.players) {
    for (const card of [...player.deck, ...player.collected]) if (card) present.add(card.characterKey);
  }
  const temporaryDisabled: Record<string, boolean> = {};
  for (const key of state.order) if (!present.has(key)) temporaryDisabled[key] = true;
  return { ...state, temporaryDisabled };
}

export { makePlayer, slotCount };
