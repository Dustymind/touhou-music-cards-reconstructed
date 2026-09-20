/** 种子权威：谁生成、谁采用、谁能抽（D104）。 */
import { beforeEach, describe, expect, it } from "vitest";

import { SEED_MAX } from "../rng";
import { bootstrapSeed, useSeeds } from "./seeds";

function reset(overrides: Partial<Parameters<typeof useSeeds.setState>[0]> = {}): void {
  useSeeds.setState({ ownSeed: 1000, adoptedSeed: null, authority: "authority", nonce: 0, ...overrides });
}

describe("种子权威", () => {
  beforeEach(() => {
    localStorage.clear();
    reset();
  });

  it("默认是权威端（单机 = 本机自己说了算），会话种子 = 自己的种子", () => {
    const state = useSeeds.getState();
    expect(state.authority).toBe("authority");
    expect(state.sessionSeed()).toBe(1000);
  });

  it("draw：权威端每次抽不同子种子，且都在值域内", () => {
    const first = useSeeds.getState().draw("fill", 0);
    const second = useSeeds.getState().draw("fill", 0);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first).not.toBe(second);                       // nonce 变了 → 子种子也变
    for (const seed of [first!, second!]) {
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(SEED_MAX);
    }
    expect(useSeeds.getState().nonce).toBe(2);
  });

  it("derive：两端同种子必得同值，不消耗 nonce（可反复调用）", () => {
    const host = useSeeds.getState().derive("cpu", 3);
    expect(useSeeds.getState().derive("cpu", 3)).toBe(host);
    expect(useSeeds.getState().nonce).toBe(0);

    // 客户端采用主机的种子（1000）后，派生结果与主机一致
    reset({ authority: "replica", adoptedSeed: 1000 });
    expect(useSeeds.getState().derive("cpu", 3)).toBe(host);
    // 换了种子就不同
    reset({ authority: "replica", adoptedSeed: 1001 });
    expect(useSeeds.getState().derive("cpu", 3)).not.toBe(host);
  });

  it("副本端（联机客户端）：不能自己抽种子 / 换种子", () => {
    reset({ authority: "replica", adoptedSeed: 2000 });
    expect(useSeeds.getState().draw("fill", 0)).toBeNull();
    expect(useSeeds.getState().roll()).toBeNull();
    expect(useSeeds.getState().ownSeed).toBe(1000);        // 自己那份没被动过
    expect(useSeeds.getState()).toBeDefined();
  });

  it("adopt：采用主机种子（不落盘），离开房间后回到自己那份", () => {
    const seeds = useSeeds.getState();
    seeds.setAuthority("replica");
    seeds.adopt(4321);
    expect(useSeeds.getState().sessionSeed()).toBe(4321);
    expect(localStorage.getItem("tmc.v1.seed") ?? "").not.toContain("4321");

    useSeeds.getState().setAuthority("authority");
    expect(useSeeds.getState().sessionSeed()).toBe(1000);
    expect(useSeeds.getState().adoptedSeed).toBeNull();
  });

  it("adopt 拒收脏值（线上来的字段一律校验）", () => {
    useSeeds.getState().setAuthority("replica");
    useSeeds.getState().adopt(2000);
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, SEED_MAX + 1, 2 ** 32]) {
      useSeeds.getState().adopt(bad as number);
      expect(useSeeds.getState().sessionSeed()).toBe(2000);
    }
  });

  it("roll：权威端换一个新种子并落盘；副本端返回 null", () => {
    const rolled = useSeeds.getState().roll();
    expect(rolled).not.toBeNull();
    expect(useSeeds.getState().ownSeed).toBe(rolled);
    const saved = JSON.parse(localStorage.getItem("tmc.v1.seed")!) as { data: { ownSeed: number } };
    expect(saved.data.ownSeed).toBe(rolled);

    reset({ authority: "replica", adoptedSeed: 555 });
    expect(useSeeds.getState().roll()).toBeNull();
    expect(useSeeds.getState().ownSeed).toBe(1000);
  });

  it("D104 迁移：旧 queue 存档里的轮播种子会被搬进种子商店", () => {
    localStorage.clear();
    localStorage.setItem("tmc.v1.queue", JSON.stringify({
      v: 1, data: { order: ["a"], temporaryDisabled: {}, currentKey: "a", seed: 424242 },
    }));
    // 直接调引导函数，而不是 resetModules + 重新 import（浏览器模式下顶层副作用不会重跑）
    expect(bootstrapSeed()).toBe(424242);
    expect(localStorage.getItem("tmc.v1.seed")).toContain("424242");
  });

  it("首次运行：没有存档就生成一个权威种子并落盘", () => {
    localStorage.clear();
    const seed = bootstrapSeed();
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(SEED_MAX);
    const saved = JSON.parse(localStorage.getItem("tmc.v1.seed")!) as { data: { ownSeed: number } };
    expect(saved.data.ownSeed).toBe(seed);
  });
});
