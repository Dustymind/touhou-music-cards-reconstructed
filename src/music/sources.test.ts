import { describe, expect, it, vi } from "vitest";

import { applyManifestOverrides, normalizeManifestUrl, buildEntries, countResolvable, loadSourceTables,
  resolveTrack, sourceRelativeUrl, tableRevision, versionedUrl } from "./sources";
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
    expect(resolveTrack(tables, ["s1", "s2"], "紅魔郷", "おてんば恋娘", failed)?.sourceId).toBe("s2");
    expect(resolveTrack(tables, ["s1"], "紅魔郷", "おてんば恋娘", failed)).toBeNull();
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

  it("曲目地址按 **manifest 所在的那一层**解析（D141：源挂在别的域名上）", () => {
    const relative = [["otomads", "a", "media/otomads/a.mp3"], ["otomads", "b", "./media/otomads/b.mp3"]];

    // 跨域源（CDN）：拼成源自己那台主机上的绝对地址；`./` 去掉
    const cdn = buildEntries(relative, "https://cdn.example.com/manifest.json");
    expect(cdn.get(trackId("otomads", "a"))).toBe("https://cdn.example.com/media/otomads/a.mp3");
    expect(cdn.get(trackId("otomads", "b"))).toBe("https://cdn.example.com/media/otomads/b.mp3");
    // 源挂在子路径下时跟着 manifest 的目录走
    expect(buildEntries(relative, "https://cdn.example.com/music/manifest.json").get(trackId("otomads", "a")))
      .toBe("https://cdn.example.com/music/media/otomads/a.mp3");

    // manifest 本身是相对路径（同源 / 子目录部署）→ 仍然是相对形式，与改前逐字一致
    expect(buildEntries(relative, "manifest.json").get(trackId("otomads", "a"))).toBe("media/otomads/a.mp3");
    // 绝对地址原样通过（本机助手就是这种）
    expect(buildEntries(rows, "https://cdn.example.com/manifest.json").get(trackId("紅魔郷", "おてんば恋娘")))
      .toBe("https://a/1.mp3");
  });

  it("跨域源：曲目与响度表两条地址口径一致（都落在源那一层，D139 + D141）", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      schema: 1, loudness: "loudness/otomads.json", tracks: [["otomads", "a", "media/otomads/a.mp3"]],
    }), { status: 200 })) as unknown as typeof fetch;
    const result = await loadSourceTables([
      { id: "local", label: { en: "l", zh: "l" }, tableUrl: "https://cdn.example.com/manifest.json", kind: "local", order: 1, enabled: true, proxyable: false, description: { en: "", zh: "" } },
    ], {}, fetcher);

    const table = result.tables.local!;
    expect(table.entries.get(trackId("otomads", "a"))).toBe("https://cdn.example.com/media/otomads/a.mp3");
    expect(table.loudnessUrl).toBe("https://cdn.example.com/loudness/otomads.json");
  });

  // ------------------------------------------------- 媒体地址上的数据版本（D144）

  it("媒体地址拼上清单里的**逐曲**版本号，盖过整表版本号", () => {
    const withRevisions = [
      ["otomads", "a", "media/otomads/a.mp3", "rev-a"],
      ["otomads", "b", "media/otomads/b.mp3"],                 // 行里没给 → 用整表兜底
    ];
    const entries = buildEntries(withRevisions, "https://cdn.example.com/manifest.json", "whole");

    expect(entries.get(trackId("otomads", "a"))).toBe("https://cdn.example.com/media/otomads/a.mp3?v=rev-a");
    expect(entries.get(trackId("otomads", "b"))).toBe("https://cdn.example.com/media/otomads/b.mp3?v=whole");
  });

  it("没有版本的源**逐字不变**（三个远程镜像的裸数组就是这种）", () => {
    // 关键的一条：D144 不许顺手改掉别人的地址 —— 没声明版本就一个字节都不拼
    expect(buildEntries(rows, "https://cdn.example.com/manifest.json").get(trackId("紅魔郷", "おてんば恋娘")))
      .toBe("https://a/1.mp3");
    expect(versionedUrl("https://a/1.mp3", "")).toBe("https://a/1.mp3");
    expect(versionedUrl("https://a/1.mp3", undefined)).toBe("https://a/1.mp3");
    expect(tableRevision(rows)).toBe("");                      // 裸数组没有 revision 键
    expect(tableRevision(null)).toBe("");
  });

  it("已经有查询串的地址用 `&` 接，不做替换", () => {
    expect(versionedUrl("https://a/x.mp3?id=7", "r1")).toBe("https://a/x.mp3?id=7&v=r1");
    expect(versionedUrl("https://a/x.mp3", "r1")).toBe("https://a/x.mp3?v=r1");
    // 版本号里的特殊字符要编码（数据侧是十六进制，但别把这条当隐含前提）
    expect(versionedUrl("https://a/x.mp3", "a/b c")).toBe("https://a/x.mp3?v=a%2Fb%20c");
  });

  it("加载时读清单顶层的 `revision` 当整表兜底", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      schema: 1, pack: "otomads", revision: "rev-42",
      tracks: [["otomads", "a", "media/otomads/a.mp3"]],
    }), { status: 200 })) as unknown as typeof fetch;
    const result = await loadSourceTables([
      { id: "local", label: { en: "l", zh: "l" }, tableUrl: "https://cdn.example.com/manifest.json", kind: "local", order: 1, enabled: true, proxyable: false, description: { en: "", zh: "" } },
    ], {}, fetcher);

    expect(tableRevision({ revision: "rev-42" })).toBe("rev-42");
    expect(result.tables.local!.entries.get(trackId("otomads", "a")))
      .toBe("https://cdn.example.com/media/otomads/a.mp3?v=rev-42");
  });

  it("模式 3：**同一个 payload** 里同时解析自定义清单与它声明的响度表（不发第二个请求）", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      schema: 1, mode: "custom",
      cards: [{ name: "爱丽丝", face: "faces/a.jpg", audio: "media/a.mp3", album: "旧作", title: "第一首" }],
      loudness: "loudness/custom.json",
    }), { status: 200 })) as unknown as typeof fetch;
    const result = await loadSourceTables([
      { id: "custom", label: { en: "c", zh: "c" }, tableUrl: "https://cards.example.com/manifest.json",
        kind: "custom", order: 1, enabled: true, proxyable: false, description: { en: "", zh: "" } },
    ], {}, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    const table = result.tables.custom!;
    expect(table.status).toBe("ready");
    expect(table.custom!.characters).toHaveLength(1);
    // 这个模式**没有 tracks 行**（音频地址在每张卡自己身上）⇒ `entries` 为空是正常的
    expect(table.entries.size).toBe(0);
    // 响度表由清单自己声明、按**清单那一层**解析（D139 的同一套规则）
    expect(table.loudnessUrl).toBe("https://cards.example.com/loudness/custom.json");
  });

  it("模式 3：清单形状不对 ⇒ 不留下 `custom`（整份不生效），源本身仍是 ready 的", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      schema: 1, mode: "custom", cards: [{ name: "缺音频" }],
    }), { status: 200 })) as unknown as typeof fetch;
    const result = await loadSourceTables([
      { id: "custom", label: { en: "c", zh: "c" }, tableUrl: "https://cards.example.com/manifest.json",
        kind: "custom", order: 1, enabled: true, proxyable: false, description: { en: "", zh: "" } },
    ], {}, fetcher);

    expect(result.tables.custom!.status).toBe("ready");
    expect(result.tables.custom!.custom).toBeUndefined();
  });

  it("清单里没有 `revision` 键时也不拼（否则会把远程镜像的地址全改掉）", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      schema: 1, pack: "otomads", tracks: [["otomads", "a", "media/otomads/a.mp3"]],
    }), { status: 200 })) as unknown as typeof fetch;
    const result = await loadSourceTables([
      { id: "local", label: { en: "l", zh: "l" }, tableUrl: "https://cdn.example.com/manifest.json", kind: "local", order: 1, enabled: true, proxyable: false, description: { en: "", zh: "" } },
    ], {}, fetcher);

    expect(result.tables.local!.entries.get(trackId("otomads", "a")))
      .toBe("https://cdn.example.com/media/otomads/a.mp3");
  });
});

describe("源清单地址的运行时覆盖（本地曲库 / 自定义源两种 kind）", () => {
  const sources = [
    { id: "netease163", kind: "remote", tableUrl: "data/sources/netease163.json" },
    { id: "local", kind: "local", tableUrl: "manifest.json" },
    { id: "custom", kind: "custom", tableUrl: "" },
  ] as unknown as Parameters<typeof applyManifestOverrides>[0];

  it("归一化：空 → null；基地址补 manifest.json；host:port 补协议；完整 json 原样", () => {
    expect(normalizeManifestUrl("")).toBeNull();
    expect(normalizeManifestUrl("   ")).toBeNull();
    expect(normalizeManifestUrl("127.0.0.1:8011")).toBe("http://127.0.0.1:8011/manifest.json");
    expect(normalizeManifestUrl("127.0.0.1:8011/")).toBe("http://127.0.0.1:8011/manifest.json");
    expect(normalizeManifestUrl("http://127.0.0.1:8011")).toBe("http://127.0.0.1:8011/manifest.json");
    expect(normalizeManifestUrl("https://cards.example.com/music/"))
      .toBe("https://cards.example.com/music/manifest.json");
    expect(normalizeManifestUrl("https://x/y/table.json")).toBe("https://x/y/table.json");
  });

  it("默认（空覆盖）保持数据里的原值 —— 自定义源那个空串是**合法**的（还没填）", () => {
    const applied = applyManifestOverrides(sources, {});
    expect(applied.find((source) => source.id === "local")!.tableUrl).toBe("manifest.json");
    expect(applied.find((source) => source.id === "custom")!.tableUrl).toBe("");
    expect(applied.find((source) => source.id === "netease163")!.tableUrl)
      .toBe("data/sources/netease163.json");
  });

  it("给了覆盖值：只改**那一类**源，其它源不受影响", () => {
    const applied = applyManifestOverrides(sources, { local: "127.0.0.1:8011" });
    expect(applied.find((source) => source.id === "local")!.tableUrl)
      .toBe("http://127.0.0.1:8011/manifest.json");
    expect(applied.find((source) => source.id === "custom")!.tableUrl).toBe("");
    expect(applied.find((source) => source.id === "netease163")!.tableUrl)
      .toBe("data/sources/netease163.json");
    // 不改写入参
    expect(sources[1]!.tableUrl).toBe("manifest.json");
  });

  it("自定义源覆盖：只动 kind=custom 那一条（本地曲库与镜像都不动）", () => {
    const applied = applyManifestOverrides(sources, { custom: "https://cards.example.com/manifest.json" });
    expect(applied.find((source) => source.id === "custom")!.tableUrl)
      .toBe("https://cards.example.com/manifest.json");
    expect(applied.find((source) => source.id === "local")!.tableUrl).toBe("manifest.json");
    expect(sources[2]!.tableUrl).toBe("");
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

describe("源给的曲目表快照：同一个 payload，不额外发请求（D145）", () => {
  const LOCAL = {
    id: "local", label: { en: "l", zh: "l" }, tableUrl: "manifest.json", kind: "local" as const,
    order: 1, enabled: true, proxyable: false, description: { en: "", zh: "" },
  };
  const SNAPSHOT = {
    albums: [{ key: "otomads", name: "otomads", kind: "other", pack: "otomads", order: 100,
      showAlbumName: false }],
    characters: [{ key: "cirno", music: [["otomads", "おてんば恋娘", "角色曲", "作者"]], card: ["c.png"] }],
  };

  it("解析出来挂在源表上（调用方拿去重建数据集）", async () => {
    const payload = { schema: 1, pack: "otomads", tracks: rows, ...SNAPSHOT };
    const fetcher = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch;
    const result = await loadSourceTables([LOCAL], {}, fetcher);
    expect(result.tables.local!.status).toBe("ready");
    expect(result.tables.local!.snapshot).toEqual(SNAPSHOT);
    expect(fetcher).toHaveBeenCalledTimes(1);          // 快照就在同一份 payload 里
  });

  it("老清单（没有这两个键）⇒ 没有快照，行为与改前一致", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ schema: 1, pack: "otomads", tracks: rows }), { status: 200 })) as unknown as typeof fetch;
    const result = await loadSourceTables([LOCAL], {}, fetcher);
    expect(result.tables.local!.snapshot).toBeUndefined();
    expect(result.tables.local!.entries.size).toBe(2);
  });

  it("形状不对的快照整段丢掉（走自带那份兜底，绝不半信半疑地用）", async () => {
    const payload = { schema: 1, pack: "otomads", tracks: rows, albums: SNAPSHOT.albums,
      characters: [{ key: "cirno", music: [["otomads", "曲", "插曲"]] }] };
    const fetcher = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch;
    const result = await loadSourceTables([LOCAL], {}, fetcher);
    expect(result.tables.local!.status).toBe("ready");   // 源本身是好的
    expect(result.tables.local!.snapshot).toBeUndefined();
  });
});
