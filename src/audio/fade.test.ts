/** 短淡入淡出的线性包络：时间基（后台标签页被节流时不会卡在半路）。 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { FADE_STEP_MS, GAME_FADE_MS, rampGain } from "./fade";

describe("rampGain", () => {
  afterEach(() => vi.useRealTimers());

  it("从 from 到 to：立刻回调起点，到点回调终点，中间单调", () => {
    vi.useFakeTimers();
    const values: number[] = [];
    const stop = rampGain(0, 1, GAME_FADE_MS, (gain) => values.push(gain));
    try {
      expect(values).toEqual([0]);                       // 起点立刻落地（起播前就得是 0 ✓）
      vi.advanceTimersByTime(GAME_FADE_MS / 2);
      const middle = values[values.length - 1]!;
      expect(middle).toBeGreaterThan(0);
      expect(middle).toBeLessThan(1);
      vi.advanceTimersByTime(GAME_FADE_MS);
      expect(values[values.length - 1]).toBe(1);
      expect(values.every((value, index) => index === 0 || value >= values[index - 1]!)).toBe(true);
    } finally {
      stop();
    }
  });

  it("取消之后不再有任何回调（也不补一次终点）", () => {
    vi.useFakeTimers();
    const values: number[] = [];
    const stop = rampGain(0, 1, GAME_FADE_MS, (gain) => values.push(gain));
    vi.advanceTimersByTime(FADE_STEP_MS * 2);
    const seen = values.length;
    stop();
    vi.advanceTimersByTime(GAME_FADE_MS * 3);
    expect(values.length).toBe(seen);
  });

  it("ms <= 0 或起止相同：只回调一次终点", () => {
    const values: number[] = [];
    rampGain(1, 1, GAME_FADE_MS, (gain) => values.push(gain));
    rampGain(0, 1, 0, (gain) => values.push(gain));
    expect(values).toEqual([1, 1]);
  });
});
