/** 音源开关与回退顺序（用户存档）：**按音乐模式分键**（契约 `docs/sources-separation-v1.md` §4）。 */
import { beforeEach, describe, expect, it } from "vitest";

import { defineStore } from "../persist";
import { useSession } from "./session";
import { effectiveOrder, sourceSpec, sourceStoreFor } from "./sources";

const ids = ["netease163", "cloudflare_r2", "thbwiki"];
/** 注册表里的默认开关（各自的 toml 决定） */
const defaults: Record<string, boolean> = { netease163: true, cloudflare_r2: true, thbwiki: true };

const originals = sourceStoreFor("originals");
const otomads = sourceStoreFor("otomads");

describe("effectiveOrder", () => {
  beforeEach(() => localStorage.clear());

  it("覆盖过的按 order 排前，未覆盖的保持注册顺序在后", () => {
    expect(effectiveOrder({}, ["a", "b", "c"])).toEqual(["a", "b", "c"]);
    expect(effectiveOrder(
      { c: { enabled: true, order: 1 }, a: { enabled: false, order: 2 } },
      ["a", "b", "c"],
    )).toEqual(["c", "a", "b"]);
  });
});

describe("音乐源顺序与开关（用户反馈后的回归）", () => {
  beforeEach(() => {
    localStorage.clear();
    useSession.setState({ musicMode: "originals" });
    originals.setState({ overrides: {} });
    otomads.setState({ overrides: {} });
  });

  it("开关某个源不会打乱已经排好的顺序", () => {
    const { move, toggle } = originals.getState();
    // 把 thbwiki 移到最前
    move("thbwiki", -1, ids, defaults);
    move("thbwiki", -1, ids, defaults);
    expect(effectiveOrder(originals.getState().overrides, ids))
      .toEqual(["thbwiki", "netease163", "cloudflare_r2"]);

    // 现在关掉 cloudflare_r2：顺序必须保持
    toggle("cloudflare_r2", false, ids);
    const after = originals.getState().overrides;
    expect(effectiveOrder(after, ids)).toEqual(["thbwiki", "netease163", "cloudflare_r2"]);
    expect(after.cloudflare_r2!.enabled).toBe(false);
    // 位置不重复
    expect(new Set(Object.values(after).map((entry) => entry.order)).size).toBe(3);
  });

  it("重排不会把默认关闭的源打开", () => {
    // 用一份"本地源默认关"的注册表来验：重排时没覆盖过的源必须沿用默认开关
    const withLocal = [...ids, "local"];
    const localDefaults = { ...defaults, local: false };
    const { move } = originals.getState();
    move("thbwiki", -1, withLocal, localDefaults);
    const after = originals.getState().overrides;
    expect(after.local!.enabled).toBe(false);          // 仍是关的
    expect(after.local!.order).toBe(4);                // 只是位置信息
    expect(after.netease163!.enabled).toBe(true);
  });

  it("开关只改 enabled，不改 order", () => {
    const { move, toggle } = originals.getState();
    move("thbwiki", -1, ids, defaults);
    const before = originals.getState().overrides.thbwiki!.order;
    toggle("thbwiki", false, ids);
    expect(originals.getState().overrides.thbwiki!.order).toBe(before);
  });

  it("两模式各记各的：原曲侧关掉一个源，音MAD 侧不受影响", () => {
    originals.getState().toggle("netease163", false, ids);
    expect(originals.getState().overrides.netease163!.enabled).toBe(false);
    expect(otomads.getState().overrides).toEqual({});
    // 落盘也是两把键
    expect(localStorage.getItem("tmc.v1.sources.originals")).toContain("netease163");
    expect(localStorage.getItem("tmc.v1.sources.otomads")).toBeNull();
  });
});

describe("老存档迁移（单键 → .originals）", () => {
  beforeEach(() => localStorage.clear());

  it("老键搬到 .originals，音MAD 从空表长起，老键不删", () => {
    localStorage.setItem("tmc.v1.sources", JSON.stringify({
      v: 1, data: { thbwiki: { enabled: false, order: 1 } },
    }));
    expect(defineStore(sourceSpec("originals")).load()).toEqual({ thbwiki: { enabled: false, order: 1 } });
    expect(localStorage.getItem("tmc.v1.sources.originals")).toContain("thbwiki");
    expect(localStorage.getItem("tmc.v1.sources")).toContain("thbwiki");     // 老键保留
    expect(defineStore(sourceSpec("otomads")).load()).toEqual({});           // 音MAD 是空表
  });
});
