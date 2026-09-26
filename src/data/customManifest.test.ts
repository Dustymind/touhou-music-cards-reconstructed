/** 模式 3「自定义」的清单解析与数据集重建（契约 `docs/custom-mode-v1.md` C2/C3/C6）。
 *
 * 四条最要紧的性质钉在这里：
 *
 * 1. **形状不对就整份不用**（`undefined`）—— 半信半疑地用一份坏清单，表现是"少几张卡 / 点不响"；
 * 2. **卡面与音频在校验阶段解析成绝对地址**（相对 ⇒ 按清单目录拼，绝对 ⇒ 原样）＋ 逐卡 `?v=`；
 * 3. **派生 key 与数组顺序无关**、跨端同值（重名卡靠它区分）；
 * 4. **指纹不含音频地址与版本号**（换宿主不该把两端拆开），但**含卡名与顺序**（那是清单给的）。
 */
import { beforeAll, describe, expect, it } from "vitest";

import { loadRealBundle } from "../test-utils";
import { customHash, parseCustomManifest, withCustomManifest } from "./customManifest";
import { packHash } from "./packSnapshot";
import type { AlbumRecord, CharacterRecord, DataBundle } from "./types";

let bundle: DataBundle;

beforeAll(async () => {
  bundle = await loadRealBundle();
});

const MANIFEST_URL = "https://cards.example.com/music/manifest.json";

/** 一张最普通的卡：相对卡面 / 相对音频 / 有专辑、曲名、作者。 */
function card(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "爱丽丝", cover: "cover/01.jpg", audio: "media/01.mp3",
    album: "旧作", title: "第一首", author: "甲", ...overrides,
  };
}

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { schema: 1, mode: "custom", cards: [card()], ...overrides };
}

describe("parseCustomManifest：合法清单 → 数据集（1 卡 = 1 名 + 1 面 + 1 曲）", () => {
  it("一张卡就是一条角色记录：卡面、曲目、逐卡音频三者一一对应", () => {
    const manifest = parseCustomManifest(payload(), MANIFEST_URL)!;
    expect(manifest.characters).toHaveLength(1);
    const character = manifest.characters[0]!;
    expect(character.key).toMatch(/^custom-[0-9a-f]{8}$/);        // 没写 id ⇒ 内容哈希派生
    expect(character.name).toBe("爱丽丝");
    expect(character.order).toBe(0);
    expect(character.searchNames).toEqual(["爱丽丝"]);
    // 相对路径按**清单目录**解析成绝对地址（D141 的口径）
    expect(character.card).toEqual(["https://cards.example.com/music/cover/01.jpg"]);
    expect(character.covers).toEqual(character.card);             // 1:1 ⇒ 卡池与卡面都只有这一张
    expect(character.music).toEqual([["旧作", "第一首", "角色曲", "甲"]]);
    expect(character.audio).toEqual(["https://cards.example.com/music/media/01.mp3"]);
  });

  it("专辑按**首次出现顺序**建，`kind` 一律 other、`pack` 一律 custom", () => {
    const manifest = parseCustomManifest(payload({
      cards: [card({ album: "B" }), card({ name: "第二张", album: "A" }), card({ name: "第三张", album: "B" })],
    }), MANIFEST_URL)!;
    expect(manifest.albums.map((album: AlbumRecord) => [album.name, album.order])).toEqual([["B", 1], ["A", 2]]);
    expect(manifest.albums.every((album) => album.kind === "other" && album.pack === "custom")).toBe(true);
    // 角色顺序 = 数组序（这个模式没有别的顺序来源）
    expect(manifest.characters.map((character) => character.order)).toEqual([0, 1, 2]);
  });

  it("绝对 URL 原样用（Q3：清单写 https 就热链，不拼目录）", () => {
    const manifest = parseCustomManifest(payload({
      cards: [card({ cover: "https://img.example.com/a.jpg", audio: "https://cdn.example.com/a.mp3" })],
    }), MANIFEST_URL)!;
    expect(manifest.characters[0]!.card).toEqual(["https://img.example.com/a.jpg"]);
    expect(manifest.characters[0]!.audio).toEqual(["https://cdn.example.com/a.mp3"]);
  });

  it("版本号：逐卡优先、顶层兜底（D144 的 `?v=` 口径）", () => {
    const manifest = parseCustomManifest(payload({
      revision: "table-1",
      cards: [
        card({ id: "a", audio: "media/a.mp3" }),                       // 用顶层
        card({ id: "b", audio: "media/b.mp3", revision: "own-2" }),    // 用自己的
      ],
    }), MANIFEST_URL)!;
    expect(manifest.characters[0]!.audio).toEqual(["https://cards.example.com/music/media/a.mp3?v=table-1"]);
    expect(manifest.characters[1]!.audio).toEqual(["https://cards.example.com/music/media/b.mp3?v=own-2"]);
  });

  it("没写 id ⇒ 派生 key 与数组顺序无关，且同内容跨端同值", () => {
    const first = parseCustomManifest(payload(), MANIFEST_URL)!.characters[0]!.key;
    const second = parseCustomManifest(payload({ cards: [card(), card({ name: "别的" })] }), MANIFEST_URL)!
      .characters[0]!.key;
    expect(second).toBe(first);
    // 同名不同专辑 ⇒ 不同 key（重名卡是允许的，Q8）
    const other = parseCustomManifest(payload({ cards: [card({ album: "新作" })] }), MANIFEST_URL)!
      .characters[0]!.key;
    expect(other).not.toBe(first);
  });

  it("写了 id 就用它；两张卡共用一首曲子是**允许的**（F1 的收益）", () => {
    const manifest = parseCustomManifest(payload({
      cards: [
        card({ id: "alice-01" }),
        card({ id: "alice-02", name: "爱丽丝（另一张）" }),   // 同名曲目、同专辑
      ],
    }), MANIFEST_URL)!;
    expect(manifest.characters.map((character) => character.key)).toEqual(["alice-01", "alice-02"]);
    expect(manifest.characters[0]!.music).toEqual(manifest.characters[1]!.music);
  });

  it("空作者不入第 4 位（Q7：空作者不进作者开关列表）", () => {
    const manifest = parseCustomManifest(payload({ cards: [card({ author: undefined })] }), MANIFEST_URL)!;
    expect(manifest.characters[0]!.music).toEqual([["旧作", "第一首", "角色曲"]]);
  });
});

/** 坏形状矩阵：只要有一样不对，整份清单就不能用（宁可走空兜底）。 */
const BAD_PAYLOADS: [string, unknown][] = [
  ["不是对象", "nope"],
  ["是 null", null],
  ["是数组", [1, 2]],
  ["schema 不是 1", payload({ schema: 2 })],
  ["缺 schema", { mode: "custom", cards: [card()] }],
  ["mode 不是 custom", payload({ mode: "otomads" })],
  ["缺 mode", { schema: 1, cards: [card()] }],
  ["cards 不是数组", payload({ cards: {} })],
  ["cards 空", payload({ cards: [] })],
  ["卡片不是对象", payload({ cards: ["alice"] })],
  ["缺卡名", payload({ cards: [card({ name: undefined })] })],
  ["卡名空串", payload({ cards: [card({ name: "  " })] })],
  ["缺卡面（C2：不出现空卡面）", payload({ cards: [card({ cover: undefined })] })],
  ["缺音频（F2：缺音频整份不合法）", payload({ cards: [card({ audio: undefined })] })],
  ["缺专辑（Q7：专辑必填）", payload({ cards: [card({ album: undefined })] })],
  ["缺曲名", payload({ cards: [card({ title: undefined })] })],
  ["作者写了空串", payload({ cards: [card({ author: " " })] })],
  ["id 写了空串", payload({ cards: [card({ id: "" })] })],
  ["source 不是字符串", payload({ cards: [card({ source: 7 })] })],
  ["revision 不是字符串", payload({ cards: [card({ revision: 3 })] })],
  ["顶层 revision 类型不对", payload({ revision: 3 })],
  ["id 重复", payload({ cards: [card({ id: "x" }), card({ id: "x", name: "另一张" })] })],
  ["同一张卡写了两遍（派生 key 撞车）", payload({ cards: [card(), card()] })],
  ["卡片不是对象而是数组", payload({ cards: [[1, 2, 3]] })],
  // 逐比例卡面（D164）：形状只认"档位 → 非空字符串"，认不得的键 / 空值 / 空对象一律整份拒掉
  ["卡面对象是空对象", payload({ cards: [card({ cover: {} })] })],
  ["卡面对象里有认不得的档位", payload({ cards: [card({ cover: { "16:9": "cover/a.jpg" } })] })],
  ["卡面对象里有一档是空串", payload({ cards: [card({ cover: { "16x9": "  " } })] })],
  ["卡面对象里有一档不是字符串", payload({ cards: [card({ cover: { "4x3": 7 } })] })],
  ["卡面是数字", payload({ cards: [card({ cover: 7 })] })],
];

describe("parseCustomManifest：形状不对 ⇒ 整份 undefined（fail-closed）", () => {
  it.each(BAD_PAYLOADS)("%s", (_label, bad) => {
    expect(parseCustomManifest(bad, MANIFEST_URL)).toBeUndefined();
  });
});

describe("withCustomManifest：空兜底 ↔ 清单", () => {
  it("没有清单 ⇒ 数据集等于空兜底（0 卡 0 专辑），哈希仍按同一套算法算", () => {
    const live = withCustomManifest(bundle, undefined).datasets.custom;
    const baked = bundle.datasets.custom;
    expect(live.characters).toEqual(baked.characters);
    expect(live.albums).toEqual(baked.albums);
    expect(live.sources).toBe(baked.sources);                    // 源注册表不归清单管
    expect(live.index.contentHash).toBe(customHash(baked.albums, baked.characters));
  });

  it("有清单 ⇒ counts 跟着清单走，另两份数据集一个字都不动", () => {
    const manifest = parseCustomManifest(payload({
      cards: [card({ album: "B" }), card({ name: "第二张", album: "A" })],
    }), MANIFEST_URL)!;
    const live = withCustomManifest(bundle, manifest);
    const custom = live.datasets.custom;
    expect(custom.index.counts).toMatchObject({ characters: 2, albums: 2, trackEntries: 2, distinctTracks: 2 });
    expect(custom.characterByKey.get("custom-" + custom.characters[0]!.key.slice(7))).toBeDefined();
    expect(custom.albumByName.get("B")).toBe(custom.albums[0]);
    expect(live.datasets.originals).toBe(bundle.datasets.originals);
    expect(live.datasets.otomads).toBe(bundle.datasets.otomads);
    expect(live.shared).toBe(bundle.shared);
  });

  it("两张卡共用一首 ⇒ 去重曲目数仍是 1（互斥由 `songConflicts` 处理，不是这里）", () => {
    const manifest = parseCustomManifest(payload({
      cards: [card({ id: "a" }), card({ id: "b", name: "另一张" })],
    }), MANIFEST_URL)!;
    expect(withCustomManifest(bundle, manifest).datasets.custom.index.counts)
      .toMatchObject({ trackEntries: 2, distinctTracks: 1 });
  });
});

describe("逐比例卡面（D164）：`cover` 给两份 ⇒ 两份都解析成绝对地址", () => {
  it("两份都进数据集（`coversByRatio`），`card` / `covers` 放默认档那一份（16:9）", () => {
    const manifest = parseCustomManifest(payload({
      cards: [card({ cover: { "16x9": "cover/a.16x9.png", "4x3": "cover/a.4x3.png" } })],
    }), MANIFEST_URL)!;
    const character = manifest.characters[0]!;
    expect(character.coversByRatio).toEqual({
      "16x9": "https://cards.example.com/music/cover/a.16x9.png",
      "4x3": "https://cards.example.com/music/cover/a.4x3.png",
    });
    expect(character.card).toEqual(["https://cards.example.com/music/cover/a.16x9.png"]);
    expect(character.covers).toEqual(character.card);
  });

  it("只写一档也合法：另一档回落到这一份（数据集里只有这一个键）", () => {
    const manifest = parseCustomManifest(payload({
      cards: [card({ cover: { "4x3": "cover/a.4x3.png" } })],
    }), MANIFEST_URL)!;
    const character = manifest.characters[0]!;
    expect(character.coversByRatio).toEqual({ "4x3": "https://cards.example.com/music/cover/a.4x3.png" });
    expect(character.card).toEqual(["https://cards.example.com/music/cover/a.4x3.png"]);
  });

  it("单图形态（旧清单 / 手放的图 / 绝对直链）⇒ **没有** `coversByRatio`，两档共用这一份", () => {
    const manifest = parseCustomManifest(payload(), MANIFEST_URL)!;
    expect(manifest.characters[0]!.coversByRatio).toBeUndefined();
    expect(manifest.characters[0]!.card).toEqual(["https://cards.example.com/music/cover/01.jpg"]);
  });

  it("派生 key 只看**默认档那一份**：同一张卡写成单图或两份，key 不变（存档不会错位）", () => {
    const single = parseCustomManifest(payload({ cards: [card({ cover: "cover/01.jpg" })] }), MANIFEST_URL)!;
    const both = parseCustomManifest(payload({
      cards: [card({ cover: { "16x9": "cover/01.jpg", "4x3": "cover/01.4x3.jpg" } })],
    }), MANIFEST_URL)!;
    expect(both.characters[0]!.key).toBe(single.characters[0]!.key);
  });
});

describe("customHash：覆盖什么、不覆盖什么（契约 C6）", () => {
  const albums: AlbumRecord[] = [
    { key: "旧作", name: "旧作", kind: "other", pack: "custom", order: 1 },
  ];
  const character = (overrides: Partial<CharacterRecord> = {}): CharacterRecord => ({
    key: "custom-a", name: "爱丽丝", order: 0, card: ["https://x/a.jpg"], covers: ["https://x/a.jpg"],
    searchNames: ["爱丽丝"], music: [["旧作", "第一首", "角色曲", "甲"]],
    audio: ["https://x/a.mp3?v=1"], ...overrides,
  });

  it("同一份数据 ⇒ 同一个哈希（两端要能一起玩）", () => {
    expect(customHash(albums, [character()])).toBe(customHash(albums, [character()]));
    expect(customHash(albums, [character()])).toMatch(/^[0-9a-f]{16}$/);
  });

  it("**不覆盖**音频地址与版本号：换 CDN / 换宿主不该把两端拆开（与 D145 同口径）", () => {
    const base = customHash(albums, [character()]);
    expect(customHash(albums, [character({ audio: ["https://other.example.com/a.mp3?v=2"] })]))
      .toBe(base);
    expect(customHash(albums, [character({ audio: undefined })])).toBe(base);
  });

  it("**覆盖**卡名 / 顺序 / 卡面 / 专辑 / 作者 / 曲名（这些就是清单给的「桌上会有哪些牌」）", () => {
    const base = customHash(albums, [character()]);
    expect(customHash(albums, [character({ name: "别的名字" })])).not.toBe(base);
    expect(customHash(albums, [character({ order: 3 })])).not.toBe(base);
    expect(customHash(albums, [character({ card: ["https://x/b.jpg"], covers: ["https://x/b.jpg"] })]))
      .not.toBe(base);
    expect(customHash([{ ...albums[0]!, order: 9 }], [character()])).not.toBe(base);
    expect(customHash(albums, [character({ music: [["旧作", "第一首", "角色曲", "乙"]] })]))
      .not.toBe(base);
    expect(customHash(albums, [character({ music: [["旧作", "第二首", "角色曲", "甲"]] })]))
      .not.toBe(base);
  });

  it("两档卡面都算进哈希（换一张图就是换数据），但**「用户现在选哪一档」不是数据**（D164）", () => {
    const base = customHash(albums, [character()]);
    // 两份都进哈希：换了 4:3 那张图 ⇒ 数据确实不同（两端该拒）
    expect(customHash(albums, [character({
      coversByRatio: { "16x9": "https://x/a.jpg", "4x3": "https://x/a.4x3.jpg" },
    })])).not.toBe(base);
    // 而"只看 16:9 还是只看 4:3"根本不进哈希的输入 —— 数据集里两份都在，
    // 选哪一档是**显示偏好**（`resolveCardSet` 的事，不碰数据集）⇒ 两端各选各的也能握手 ✓
    const both = character({
      coversByRatio: { "16x9": "https://x/a.jpg", "4x3": "https://x/a.4x3.jpg" },
    });
    expect(customHash(albums, [both])).toBe(customHash(albums, [{ ...both }]));
  });

  it("与 `packHash` **不是同一套投影**：卡名/顺序在音MAD 那边不算数，在这边必须算", () => {
    const char = character();
    expect(customHash(albums, [char])).not.toBe(packHash(albums, [char]));
    // 音MAD 的投影对卡名与顺序不敏感（身份由原曲数据集守，S1）
    expect(packHash(albums, [character({ name: "别的" })])).toBe(packHash(albums, [char]));
  });

  it("空兜底也有稳定值（两端都没配源时握手期哈希一致）", () => {
    expect(customHash([], [])).toBe(customHash([], []));
    expect(customHash([], [])).toMatch(/^[0-9a-f]{16}$/);
  });
});
