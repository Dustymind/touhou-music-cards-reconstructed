/** 同名 ≠ 同曲：曲目身份必须带专辑（不同作品/CD 的同名曲目是不同曲子）。 */
import { describe, expect, it } from "vitest";

import type { AlbumRecord, CharacterRecord } from "../data/types";
import { displayTitle, trackId } from "../data/types";
import { buildEntries, resolveTrack } from "./sources";
import { allowedTracks, defaultPreset, isTrackEnabled } from "./selection";
import { presetStats } from "./presetView";

const albums: AlbumRecord[] = [
  { key: "th07", name: "東方妖々夢", kind: "game", pack: "originals", order: 24 },
  { key: "th09", name: "東方花映塚", kind: "game", pack: "originals", order: 26 },
];

// 同一曲名出现在两张专辑里：TH07 的与 TH09 的是两首不同的曲子
const SAME_TITLE = "東方妖妖夢　～ Ancient Temple";

const youmu: CharacterRecord = {
  key: "konpaku-youmu", name: "魂魄妖夢", order: 1, card: ["y.png"], searchNames: ["魂魄妖夢"],
  music: [
    { id: "th07_10", album: "東方妖々夢", title: SAME_TITLE, extra: "道中曲" },
    { id: "th09_07", album: "東方花映塚", title: SAME_TITLE, extra: "更多道中曲" },
  ],
};

describe("曲目身份：同名不同专辑 = 不同曲子", () => {
  it("trackId 带专辑，同名曲目不会互相覆盖", () => {
    const a = trackId("東方妖々夢", SAME_TITLE);
    const b = trackId("東方花映塚", SAME_TITLE);
    expect(a).not.toBe(b);
    expect(displayTitle(SAME_TITLE)).toBe(SAME_TITLE);   // 显示名只是显示名
  });

  it("源表解析按 (专辑,曲目) 分别命中，各自拿到自己的 URL", () => {
    const entries = buildEntries([
      ["東方妖々夢", SAME_TITLE, "https://a/th07.mp3"],
      ["東方花映塚", SAME_TITLE, "https://b/th09.mp3"],
    ]);
    // 归一化别名（去掉 `作者 - ` 前缀）会额外插入键，所以这里只要求"不少于两个"，关键是下面两次查找各自命中
    expect(entries.size).toBeGreaterThanOrEqual(2);
    const table = { s: { id: "s", status: "ready" as const, entries } };
    expect(resolveTrack(table, ["s"], { id: "th07_10", album: "東方妖々夢", title: SAME_TITLE })?.url).toBe("https://a/th07.mp3");
    expect(resolveTrack(table, ["s"], { id: "th09_07", album: "東方花映塚", title: SAME_TITLE })?.url).toBe("https://b/th09.mp3");
  });

  it("选择系统按专辑分别判定：勾一张专辑不会连带另一张的同名曲", () => {
    const preset = defaultPreset(albums);
    preset.albums["東方妖々夢"] = false;                 // 只取消 TH07
    expect(isTrackEnabled(preset, "東方妖々夢", "道中曲")).toBe(false);
    expect(isTrackEnabled(preset, "東方花映塚", "更多道中曲")).toBe(true);
    const allowed = allowedTracks(preset, youmu).entries;
    expect(allowed).toHaveLength(1);
    expect(allowed[0]!.album).toBe("東方花映塚");
  });

  it("统计按条目计数，不会把同名曲目当成一首", () => {
    const stats = presetStats(defaultPreset(albums), [youmu]);
    expect(stats.totalTracks).toBe(2);
    expect(stats.enabledTracks).toBe(2);
  });
});
