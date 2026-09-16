import { describe, expect, it } from "vitest";

import {
  DataLoadError, groupByExtra, validateAlbums, validateCharacters, validateIndex, validateSources,
} from "./load";
import { displayTitle, splitTrackId, trackId, type CharacterRecord } from "./types";

const character = (overrides: Partial<CharacterRecord> = {}): CharacterRecord => ({
  key: "cirno",
  name: "チルノ",
  order: 1,
  card: ["チルノ.png"],
  searchNames: ["チルノ", "Cirno"],
  music: [["東方紅魔郷 ～ the Embodiment of Scarlet Devil", "おてんば恋娘", "角色曲"]],
  ...overrides,
});

describe("data validators", () => {
  it("index 必须带 schema 与 contentHash", () => {
    expect(() => validateIndex({ schema: 2, contentHash: "abcdefghij", counts: { characters: 1 } }))
      .toThrow(DataLoadError);
    const index = validateIndex({
      schema: 1, contentHash: "abcdefghij", counts: { characters: 1, albums: 1, trackEntries: 1, distinctTracks: 1 },
    });
    expect(index.schema).toBe(1);
  });

  it("curves: 记录数、重复 key、空曲目、非法附加信息都要报错", () => {
    const wrap = (list: unknown) => ({ schema: 1, characters: list });
    expect(() => validateCharacters(wrap({}), 1)).toThrow(/缺少 characters/);
    expect(() => validateCharacters(wrap([character()]), 2)).toThrow(/记录数/);
    expect(() => validateCharacters(wrap([character(), character()]), 2)).toThrow(/key 重复/);
    expect(() => validateCharacters(wrap([character({ music: [] })]), 1)).toThrow(/缺曲目/);
    expect(() => validateCharacters(
      wrap([character({ music: [["a", "b", "非法" as never]] })]), 1)).toThrow(/附加信息/);
  });

  it("合法角色通过", () => {
    expect(validateCharacters({ schema: 1, characters: [character()] }, 1)).toHaveLength(1);
  });

  it("albums / sources 结构校验", () => {
    expect(validateAlbums({ schema: 1, albums: [] })).toEqual([]);
    expect(() => validateSources({ sources: [] })).toThrow();
    expect(() => validateSources({ sources: [
      { id: "a", order: 1 }, { id: "b", order: 1 },
    ] })).toThrow(/order 重复/);
    expect(validateSources({ sources: [{ id: "a", order: 1 }] })).toHaveLength(1);
  });
});

describe("track helpers", () => {
  it("trackId 往返", () => {
    const id = trackId("专辑", "01. 曲目");
    expect(splitTrackId(id)).toEqual(["专辑", "01. 曲目"]);
  });

  it("显示名去掉序号但存档值保留", () => {
    expect(displayTitle("04. 恋色マジック")).toBe("恋色マジック");
    expect(displayTitle("恋色マスタースパーク")).toBe("恋色マスタースパーク");
  });

  it("按附加信息分组", () => {
    const counts = groupByExtra(character({
      music: [
        ["a", "t1", "角色曲"],
        ["a", "t2", "道中曲"],
        ["b", "t3", "秘封曲"],
        ["b", "t4", "秘封曲"],
      ],
    }));
    expect(counts).toEqual({ 角色曲: 1, 道中曲: 1, 更多道中曲: 0, 秘封曲: 2 });
  });
});
