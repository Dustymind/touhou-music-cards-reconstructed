/** 对战规则（对齐 `.ref/notes/A-game-core-spec.md` §4 的每一条边界）。 */
import { describe, expect, it } from "vitest";

import * as rules from "./rules";
import { emptyState, filledSlots, makePlayer, type CardInfo, type GameState } from "./types";

const card = (characterKey: string, cardIndex = 0): CardInfo => ({ characterKey, cardIndex });

function withDecks(rows: number, columns: number, decks: [CardInfo[], CardInfo[]]): GameState {
  const base = rules.adjustDeckSize(emptyState({ mode: "solo" }), rows, columns);
  const players = base.players.map((player, index) => ({
    ...player,
    deck: base.players[index]!.deck.map((_slot, slot) => decks[index]![slot] ?? null),
  }));
  return { ...base, players };
}

/** 3×2 牌库：P0 = [a, b, c]，P1 = [d, e, f] */
function threeByTwo(): GameState {
  return withDecks(3, 2, [
    [card("a"), card("b"), card("c")],
    [card("d"), card("e"), card("f")],
  ]);
}

describe("牌库编辑", () => {
  it("调整尺寸会截断/补齐所有玩家的牌库，并夹紧到 1..5 行 / 1..15 列", () => {
    const state = rules.adjustDeckSize(threeByTwo(), 2, 2);
    expect(state.deckRows).toBe(2);
    expect(state.deckColumns).toBe(2);
    expect(state.players[0]!.deck).toHaveLength(4);
    expect(state.players.every((player) => player.deck.length === 4)).toBe(true);
    expect(rules.adjustDeckSize(state, 99, 99).deckRows).toBe(5);
    expect(rules.adjustDeckSize(state, 0, 0).deckRows).toBe(1);
  });

  it("randomFill 不重复使用场上已有的卡面", () => {
    const state = rules.adjustDeckSize(emptyState(), 2, 2);
    const withOne = rules.addCard(state, 0, card("x", 0));
    const pool = [card("x", 0), card("y", 0), card("z", 0)];
    const filled = rules.randomFill(withOne, 1, pool, () => 0);
    const used = filled.players[1]!.deck.filter((slot): slot is CardInfo => slot !== null);
    expect(used.some((entry) => entry.characterKey === "x")).toBe(false);
    expect(used.length).toBeGreaterThan(0);
  });

  it("addCard 优先用指定槽位，满了就不放", () => {
    const state = rules.adjustDeckSize(emptyState(), 1, 1);
    const one = rules.addCard(state, 0, card("a"));
    expect(rules.addCard(one, 0, card("b"))).toBe(one);
  });

  it("shuffleDeck 是同集合的排列", () => {
    const state = threeByTwo();
    const shuffled = rules.shuffleDeck(state, 0, () => 0.5);
    const keys = (deck: readonly (CardInfo | null)[]) => deck.filter(Boolean).map((c) => c!.characterKey).sort();
    expect(keys(shuffled.players[0]!.deck)).toEqual(keys(state.players[0]!.deck));
  });
});

describe("开局与回合推进", () => {
  it("startGame 洗牌后当前角色取最后一个（首次 nextTurn 落到洗好的第 0 个）", () => {
    const state = { ...threeByTwo(), order: ["a", "b", "c"], state: "selecting" as const };
    const started = rules.startGame(state, () => 0.5);
    // 洗过但仍是同一批角色
    expect(started.order.slice().sort()).toEqual(["a", "b", "c"]);
    expect(started.currentKey).toBe(started.order[started.order.length - 1]);
    expect(started.state).toBe("countdown");
    expect(started.gameSeed).toBeGreaterThanOrEqual(0);
    const next = rules.countdownFinished(started, 1000);
    expect(next.currentKey).toBe(started.order[0]);
    expect(next.state).toBe("turnStart");
    expect(next.turnSeq).toBe(1);
  });

  it("每局洗出来的顺序不同（同一 rng 则可复现）", () => {
    const state = { ...threeByTwo(), order: ["a", "b", "c", "d", "e", "f"], state: "selecting" as const };
    const first = rules.startGame(state, () => 0.11);
    const second = rules.startGame(state, () => 0.77);
    expect(first.gameSeed).not.toBe(second.gameSeed);
    expect(first.currentKey).not.toBe(second.currentKey);      // 开局第一首不再固定
    expect(rules.startGame(state, () => 0.11).order).toEqual(first.order);   // 同种子可复现
    // 原状态不被就地改掉
    expect(state.order).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("nextTurn 环形推进并跳过临时禁用的角色", () => {
    const state: GameState = { ...threeByTwo(), order: ["a", "b", "c"], currentKey: "a", state: "turnStart" };
    const skipped = rules.nextTurn({ ...state, temporaryDisabled: { b: true } }, 1);
    expect(skipped.currentKey).toBe("c");
    const wrapped = rules.nextTurn({ ...skipped, currentKey: "c" }, 1);
    expect(wrapped.currentKey).toBe("a");
  });

  it("所有角色都被临时禁用时不进入回合", () => {
    const state: GameState = {
      ...threeByTwo(), order: ["a"], currentKey: "a", state: "turnStart",
      temporaryDisabled: { a: true },
    };
    expect(rules.nextTurn(state, 1).currentKey).toBeNull();
  });
});

describe("抢拍判定", () => {
  it("按时间排序并按角色去重（保留最早）", () => {
    const events = [
      { timestamp: 30, player: 1, card: card("a"), side: 1 as const, slot: 0 },
      { timestamp: 10, player: 0, card: card("a"), side: 0 as const, slot: 0 },
      { timestamp: 20, player: 1, card: card("b"), side: 1 as const, slot: 1 },
    ];
    const sorted = rules.sortPickEvents(events);
    expect(sorted.map((event) => event.card.characterKey)).toEqual(["a", "b"]);
    expect(sorted[0]!.player).toBe(0);
  });

  it("抢中当前角色：赢家收牌、卡片从实际所在牌库移除、别人收集区里的同角色被清掉", () => {
    let state = threeByTwo();
    state = {
      ...state,
      currentKey: "e",
      state: "turnStart",
      players: [
        { ...state.players[0]!, collected: [card("e", 9)] },
        state.players[1]!,
      ],
    };
    const result = rules.notifyPickEvent(state, {
      timestamp: 120, player: 0, card: card("e"), side: 1, slot: 1,
    });
    expect(result.accepted).toBe(true);
    const next = result.state;
    expect(next.turnWinner).toBe(0);
    // 赢家收集区里原有同角色的另一张卡面会被保留（上游只跨玩家去重），新抢到的这张追加进来
    expect(next.players[0]!.collected.map((entry) => entry.cardIndex)).toEqual([9, 0]);
    expect(next.players[1]!.deck[1]).toBeNull();                                      // 从对手牌库移除
    expect(next.state).toBe("turnWinner");
  });

  it("抢错只是记录，不结算", () => {
    const state: GameState = { ...threeByTwo(), currentKey: "e", state: "turnStart" };
    const result = rules.notifyPickEvent(state, {
      timestamp: 50, player: 0, card: card("a"), side: 0, slot: 0,
    });
    expect(result.accepted).toBe(true);
    expect(result.state.state).toBe("turnStart");
    expect(result.state.turnWinner).toBeNull();
    expect(result.state.pickEvents).toHaveLength(1);
  });

  it("不在回合中时忽略抢拍", () => {
    const state: GameState = { ...threeByTwo(), currentKey: "e", state: "countdown" };
    const result = rules.notifyPickEvent(state, {
      timestamp: 50, player: 0, card: card("e"), side: 1, slot: 1,
    });
    expect(result.accepted).toBe(false);
    expect(result.state).toBe(state);
  });
});

describe("罚牌计算与夹紧", () => {
  const base = (): GameState => ({
    ...threeByTwo(),
    mode: "multi",
    traditional: true,
    melee: false,
    currentKey: "e",
    state: "turnStart",
  });

  it("抢错的罚牌在回合结算时才生效（上游语义）", () => {
    const state = base();
    const wrong0 = rules.notifyPickEvent(state, { timestamp: 1, player: 0, card: card("a"), side: 0, slot: 0 });
    expect(wrong0.state.givesLeft).toBe(0);                       // 抢错本身不改罚牌
    expect(rules.finishTurn(wrong0.state).state.givesLeft).toBe(-1);   // 结算时 −1
    const wrong1 = rules.notifyPickEvent(state, { timestamp: 1, player: 1, card: card("d"), side: 1, slot: 0 });
    expect(rules.finishTurn(wrong1.state).state.givesLeft).toBe(1);
  });

  it("抢对：从对方托盘抢到会翻号，抢自己托盘不翻", () => {
    const state = base();
    const correctFromOpponent = rules.notifyPickEvent(state, {
      timestamp: 1, player: 0, card: card("e"), side: 1, slot: 1,
    });
    expect(correctFromOpponent.state.givesLeft).toBe(1);
    const correctOnOwnSide = rules.notifyPickEvent(state, {
      timestamp: 1, player: 1, card: card("e"), side: 1, slot: 1,
    });
    expect(correctOnOwnSide.state.givesLeft).toBe(0);
  });

  it("夹紧：接收方空格数 / 交牌方卡数限制了实际交牌数", () => {
    // 当前角色的卡不在任何牌库里 → 结算不会移除卡，夹紧按原牌库算
    const base2 = { ...base(), currentKey: "zz" };
    const state: GameState = {
      ...base2,
      players: [
        { ...base2.players[0]!, deck: [card("a"), card("b"), card("c"), null, null, null] },
        { ...base2.players[1]!, deck: [card("e"), null, null, null, null, null] },
      ],
    };
    const wrong = rules.notifyPickEvent(state, { timestamp: 1, player: 0, card: card("a"), side: 0, slot: 0 });
    expect(rules.finishTurn(wrong.state).state.givesLeft).toBe(-1);

    // P1 一张卡都没有 → 无牌可交，夹到 0
    const empty1: GameState = {
      ...state,
      players: [
        state.players[0]!,
        { ...state.players[1]!, deck: state.players[1]!.deck.map(() => null) },
      ],
    };
    const wrong2 = rules.notifyPickEvent(empty1, { timestamp: 1, player: 0, card: card("a"), side: 0, slot: 0 });
    expect(rules.finishTurn(wrong2.state).state.givesLeft).toBe(0);
  });

  it("超时结算会先移除当前角色的卡，再按剩余牌库夹紧罚牌", () => {
    const state: GameState = {
      ...base(),
      players: [
        { ...base().players[0]!, deck: [card("a"), card("b"), card("c"), null, null, null] },
        { ...base().players[1]!, deck: [card("e"), null, null, null, null, null] },
      ],
    };
    const wrong = rules.notifyPickEvent(state, { timestamp: 1, player: 0, card: card("a"), side: 0, slot: 0 });
    // currentKey = e 在 P1 手里：结算先移除它 → P1 变成 0 张卡 → 夹到 0
    expect(rules.finishTurn(wrong.state).state.givesLeft).toBe(0);
  });

  it("单人/休闲/混战模式不罚牌", () => {
    expect(rules.calculateGives({ ...base(), mode: "solo" }, 0)).toBe(0);
    expect(rules.calculateGives({ ...base(), traditional: false }, 0)).toBe(0);
    expect(rules.calculateGives({ ...base(), melee: true }, 0)).toBe(0);
  });
});

describe("超时与交牌", () => {
  it("超时：静默移除当前角色的卡；罚牌为 0 时可以直接推进", () => {
    const state: GameState = { ...threeByTwo(), mode: "multi", currentKey: "e", state: "turnStart" };
    const { state: next, advance } = rules.finishTurn(state);
    expect(advance).toBe(true);
    expect(next.players[1]!.deck[1]).toBeNull();
    expect(next.givesLeft).toBe(0);
  });

  it("超时且罚牌非 0：进入交牌阶段（不推进）", () => {
    let state: GameState = {
      ...threeByTwo(), mode: "multi", traditional: true, currentKey: "e", state: "turnStart",
      pickEvents: [{ timestamp: 5, player: 0, card: card("a"), side: 0, slot: 0 }],
    };
    const { state: next, advance } = rules.finishTurn(state);
    expect(advance).toBe(false);
    expect(next.state).toBe("turnWinner");
    expect(next.givesLeft).toBe(-1);
  });

  it("随机交牌把 |givesLeft| 张从交牌方移到接收方并清零", () => {
    const state: GameState = {
      ...threeByTwo(), mode: "multi", currentKey: "e", state: "turnWinner", givesLeft: 2,
    };
    const after = rules.giveCardsRandomly(state, () => 0);
    expect(after.givesLeft).toBe(0);
    expect(filledSlots(after.players[0]!.deck)).toBe(1);
    expect(filledSlots(after.players[1]!.deck)).toBe(5);
  });
});

describe("终局", () => {
  it("单人：自己牌库清空即结束", () => {
    const state = { ...threeByTwo(), mode: "solo" as const, players: [
      { ...makePlayer("me"), deck: [null, null, null, null, null, null] },
      makePlayer("other"),
    ] };
    const finished = rules.detectFinish(state);
    expect(finished.state).toBe("finished");
    expect(finished.winner).toBe(0);
  });

  it("经典 1v1：先清空牌库者胜（对方清空则对方胜）", () => {
    const base = { ...threeByTwo(), mode: "multi" as const, traditional: true, givesLeft: 0 };
    const p0Empty = rules.detectFinish({ ...base, players: [
      { ...base.players[0]!, deck: base.players[0]!.deck.map(() => null) }, base.players[1]!,
    ] });
    expect(p0Empty.winner).toBe(0);
    const p1Empty = rules.detectFinish({ ...base, players: [
      base.players[0]!,
      { ...base.players[1]!, deck: base.players[1]!.deck.map(() => null) },
    ] });
    expect(p1Empty.winner).toBe(1);
  });

  it("休闲 1v1：双方都清空才结束，收牌多者胜", () => {
    const base = { ...threeByTwo(), mode: "multi" as const, traditional: false };
    const oneEmpty = { ...base, players: [
      { ...base.players[0]!, deck: base.players[0]!.deck.map(() => null) }, base.players[1]!,
    ] };
    expect(rules.isGameFinished(oneEmpty)).toBe(false);
    const bothEmpty = { ...oneEmpty, players: [
      oneEmpty.players[0]!,
      { ...oneEmpty.players[1]!, deck: oneEmpty.players[1]!.deck.map(() => null), collected: [card("x")] },
    ] };
    const finished = rules.detectFinish(bothEmpty);
    expect(finished.state).toBe("finished");
    expect(finished.winner).toBe(1);
  });

  it("罚牌没交完不算结束", () => {
    const state = { ...threeByTwo(), mode: "multi" as const, traditional: true, givesLeft: 1, players: [
      { ...makePlayer("a"), deck: [null, null, null, null, null, null] },
      makePlayer("b"),
    ] };
    expect(rules.isGameFinished(state)).toBe(false);
  });

  it("stopGame 回到选牌阶段并清空收集区", () => {
    const state: GameState = {
      ...threeByTwo(), state: "turnWinner", winner: 0, givesLeft: 2,
      players: [
        { ...makePlayer("a"), collected: [card("z")] },
        { ...makePlayer("b"), collected: [card("y")] },
      ],
    };
    const stopped = rules.stopGame(state);
    expect(stopped.state).toBe("selecting");
    expect(stopped.givesLeft).toBe(0);
    expect(stopped.players.every((player) => player.collected.length === 0)).toBe(true);
  });
});

describe("按牌库筛选音乐", () => {
  it("把不在牌库/收集区里的角色标为临时禁用", () => {
    const state = {
      ...threeByTwo(), order: ["a", "b", "e", "zzz"],
      players: [
        { ...makePlayer("a"), deck: [card("a"), null, null, null, null, null] },
        { ...makePlayer("b"), deck: [card("e"), null, null, null, null, null] },
      ],
    };
    const filtered = rules.filterMusicByDeck(state);
    expect(filtered.temporaryDisabled).toEqual({ b: true, zzz: true });
  });
});

describe("回合选曲种子", () => {
  it("同一 (回合号, 角色) 派生同一种子（两端同步）", () => {
    expect(rules.turnSeed(7, 3, "kirisame-marisa")).toBe(rules.turnSeed(7, 3, "kirisame-marisa"));
    expect(rules.turnSeed(7, 3, null)).toBe(rules.turnSeed(7, 3, null));
  });

  it("回合号或角色变了就是另一种子（不会老是同一首）", () => {
    const base = rules.turnSeed(7, 1, "cirno");
    expect(rules.turnSeed(7, 2, "cirno")).not.toBe(base);
    expect(rules.turnSeed(7, 1, "kirisame-marisa")).not.toBe(base);
    // 段间不能串（"1" + "23" 与 "12" + "3" 必须不同）
    expect(rules.turnSeed(7, 1, "23")).not.toBe(rules.turnSeed(7, 12, "3"));
  });

  it("种子落在 pickWithSeed 能吃的范围内", () => {
    for (const [turn, key] of [[0, null], [1, "cirno"], [9999, "zzz"]] as const) {
      const seed = rules.turnSeed(7, turn, key);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2147483647);
    }
  });
});

describe("自定义卡组", () => {
  const pool = ["a", "b", "c", "d"].map((key) => ({ characterKey: key, cardIndex: 0 }));

  it("addCard 放第一个空位，指定槽位也行；同一个卡面只能有一份", () => {
    let state = rules.adjustDeckSize(emptyState(), 2, 2);
    state = rules.addCard(state, 0, pool[0]!);
    expect(state.players[0]!.deck[0]).toEqual(pool[0]);
    state = rules.addCard(state, 0, pool[1]!, 1);
    expect(state.players[0]!.deck[1]).toEqual(pool[1]);
    // 已在牌库里的卡再放一次：不动
    const before = state;
    state = rules.addCard(state, 1, pool[0]!);
    expect(state).toBe(before);
    // 牌库满了也放不进去
    state = rules.addCard(state, 0, pool[2]!);
    state = rules.addCard(state, 0, pool[3]!);
    expect(state.players[0]!.deck.filter((card) => card !== null)).toHaveLength(4);
  });

  it("removeCard 把卡拿回未使用区；空槽位是空操作", () => {
    let state = rules.adjustDeckSize(emptyState(), 2, 2);
    state = rules.addCard(state, 0, pool[0]!);
    expect(rules.unusedCards(state, pool).map((card) => card.characterKey)).toEqual(["b", "c", "d"]);
    state = rules.removeCard(state, 0, 0);
    expect(state.players[0]!.deck[0]).toBeNull();
    expect(rules.unusedCards(state, pool)).toHaveLength(4);
    const before = state;
    expect(rules.removeCard(state, 0, 1)).toBe(before);   // 本来就空
  });

  it("收集区里的卡也不算未使用（混战换手后不会重复出现）", () => {
    let state = rules.adjustDeckSize(emptyState(), 2, 2);
    state = rules.addCard(state, 0, pool[0]!);
    state = {
      ...state,
      players: [
        state.players[0]!,
        { ...state.players[1]!, collected: [pool[0]!] },
      ],
    };
    expect(rules.unusedCards(state, pool).map((card) => card.characterKey)).toEqual(["b", "c", "d"]);
  });
});

describe("拖动放置与指定交牌", () => {
  const cards = ["a", "b", "c"].map((key) => ({ characterKey: key, cardIndex: 0 }));
  const withDecks = (deck0: (typeof cards[number] | null)[], deck1: (typeof cards[number] | null)[],
                     givesLeft = 0): GameState => ({
    ...rules.adjustDeckSize({ ...threeByTwo(), givesLeft }, 1, Math.max(deck0.length, deck1.length)),
    players: [
      { ...makePlayer("P1"), deck: deck0 },
      { ...makePlayer("P2"), deck: deck1 },
    ],
  });
  const keys = (state: GameState, player: number): (string | null)[] =>
    state.players[player]!.deck.map((card) => card?.characterKey ?? null);

  it("moveDeckCard：挪到空位是移动，挪到有卡的槽位是交换", () => {
    const state = withDecks([cards[0]!, null, cards[2]!], [null, null, null]);
    expect(keys(rules.moveDeckCard(state, 0, 0, 0, 1), 0)).toEqual([null, "a", "c"]);   // 挪到空位
    expect(keys(rules.moveDeckCard(state, 0, 0, 0, 2), 0)).toEqual(["c", null, "a"]);   // 有卡则交换
    expect(keys(rules.moveDeckCard(state, 0, 0, 0, 2), 0)).toEqual(["c", null, "a"]);
    // 原地不动是空操作
    expect(rules.moveDeckCard(state, 0, 0, 0, 0)).toBe(state);
    // 空格子挪不出东西
    expect(rules.moveDeckCard(state, 0, 1, 0, 2)).toBe(state);
  });

  it("moveDeckCard：跨牌库拖会跟对方那张交换", () => {
    const state = withDecks([cards[0]!, null, null], [cards[1]!, null, null]);
    const moved = rules.moveDeckCard(state, 0, 0, 1, 0);
    expect(keys(moved, 0)).toEqual(["b", null, null]);
    expect(keys(moved, 1)).toEqual(["a", null, null]);
  });

  it("giveCard：只有欠牌方交得动，交完 givesLeft 往 0 推一格", () => {
    const owing = withDecks([cards[0]!, cards[1]!], [null, null], 2);
    const once = rules.giveCard(owing, 0, 0, 1, 0);
    expect(once.givesLeft).toBe(1);
    expect(keys(once, 1)).toEqual(["a", null]);
    expect(keys(once, 0)).toEqual([null, "b"]);

    // 不欠牌的人交不动
    expect(rules.giveCard(owing, 1, 0, 0, 1)).toBe(owing);
    // 目标槽位有卡也不行
    const occupied = withDecks([cards[0]!], [cards[1]!], 1);
    expect(rules.giveCard(occupied, 0, 0, 1, 0)).toBe(occupied);
    // 反向欠牌时由 1 号交
    const reverse = withDecks([null, null], [cards[1]!, cards[2]!], -1);
    const given = rules.giveCard(reverse, 1, 0, 0, 0);
    expect(given.givesLeft).toBe(0);
    expect(keys(given, 0)).toEqual(["b", null]);
  });
});

describe("按卡组筛选音乐（用户口径：只看卡槽、单方/双方有别）", () => {
  /** 造局面：`deck` 是卡槽，`collected` 是已得的牌 */
  const state = (order: string[], decks: [string[], string[]], collected: [string[], string[]] = [[], []]) => ({
    ...emptyState({ mode: "multi" }),
    order,
    players: [
      { ...makePlayer("You"), deck: decks[0].map((k) => ({ characterKey: k, cardIndex: 0 })),
        collected: collected[0].map((k) => ({ characterKey: k, cardIndex: 0 })) },
      { ...makePlayer("Opponent"), deck: decks[1].map((k) => ({ characterKey: k, cardIndex: 0 })),
        collected: collected[1].map((k) => ({ characterKey: k, cardIndex: 0 })) },
    ],
  });
  const playable = (filtered: ReturnType<typeof rules.filterMusicByDeck>) =>
    filtered.order.filter((key) => !filtered.temporaryDisabled[key]);

  it("只看卡槽：已经收进已得的牌不算", () => {
    const filtered = rules.filterMusicByDeck(
      state(["alice", "cirno"], [["alice"], []], [["cirno"], []]), null);
    expect(playable(filtered)).toEqual(["alice"]);
  });

  it("单人/电脑：只按自己这一方卡槽筛（对手的牌不算）", () => {
    const filtered = rules.filterMusicByDeck(state(["alice", "cirno"], [["alice"], ["cirno"]]), 0);
    expect(playable(filtered)).toEqual(["alice"]);
  });

  it("多人：双方卡槽都算", () => {
    const filtered = rules.filterMusicByDeck(state(["alice", "cirno"], [["alice"], ["cirno"]]), null);
    expect(playable(filtered)).toEqual(["alice", "cirno"]);
  });

  it("有牌但不在轮播里的角色会被补进轮播（否则轮播数 < 剩余卡牌数）", () => {
    const filtered = rules.filterMusicByDeck(state(["alice"], [["alice", "cirno"], []]), 0);
    expect(playable(filtered)).toContain("cirno");
    expect(playable(filtered)).toHaveLength(2);
  });

  it("只剩最后一张卡时，待播列表不会变空", () => {
    const filtered = rules.filterMusicByDeck(state([], [["cirno"], []]), 0);
    expect(playable(filtered)).toEqual(["cirno"]);
  });
});
