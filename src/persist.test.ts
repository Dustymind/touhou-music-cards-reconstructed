import { beforeEach, describe, expect, it } from "vitest";

import { defineStore, isKnownKey, pickBoolean, pickNumber, pickString, purgeLegacyKeys } from "./persist";
import { customPresetSpec } from "./store/customPreset";
import { customSingleSpec } from "./store/customSingle";
import { presetSpec } from "./store/preset";
import { queueSpec } from "./store/queue";
import { singleTrackSpec } from "./store/single";
import { sourceSpec } from "./store/sources";

interface Shape {
  a: number;
  b: string;
}

const spec = {
  name: "test",
  version: 1,
  fallback: { a: 0, b: "none" } as Shape,
  validate(raw: unknown): Shape | null {
    if (typeof raw !== "object" || raw === null) return null;
    const value = raw as Record<string, unknown>;
    const a = pickNumber(value.a, 0, 100);
    const b = pickString(value.b);
    return a === null || b === null ? null : { a, b };
  },
};

describe("persist", () => {
  beforeEach(() => localStorage.clear());

  it("无数据时给默认值", () => {
    expect(defineStore(spec).load()).toEqual({ a: 0, b: "none" });
  });

  it("存取往返", () => {
    const store = defineStore(spec);
    store.save({ a: 5, b: "x" });
    expect(store.load()).toEqual({ a: 5, b: "x" });
  });

  it("损坏的 JSON 只影响该键", () => {
    const store = defineStore(spec);
    const other = defineStore({ ...spec, name: "other" });
    localStorage.setItem("tmc.v1.test", "{ not json");
    other.save({ a: 9, b: "ok" });
    expect(store.load()).toEqual({ a: 0, b: "none" });
    expect(store.lastError()).toBe("JSON 解析失败");
    expect(other.load()).toEqual({ a: 9, b: "ok" });
  });

  it("内容不合法 → 回落默认值并记录原因", () => {
    localStorage.setItem("tmc.v1.test", JSON.stringify({ v: 1, data: { a: 999, b: "x" } }));
    const store = defineStore(spec);
    expect(store.load()).toEqual({ a: 0, b: "none" });
    expect(store.lastError()).toBe("内容校验失败");
  });

  it("版本不符 → 回落默认值（没有跨版本迁移那条路）", () => {
    localStorage.setItem("tmc.v1.test", JSON.stringify({ v: 2, data: { a: 1, b: "x" } }));
    const store = defineStore(spec);
    expect(store.load()).toEqual({ a: 0, b: "none" });
    expect(store.lastError()).toContain("版本不符");
  });

  it("缺少版本号 → 回落默认值", () => {
    localStorage.setItem("tmc.v1.test", JSON.stringify({ data: { a: 1, b: "x" } }));
    const store = defineStore(spec);
    expect(store.load()).toEqual({ a: 0, b: "none" });
    expect(store.lastError()).toBe("缺少版本号");
  });

  it("pick* 收窄工具", () => {
    expect(pickBoolean("yes")).toBeNull();
    expect(pickBoolean(true)).toBe(true);
    expect(pickString("zh", ["en", "zh"])).toBe("zh");
    expect(pickString("fr", ["en", "zh"])).toBeNull();
    expect(pickNumber(Number.NaN)).toBeNull();
    expect(pickNumber(5, 0, 3)).toBeNull();
  });
});

describe("旧设备存储键清理", () => {
  beforeEach(() => localStorage.clear());

  it("每个生产 spec 的键都在白名单里（漏登记会在这里红）", () => {
    const specs = [
      customPresetSpec(), customSingleSpec(),
      ...(["originals", "otomads", "custom"] as const).flatMap((mode) => [
        presetSpec(mode), queueSpec(mode), singleTrackSpec(mode), sourceSpec(mode),
      ]),
    ];
    for (const spec of specs) expect(isKnownKey(spec.name), spec.name).toBe(true);
    // 固定键与逐条公告键
    for (const fixed of ["session", "seed", "appearance", "game-setting"]) {
      expect(isKnownKey(fixed), fixed).toBe(true);
    }
    expect(isKnownKey("notice.any-id")).toBe(true);
  });

  it("清理只删白名单外的 `tmc.v1.*`，在役键与别名下的键一个不动", () => {
    localStorage.setItem("tmc.v1.session", "{}");              // 在役，保留
    localStorage.setItem("tmc.v1.preset.originals", "{}");     // 在役，保留
    localStorage.setItem("tmc.v1.notice.hello", "{}");         // 在役（前缀），保留
    localStorage.setItem("tmc.v1.sources", "{}");              // 已废弃的老单键，删
    localStorage.setItem("tmc.v1.preset", "{}");               // 已废弃（没有模式后缀），删
    localStorage.setItem("tmc.v1.single-track", "{}");         // 已废弃，删
    localStorage.setItem("tmc.v1.gone-thing", "{}");           // 已废弃，删
    localStorage.setItem("other-app-key", "{}");               // 别的命名空间，绝不动

    expect(purgeLegacyKeys().sort()).toEqual(
      ["tmc.v1.gone-thing", "tmc.v1.preset", "tmc.v1.single-track", "tmc.v1.sources"].sort());

    expect(localStorage.getItem("tmc.v1.session")).toBe("{}");
    expect(localStorage.getItem("tmc.v1.preset.originals")).toBe("{}");
    expect(localStorage.getItem("tmc.v1.notice.hello")).toBe("{}");
    expect(localStorage.getItem("other-app-key")).toBe("{}");
    expect(localStorage.getItem("tmc.v1.sources")).toBeNull();
  });

  it("没有可清理的键时是空操作", () => {
    localStorage.setItem("tmc.v1.seed", "{}");
    expect(purgeLegacyKeys()).toEqual([]);
    expect(localStorage.getItem("tmc.v1.seed")).toBe("{}");
  });
});
