/** 音乐模式（原曲 / 音MAD / 自定义）：C 之后"模式"= **用哪份数据集**，不再按 `album.pack` 逐条过滤。
 *
 * 数据来自真实生成物（`data/public/data/{,otomads/,custom/}index.json`），
 * 所以这里同时验证"三份数据集真的分开了、且前两份的并集与分离前一致"。
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

describe("音乐模式（原曲 / 音MAD / 自定义）", () => {
  it("默认模式是原曲，三个模式都有数据集", () => {
    expect(DEFAULT_MUSIC_MODE).toBe("originals");
    expect(MUSIC_MODES).toEqual(["originals", "otomads", "custom"]);
    for (const mode of MUSIC_MODES) {
      expect(datasetFor(bundle, mode).index.mode).toBe(mode);
      expect(datasetFor(bundle, mode).index.contentHash.length).toBeGreaterThan(8);
    }
    // 哈希两两不同（否则"一模式一哈希"没有意义）
    const hashes = MUSIC_MODES.map((mode) => datasetFor(bundle, mode).index.contentHash);
    expect(new Set(hashes).size).toBe(MUSIC_MODES.length);
  });

  it("自定义那份是**空兜底**：0 角色 0 专辑，只有一条地址为空的源（契约 custom-mode-v1 C1/C7）", () => {
    const custom = datasetFor(bundle, "custom");
    expect(custom.characters).toEqual([]);
    expect(custom.albums).toEqual([]);
    expect(custom.index.counts).toMatchObject({ characters: 0, albums: 0, trackEntries: 0 });
    // 一条 `kind = "custom"` 的源，默认启用、**地址为空**（"还没填"是这个模式的正常状态）
    expect(custom.sources.map((source) => source.kind)).toEqual(["custom"]);
    expect(custom.sources[0]!.tableUrl).toBe("");
    expect(custom.sources[0]!.enabled).toBe(true);
    // 空源 ⇒ 界面要提示"必须填写自定义源链接"（文案键在 i18n，这里只钉数据侧）
    expect(datasetFor(bundle, "originals").characters.length).toBeGreaterThan(0);
  });

  it("原曲数据集：只含原曲曲目，且与 index 的自述一致", () => {
    const originals = datasetFor(bundle, "originals");
    // 不写死数量：角色表与专辑表会继续增长，只与 index.json 的自述互证（D97）
    expect(originals.characters).toHaveLength(originals.index.counts.characters);
    expect(originals.albums).toHaveLength(originals.index.counts.albums);
    expect(originals.albums.every((album) => album.pack !== "otomads")).toBe(true);
    const entries = originals.characters.flatMap((character) => character.music);
    expect(entries.length).toBe(originals.index.counts.trackEntries);
    expect(new Set(entries.map((entry) => entry.id)).size)
      .toBe(originals.index.counts.distinctTracks);
    expect(entries.every((entry) => entry.album !== "otomads")).toBe(true);
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
      expect(character.music.every((entry) => entry.album === "otomads")).toBe(true);
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

    const keys = (entries: readonly MusicEntry[]) => entries.map((entry) => entry.id);
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
    expect(entries.every((entry) => entry.album !== "otomads")).toBe(true);

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
