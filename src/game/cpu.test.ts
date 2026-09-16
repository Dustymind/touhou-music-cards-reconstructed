import { describe, expect, it } from "vitest";

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

/** 按给定序列出数的假 rng。 */
function scripted(values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
}

describe("planCpuPick", () => {
  const settings = { meanSeconds: 2, stdDevSeconds: 1, mistakeRate: 10 };

  it("没有牌或没有当前角色时不规划", () => {
    expect(planCpuPick(stateWith([], null), 1, settings)).toBeNull();
    expect(planCpuPick(stateWith([card("a")], null), 1, settings)).toBeNull();
    expect(planCpuPick(stateWith([null, null], "a"), 1, settings)).toBeNull();
  });

  it("延迟 = mean ± √3σ，且不低于 0.1 秒", () => {
    const rng = scripted([0.5, 1]);      // 0.5 → 居中；失误判定用 1（不失误）
    expect(planCpuPick(stateWith([card("a")], "a"), 1, settings, rng)!.delayMs).toBeCloseTo(2000, 5);
    const low = planCpuPick(stateWith([card("a")], "a"), 1, { ...settings, meanSeconds: 0.1 },
      scripted([0, 1]))!;
    expect(low.delayMs).toBeGreaterThanOrEqual(100);
    const high = planCpuPick(stateWith([card("a")], "a"), 1, settings, scripted([1, 1]))!;
    expect(high.delayMs).toBeCloseTo((2 + Math.sqrt(3)) * 1000, 5);
  });

  it("按失误率抢错：挑一张不是当前角色的牌", () => {
    const state = stateWith([card("a"), card("b")], "a");
    const plan = planCpuPick(state, 1, { ...settings, mistakeRate: 100 }, scripted([0.5, 0, 0]))!;
    expect(plan.willMistake).toBe(true);
    expect(plan.card!.characterKey).toBe("b");
  });

  it("不失误时抢正确的那张", () => {
    const state = stateWith([card("a"), card("b")], "b");
    const plan = planCpuPick(state, 1, { ...settings, mistakeRate: 0 }, scripted([0.5, 1]))!;
    expect(plan.willMistake).toBe(false);
    expect(plan.card!.characterKey).toBe("b");
  });

  it("手里没有正确卡时只能抢错（且不会崩）", () => {
    const plan = planCpuPick(stateWith([card("a")], "z"), 1, { ...settings, mistakeRate: 0 },
      scripted([0.5, 1]))!;
    expect(plan.card!.characterKey).toBe("a");
  });

  it("默认设置可用", () => {
    const plan = planCpuPick(stateWith([card("a")], "a"), 1, DEFAULT_CPU_SETTINGS, scripted([0.5, 1]));
    expect(plan).not.toBeNull();
  });
});
