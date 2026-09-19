/** 主机侧意图落地：牌组编辑（自定义卡组 / 补满 / 打乱 / 清空）与权限边界。 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as rules from "../game/rules";
import { emptyState, type CardInfo } from "../game/types";
import { useGame } from "../game/useGame";
import { useSeeds } from "../store/seeds";
import { applyIntentLocally } from "./useNet";

const POOL: CardInfo[] = Array.from({ length: 12 }, (_unused, index) => ({
  characterKey: `char-${index}`,
  cardIndex: 0,
}));

const deckKeys = (player: number): string[] =>
  useGame.getState().game.players[player]!.deck.map((card) => card?.characterKey ?? "-");

beforeEach(() => {
  useGame.setState({ game: rules.adjustDeckSize(emptyState(), 2, 2), pool: POOL });
  // 权威端（主机）固定种子：随机结果可复现（D104）
  useSeeds.setState({ ownSeed: 20260919, adoptedSeed: null, authority: "authority", nonce: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("牌组编辑意图", () => {
  it("客户端只能动自己那一份：打乱/清空/补满都只作用于 from", () => {
    applyIntentLocally({ kind: "fillDeck", player: 0 }, 0);          // 主机补自己
    applyIntentLocally({ kind: "fillDeck", player: 1 }, 1);          // 客户端补自己
    expect(deckKeys(0).filter((key) => key !== "-")).toHaveLength(4);
    expect(deckKeys(1).filter((key) => key !== "-")).toHaveLength(4);

    // 打乱自己那一份会真的执行：牌还是同一批（顺序由**种子**决定，不再打桩 Math.random）
    const before = [...deckKeys(1)].sort();
    const nonceBefore = useSeeds.getState().nonce;
    applyIntentLocally({ kind: "shuffleDeck", player: 1 }, 1);
    expect([...deckKeys(1)].sort()).toEqual(before);                  // 客户端打乱自己的牌库生效
    expect(useSeeds.getState().nonce).toBe(nonceBefore + 1);          // 且真的向权威要了一个子种子

    const hostBefore = deckKeys(0);
    const hostNonce = useSeeds.getState().nonce;
    applyIntentLocally({ kind: "shuffleDeck", player: 0 }, 1);        // 客户端想动主机的牌库
    expect(deckKeys(0)).toEqual(hostBefore);                          // 被拒绝
    expect(useSeeds.getState().nonce).toBe(hostNonce);                // 连随机数都不该抽（D104）

    applyIntentLocally({ kind: "clearDeck", player: 0 }, 1);
    expect(deckKeys(0).filter((key) => key !== "-")).toHaveLength(4); // 仍然拒绝
    applyIntentLocally({ kind: "clearDeck", player: 1 }, 1);
    expect(deckKeys(1).every((key) => key === "-")).toBe(true);       // 自己的可以清
  });

  it("主机（from=0）可以替电脑/对手改牌库", () => {
    applyIntentLocally({ kind: "fillDeck", player: 1 }, 0);
    expect(deckKeys(1).filter((key) => key !== "-")).toHaveLength(4);
    applyIntentLocally({ kind: "clearDeck", player: 1 }, 0);
    expect(deckKeys(1).every((key) => key === "-")).toBe(true);
  });

  it("自定义加牌：放进第一个空位，重复加同一张被拒绝", () => {
    applyIntentLocally({ kind: "addCard", player: 1, card: POOL[3]! }, 1);
    expect(deckKeys(1)[0]).toBe("char-3");
    applyIntentLocally({ kind: "addCard", player: 1, card: POOL[3]! }, 1);
    expect(deckKeys(1).filter((key) => key === "char-3")).toHaveLength(1);
    // 客户端不能把牌塞进主机牌库
    applyIntentLocally({ kind: "addCard", player: 0, card: POOL[5]! }, 1);
    expect(deckKeys(0).every((key) => key === "-")).toBe(true);
    // 指定槽位也行
    applyIntentLocally({ kind: "addCard", player: 1, card: POOL[5]!, slot: 3 }, 1);
    expect(deckKeys(1)[3]).toBe("char-5");
  });

  it("拖动放置与指定交牌：主机落地，客户端只能动自己的", () => {
    // 客户端把手里第 0 张挪到第 3 个槽位
    applyIntentLocally({ kind: "addCard", player: 1, card: POOL[2]! }, 1);
    applyIntentLocally({ kind: "moveDeckCard", player: 1, fromSlot: 0, toPlayer: 1, toSlot: 3 }, 1);
    expect(deckKeys(1)[3]).toBe("char-2");
    expect(deckKeys(1)[0]).toBe("-");

    // 客户端想挪主机的牌库：拒绝
    applyIntentLocally({ kind: "fillDeck", player: 0 }, 0);
    const hostBefore = deckKeys(0);
    applyIntentLocally({ kind: "moveDeckCard", player: 0, fromSlot: 0, toPlayer: 0, toSlot: 3 }, 1);
    expect(deckKeys(0)).toEqual(hostBefore);

    // 指定交牌：欠牌的是 0 号，客户端（1 号）交不动
    applyIntentLocally({ kind: "fillDeck", player: 1 }, 1);
    useGame.setState((slice) => ({ game: { ...slice.game, givesLeft: 1 } }));
    const guestBefore = deckKeys(1);
    applyIntentLocally({ kind: "giveCard", fromSlot: 0, toSlot: 0 }, 1);
    expect(deckKeys(1)).toEqual(guestBefore);
    expect(useGame.getState().game.givesLeft).toBe(1);

    // 主机交牌：卡从自己手里进对方空位，givesLeft 归零（先把对方牌库清空看好落点）
    applyIntentLocally({ kind: "clearDeck", player: 1 }, 0);
    const hostCard = useGame.getState().game.players[0]!.deck[0]!;
    applyIntentLocally({ kind: "giveCard", fromSlot: 0, toSlot: 1 }, 0);
    expect(useGame.getState().game.players[0]!.deck[0]).toBeNull();
    expect(useGame.getState().game.players[1]!.deck[1]).toEqual(hostCard);
    expect(useGame.getState().game.givesLeft).toBe(0);
  });

  it("自定义拿牌：只能拿自己那一侧的", () => {
    applyIntentLocally({ kind: "addCard", player: 1, card: POOL[1]! }, 1);
    applyIntentLocally({ kind: "removeCard", player: 1, slot: 0 }, 1);
    expect(deckKeys(1)[0]).toBe("-");

    applyIntentLocally({ kind: "fillDeck", player: 0 }, 0);
    applyIntentLocally({ kind: "removeCard", player: 0, slot: 0 }, 1);
    expect(deckKeys(0)[0]).not.toBe("-");                            // 主机牌库动不了
  });
});
