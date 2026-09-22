/** 音乐模式（原曲 / 音MAD）：C 之后"模式"= **用哪份数据集**，不再按 `album.pack` 逐条过滤。
 *
 * 数据来自真实生成物（`public/data/index.json` 与 `public/data/otomads/index.json`），
 * 所以这里同时验证"两份数据集真的分开了、且并集与分离前一致"。
 */
import { beforeAll, describe, expect, it } from "vitest";

import { loadRealBundle } from "../test-utils";
import type { DataBundle, MusicEntry } from "../data/types";
import { datasetFor } from "../data/useDataset";
import { DEFAULT_MUSIC_MODE, MUSIC_MODES } from "./mode";
import { allowedTracks, defaultPreset } from "./selection";
import { effectivePin } from "./presetView";

let bundle: DataBundle;

beforeAll(async () => {
  bundle = await loadRealBundle();
});

describe("音乐模式（原曲 / 音MAD）", () => {
  it("默认模式是原曲，两个模式都有数据集", () => {
    expect(DEFAULT_MUSIC_MODE).toBe("originals");
    expect(MUSIC_MODES).toEqual(["originals", "otomads"]);
    for (const mode of MUSIC_MODES) {
      expect(datasetFor(bundle, mode).index.mode).toBe(mode);
      expect(datasetFor(bundle, mode).index.contentHash.length).toBeGreaterThan(8);
    }
    // 两个哈希必须不同（否则"一模式一哈希"没有意义）
    expect(datasetFor(bundle, "originals").index.contentHash)
      .not.toBe(datasetFor(bundle, "otomads").index.contentHash);
  });

  it("原曲数据集：只含原曲曲目，且与 index 的自述一致", () => {
    const originals = datasetFor(bundle, "originals");
    // 不写死数量：角色表与专辑表会继续增长，只与 index.json 的自述互证（D97）
    expect(originals.characters).toHaveLength(originals.index.counts.characters);
    expect(originals.albums).toHaveLength(originals.index.counts.albums);
    expect(originals.albums.every((album) => album.pack !== "otomads")).toBe(true);
    const entries = originals.characters.flatMap((character) => character.music);
    expect(entries.length).toBe(originals.index.counts.trackEntries);
    expect(new Set(entries.map((entry) => `${entry[0]}\u0001${entry[1]}`)).size)
      .toBe(originals.index.counts.distinctTracks);
    expect(entries.every((entry) => entry[0] !== "otomads")).toBe(true);
  });

  it("音MAD 数据集：只含有曲目的角色，且每条曲目都属于曲包专辑", () => {
    const originals = datasetFor(bundle, "originals");
    const otomads = datasetFor(bundle, "otomads");
    // 不写死数量：曲包会继续增长，只断言"覆盖多个角色、条目与角色自洽"
    expect(otomads.characters.length).toBeGreaterThan(10);
    expect(otomads.characters.length).toBeLessThan(originals.characters.length);
    expect(otomads.albums.map((album) => album.name)).toEqual(["otomads"]);
    for (const character of otomads.characters) {
      expect(character.music.length).toBeGreaterThan(0);        // 空角色不进这份数据集
      expect(character.music.every((entry) => entry[0] === "otomads")).toBe(true);
    }
    // S1：音MAD 这份是共享身份的投影 —— 每个角色都得在原曲那份里有出处
    const originalKeys = new Set(originals.characters.map((character) => character.key));
    for (const character of otomads.characters) {
      expect(originalKeys.has(character.key)).toBe(true);
    }
    expect(otomads.index.counts.characters).toBe(otomads.characters.length);
    expect(otomads.index.counts.trackEntries)
      .toBe(otomads.characters.reduce((sum, character) => sum + character.music.length, 0));
  });

  it("两模式互斥：同一角色的两曲目集合不相交，并集 = 分离前的并集", () => {
    const cirnoIn = (mode: "originals" | "otomads") =>
      datasetFor(bundle, mode).characters.find((character) => character.key === "cirno");
    const originals = cirnoIn("originals")!;
    const otomads = cirnoIn("otomads");
    expect(originals).toBeDefined();
    expect(otomads).toBeDefined();                              // 琪露诺有音MAD 曲目

    const keys = (entries: readonly MusicEntry[]) => entries.map((entry) => `${entry[0]}\u0001${entry[1]}`);
    const left = new Set(keys(originals.music));
    const right = keys(otomads!.music);
    expect(right.length).toBeGreaterThan(0);
    expect(right.every((key) => !left.has(key))).toBe(true);     // 同一条曲目不会两边都有
    expect(left.size + right.length).toBe(originals.music.length + otomads!.music.length);
  });

  it("allowedTracks 只吃数据集里的角色；手选（pinned）直接生效", () => {
    const originals = datasetFor(bundle, "originals");
    const otomads = datasetFor(bundle, "otomads");
    const preset = defaultPreset(originals.albums);

    const cirno = originals.characters.find((character) => character.key === "cirno")!;
    const entries = allowedTracks(preset, cirno).entries;
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry) => entry[0] !== "otomads")).toBe(true);

    // pinned：模式只影响"接下来能选哪些"，不打断已选的这一首
    const pinned = allowedTracks(defaultPreset(otomads.albums),
      otomads.characters.find((character) => character.key === "cirno")!).entries[0]!;
    expect(allowedTracks(preset, cirno, pinned).entries).toEqual([pinned]);
  });

  it("effectivePin：每个模式各自的存档，取到的就是那首（D110 之后不再需要跨模式回退）", () => {
    const originals = datasetFor(bundle, "originals");
    const cirno = originals.characters.find((character) => character.key === "cirno")!;
    const preset = defaultPreset(originals.albums);
    const chosen = cirno.music[1]!;
    expect(effectivePin(preset, cirno, { cirno: chosen })).toEqual(chosen);
    // 没手选 → 预设允许的第一首
    expect(effectivePin(preset, cirno, {})).toEqual(allowedTracks(preset, cirno).entries[0]);
  });
});
