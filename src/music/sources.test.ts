import { describe, expect, it, vi } from "vitest";

import { buildEntries, countResolvable, loadSourceTables, nextCandidate, resolveTrack } from "./sources";
import { trackId } from "../data/types";

const rows = [["紅魔郷", "おてんば恋娘", "https://a/1.mp3"], ["妖々夢", "クリスタライズシルバー", "https://a/2.mp3"]];

describe("sources resolver", () => {
  it("buildEntries 用 trackId 作键并跳过坏行", () => {
    const entries = buildEntries([...rows, ["x"], null, ["a", "b", ""]]);
    expect(entries.get(trackId("紅魔郷", "おてんば恋娘"))).toBe("https://a/1.mp3");
    expect(entries.size).toBe(2);
  });

  it("按顺序命中第一个有该曲目的源", () => {
    const tables = {
      s1: { id: "s1", status: "ready" as const, entries: new Map() },
      s2: { id: "s2", status: "ready" as const, entries: buildEntries(rows) },
    };
    expect(resolveTrack(tables, ["s1", "s2"], "紅魔郷", "おてんば恋娘")?.sourceId).toBe("s2");
    expect(resolveTrack(tables, ["s1"], "紅魔郷", "おてんば恋娘")).toBeNull();
  });

  it("记入失败集合的源会被跳过（运行时换源）", () => {
    const tables = {
      s1: { id: "s1", status: "ready" as const, entries: buildEntries(rows) },
      s2: { id: "s2", status: "ready" as const, entries: buildEntries(rows) },
    };
    const failed = new Set([`s1\u0000${trackId("紅魔郷", "おてんば恋娘")}`]);
    expect(nextCandidate(tables, ["s1", "s2"], "紅魔郷", "おてんば恋娘", failed)?.sourceId).toBe("s2");
    expect(nextCandidate(tables, ["s1"], "紅魔郷", "おてんば恋娘", failed)).toBeNull();
  });

  it("加载失败的源不参与解析，状态被记录", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("bad")) return new Response("no", { status: 500 });
      return new Response(JSON.stringify(rows), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await loadSourceTables([
      { id: "good", label: { en: "g", zh: "g" }, tableUrl: "/good.json", kind: "remote", order: 1, enabled: true, proxyable: false, description: { en: "", zh: "" } },
      { id: "bad", label: { en: "b", zh: "b" }, tableUrl: "/bad.json", kind: "remote", order: 2, enabled: true, proxyable: false, description: { en: "", zh: "" } },
      { id: "off", label: { en: "o", zh: "o" }, tableUrl: "/off.json", kind: "remote", order: 3, enabled: false, proxyable: false, description: { en: "", zh: "" } },
    ], {}, fetcher);
    expect(result.order).toEqual(["good", "bad"]);
    expect(result.tables.good!.status).toBe("ready");
    expect(result.tables.bad!.status).toBe("error");
    expect(result.tables.off!.status).toBe("idle");
    expect(resolveTrack(result.tables, result.order, "紅魔郷", "おてんば恋娘")?.sourceId).toBe("good");
    expect(countResolvable(result.tables, result.order)).toBe(2);
  });

  it("本地助手的 manifest（{tracks:[…]}）也能解析", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ schema: 1, pack: "otomads", tracks: rows }), { status: 200 })) as unknown as typeof fetch;
    const result = await loadSourceTables([
      { id: "local", label: { en: "l", zh: "l" }, tableUrl: "http://127.0.0.1:8011/manifest.json", kind: "local", order: 1, enabled: true, proxyable: false, description: { en: "", zh: "" } },
    ], {}, fetcher);
    expect(result.tables.local!.entries.size).toBe(2);
  });
});
