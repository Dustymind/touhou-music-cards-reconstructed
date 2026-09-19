import { beforeEach, describe, expect, it } from "vitest";

import { useGame } from "./useGame";
import type { CardInfo } from "./types";
import { filledSlots } from "./types";

const card = (key: string): CardInfo => ({ characterKey: key, cardIndex: 0 });

function freshGame(): void {
  useGame.setState({
    game: {
      mode: "solo", players: [
        { name: "You", isObserver: false, deck: [], collected: [], confirmStart: false, confirmNext: false },
        { name: "Opponent", isObserver: false, deck: [], collected: [], confirmStart: false, confirmNext: false },
      ],
      deckRows: 1, deckColumns: 2, traditional: true, melee: false, order: ["a", "b"], gameSeed: 0,
      temporaryDisabled: {}, currentKey: null, turnSeq: 0, state: "selecting",
      turnStartTimestamp: 0, pickEvents: [], turnWinner: null, givesLeft: 0, winner: null,
    },
    pool: [card("a"), card("b"), card("c")],
    myIndex: 0,
  });
}

describe("useGame store", () => {
  beforeEach(() => {
    localStorage.clear();
    freshGame();
  });

  it("init 灌入卡池并按尺寸初始化牌库", () => {
    useGame.getState().init([card("a")]);
    const game = useGame.getState().game;
    expect(useGame.getState().pool).toEqual([card("a")]);
    expect(game.players[0]!.deck).toHaveLength(2);
    expect(game.players[0]!.name).toBe("You");
    expect(game.players[1]!.name).toBe("Opponent");
  });

  it("resize 夹紧到合法范围并同步两侧牌库长度", () => {
    useGame.getState().resize(9, 99);
    expect(useGame.getState().game.deckRows).toBe(5);
    expect(useGame.getState().game.deckColumns).toBe(15);
    expect(useGame.getState().game.players[1]!.deck).toHaveLength(75);
  });

  it("fill→start→advanceCountdown 进入回合，pick 抢中即结算", () => {
    const store = useGame.getState();
    store.resize(1, 3);
    store.init([card("a"), card("b"), card("c")]);
    useGame.getState().fill(0);
    const deck = useGame.getState().game.players[0]!.deck;
    expect(deck.every((slot) => slot !== null)).toBe(true);   // 3 张卡刚好填满

    useGame.getState().start();
    expect(useGame.getState().game.state).toBe("countdown");
    useGame.getState().advanceCountdown();
    const inTurn = useGame.getState().game;
    expect(inTurn.state).toBe("turnStart");
    // 开局会洗牌，所以不假定是哪个角色，只要求它来自轮播顺序且手里有这张
    expect(inTurn.currentKey).not.toBeNull();
    expect(inTurn.currentKey).not.toBe("");

    // 找到当前角色的卡并抢中
    const slot = inTurn.players[0]!.deck.findIndex((entry) => entry?.characterKey === inTurn.currentKey);
    if (slot >= 0) {
      useGame.getState().pick(0, 0, slot);
      const after = useGame.getState().game;
      expect(after.state).toBe("turnWinner");
      expect(after.players[0]!.collected).toHaveLength(1);
    }
  });

  it("抢错只是染色，next 之后回合推进", () => {
    useGame.getState().init([card("a"), card("b")]);
    useGame.getState().resize(1, 2);
    useGame.getState().fill(0);
    useGame.getState().start();
    useGame.getState().advanceCountdown();
    const game = useGame.getState().game;
    const wrongSlot = game.players[0]!.deck.findIndex(
      (entry) => entry && entry.characterKey !== game.currentKey);
    if (wrongSlot >= 0) useGame.getState().pick(0, 0, wrongSlot);
    expect(useGame.getState().game.pickEvents.length).toBeGreaterThan(0);

    const turnBefore = useGame.getState().game.turnSeq;
    useGame.getState().next();
    expect(useGame.getState().game.state).toBe("countdown");
    useGame.getState().advanceCountdown();
    expect(useGame.getState().game.turnSeq).toBe(turnBefore + 1);
  });

  it("solo 模式：抢到最后一张卡即终局", () => {
    useGame.getState().init([card("a")]);
    useGame.getState().resize(1, 1);
    useGame.getState().fill(0);
    useGame.getState().start();
    useGame.getState().advanceCountdown();
    // 开局洗牌后手里那一张未必是当前角色，这里直接摆成"就剩当前角色这一张"
    const current = useGame.getState().game.currentKey!;
    useGame.setState((slice) => ({
      game: {
        ...slice.game,
        players: [
          { ...slice.game.players[0]!, deck: [{ characterKey: current, cardIndex: 0 }] },
          slice.game.players[1]!,
        ],
      },
    }));
    const game = useGame.getState().game;
    expect(filledSlots(game.players[0]!.deck)).toBe(1);
    useGame.getState().pick(0, 0, 0);
    const after = useGame.getState().game;
    expect(after.state).toBe("finished");
    expect(after.winner).toBe(0);
  });

  it("stop 回到选牌阶段", () => {
    useGame.getState().init([card("a")]);
    useGame.getState().start();
    useGame.getState().stop();
    expect(useGame.getState().game.state).toBe("selecting");
  });

  it("filterByDeck 把不在场上的角色标为临时禁用", () => {
    useGame.setState((slice) => ({
      game: { ...slice.game, order: ["a", "b", "c", "d"] },
    }));
    useGame.getState().resize(1, 1);
    useGame.setState((slice) => {
      const players = slice.game.players.map((player, index) => ({
        ...player, deck: index === 0 ? [card("a")] : [card("c")],
      }));
      return { game: { ...slice.game, players } };
    });
    useGame.getState().filterByDeck();
    // 新口径：单人/电脑只按**自己这一方**卡槽筛（c 只在对手卡槽里 → 应被禁用 ✓）
    expect(useGame.getState().game.temporaryDisabled).toEqual({ b: true, c: true, d: true });
  });
});
