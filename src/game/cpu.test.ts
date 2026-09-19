import { describe, expect, it } from "vitest";

import { createRng } from "../rng";
import { DEFAULT_CPU_SETTINGS, planCpuPick } from "./cpu";
import { emptyState, type CardInfo, type GameState } from "./types";
import * as rules from "./rules";

const card = (key: string): CardInfo => ({ characterKey: key, cardIndex: 0 });

function stateWith(cpuDeck: (CardInfo | null)[], currentKey: string | null): GameState {
  const base = rules.adjustDeckSize(emptyState({ mode: "cpu" }), 1, cpuDeck.length);
  return {
    ...base,
    currentKey,
    state: "turnStart",
    players: [
      base.players[0]!,
      { ...base.players[1]!, deck: cpuDeck.map((entry) => entry ?? null) },
    ],
  };
}

describe("planCpuPick", () => {
  const settings = { meanSeconds: 2, stdDevSeconds: 1, mistakeRate: 10 };
  const SPAN = Math.sqrt(3) * settings.stdDevSeconds;

  it("没有牌或没有当前角色时不规划", () => {
    expect(planCpuPick(stateWith([], null), 1, settings, createRng(1))).toBeNull();
    expect(planCpuPick(stateWith([card("a")], null), 1, settings, createRng(1))).toBeNull();
    expect(planCpuPick(stateWith([null, null], "a"), 1, settings, createRng(1))).toBeNull();
  });

  it("延迟 = mean ± √3σ，且不低于 0.1 秒", () => {
    // D104 之后 CPU 也用同一套种子随机数：这里断言的是**分布区间**，不再是"喂进去的假数"
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const plan = planCpuPick(stateWith([card("a")], "a"), 1, settings, createRng(seed))!;
      expect(plan.delayMs).toBeGreaterThanOrEqual(100);
      expect(plan.delayMs).toBeGreaterThanOrEqual((settings.meanSeconds - SPAN) * 1000);
      expect(plan.delayMs).toBeLessThanOrEqual((settings.meanSeconds + SPAN) * 1000);
    }
    const low = planCpuPick(stateWith([card("a")], "a"), 1,
      { ...settings, meanSeconds: 0.1 }, createRng(3))!;
    expect(low.delayMs).toBeGreaterThanOrEqual(100);
  });

  it("按失误率抢错：挑一张不是当前角色的牌", () => {
    const state = stateWith([card("a"), card("b")], "a");
    const plan = planCpuPick(state, 1, { ...settings, mistakeRate: 100 }, createRng(9))!;
    expect(plan.willMistake).toBe(true);
    expect(plan.card!.characterKey).toBe("b");
  });

  it("不失误时抢正确的那张", () => {
    const state = stateWith([card("a"), card("b")], "b");
    const plan = planCpuPick(state, 1, { ...settings, mistakeRate: 0 }, createRng(9))!;
    expect(plan.willMistake).toBe(false);
    expect(plan.card!.characterKey).toBe("b");
  });

  it("手里没有正确卡时只能抢错（且不会崩）", () => {
    const plan = planCpuPick(stateWith([card("a")], "z"), 1, { ...settings, mistakeRate: 0 },
      createRng(9))!;
    expect(plan.card!.characterKey).toBe("a");
  });

  it("默认设置可用，且同种子必然规划出同一套动作（可复盘）", () => {
    const state = stateWith([card("a"), card("b")], "a");
    const first = planCpuPick(state, 1, DEFAULT_CPU_SETTINGS, createRng(2024));
    const again = planCpuPick(state, 1, DEFAULT_CPU_SETTINGS, createRng(2024));
    expect(first).not.toBeNull();
    expect(again).toEqual(first);
  });
});
