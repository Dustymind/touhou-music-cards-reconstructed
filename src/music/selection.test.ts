import { describe, expect, it } from "vitest";

import type { AlbumRecord, CharacterRecord } from "../data/types";
import { allowedTracks, countEnabled, defaultPreset, isTrackEnabled, type PresetState } from "./selection";

const albums: AlbumRecord[] = [
  { key: "th06", name: "紅魔郷", kind: "game", pack: "originals", order: 1 },
  { key: "th07", name: "妖々夢", kind: "game", pack: "originals", order: 2 },
  { key: "hr01", name: "蓬莱人形", kind: "hifuu", pack: "originals", order: 3 },
];

const character: CharacterRecord = {
  key: "cirno", name: "チルノ", order: 1, card: ["c.png"], searchNames: ["チルノ"],
  music: [
    ["紅魔郷", "おてんば恋娘", "角色曲"],
    ["妖々夢", "無何有の郷　～ Deep Mountain", "更多道中曲"],
    ["蓬莱人形", "氷の妖精", "秘封曲"],
  ],
};

const preset = (patch: Partial<PresetState> = {}): PresetState => ({ ...defaultPreset(albums), ...patch });

describe("selection resolver", () => {
  it("默认：全部勾选 + 三态不配置 → 所有曲目可用", () => {
    expect(isTrackEnabled(preset(), "紅魔郷", "角色曲")).toBe(true);
    expect(allowedTracks(preset(), character).entries).toHaveLength(3);
  });

  it("未勾选的专辑落选（不配置时取决于专辑）", () => {
    expect(isTrackEnabled(preset({ albums: { 紅魔郷: false } }), "紅魔郷", "角色曲")).toBe(false);
  });

  it("已启用压过未勾选的专辑", () => {
    const p = preset({ albums: { 紅魔郷: false }, category: { 角色曲: "on", 道中曲: "unset", 更多道中曲: "unset" } });
    expect(isTrackEnabled(p, "紅魔郷", "角色曲")).toBe(true);
  });

  it("已禁用否决已勾选的专辑", () => {
    const p = preset({ category: { 角色曲: "off", 道中曲: "unset", 更多道中曲: "unset" } });
    expect(isTrackEnabled(p, "紅魔郷", "角色曲")).toBe(false);
    expect(isTrackEnabled(p, "妖々夢", "更多道中曲")).toBe(true);
  });

  it("秘封曲只受秘封碟勾选控制，三态开关对它无效", () => {
    const p = preset({ category: { 角色曲: "on", 道中曲: "on", 更多道中曲: "on" }, hifuu: { 蓬莱人形: false } });
    expect(isTrackEnabled(p, "蓬莱人形", "秘封曲")).toBe(false);
    p.hifuu["蓬莱人形"] = true;
    p.category.角色曲 = "off";
    expect(isTrackEnabled(p, "蓬莱人形", "秘封曲")).toBe(true);
  });

  it("单曲模式手选优先级最高", () => {
    const pinned = character.music[2]!;
    const result = allowedTracks(preset({ hifuu: { 蓬莱人形: false } }), character, pinned);
    expect(result.entries).toEqual([pinned]);
    expect(result.pinned).toBe(pinned);
  });

  it("统计可用曲目数", () => {
    expect(countEnabled(preset(), [character])).toEqual({ enabled: 3, total: 3 });
    expect(countEnabled(preset({ albums: { 紅魔郷: false, 妖々夢: false }, hifuu: { 蓬莱人形: false } }), [character]))
      .toEqual({ enabled: 0, total: 3 });
  });
});
