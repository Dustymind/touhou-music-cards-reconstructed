import { describe, expect, it, vi } from "vitest";

import { applyLocalManifestUrl, normalizeLocalManifestUrl, buildEntries, countResolvable, loadSourceTables, nextCandidate, resolveTrack, sourceRelativeUrl } from "./sources";
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

describe("本地曲库地址（单端口同源 / 本机分离两种形态）", () => {
  const sources = [
    { id: "netease163", kind: "remote", tableUrl: "data/sources/netease163.json" },
    { id: "local", kind: "local", tableUrl: "manifest.json" },
  ] as unknown as Parameters<typeof applyLocalManifestUrl>[0];

  it("归一化：空 → null；基地址补 manifest.json；host:port 补协议；完整 json 原样", () => {
    expect(normalizeLocalManifestUrl("")).toBeNull();
    expect(normalizeLocalManifestUrl("   ")).toBeNull();
    expect(normalizeLocalManifestUrl("127.0.0.1:8011")).toBe("http://127.0.0.1:8011/manifest.json");
    expect(normalizeLocalManifestUrl("127.0.0.1:8011/")).toBe("http://127.0.0.1:8011/manifest.json");
    expect(normalizeLocalManifestUrl("http://127.0.0.1:8011")).toBe("http://127.0.0.1:8011/manifest.json");
    expect(normalizeLocalManifestUrl("https://cards.example.com/music/"))
      .toBe("https://cards.example.com/music/manifest.json");
    expect(normalizeLocalManifestUrl("https://x/y/table.json")).toBe("https://x/y/table.json");
  });

  it("默认（空覆盖）保持数据里的相对路径 = 同源", () => {
    const applied = applyLocalManifestUrl(sources, "");
    expect(applied.find((source) => source.id === "local")!.tableUrl).toBe("manifest.json");
    expect(applied.find((source) => source.id === "netease163")!.tableUrl)
      .toBe("data/sources/netease163.json");
  });

  it("给了覆盖值：只改 local 源，镜像源不受影响", () => {
    const applied = applyLocalManifestUrl(sources, "127.0.0.1:8011");
    expect(applied.find((source) => source.id === "local")!.tableUrl)
      .toBe("http://127.0.0.1:8011/manifest.json");
    expect(applied.find((source) => source.id === "netease163")!.tableUrl)
      .toBe("data/sources/netease163.json");
    // 不改写入参
    expect(sources[1]!.tableUrl).toBe("manifest.json");
  });
});

describe("源表地址：部署形态无关（D131）", () => {
  /** 子目录部署（GitHub Pages 项目页 `user.github.io/<repo>/`）下，根绝对路径会打到**域名根**上去。
   *  这里把"相对路径按页面 URL 解析"这件事钉住 —— 前端只负责把数据里的字符串交给 `fetch()`，
   *  所以正确性完全取决于数据里那条字符串不带前导 `/`（生成侧由 `tmc.build`/`tmc.validate` 守）。 */
  const pageBase = "https://user.github.io/tmc/sub/";

  it("相对路径按页面地址解析，子目录部署也落在站点内", () => {
    expect(new URL("data/sources/netease163.json", pageBase).href)
      .toBe("https://user.github.io/tmc/sub/data/sources/netease163.json");
    expect(new URL("manifest.json", pageBase).href)
      .toBe("https://user.github.io/tmc/sub/manifest.json");
  });

  it("根绝对路径会跑到站点外面（就是那个 Bug 的形状）", () => {
    expect(new URL("/data/sources/netease163.json", pageBase).href)
      .toBe("https://user.github.io/data/sources/netease163.json");
  });

  it("域名根部署时两者等价（老形态在根部署下看不出问题）", () => {
    const root = "https://cards.example.com/";
    expect(new URL("data/sources/netease163.json", root).href)
      .toBe(new URL("/data/sources/netease163.json", root).href);
  });

  it("已提交的生成物里不许有根绝对路径的 tableUrl", async () => {
    const datasets = ["data", "data/otomads"];
    for (const base of datasets) {
      const payload = (await (await fetch(`${base}/sources.json`)).json()) as {
        sources: { id: string; tableUrl: string }[];
      };
      expect(payload.sources.length).toBeGreaterThan(0);
      for (const source of payload.sources) {
        expect(source.tableUrl.startsWith("/"), `${base} → ${source.id}`).toBe(false);
      }
    }
  });
});

describe("源自己声明的响度表：跟着源走（D139）", () => {
  const LOCAL = {
    id: "local", label: { en: "l", zh: "l" }, tableUrl: "manifest.json", kind: "local" as const,
    order: 1, enabled: true, proxyable: false, description: { en: "", zh: "" },
  };

  it("相对路径解析到 manifest 所在目录（根部署 / 子目录 / 分离跑 / 带 query 都对）", () => {
    expect(sourceRelativeUrl("manifest.json", "loudness/otomads.json")).toBe("loudness/otomads.json");
    expect(sourceRelativeUrl("sub/manifest.json", "loudness/otomads.json")).toBe("sub/loudness/otomads.json");
    expect(sourceRelativeUrl("/sub/manifest.json", "./loudness/otomads.json")).toBe("/sub/loudness/otomads.json");
    expect(sourceRelativeUrl("http://127.0.0.1:8011/manifest.json", "loudness/otomads.json"))
      .toBe("http://127.0.0.1:8011/loudness/otomads.json");
    expect(sourceRelativeUrl("manifest.json?v=2", "loudness/otomads.json")).toBe("loudness/otomads.json");
  });

  it("绝对地址与根绝对路径原样保留（表在别的宿主上时用得上）", () => {
    expect(sourceRelativeUrl("manifest.json", "https://cdn.example.com/loudness/x.json"))
      .toBe("https://cdn.example.com/loudness/x.json");
    expect(sourceRelativeUrl("sub/manifest.json", "/loudness/x.json")).toBe("/loudness/x.json");
  });

  it("manifest 里声明了就记在源表上（供播放层优先使用）", async () => {
    const payload = { schema: 1, pack: "otomads", loudness: "loudness/otomads.json", tracks: rows };
    const fetcher = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch;
    const result = await loadSourceTables([LOCAL], {}, fetcher);
    expect(result.tables.local!.loudnessUrl).toBe("loudness/otomads.json");
  });

  it("没声明就没有该字段（调用方回落到注册表里那份 = 数据集目录，D130）", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ schema: 1, pack: "otomads", tracks: rows }), { status: 200 })) as unknown as typeof fetch;
    const result = await loadSourceTables([LOCAL], {}, fetcher);
    expect(result.tables.local!.loudnessUrl).toBeUndefined();
  });

  it("远端源表（裸数组）不会被误当成 manifest 去读字段", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(rows), { status: 200 })) as unknown as typeof fetch;
    const remote = { ...LOCAL, id: "mirror", kind: "remote" as const, tableUrl: "data/sources/x.json" };
    const result = await loadSourceTables([remote], {}, fetcher);
    expect(result.tables.mirror!.loudnessUrl).toBeUndefined();
    expect(result.tables.mirror!.entries.size).toBe(2);
  });
});
