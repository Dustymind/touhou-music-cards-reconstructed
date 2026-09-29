import { describe, expect, it, vi } from "vitest";

import { applyManifestOverrides, canonicalPathEncoding, normalizeManifestUrl, buildEntries,
  countResolvable, loadSourceTables, resolveTrack, sourceRelativeUrl, tableRevision,
  versionedUrl } from "./sources";
import { trackId } from "../data/types";

const rows = [["紅魔郷", "おてんば恋娘", "https://a/1.mp3"], ["妖々夢", "クリスタライズシルバー", "https://a/2.mp3"]];

describe("sources resolver", () => {
  it("buildEntries 用 trackId 作键并跳过坏行", () => {
    const entries = buildEntries({ tracks: [...rows, ["x"], null, ["a", "b", ""]] });
    expect(entries.get(trackId("紅魔郷", "おてんば恋娘"))).toBe("https://a/1.mp3");
    expect(entries.size).toBe(2);
  });

  it("按顺序命中第一个有该曲目的源", () => {
    const tables = {
      s1: { id: "s1", status: "ready" as const, entries: new Map() },
      s2: { id: "s2", status: "ready" as const, entries: buildEntries({ tracks: rows }) },
    };
    const entry = { id: "th06_03", album: "紅魔郷", title: "おてんば恋娘" };
    expect(resolveTrack(tables, ["s1", "s2"], entry)?.sourceId).toBe("s2");
    expect(resolveTrack(tables, ["s1"], entry)).toBeNull();
  });

  it("记入失败集合的源会被跳过（运行时换源）", () => {
    const tables = {
      s1: { id: "s1", status: "ready" as const, entries: buildEntries({ tracks: rows }) },
      s2: { id: "s2", status: "ready" as const, entries: buildEntries({ tracks: rows }) },
    };
    const entry = { id: "th06_03", album: "紅魔郷", title: "おてんば恋娘" };
    const failed = new Set([`s1\u0000${trackId("紅魔郷", "おてんば恋娘")}`]);
    expect(resolveTrack(tables, ["s1", "s2"], entry, failed)?.sourceId).toBe("s2");
    expect(resolveTrack(tables, ["s1"], entry, failed)).toBeNull();
  });

  /** 真实曲包里那几种"作者/曲名自带连字符"的形状 —— 兜底匹配**必须**照样命中（2026-09-27 逐条复核过
   *  真 manifest：191/191 条都解析得出地址）。这些形状先前被怀疑过（"去 `作者 - ` 前缀"会失手），
   *  所以在这里钉死：判定用的是"磁盘名以 `作者 - 曲名` **结尾**"（见 `sources.ts` 里那条注释），
   *  与作者长什么样无关。
   *
   *  ⚠️ 报"这几条解析不出来"之前，先照这条用例的口径复核 —— 上一轮就是拿"整串归一化相等"这种
   *  **简化判据**去比，把 4 条本来好好的曲目误报成了播不出来 ✗。 */
  it("作者/曲名自带连字符的真实形状照样解析（音MAD 曲包里的边界）", () => {
    const shapes: [album: string, title: string, author: string][] = [
      // 作者以 `-` 开头：`^[^-]…` 去前缀在位置 0 就失手
      ["otomads", "[合作单品] 信仰是为了萨尼铁塔", "-摇摇铃仙- & 腌西瓜瓜瓜 & y的自然对数"],
      // 作者里带连字符（无空格）：`[^-]` 跨不过去
      ["otomads", "【铁道音MAD】放在降弓用刑处轴温很快就会升高 ~ 狂气的CR（2021东方乘车录单品）",
        "Satani_ZC & 天空海Skyocean & ItsZTChun & Rendering-Liu & 专治各种乱入"],
      // **曲名自己**含 ` - `：去前缀会把曲名切掉一半（`Otto Remote - xHGNz` → `xhgnz`）
      ["otomads", "Otto Remote - xHGNz", "xHGNz_"],
      ["otomads", "【铁道音mad合作单曲】TRAINMAD's 6 - Native Faith", "佛山公交_Official_伪"],
    ];
    // 磁盘名 = `作者 - 曲名`（音MAD 数据仓库的命名口径），manifest 的键就是它
    const diskRows = shapes.map(([album, title, author], index) =>
      [album, `${author} - ${title}`, `https://a/${index}.mp3`]);
    const tables = { local: { id: "local", status: "ready" as const, entries: buildEntries({ tracks: diskRows }) } };

    for (const [album, title] of shapes) {
      expect(resolveTrack(tables, ["local"], { id: "x", album, title })?.url, title).toMatch(/^https:\/\/a\//);
    }
    // 另一张专辑里的同名行不许被串上（兜底扫描仍然按专辑过滤）
    expect(resolveTrack(tables, ["local"], { id: "x", album: "紅魔郷", title: "Otto Remote - xHGNz" })).toBeNull();
  });

  it("加载失败的源不参与解析，状态被记录", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("bad")) return new Response("no", { status: 500 });
      return new Response(JSON.stringify({ schema: 1, pack: "otomads", tracks: rows }), { status: 200 });
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
    expect(resolveTrack(result.tables, result.order, { id: "th06_03", album: "紅魔郷", title: "おてんば恋娘" })?.sourceId).toBe("good");
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
    const cdn = buildEntries({ tracks: relative }, "https://cdn.example.com/manifest.json");
    expect(cdn.get(trackId("otomads", "a"))).toBe("https://cdn.example.com/media/otomads/a.mp3");
    expect(cdn.get(trackId("otomads", "b"))).toBe("https://cdn.example.com/media/otomads/b.mp3");
    // 源挂在子路径下时跟着 manifest 的目录走
    expect(buildEntries({ tracks: relative }, "https://cdn.example.com/music/manifest.json").get(trackId("otomads", "a")))
      .toBe("https://cdn.example.com/music/media/otomads/a.mp3");

    // manifest 本身是相对路径（同源 / 子目录部署）→ 仍然是相对形式，与改前逐字一致
    expect(buildEntries({ tracks: relative }, "manifest.json").get(trackId("otomads", "a"))).toBe("media/otomads/a.mp3");
    // 绝对地址原样通过（本机助手就是这种）
    expect(buildEntries({ tracks: rows }, "https://cdn.example.com/manifest.json").get(trackId("紅魔郷", "おてんば恋娘")))
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
    const entries = buildEntries({ tracks: withRevisions }, "https://cdn.example.com/manifest.json", "whole");

    expect(entries.get(trackId("otomads", "a"))).toBe("https://cdn.example.com/media/otomads/a.mp3?v=rev-a");
    expect(entries.get(trackId("otomads", "b"))).toBe("https://cdn.example.com/media/otomads/b.mp3?v=whole");
  });

  it("没有版本的源**逐字不变**（远程镜像的裸数组就是这种）", () => {
    // 关键的一条：D144 不许顺手改掉别人的地址 —— 没声明版本就一个字节都不拼
    expect(buildEntries({ tracks: rows }, "https://cdn.example.com/manifest.json").get(trackId("紅魔郷", "おてんば恋娘")))
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
      cards: [{ name: "爱丽丝", cover: "cover/a.jpg", audio: "media/a.mp3", album: "旧作", title: "第一首" }],
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

  /** D169：路径里"多编了一层"的那 5 个字符要还原成裸写。
   *
   *  病灶（真 CDN 实测，191 首里 9 首中招）：清单用 `urllib.parse.quote()` 的默认安全集 ⇒
   *  `(` `)` `!` `'` `*` 被编成 `%28…`；Cloudflare 的静态资源站对这种非规范路径先回 **307**，
   *  而**带 `Range`**（`<audio>` 一律带）的跟随请求 **500** ⇒ 整首放不出来。
   *  裸写 + `Range` ⇒ **206** ✓（同一个资源，只是编码等价类里换了代表）。
   *
   *  ⚠️ 还原的集合是**逐字符量出来的**（`! ' ( ) *`），不是"RFC 允许"就照搬：`&` 与 `:` 在 RFC 里
   *  同样允许裸写，但这个边缘节点把**编码形式**当规范形式 —— 按 RFC 全还原时 191 首里有 **16 首**
   *  反而坏掉（15 首带 `&`、1 首带 `:`）。这条用例把两边的字符都钉死。 */
  it("媒体地址的路径编码收敛（D169）：只还原 ! ' ( ) *，别的字节一个不动", () => {
    const rows169 = [
      // 真中招的形状：`( )`、`!`、`'`、`*`（以及 `|` —— 它不是 pchar，必须留着编码）
      ["otomads", "a", "media/otomads/%E6%A6%86%E6%9C%A8%E5%8D%8E%20-%20%E6%AD%8C%28mix%29.mp3"],
      ["otomads", "b", "media/otomads/x%20-%20Who%20Kai%20Da%21.mp3"],
      ["otomads", "c", "media/otomads/x%20-%20TRAINMAD%27s%206.mp3"],
      ["otomads", "d", "media/otomads/x%20-%20%2A%2A%E5%B0%91%E5%A5%B3.mp3"],
      ["otomads", "e", "media/otomads/x%20-%20a%7Cb.mp3"],
      // 这些**不许**被还原：空格、编码过的分隔符、非 ASCII 的每个字节
      ["otomads", "f", "media/otomads/a%20b%2Fc%3Fd%23e%25f.mp3"],
      // `&`/`:` **反过来**：真 CDN 上裸着写会被 307 掉（15/15 的 `&` 曲目、1/1 的 `:` 曲目当场 500），
      // 编着写才是那里的规范形式 ⇒ 一个都不许动
      ["otomads", "g", "media/otomads/x%20%26%20y%20-%20a%3Ab.mp3"],
      // 没量到的（`$ + , ; = @`）保守处理：也不动
      ["otomads", "h", "media/otomads/a%24b%2Bc%2Cd%3Be%3Df%40g.mp3"],
    ];
    const tables = { local: { id: "local", status: "ready" as const, entries: buildEntries({ tracks: rows169 }) } };
    const of = (title: string) => tables.local.entries.get(trackId("otomads", title))!;

    expect(of("a")).toBe("media/otomads/%E6%A6%86%E6%9C%A8%E5%8D%8E%20-%20%E6%AD%8C(mix).mp3");
    expect(of("b")).toBe("media/otomads/x%20-%20Who%20Kai%20Da!.mp3");
    expect(of("c")).toBe("media/otomads/x%20-%20TRAINMAD's%206.mp3");
    expect(of("d")).toBe("media/otomads/x%20-%20**%E5%B0%91%E5%A5%B3.mp3");
    expect(of("e")).toBe("media/otomads/x%20-%20a%7Cb.mp3");          // `|` 不是 pchar ⇒ 留着
    expect(of("f")).toBe("media/otomads/a%20b%2Fc%3Fd%23e%25f.mp3");  // 全都不动
    expect(of("g")).toBe("media/otomads/x%20%26%20y%20-%20a%3Ab.mp3");  // `&`/`:` 保持编码
    expect(of("h")).toBe("media/otomads/a%24b%2Bc%2Cd%3Be%3Df%40g.mp3");  // 没量到的一律不动
    // 幂等：规范形式再过一遍还是它（清单里已经是规范写法时逐字不变）
    for (const row of rows169) {
      expect(canonicalPathEncoding(of(row[1]!))).toBe(of(row[1]!));
    }
  });

  it("D169：只动路径 —— 查询串 / fragment / 主机名原样，`?v=` 拼在收敛之后", () => {
    expect(canonicalPathEncoding("https://ex%28ample.com/a%29.mp3?q=%28#f%29"))
      .toBe("https://ex%28ample.com/a).mp3?q=%28#f%29");
    expect(canonicalPathEncoding("media/a%29.mp3")).toBe("media/a).mp3");
    expect(canonicalPathEncoding("https://host")).toBe("https://host");

    // `?v=` 拼在收敛**之后**（版本号照旧 `encodeURIComponent`，与改前逐字一致）
    const entries = buildEntries({ tracks: [["otomads", "a", "media/a%29.mp3", "rev 1"]] }, "", "rev");
    expect(entries.get(trackId("otomads", "a"))).toBe("media/a).mp3?v=rev%201");
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

  it("**相对当前页面**的地址原样保留（只给「裸主机」补 http://）", () => {
    // 同源部署的三种写法：根路径 / 带目录的相对路径 / 只有文件名
    expect(normalizeManifestUrl("/cards/manifest.json")).toBe("/cards/manifest.json");
    expect(normalizeManifestUrl("cards/manifest.json")).toBe("cards/manifest.json");
    expect(normalizeManifestUrl("manifest.json")).toBe("manifest.json");
    // 裸主机（本机助手那种写法）仍然补 http:// 并补上 manifest.json
    expect(normalizeManifestUrl("127.0.0.1:8012")).toBe("http://127.0.0.1:8012/manifest.json");
    expect(normalizeManifestUrl("127.0.0.1:8012/manifest.json"))
      .toBe("http://127.0.0.1:8012/manifest.json");
    expect(normalizeManifestUrl("cards.example.com/music/"))
      .toBe("http://cards.example.com/music/manifest.json");
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

  it("裸数组（老形状）已不在支持范围：解析成空表，不炸、也不当成 manifest 去读字段", async () => {
    // REFACTOR-PLAN v2 §2.1：源清单统一成对象 —— 裸数组那条分支已退场。留这条用例钉住退场后的行为：
    // 形状不认识 ⇒ 空表（不抛），且绝不去读只有 manifest 才有的顶层字段。
    const fetcher = vi.fn(async () => new Response(JSON.stringify(rows), { status: 200 })) as unknown as typeof fetch;
    const remote = { ...LOCAL, id: "mirror", kind: "remote" as const, tableUrl: "data/sources/x.json" };
    const result = await loadSourceTables([remote], {}, fetcher);
    expect(result.tables.mirror!.status).toBe("ready");
    expect(result.tables.mirror!.loudnessUrl).toBeUndefined();
    expect(result.tables.mirror!.entries.size).toBe(0);
  });
});

describe("源给的曲目表快照：同一个 payload，不额外发请求（D145）", () => {
  const LOCAL = {
    id: "local", label: { en: "l", zh: "l" }, tableUrl: "manifest.json", kind: "local" as const,
    order: 1, enabled: true, proxyable: false, description: { en: "", zh: "" },
  };
  /** 源那边的 **wire** 形状：曲目还是元组行（数据仓库的清单口径，没有曲id）。 */
  const SNAPSHOT_WIRE = {
    albums: [{ key: "otomads", name: "otomads", kind: "other", pack: "otomads", order: 100,
      showAlbumName: false }],
    characters: [{ key: "cirno", music: [["otomads", "おてんば恋娘", "角色曲", "作者"]], card: ["c.png"] }],
  };
  /** 应用解析后的快照：曲目变对象，id 按"该角色在清单里的出现顺序"赋（§11.1）。 */
  const SNAPSHOT_PARSED = {
    albums: SNAPSHOT_WIRE.albums,
    characters: [{ key: "cirno", card: ["c.png"],
      music: [{ id: "cirno_otomad_001", album: "otomads", title: "おてんば恋娘", extra: "角色曲", author: "作者" }] }],
  };

  it("解析出来挂在源表上（调用方拿去重建数据集）", async () => {
    const payload = { schema: 1, pack: "otomads", tracks: rows, ...SNAPSHOT_WIRE };
    const fetcher = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch;
    const result = await loadSourceTables([LOCAL], {}, fetcher);
    expect(result.tables.local!.status).toBe("ready");
    expect(result.tables.local!.snapshot).toEqual(SNAPSHOT_PARSED);
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
    const payload = { schema: 1, pack: "otomads", tracks: rows, albums: SNAPSHOT_WIRE.albums,
      characters: [{ key: "cirno", music: [["otomads", "曲", "插曲"]] }] };
    const fetcher = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch;
    const result = await loadSourceTables([LOCAL], {}, fetcher);
    expect(result.tables.local!.status).toBe("ready");   // 源本身是好的
    expect(result.tables.local!.snapshot).toBeUndefined();
  });
});
