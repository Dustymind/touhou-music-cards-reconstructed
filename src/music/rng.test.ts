import { describe, expect, it } from "vitest";

import { createRng, pickWithSeed, randomStartPosition, shuffleWithSeed } from "./rng";

describe("seeded rng", () => {
  it("同种子同序列（联机两端一致的前提）", () => {
    const a = createRng(12345);
    const b = createRng(12345);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("不同种子给出不同序列", () => {
    expect(createRng(1)()).not.toBe(createRng(2)());
  });

  it("pickWithSeed 稳定且不越界", () => {
    const items = ["a", "b", "c", "d"];
    const first = pickWithSeed(items, 42);
    expect(pickWithSeed(items, 42)).toBe(first);
    expect(items).toContain(first);
    expect(pickWithSeed([], 42)).toBeNull();
  });

  it("shuffleWithSeed 是同种子的排列", () => {
    const items = [1, 2, 3, 4, 5];
    const once = shuffleWithSeed(items, 7);
    expect(shuffleWithSeed(items, 7)).toEqual(once);
    expect(once.slice().sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5]); // 不改原数组
  });

  it("随机起播跳过最后 10 秒，短曲从 0 开始", () => {
    expect(randomStartPosition(5, 999)).toBe(0);
    expect(randomStartPosition(100, 0)).toBe(0);            // ratio 0
    expect(randomStartPosition(100, 2147483646)).toBeCloseTo(90, 3);
    const position = randomStartPosition(200, 1234567);
    expect(position).toBeGreaterThanOrEqual(0);
    expect(position).toBeLessThanOrEqual(190);
  });
});
