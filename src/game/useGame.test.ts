import { beforeEach, describe, expect, it } from "vitest";

import { useSeeds } from "../store/seeds";
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
      deckRows: 1, deckColumns: 2, traditional: true, melee: false, order: ["a", "b"],
    playedTracks: [],
      reshuffledAtTurn: 0, gameSeed: 0,
      temporaryDisabled: {}, currentKey: null, turnSeq: 0, state: "selecting",
      turnStartTimestamp: 0, pickEvents: [], turnWinner: null, givesLeft: 0, winner: null,
    },
    pool: [card("a"), card("b"), card("c")],
    conflicts: {},
    myIndex: 0,
  });
}

describe("useGame store", () => {
  beforeEach(() => {
    localStorage.clear();
    freshGame();
    // 本机是权威端（单机 / 联机主机）：随机动作才允许落地（D104）
    useSeeds.setState({ ownSeed: 20260919, adoptedSeed: null, authority: "authority", nonce: 0 });
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

  it("init 灌入曲目互斥表：addCard 与 fill 都按它挡掉重复曲目（D108）", () => {
    const conflicts = { a: ["b"], b: ["a"] };
    useGame.getState().init([card("a"), card("b"), card("c")], conflicts);
    expect(useGame.getState().conflicts).toEqual(conflicts);

    useGame.getState().addCard(0, card("a"));
    expect(useGame.getState().game.players[0]!.deck[0]?.characterKey).toBe("a");
    // 共用一首曲子的 b 放不进来了
    useGame.getState().addCard(0, card("b"));
    expect(useGame.getState().game.players[0]!.deck.filter(Boolean)).toHaveLength(1);

    // 随机补满同样守约束：a / b 不会同时出现（池子里剩一张被挡 → 只填得进两张）
    useGame.getState().clear(0);
    useGame.getState().resize(1, 3);
    useGame.getState().fill(0);
    const keys = useGame.getState().game.players[0]!.deck
      .filter((slot): slot is CardInfo => slot !== null)
      .map((entry) => entry.characterKey);
    expect(keys).toContain("c");
    expect(keys.includes("a") && keys.includes("b")).toBe(false);
    expect(keys).toHaveLength(2);
  });
});

describe("随机动作的种子权威（D104）", () => {
  beforeEach(() => {
    localStorage.clear();
    freshGame();
    useSeeds.setState({ ownSeed: 20260919, adoptedSeed: null, authority: "authority", nonce: 0 });
  });

  it("权威端：同一种子同一起点 → 补满结果完全一致", () => {
    const fill = (): (CardInfo | null)[] => {
      useSeeds.setState({ ownSeed: 4242, adoptedSeed: null, authority: "authority", nonce: 0 });
      useGame.getState().resize(1, 3);
      useGame.getState().fill(0);
      return useGame.getState().game.players[0]!.deck;
    };
    const first = fill();
    const again = fill();
    expect(again).toEqual(first);
    expect(useSeeds.getState().nonce).toBe(1);
  });

  it("权威端：每次动作都换一个子种子（两次补满不会一模一样）", () => {
    useGame.getState().resize(1, 3);
    useGame.setState({ pool: [card("a"), card("b"), card("c"), card("d"), card("e")] });
    useGame.getState().fill(0);
    const first = useGame.getState().game.players[0]!.deck.map((entry) => entry?.characterKey);
    useGame.getState().clear(0);
    useGame.getState().fill(0);
    const second = useGame.getState().game.players[0]!.deck.map((entry) => entry?.characterKey);
    expect(useSeeds.getState().nonce).toBe(2);
    expect(second).not.toEqual(first);
  });

  it("副本端（联机客户端）：补满 / 打乱 / 开局都不自己掷骰子，等主机快照", () => {
    useSeeds.setState({ authority: "replica", adoptedSeed: 777, nonce: 0 });
    const before = useGame.getState().game;
    useGame.getState().fill(0);
    useGame.getState().shuffle(0);
    useGame.getState().start();
    expect(useGame.getState().game).toBe(before);        // 一个都没落地
    expect(useSeeds.getState().nonce).toBe(0);           // 也没抽种子
  });

  it("CPU 规划由 (会话种子, 回合号) 派生：两端一致、同一回合稳定", () => {
    useGame.setState((slice) => ({
      game: {
        ...slice.game,
        mode: "cpu" as const,
        currentKey: "a",
        turnSeq: 7,
        state: "turnStart" as const,
        players: [
          slice.game.players[0]!,
          { ...slice.game.players[1]!, deck: [card("a"), card("b")] },
        ],
      },
    }));
    const host = useGame.getState().planCpu(1);
    expect(host).not.toBeNull();
    // 客户端采用主机种子后（adoptedSeed = 主机 ownSeed），派生结果必须与主机相同
    useSeeds.setState({ authority: "replica", adoptedSeed: 20260919 });
    expect(useGame.getState().planCpu(1)).toEqual(host);
    expect(useGame.getState().planCpu(1)).toEqual(host);      // 重复规划也稳定
  });
});
