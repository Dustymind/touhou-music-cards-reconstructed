import { describe, expect, it } from "vitest";

import type { AlbumRecord, CharacterRecord } from "../data/types";
import { defaultPreset } from "./selection";
import { effectivePin, groupAlbums, presetStats, singleModeRows } from "./presetView";

const albums: AlbumRecord[] = [
  { key: "th06", name: "紅魔郷", kind: "game", pack: "originals", order: 23 },
  { key: "th07", name: "妖々夢", kind: "game", pack: "originals", order: 24 },
  { key: "hr01", name: "蓬莱人形", kind: "hifuu", pack: "originals", order: 1 },
  { key: "th07.5-day", name: "萃夢想 Day Disc", kind: "fighting", pack: "originals", order: 13 },
  { key: "sangetsusei", name: "三月精", kind: "other", pack: "originals", order: 39 },
];

const cirno: CharacterRecord = {
  key: "cirno", name: "チルノ", order: 1, card: ["c.png"], searchNames: ["チルノ", "Cirno"],
  music: [
    { id: "th06_03", album: "紅魔郷", title: "おてんば恋娘", extra: "角色曲" },
    { id: "th07_02", album: "妖々夢", title: "無何有の郷", extra: "更多道中曲" },
    { id: "hr01_01", album: "蓬莱人形", title: "氷の妖精", extra: "秘封曲" },
  ],
};
const marisa: CharacterRecord = {
  key: "kirisame-marisa", name: "霧雨魔理沙", order: 2, card: ["m.png"], searchNames: ["霧雨魔理沙"],
  music: [{ id: "th08_10", album: "紅魔郷", title: "恋色マスタースパーク", extra: "角色曲" }],
};

describe("groupAlbums", () => {
  it("按 秘封 → CD（格斗+其它）→ 官作 分组并保持 order", () => {
    const groups = groupAlbums(albums);
    expect(groups.hifuu.map((a) => a.key)).toEqual(["hr01"]);
    expect(groups.cd.map((a) => a.key)).toEqual(["th07.5-day", "sangetsusei"]);
    expect(groups.game.map((a) => a.key)).toEqual(["th06", "th07"]);
  });
});

describe("presetStats", () => {
  it("统计可用曲目与有曲目的角色数", () => {
    const stats = presetStats(defaultPreset(albums), [cirno, marisa]);
    expect(stats.totalTracks).toBe(4);
    expect(stats.enabledTracks).toBe(4);
    expect(stats.charactersWithTracks).toBe(2);
    expect(stats.byExtra.秘封曲).toEqual({ enabled: 1, total: 1 });
  });

  it("取消秘封碟与官作后可用数下降", () => {
    const preset = defaultPreset(albums);
    preset.hifuu["蓬莱人形"] = false;
    preset.albums["紅魔郷"] = false;
    const stats = presetStats(preset, [cirno, marisa]);
    expect(stats.enabledTracks).toBe(1);          // 只剩 チルノ 的 更多道中曲
    expect(stats.charactersWithTracks).toBe(1);
  });
});

describe("singleModeRows / effectivePin", () => {
  it("只列出预设允许的曲目，并带上手选与禁用状态", () => {
    const preset = defaultPreset(albums);
    preset.albums["妖々夢"] = false;
    const rows = singleModeRows(preset, [cirno, marisa], {}, {});
    expect(rows.map((row) => row.character.key)).toEqual(["cirno", "kirisame-marisa"]);
    expect(rows[0]!.allowed.map((entry) => entry.title)).toEqual(["おてんば恋娘", "氷の妖精"]);
  });

  it("搜索命中别名（Cirno）", () => {
    const rows = singleModeRows(defaultPreset(albums), [cirno, marisa], {}, {}, "cirno");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.character.key).toBe("cirno");
  });

  it("effectivePin 手选优先，否则取第一首", () => {
    const preset = defaultPreset(albums);
    expect(effectivePin(preset, cirno, {})?.title).toBe("おてんば恋娘");
    const picked: CharacterRecord["music"][number] = { id: "hr01_01", album: "蓬莱人形", title: "氷の妖精", extra: "秘封曲" };
    expect(effectivePin(preset, cirno, { cirno: picked })?.title).toBe("氷の妖精");
  });

  it("没有任何可用曲目时返回 null", () => {
    const preset = defaultPreset(albums);
    for (const album of albums) {
      preset.albums[album.name] = false;
      preset.hifuu[album.name] = false;
    }
    expect(effectivePin(preset, cirno, {})).toBeNull();
  });
});
