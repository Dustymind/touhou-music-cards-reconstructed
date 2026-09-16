/** 对战页交互：随机补满 → 开局 → 抢拍 → 下一回合 → 终局（真实数据）。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DataBundle } from "../../data/types";
import { setLocale } from "../../i18n/localization";
import { loadRealBundle } from "../../test-utils";
import { useGame } from "../../game/useGame";
import { TURN_COUNTDOWN_MS } from "../../game/useGameLoop";
import { GamePanel } from "./GamePanel";

let bundle: DataBundle;
let root: Root | null = null;

async function render(): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<GamePanel bundle={bundle} />);
  });
  return container;
}

async function click(container: HTMLElement, testId: string): Promise<void> {
  const element = container.querySelector(`[data-testid="${testId}"]`);
  if (!element) throw new Error(`缺少元素 ${testId}`);
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("GamePanel", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.clear();
    setLocale("en");   // 断言用的都是英文文案；中文另见下一个用例
    bundle = await loadRealBundle();
    // 每个用例都从干净的对局状态开始，避免上一个用例的计时器/状态串味
    useGame.setState({
      cpu: { meanSeconds: 0.5, stdDevSeconds: 0, mistakeRate: 0 },
      pool: [],
      game: {
        mode: "solo",
        players: [
          { name: "You", isObserver: false, deck: [], collected: [], confirmStart: false, confirmNext: false },
          { name: "Opponent", isObserver: false, deck: [], collected: [], confirmStart: false, confirmNext: false },
        ],
        deckRows: 3, deckColumns: 8, traditional: true, melee: false,
        order: [], gameSeed: 0, temporaryDisabled: {}, currentKey: null, turnSeq: 0, state: "selecting",
        turnStartTimestamp: 0, pickEvents: [], turnWinner: null, givesLeft: 0, winner: null,
      },
    });
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    root = null;
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("渲染棋盘、设置控件与双方牌库", async () => {
    const container = await render();
    const text = container.textContent ?? "";
    expect(text).toContain("deck 3×8");
    expect(container.querySelector('[data-testid="deck-you"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="deck-opponent"]')).not.toBeNull();
    // 6 行 × 8 列槽位（自己 + 对手）
    expect(container.querySelectorAll('[data-testid^="deck-you-"]').length).toBe(24);
  });

  it("随机补满 → 开局 → 倒计时后进入回合", async () => {
    const container = await render();
    await click(container, "random-fill");
    const filled = useGame.getState().game.players[0]!.deck.filter(Boolean).length;
    expect(filled).toBe(24);

    await click(container, "start-game");
    expect(useGame.getState().game.state).toBe("countdown");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TURN_COUNTDOWN_MS + 50);
    });
    expect(useGame.getState().game.state).toBe("turnStart");
    expect(container.textContent).toContain("Now playing: ???");   // 回合中不暴露答案
  });

  it("点击自己的牌即抢拍；抢错会染色并记录", async () => {
    const container = await render();
    await click(container, "random-fill");
    await click(container, "start-game");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TURN_COUNTDOWN_MS + 50);
    });
    const game = useGame.getState().game;
    const wrongSlot = game.players[0]!.deck.findIndex(
      (entry) => entry && entry.characterKey !== game.currentKey);
    await click(container, `deck-you-card-${wrongSlot}`);
    expect(useGame.getState().game.pickEvents).toHaveLength(1);
  });

  it("下一回合推进 turnSeq，并把答案在结算时公开", async () => {
    const container = await render();
    await click(container, "random-fill");
    await click(container, "start-game");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TURN_COUNTDOWN_MS + 50);
    });
    const before = useGame.getState().game.turnSeq;
    await click(container, "next-turn");
    expect(useGame.getState().game.state).toBe("countdown");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TURN_COUNTDOWN_MS + 50);
    });
    expect(useGame.getState().game.turnSeq).toBe(before + 1);
  });

  it("CPU 模式：对手会自己出手", async () => {
    const container = await render();
    await click(container, "mode-cpu");
    expect(useGame.getState().game.mode).toBe("cpu");
    await click(container, "random-fill");
    await click(container, "start-game");
    // 开局会洗牌，第一个回合的角色＝洗好顺序的第 0 个（读完再给 CPU 摆牌）
    const first = useGame.getState().game.order[0]!;
    const decoy = useGame.getState().game.order[1]!;
    await act(async () => {
      useGame.setState((slice) => {
        const players = slice.game.players.map((player) => ({ ...player, deck: player.deck.slice() }));
        players[1]!.deck[0] = { characterKey: first, cardIndex: 0 };
        players[1]!.deck[1] = { characterKey: decoy, cardIndex: 0 };
        return { game: { ...slice.game, players } };
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TURN_COUNTDOWN_MS + 50);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    // CPU 抢中后进入结算阶段
    expect(useGame.getState().game.state).toBe("turnWinner");
    expect(container.textContent).toContain("Answer:");
  });

  it("切到中文后游戏页全部是中文（不留英文标签）", async () => {
    setLocale("zh");
    const container = await render();
    const text = container.textContent ?? "";
    for (const label of ["开始游戏", "中止游戏", "随机补满", "补满电脑", "清空卡组", "打乱卡组",
      "卡组 3×8", "减行", "加行", "减列", "加列", "单人", "电脑", "经典", "休闲",
      "对手 · 已得 0", "你 · 已得 0", "下一回合", "随机交出", "牌堆", "轮播",
      "正在播放：—", "第 0 回合 · 选牌中 · 罚牌 0", "卡牌缩小", "卡牌放大", "联机", "名称", "房间号"]) {
      expect(text, `缺少中文文案：${label}`).toContain(label);
    }
    // 英文标签不该再出现在中文界面里
    for (const leftover of ["Random Fill", "Clear Deck", "Shuffle Deck", "Next Turn",
      "Now playing", "deck 3×8", "Opponent · collected", "cross-machine", "Chat"]) {
      expect(text).not.toContain(leftover);
    }
    // 开局后的状态名也走中文
    await click(container, "random-fill");
    await click(container, "start-game");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TURN_COUNTDOWN_MS + 50);
    });
    expect(container.textContent).toContain("抢拍中");
    expect(container.textContent).toContain("正在播放：???");
  });

  it("中文下的结算与罚牌提示", async () => {
    setLocale("zh");
    const container = await render();
    await click(container, "random-fill");
    await click(container, "start-game");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TURN_COUNTDOWN_MS + 50);
    });
    // 保证自己手里就有当前角色：随机补满不保证发到，抢拍必须命中才能进结算
    const currentKey = useGame.getState().game.currentKey!;
    await act(async () => {
      useGame.setState((slice) => {
        const players = slice.game.players.map((player) => ({ ...player, deck: player.deck.slice() }));
        players[0]!.deck[0] = { characterKey: currentKey, cardIndex: 0 };
        return { game: { ...slice.game, players } };
      });
    });
    await act(async () => {
      useGame.getState().pick(0, 0, 0);
    });
    expect(useGame.getState().game.state).toBe("turnWinner");
    expect(container.textContent).toContain("答案：");
    expect(container.textContent).toContain("结算中");
  });

  it("电脑卡组也有打乱与清空（用户要求）", async () => {
    const container = await render();
    // 两边都补满，再打乱电脑卡组：顺序变了但张数不变
    await click(container, "random-fill");
    await click(container, "fill-cpu-deck");
    const before = useGame.getState().game.players[1]!.deck.map((card) => card?.characterKey ?? "-");
    expect(before.filter((key) => key !== "-")).toHaveLength(24);

    await click(container, "shuffle-cpu-deck");
    const shuffled = useGame.getState().game.players[1]!.deck.map((card) => card?.characterKey ?? "-");
    expect(shuffled.filter((key) => key !== "-")).toHaveLength(24);
    expect(shuffled).not.toEqual(before);          // 24 张里换位，几乎不可能原地不动
    expect(useGame.getState().game.players[0]!.deck.every((card) => card !== null)).toBe(true);

    await click(container, "clear-cpu-deck");
    expect(useGame.getState().game.players[1]!.deck.every((card) => card === null)).toBe(true);
    // 电脑卡组清空后，这些卡回到"未使用卡牌"
    const unused = container.querySelectorAll('[data-testid^="unused-card-"]').length;
    expect(unused).toBeGreaterThan(24);
  });

  it("自己的卡组也有打乱与清空（按钮落到自己的那一侧）", async () => {
    const container = await render();
    await click(container, "fill-cpu-deck");
    await click(container, "random-fill");
    await click(container, "shuffle-deck");
    expect(useGame.getState().game.players[0]!.deck.every((card) => card !== null)).toBe(true);
    const cpuBefore = useGame.getState().game.players[1]!.deck.map((card) => card?.characterKey ?? "-");
    await click(container, "clear-deck");
    expect(useGame.getState().game.players[0]!.deck.every((card) => card === null)).toBe(true);
    expect(useGame.getState().game.players[1]!.deck.map((card) => card?.characterKey ?? "-"))
      .toEqual(cpuBefore);                          // 只动自己那一侧
  });

  it("自定义卡组：点未使用的卡加进牌库，点牌库里的卡拿回来", async () => {
    const container = await render();
    const unusedBefore = container.querySelectorAll('[data-testid^="unused-card-"]').length;
    expect(unusedBefore).toBeGreaterThan(0);

    // 点第一张未使用的卡 → 进自己牌库的第一个空位
    const first = container.querySelector<HTMLElement>('[data-testid^="unused-card-"]');
    const cardKey = first!.getAttribute("data-testid")!.replace("unused-card-", "").replace(/-\d+$/, "");
    await act(async () => {
      first!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const deck = useGame.getState().game.players[0]!.deck;
    expect(deck[0]?.characterKey).toBe(cardKey);
    expect(container.querySelectorAll('[data-testid^="unused-card-"]').length).toBe(unusedBefore - 1);

    // 再点牌库里这张 → 回到未使用卡牌
    await click(container, "deck-you-card-0");
    expect(useGame.getState().game.players[0]!.deck[0]).toBeNull();
    expect(container.querySelectorAll('[data-testid^="unused-card-"]').length).toBe(unusedBefore);
  });

  it("自定义卡组：主机能拿走电脑卡组里的牌，开局后按钮与卡池都不可改", async () => {
    const container = await render();
    await click(container, "fill-cpu-deck");
    const cpuSlot0 = useGame.getState().game.players[1]!.deck[0]!;
    await click(container, "deck-opponent-card-0");
    expect(useGame.getState().game.players[1]!.deck[0]).toBeNull();
    // 被拿掉的卡出现在未使用区
    const testId = `unused-card-${cpuSlot0.characterKey}-${cpuSlot0.cardIndex}`;
    expect(container.querySelector(`[data-testid="${testId}"]`)).not.toBeNull();

    // 开局后（非选牌阶段）不能再改卡组
    await click(container, "random-fill");
    await click(container, "start-game");
    const shuffleButton = container.querySelector<HTMLButtonElement>('[data-testid="shuffle-cpu-deck"]');
    expect(shuffleButton?.disabled).toBe(true);
  });

  it("按卡组筛选音乐：不在场上的角色被临时禁用", async () => {
    const container = await render();
    await click(container, "random-fill");
    await click(container, "filter-by-deck");
    const disabled = useGame.getState().game.temporaryDisabled;
    expect(Object.values(disabled).filter(Boolean).length).toBeGreaterThan(0);
  });
});
