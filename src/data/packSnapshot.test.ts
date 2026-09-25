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
import type { AlbumRecord, CharacterRecord, DataBundle, MusicEntry } from "./types";

let bundle: DataBundle;

beforeAll(async () => {
  bundle = await loadRealBundle();
});

const ALBUM: AlbumRecord = {
  key: "otomads", name: "otomads", kind: "other", pack: "otomads", order: 100,
  showAlbumName: false,
};
const CHARACTER: PackSnapshotCharacter = {
  key: "cirno", music: [["otomads", "おてんば恋娘", "角色曲", "作者"]], card: ["c.png"],
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
});

describe("withPackSnapshot", () => {
  /** 把**自带**的 otomads 数据集"回灌"成一份快照（模拟源给的正是同一份数据）。 */
  function snapshotOf(dataset = datasetFor(bundle, "otomads")): PackSnapshot {
    return {
      albums: dataset.albums.map((album) => ({ ...album })),
      characters: dataset.characters.map((character) => ({
        key: character.key, music: character.music.map((entry) => [...entry] as MusicEntry),
        card: [...character.card],
      })),
    };
  }

  it("快照的角色去原曲数据集取身份（name/order/搜索名），卡面用快照的覆盖", () => {
    const source = datasetFor(bundle, "otomads");
    const target = source.characters[0]!;
    const snapshot = snapshotOf();
    const patched: PackSnapshot = {
      albums: snapshot.albums,
      characters: snapshot.characters.map((entry) =>
        entry.key === target.key ? { ...entry, card: ["改过的卡面.png"] } : entry),
    };
    const live = withPackSnapshot(bundle, patched).datasets.otomads;

    expect(live.characters.map((character) => character.key).sort())
      .toEqual(source.characters.map((character) => character.key).sort());
    const spliced = live.characterByKey.get(target.key)!;
    expect(spliced.name).toBe(target.name);                 // 身份来自原曲数据集（S1）
    expect(spliced.order).toBe(target.order);
    expect(spliced.searchNames).toEqual(target.searchNames);
    expect(spliced.card).toEqual(["改过的卡面.png"]);        // 卡面用快照的覆盖（D137）
    expect(live.sources).toBe(datasetFor(bundle, "otomads").sources);   // 注册表不归源管
    expect(live.index.counts.characters).toBe(live.characters.length);
    expect(live.index.counts.trackEntries)
      .toBe(live.characters.reduce((sum, character) => sum + character.music.length, 0));
    expect(live.albumByName.get("otomads")?.key).toBe("otomads");
  });

  it("S2：快照自带身份的角色（原曲数据集里没有）也能进数据集；缺身份/卡面则跳过并报一句人话", () => {
    const problems: string[] = [];
    const snapshot: PackSnapshot = {
      albums: [ALBUM],
      characters: [
        { key: "otomad-only", name: "自成一格", order: 2, searchNames: ["otto"],
          card: ["otto.png"], music: [["otomads", "曲", "角色曲", "作者"]] },
        { key: "no-identity", music: [["otomads", "曲", "角色曲"]] },
        { key: "no-card", name: "有名字没卡面", music: [["otomads", "曲", "角色曲"]] },
      ],
    };
    const live = withPackSnapshot(bundle, snapshot, (message) => problems.push(message)).datasets.otomads;

    expect(live.characters.map((character) => character.key)).toEqual(["otomad-only"]);
    const spliced = live.characters[0]!;
    expect([spliced.name, spliced.order, spliced.searchNames, spliced.card])
      .toEqual(["自成一格", 2, ["otto"], ["otto.png"]]);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("no-identity");
    expect(problems[1]).toContain("no-card");
  });

  it("一个角色都不认识的快照 ⇒ 空数据集（但**不静默**：每条都报）", () => {
    const problems: string[] = [];
    const live = withPackSnapshot(bundle, { albums: [ALBUM], characters: [
      { key: "ghost", music: [["otomads", "曲", "角色曲"]] },
    ] }, (message) => problems.push(message)).datasets.otomads;
    expect(live.characters).toHaveLength(0);
    expect(live.index.counts).toMatchObject({ characters: 0, trackEntries: 0, distinctTracks: 0 });
    expect(problems).toHaveLength(1);
  });

  it("没有快照 ⇒ 数据集逐字等于今天（只有 contentHash 换成应用侧那套）", () => {
    const baked = datasetFor(bundle, "otomads");
    const live = withPackSnapshot(bundle, undefined).datasets.otomads;

    expect(live.characters).toBe(baked.characters);          // 同一批对象，一个字段都不动
    expect(live.albums).toBe(baked.albums);
    expect(live.sources).toBe(baked.sources);
    expect(live.index.counts).toEqual(baked.index.counts);
    expect(live.index.contentHash).toMatch(/^[0-9a-f]{16}$/);
    expect(live.index.contentHash).toBe(packHash(baked.albums, baked.characters));
  });

  it("原曲那份数据集一个字都不动（哈希仍是构建期那个）", () => {
    const live = withPackSnapshot(bundle, { albums: [ALBUM], characters: [CHARACTER] });
    expect(live.datasets.originals).toBe(bundle.datasets.originals);
    expect(live.shared).toBe(bundle.shared);
  });

  it("**同一份数据 ⇒ 同一个哈希**：源给的曲目表与自带那份一致时，两端仍能一起玩", () => {
    const baked = withPackSnapshot(bundle, undefined).datasets.otomads.index.contentHash;
    const live = withPackSnapshot(bundle, snapshotOf()).datasets.otomads.index.contentHash;
    expect(live).toBe(baked);
  });

  it("源多给一首 ⇒ 哈希跟着变（两端曲目表不同必须在握手期被拒）", () => {
    const baked = withPackSnapshot(bundle, undefined).datasets.otomads.index.contentHash;
    const snapshot = snapshotOf();
    const first = snapshot.characters[0]!;
    const grown: PackSnapshot = {
      albums: snapshot.albums,
      characters: [{ ...first, music: [...first.music, ["otomads", "新加的曲目", "角色曲", "作者"]] },
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
    music: [["otomads", "一", "角色曲", "甲"], ["otomads", "二", "道中曲", "甲 & 乙", ["甲", "乙"]]],
  };
  const marisa: CharacterRecord = {
    key: "kirisame-marisa", name: "霧雨魔理沙", order: 2, card: ["m.png"], searchNames: ["魔理沙"],
    music: [["otomads", "三", "角色曲"]],
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
    expect(packHash(albums, [{ ...cirno, music: [...cirno.music, ["otomads", "四", "角色曲"]] }, marisa]))
      .not.toBe(base);
    expect(packHash([{ ...ALBUM, showAlbumName: true }], [cirno, marisa])).not.toBe(base);
    expect(packHash([{ ...ALBUM, order: 99 }], [cirno, marisa])).not.toBe(base);
  });

  it("不含身份字段（name/order/searchNames）—— 那是主仓库真源，由原曲那份哈希守", () => {
    const base = packHash(albums, [cirno, marisa]);
    expect(packHash(albums, [{ ...cirno, name: "别的名字", order: 9, searchNames: [] }, marisa]))
      .toBe(base);
  });
});
