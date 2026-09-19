/** 随机数契约测试（`docs/rng-v1.md`）：**冻结向量** —— 这些数字变了就等于改了协议，
 *  联机两端（不同浏览器 / 不同版本）会算出不同结果，所以必须同步升级 `PROTOCOL_VERSION`。 */
import { describe, expect, it } from "vitest";

import {
  SEED_MAX, createRng, deriveSeed, ephemeralIntBelow, ephemeralRandom, newSeed, pickWithSeed,
  randomStartPosition, randomToken, shuffleWithSeed, stableHash,
} from "./index";

describe("createRng（mulberry32，冻结向量）", () => {
  it("同种子同序列（联机两端一致的前提）", () => {
    const a = createRng(12345);
    const b = createRng(12345);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it("冻结：createRng(12345) 的头三个数", () => {
    const rng = createRng(12345);
    expect([rng.next(), rng.next(), rng.next()]).toEqual([4207900869, 1317490944, 2079646450]);
    const floats = createRng(12345);
    expect([floats.float(), floats.float(), floats.float()].map((value) => Number(value.toFixed(9))))
      .toEqual([0.979728268, 0.306752264, 0.484205422]);
  });

  it("不同种子给出不同序列", () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it("intBelow 落在 [0, bound)，且 bound <= 0 时返回 0", () => {
    const rng = createRng(7);
    const values = Array.from({ length: 500 }, () => rng.intBelow(10));
    expect(values.every((value) => Number.isInteger(value) && value >= 0 && value < 10)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(5);          // 不是常数
    expect(createRng(7).intBelow(0)).toBe(0);
    expect(createRng(7).intBelow(-3)).toBe(0);
  });

  it("float 落在 [0,1)", () => {
    const rng = createRng(99);
    for (let index = 0; index < 500; index += 1) {
      const value = rng.float();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("pick / shuffle：空数组安全、不改原数组", () => {
    expect(createRng(3).pick([])).toBeNull();
    const items = [1, 2, 3, 4, 5];
    const shuffled = createRng(3).shuffle(items);
    expect(shuffled.slice().sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5]);
    expect(createRng(3).shuffle(items)).toEqual(shuffled);    // 同种子可复现
  });
});

describe("deriveSeed（唯一派生方式）", () => {
  it("冻结：几个常用标签的派生结果", () => {
    expect(deriveSeed(12345, "turn", 3, "cirno")).toBe(369832200);
    expect(deriveSeed(12345, "turn", 3, "-")).toBe(395564828);
    expect(stableHash("Alice")).toBe(810019001);
    expect(deriveSeed(0, "hash", "abc")).toBe(1159611592);
  });

  it("邻近输入完全打散（不是 seed + n 的线性近似）", () => {
    const a = deriveSeed(0, "hash", "abc");
    const b = deriveSeed(0, "hash", "abd");
    expect(Math.abs(a - b)).toBeGreaterThan(1_000_000);
    const near = [1, 2, 3, 4, 5].map((turn) => deriveSeed(12345, "turn", turn, "cirno"));
    expect(new Set(near).size).toBe(5);
  });

  it("标签有序：('a','b') 与 ('b','a') 必不同；数字与字符串不混同", () => {
    expect(deriveSeed(5, "a", "b")).not.toBe(deriveSeed(5, "b", "a"));
    expect(deriveSeed(5, 7)).not.toBe(deriveSeed(5, "7"));
  });

  it("结果始终是合法种子（[0, SEED_MAX] 的整数）", () => {
    for (let index = 0; index < 2000; index += 1) {
      const seed = deriveSeed(index, "x", index, `s${index}`);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(SEED_MAX);
    }
  });
});

describe("种子生成与非种子随机（分开标注，别混用）", () => {
  it("newSeed 落在值域内，且几乎不会重复", () => {
    const seeds = new Set(Array.from({ length: 200 }, () => newSeed()));
    expect(seeds.size).toBeGreaterThan(190);
    for (const seed of seeds) {
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(SEED_MAX);
    }
  });

  it("randomToken 是标识（不含易混字符、长度固定、不重复）", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => randomToken(6)));
    expect(tokens.size).toBeGreaterThan(190);
    for (const token of tokens) expect(token).toMatch(/^[a-z0-9]{6}$/);
    expect(randomToken(3)).toHaveLength(3);
  });

  it("ephemeralRandom / ephemeralIntBelow 只用于装饰，边界安全", () => {
    for (let index = 0; index < 200; index += 1) {
      const value = ephemeralRandom();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      const indexBelow = ephemeralIntBelow(5);
      expect(indexBelow).toBeGreaterThanOrEqual(0);
      expect(indexBelow).toBeLessThan(5);
    }
    expect(ephemeralIntBelow(0)).toBe(0);
  });
});

describe("按种子取用（pick / shuffle / 起播位置）", () => {
  it("pickWithSeed 稳定且不越界", () => {
    const items = ["a", "b", "c", "d"];
    const first = pickWithSeed(items, 42, "track", "marisa");
    expect(pickWithSeed(items, 42, "track", "marisa")).toBe(first);
    expect(items).toContain(first);
    expect(pickWithSeed([], 42, "track", "marisa")).toBeNull();
  });

  it("不同标签会落到不同曲目（旧实现 seed + order*7919 会撞）", () => {
    const items = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const picks = ["k1", "k2", "k3", "k4", "k5"].map((key) => pickWithSeed(items, 777, "track", key));
    expect(new Set(picks).size).toBeGreaterThan(2);
  });

  it("shuffleWithSeed 是同种子的排列，且标签参与", () => {
    const items = [1, 2, 3, 4, 5];
    expect(shuffleWithSeed(items, 7, "queue")).toEqual([5, 3, 2, 4, 1]);      // 冻结向量
    expect(shuffleWithSeed(items, 7, "queue")).toEqual(shuffleWithSeed(items, 7, "queue"));
    expect(shuffleWithSeed(items, 7, "deck")).not.toEqual(shuffleWithSeed(items, 7, "queue"));
    expect(items).toEqual([1, 2, 3, 4, 5]);                                    // 不改原数组
  });

  it("随机起播：跳过最后 10 秒、短曲从 0 开始、同一首稳定 / 不同首不同", () => {
    expect(randomStartPosition(5, 999, "x")).toBe(0);
    expect(randomStartPosition(100, 999, "track-a")).toBeCloseTo(1.769447, 5);   // 冻结向量
    expect(randomStartPosition(100, 999, "track-a")).toBe(randomStartPosition(100, 999, "track-a"));
    expect(randomStartPosition(100, 999, "track-b")).not.toBe(randomStartPosition(100, 999, "track-a"));
    for (const duration of [10, 60, 200, 3600]) {
      const position = randomStartPosition(duration, 1234567, "x");
      expect(position).toBeGreaterThanOrEqual(0);
      expect(position).toBeLessThanOrEqual(Math.max(0, duration - 10));
    }
  });
});
