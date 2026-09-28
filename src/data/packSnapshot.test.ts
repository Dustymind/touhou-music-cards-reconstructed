/** 曲目表快照（D145，C 路线）：解析的严格性、身份拼接、以及"生效数据集"的哈希口径。
 *
 * 三条最要紧的性质在这里钉住：
 *
 * 1. **形状不对就整段不用**（`undefined`）—— 半信半疑地用一份坏数据的表现是"少几首 / 点不响"；
 * 2. **没有快照时数据集逐字等于今天**（只有 `contentHash` 换成应用侧那套算法）；
 * 3. **同一份曲目表 ⇒ 同一个哈希** —— 一人用本机助手、一人用 CDN 也能一起玩（D145 §3）。
 */
import { beforeAll, describe, expect, it } from "vitest";

import { loadRealBundle } from "../test-utils";
import { datasetFor } from "./useDataset";
import {
  packHash, parsePackSnapshot, withPackSnapshot,
  type PackSnapshot, type PackSnapshotCharacter,
} from "./packSnapshot";
import type { AlbumRecord, CharacterRecord, DataBundle } from "./types";

let bundle: DataBundle;

beforeAll(async () => {
  bundle = await loadRealBundle();
});

const ALBUM: AlbumRecord = {
  key: "otomads", name: "otomads", kind: "other", pack: "otomads", order: 100,
  showAlbumName: false,
};
const CHARACTER: PackSnapshotCharacter = {
  key: "cirno",
  music: [{ id: "cirno_otomad_001", album: "otomads", title: "おてんば恋娘", extra: "角色曲", author: "作者" }],
  card: ["c.png"],
};

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { schema: 1, pack: "otomads", tracks: [], albums: [ALBUM], characters: [CHARACTER],
    ...overrides };
}

/** 坏形状矩阵：只要有一样不对，整段快照就不能用（宁可走自带那份兜底）。 */
const BAD_PAYLOADS: [string, unknown][] = [
  ["不是对象", "nope"],
  ["是数组", [1, 2]],
  ["是 null", null],
  ["只有 albums", { albums: [ALBUM] }],
  ["只有 characters", { characters: [CHARACTER] }],
  ["albums 不是数组", payload({ albums: "x" })],
  ["albums 空", payload({ albums: [] })],
  ["characters 不是数组", payload({ characters: {} })],
  ["characters 空", payload({ characters: [] })],
  ["专辑不是对象", payload({ albums: ["otomads"] })],
  ["专辑缺 key", payload({ albums: [{ ...ALBUM, key: "" }] })],
  ["专辑缺 name", payload({ albums: [{ ...ALBUM, name: undefined }] })],
  ["专辑缺 pack", payload({ albums: [{ ...ALBUM, pack: null }] })],
  ["专辑 kind 不认识", payload({ albums: [{ ...ALBUM, kind: "album" }] })],
  ["专辑 order 不是数", payload({ albums: [{ ...ALBUM, order: "100" }] })],
  ["专辑 showAlbumName 不是布尔", payload({ albums: [{ ...ALBUM, showAlbumName: "no" }] })],
  ["专辑 key 重复", payload({ albums: [ALBUM, ALBUM] })],
  ["角色不是对象", payload({ characters: ["cirno"] })],
  ["角色缺 key", payload({ characters: [{ music: [["otomads", "曲", "角色曲"]] }] })],
  ["角色 key 重复", payload({ characters: [CHARACTER, CHARACTER] })],
  ["角色没有曲目", payload({ characters: [{ key: "cirno", music: [] }] })],
  ["曲目不是数组", payload({ characters: [{ key: "cirno", music: ["曲"] }] })],
  ["曲目只有两位", payload({ characters: [{ key: "cirno", music: [["otomads", "曲"]] }] })],
  ["曲目有六位", payload({
    characters: [{ key: "cirno", music: [["otomads", "曲", "角色曲", "a", ["a"], "x"]] }] })],
  ["曲目专辑为空", payload({ characters: [{ key: "cirno", music: [["", "曲", "角色曲"]] }] })],
  ["附加信息不认识", payload({ characters: [{ key: "cirno", music: [["otomads", "曲", "插曲"]] }] })],
  ["作者不是字符串", payload({
    characters: [{ key: "cirno", music: [["otomads", "曲", "角色曲", 7]] }] })],
  ["多作者不是数组", payload({
    characters: [{ key: "cirno", music: [["otomads", "曲", "角色曲", "a", "a"]] }] })],
  ["多作者里混了空串", payload({
    characters: [{ key: "cirno", music: [["otomads", "曲", "角色曲", "a", ["a", " "]]] }] })],
  ["第 5 位配了个不是字符串的作者", payload({
    characters: [{ key: "cirno", music: [["otomads", "曲", "角色曲", null, ["a"]]] }] })],
  ["卡面为空数组", payload({ characters: [{ ...CHARACTER, card: [] }] })],
  ["卡面里是空串", payload({ characters: [{ ...CHARACTER, card: [""] }] })],
  ["封面为空数组", payload({ characters: [{ ...CHARACTER, covers: [] }] })],
  ["封面里是空串", payload({ characters: [{ ...CHARACTER, covers: [""] }] })],
  ["封面不是数组", payload({ characters: [{ ...CHARACTER, covers: "https://x/" }] })],
  // 卡面只认一条链接（D167）：对象/表形态的封面值是坏数据
  ["封面值是对象", payload({ characters: [{ ...CHARACTER, covers: [{ original: "https://x/a.jpg" }] }] })],
  ["自带 name 是空串", payload({ characters: [{ ...CHARACTER, name: "" }] })],
  ["自带 order 不是数", payload({ characters: [{ ...CHARACTER, order: "1" }] })],
  ["自带 searchNames 为空", payload({ characters: [{ ...CHARACTER, searchNames: [] }] })],
];

describe("parsePackSnapshot", () => {
  it("老清单（清单里根本没有这两个键）⇒ undefined，走自带那份兜底", () => {
    for (const old of [{}, { schema: 1, pack: "otomads", tracks: [] }, [{ album: "x" }], null]) {
      expect(parsePackSnapshot(old)).toBeUndefined();
    }
  });

  it.each(BAD_PAYLOADS)("坏形状：%s ⇒ undefined", (_label, value) => {
    expect(parsePackSnapshot(value)).toBeUndefined();
  });

  it("好形状 ⇒ 收下，且只留认识的键（不认识的多余字段不进运行时数据）", () => {
    const parsed = parsePackSnapshot(payload({
      characters: [{ ...CHARACTER, name: "チルノ", order: 3, searchNames: ["cirno"], 备注: "x" }],
      乱写: true,
    }));
    expect(parsed).toEqual({
      albums: [ALBUM],
      characters: [{ key: "cirno", music: [["otomads", "おてんば恋娘", "角色曲", "作者"]],
        card: ["c.png"], name: "チルノ", order: 3, searchNames: ["cirno"] }],
    });
  });

  it("曲目条目的形状与自带数据一致（3 / 4 / 5 位都收）", () => {
    const parsed = parsePackSnapshot(payload({
      characters: [{ key: "cirno", music: [
        ["otomads", "一", "角色曲"],
        ["otomads", "二", "道中曲", "甲"],
        ["otomads", "三", "秘封曲", "甲 & 乙", ["甲", "乙"]],
      ] }],
    }));
    expect(parsed?.characters[0]!.music).toHaveLength(3);
    expect(parsed?.characters[0]!.music[2]).toEqual(["otomads", "三", "秘封曲", "甲 & 乙", ["甲", "乙"]]);
  });

  it("源封面（D153）：与曲目一一对应的绝对 URL 数组照收，没有这个键就没有这个字段", () => {
    const withCovers = parsePackSnapshot(payload({
      characters: [{ ...CHARACTER, covers: ["https://i0.hdslb.com/a.jpg@703w_1000h_1c.webp"] }],
    }));
    expect(withCovers?.characters[0]!.covers).toEqual(["https://i0.hdslb.com/a.jpg@703w_1000h_1c.webp"]);
    expect(parsePackSnapshot(payload())?.characters[0]).not.toHaveProperty("covers");
  });

  it("源封面（D153/D167）：每首曲目**一条链接**，与 `music` 按下标对齐", () => {
    const wide = "https://i0.hdslb.com/a.jpg";
    const parsed = parsePackSnapshot(payload({
      characters: [{ ...CHARACTER, covers: [wide] }],
    }))!;
    expect(parsed.characters[0]!.covers).toEqual([wide]);
    // 两首曲目 ⇒ 两条链接，顺序即曲目顺序
    const two = parsePackSnapshot(payload({
      characters: [{
        ...CHARACTER,
        music: [...CHARACTER.music, { ...CHARACTER.music[0]!, id: "cirno_otomad_002" }],
        covers: [wide, "https://i0.hdslb.com/b.jpg"],
      }],
    }))!;
    expect(two.characters[0]!.covers).toEqual([wide, "https://i0.hdslb.com/b.jpg"]);
  });
});

describe("withPackSnapshot", () => {
  /** 把**自带**的 otomads 数据集"回灌"成一份快照（模拟源给的正是同一份数据）。 */
  function snapshotOf(dataset = datasetFor(bundle, "otomads")): PackSnapshot {
    return {
      albums: dataset.albums.map((album) => ({ ...album })),
      characters: dataset.characters.map((character) => ({
        key: character.key, music: character.music.map((entry) => ({ ...entry })),
        card: [...character.card],
        // 源封面（D153）：有才带 —— 与真源 per-track `cover = "…"` 攒出来的数组同形
        ...(character.covers ? { covers: [...character.covers] } : {}),
      })),
    };
  }

  it("快照的角色去原曲数据集取身份（name/order/搜索名），卡面用快照的覆盖", () => {
    // 这是**真实踩过的坑**（2026-09-26 浏览器实测）：清单先到、封面后到的那段时间里，
    // `hasSourceCovers` 一度翻成 false ⇒ "B 站封面"图集整套消失、回落成上游立绘。
    // 身份字段的兜底仍是原曲那份（S1 的边界），只有封面从自带的音MAD 数据集兜底。
    const baked = datasetFor(bundle, "otomads");
    const withCovers = baked.characters.filter((character) => (character.covers?.length ?? 0) > 0);
    expect(withCovers.length).toBeGreaterThan(0);          // 前置：自带数据集确实烘进了封面
    const snapshot = snapshotOf();
    const stripped: PackSnapshot = {
      albums: snapshot.albums,
      characters: snapshot.characters.map(({ covers: _covers, ...rest }) => rest),
    };
    const live = withPackSnapshot(bundle, stripped).datasets.otomads;
    const target = withCovers[0]!;
    expect(live.characterByKey.get(target.key)!.covers).toEqual(target.covers);
    expect(live.index.contentHash).toBe(
      withPackSnapshot(bundle, snapshotOf()).datasets.otomads.index.contentHash);
  });

  it("covers 变了 ⇒ 哈希跟着变（卡数 = 桌上会有哪些牌，两端必须一致）", () => {
    const before = withPackSnapshot(bundle, undefined).datasets.otomads.index.contentHash;
    const snapshot = snapshotOf();
    const first = snapshot.characters[0]!;
    const withCovers: PackSnapshot = {
      albums: snapshot.albums,
      characters: [{ ...first, covers: ["https://i0.hdslb.com/a.jpg@703w_1000h_1c.webp"] },
        ...snapshot.characters.slice(1)],
    };
    const after = withPackSnapshot(bundle, withCovers).datasets.otomads.index.contentHash;
    expect(after).not.toBe(before);
  });

  it("源多给一首 ⇒ 哈希跟着变（两端曲目表不同必须在握手期被拒）", () => {
    const baked = withPackSnapshot(bundle, undefined).datasets.otomads.index.contentHash;
    const snapshot = snapshotOf();
    const first = snapshot.characters[0]!;
    const grown: PackSnapshot = {
      albums: snapshot.albums,
      characters: [{ ...first, music: [...first.music, { id: "cirno_otomad_999", album: "otomads", title: "新加的曲目", extra: "角色曲", author: "作者" }] },
        ...snapshot.characters.slice(1)],
    };
    const live = withPackSnapshot(bundle, grown).datasets.otomads;
    expect(live.index.contentHash).not.toBe(baked);
    expect(live.index.counts.trackEntries)
      .toBe(datasetFor(bundle, "otomads").index.counts.trackEntries + 1);
  });
});

describe("packHash", () => {
  const albums: AlbumRecord[] = [ALBUM];
  const cirno: CharacterRecord = {
    key: "cirno", name: "チルノ", order: 1, card: ["c.png"], searchNames: ["cirno"],
    music: [
      { id: "cirno_otomad_001", album: "otomads", title: "一", extra: "角色曲", author: "甲" },
      { id: "cirno_otomad_002", album: "otomads", title: "二", extra: "道中曲", author: "甲 & 乙", authors: ["甲", "乙"] },
    ],
  };
  const marisa: CharacterRecord = {
    key: "kirisame-marisa", name: "霧雨魔理沙", order: 2, card: ["m.png"], searchNames: ["魔理沙"],
    music: [{ id: "kirisame-marisa_otomad_001", album: "otomads", title: "三", extra: "角色曲" }],
  };

  it("同数据同值（可复现）、16 位十六进制、两次不同标签拼成 62 位", () => {
    const value = packHash(albums, [cirno, marisa]);
    expect(value).toMatch(/^[0-9a-f]{16}$/);
    expect(packHash(albums, [cirno, marisa])).toBe(value);
    expect(value.slice(0, 8)).not.toBe(value.slice(8));      // 两个标签各自混淆，不是同一段复制两遍
  });

  it("与数组顺序无关（角色表在两侧的排列本来就可能不同）", () => {
    expect(packHash(albums, [marisa, cirno])).toBe(packHash(albums, [cirno, marisa]));
    expect(packHash([ALBUM, { ...ALBUM, key: "b", name: "b", order: 101 }], [cirno]))
      .toBe(packHash([{ ...ALBUM, key: "b", name: "b", order: 101 }, ALBUM], [cirno]));
  });

  it("换一首就变；连专辑的展示开关也算", () => {
    const base = packHash(albums, [cirno, marisa]);
    expect(packHash(albums, [{ ...cirno, music: [...cirno.music, { id: "cirno_otomad_003", album: "otomads", title: "四", extra: "角色曲" }] }, marisa]))
      .not.toBe(base);
    expect(packHash([{ ...ALBUM, showAlbumName: true }], [cirno, marisa])).not.toBe(base);
    expect(packHash([{ ...ALBUM, order: 99 }], [cirno, marisa])).not.toBe(base);
  });

  it("不含身份字段（name/order/searchNames）—— 那是主仓库真源，由原曲那份哈希守", () => {
    const base = packHash(albums, [cirno, marisa]);
    expect(packHash(albums, [{ ...cirno, name: "别的名字", order: 9, searchNames: [] }, marisa]))
      .toBe(base);
  });

  it("源封面算进去（卡数变了就是「桌上会有哪些牌」变了），原曲那份恒为 null ⇒ 口径不变", () => {
    const base = packHash(albums, [cirno, marisa]);
    const covered = [{ ...cirno, covers: ["https://i0.hdslb.com/a.jpg@703w_1000h_1c.webp"] }, marisa];
    expect(packHash(albums, covered)).not.toBe(base);
    // 同一个角色、同一个 card，只换封面 URL 也要变（两端看到的图可以不同，能抽到的牌数不能不同）
    const other = [{ ...cirno, covers: ["https://i1.hdslb.com/b.jpg@703w_1000h_1c.webp"] }, marisa];
    expect(packHash(albums, other)).not.toBe(packHash(albums, covered));
  });
});
