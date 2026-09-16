/** 计时器循环：3 秒倒计时自动推进 + CPU 到点出手（假计时器）。 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderHook, type HookResult } from "../test-utils";
import { useGame } from "./useGame";
import { TURN_COUNTDOWN_MS, useGameLoop } from "./useGameLoop";
import type { CardInfo } from "./types";

const card = (key: string): CardInfo => ({ characterKey: key, cardIndex: 0 });

function setup(order: string[], decks: [CardInfo[], CardInfo[]]): void {
  useGame.setState({
    cpu: { meanSeconds: 0.5, stdDevSeconds: 0, mistakeRate: 0 },
    game: {
      mode: "cpu",
      players: [
        { name: "You", isObserver: false, deck: decks[0], collected: [], confirmStart: false, confirmNext: false },
        { name: "CPU", isObserver: false, deck: decks[1], collected: [], confirmStart: false, confirmNext: false },
      ],
      deckRows: 1, deckColumns: Math.max(decks[0].length, 1), traditional: true, melee: false,
      order, temporaryDisabled: {}, currentKey: null, turnSeq: 0, state: "selecting",
      turnStartTimestamp: 0, pickEvents: [], turnWinner: null, givesLeft: 0, winner: null,
    },
    pool: [],
  });
}

describe("useGameLoop", () => {
  let active: HookResult<void> | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(async () => {
    await active?.unmount();
    active = null;
    vi.useRealTimers();
  });

  it("倒计时 3 秒后自动进入回合", async () => {
    setup(["a", "b"], [[card("a")], [card("b")]]);
    const hook = await renderHook(() => useGameLoop(true));
    active = hook;
    useGame.getState().start();
    await hook.rerender();
    expect(useGame.getState().game.state).toBe("countdown");

    await vi.advanceTimersByTimeAsync(TURN_COUNTDOWN_MS + 50);
    await hook.rerender();
    expect(useGame.getState().game.state).toBe("turnStart");
    expect(useGame.getState().game.currentKey).toBe("a");
  });

  it("CPU 在计划延迟后抢走正确卡", async () => {
    setup(["a"], [[card("x")], [card("a")]]);
    const hook = await renderHook(() => useGameLoop(true));
    active = hook;
    useGame.getState().start();
    await hook.rerender();
    await vi.advanceTimersByTimeAsync(TURN_COUNTDOWN_MS + 50);
    await hook.rerender();
    expect(useGame.getState().game.currentKey).toBe("a");

    // CPU 延迟 0.5s（mean=0.5, σ=0）
    await vi.advanceTimersByTimeAsync(600);
    await hook.rerender();
    const after = useGame.getState().game;
    expect(after.players[1]!.collected.map((entry) => entry.characterKey)).toEqual(["a"]);
  });

  it("关闭循环时不自动推进", async () => {
    setup(["a"], [[card("a")], [card("b")]]);
    const hook = await renderHook(() => useGameLoop(false));
    active = hook;
    useGame.getState().start();
    await hook.rerender();
    await vi.advanceTimersByTimeAsync(TURN_COUNTDOWN_MS + 100);
    await hook.rerender();
    expect(useGame.getState().game.state).toBe("countdown");
  });
});
