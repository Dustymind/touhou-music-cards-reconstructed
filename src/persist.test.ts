import { beforeEach, describe, expect, it } from "vitest";

import { defineStore, pickBoolean, pickNumber, pickString } from "./persist";

interface Shape {
  a: number;
  b: string;
}

const spec = {
  name: "test",
  version: 2,
  fallback: { a: 0, b: "none" } as Shape,
  validate(raw: unknown): Shape | null {
    if (typeof raw !== "object" || raw === null) return null;
    const value = raw as Record<string, unknown>;
    const a = pickNumber(value.a, 0, 100);
    const b = pickString(value.b);
    return a === null || b === null ? null : { a, b };
  },
  migrate(raw: unknown, fromVersion: number): Shape | null {
    if (fromVersion === 1 && typeof raw === "string") return { a: 1, b: raw };
    return null;
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
    localStorage.setItem("tmc.v1.test", JSON.stringify({ v: 2, data: { a: 999, b: "x" } }));
    const store = defineStore(spec);
    expect(store.load()).toEqual({ a: 0, b: "none" });
    expect(store.lastError()).toBe("内容校验失败");
  });

  it("旧版本走迁移函数", () => {
    localStorage.setItem("tmc.v1.test", JSON.stringify({ v: 1, data: "legacy" }));
    expect(defineStore(spec).load()).toEqual({ a: 1, b: "legacy" });
  });

  it("迁移失败则回落默认值", () => {
    localStorage.setItem("tmc.v1.test", JSON.stringify({ v: 1, data: 42 }));
    const store = defineStore(spec);
    expect(store.load()).toEqual({ a: 0, b: "none" });
    expect(store.lastError()).toBe("无法从 v1 迁移");
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
