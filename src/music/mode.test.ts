/** 音乐模式（原曲 / 音MAD）：曲包归属、可用性过滤、音源隐含要求。
 *
 * 数据来自真实 bundle（`data/packs/otomads.toml` → `public/data/*.json`），
 * 因此这里同时验证"曲包数据真的进了角色表与专辑表"。
 */
import { beforeAll, describe, expect, it } from "vitest";

import { loadRealBundle } from "../test-utils";
import type { DataBundle } from "../data/types";
import {
  DEFAULT_MUSIC_MODE, effectiveSourceOverrides, filterByMode, firstAllowedInMode, hasTracksInMode,
  modeOfEntry, packOfAlbum,
} from "./mode";
import { allowedTracks } from "./selection";
import { effectivePin } from "./presetView";
import { defaultPreset } from "./selection";

let bundle: DataBundle;

beforeAll(async () => {
  bundle = await loadRealBundle();
});

describe("音乐模式（原曲 / 音MAD）", () => {
  it("默认模式是原曲", () => {
    expect(DEFAULT_MUSIC_MODE).toBe("originals");
  });

  it("专辑的 pack 字段决定曲目的模式（显式归属，不做启发式推断）", () => {
    expect(packOfAlbum(bundle.albums, "otomads")).toBe("otomads");
    expect(packOfAlbum(bundle.albums, "東方紅魔郷 ～ the Embodiment of Scarlet Devil")).toBe("originals");
    // 未注册的专辑按原曲处理（数据缺失时不至于把曲目藏起来）
    expect(packOfAlbum(bundle.albums, "根本不存在的专辑")).toBe("originals");

    expect(modeOfEntry(bundle.albums, ["otomads", "川先僧 - 普通肥猫魔法使", "角色曲"])).toBe("otomads");
    expect(modeOfEntry(bundle.albums, ["otomads", "…", "角色曲"])).not.toBe("originals");
    expect(modeOfEntry(bundle.albums, ["東方紅魔郷 ～ the Embodiment of Scarlet Devil", "おてんば恋娘", "角色曲"]))
      .toBe("originals");
  });

  it("曲包数据进了角色表：音MAD 曲目分布在多个角色上", () => {
    const withOtomads = bundle.characters.filter((character) => hasTracksInMode(bundle.albums, character, "otomads"));
    const tracks = withOtomads.flatMap((character) =>
      filterByMode(bundle.albums, character.music, "otomads"));
    // 不写死数量：曲包会持续增长，只断言"确实覆盖了多个角色、且条数与角色表自洽"
    expect(withOtomads.length).toBeGreaterThan(10);
    expect(tracks.length).toBeGreaterThanOrEqual(withOtomads.length);
    expect(tracks.length).toBe(
      bundle.characters.flatMap((c) => c.music).filter((entry) => entry[0] === "otomads").length);
    // 每个曲包曲目都指向 pack = otomads 的那张专辑
    expect(tracks.every((entry) => entry[0] === "otomads")).toBe(true);
  });

  it("两个模式互斥：原曲模式看不到音MAD 曲目，反之亦然", () => {
    const cirno = bundle.characters.find((character) => character.key === "cirno")!;
    const originals = filterByMode(bundle.albums, cirno.music, "originals");
    const otomads = filterByMode(bundle.albums, cirno.music, "otomads");
    expect(originals.every((entry) => entry[0] !== "otomads")).toBe(true);
    expect(otomads.length).toBeGreaterThan(0);
    expect(otomads.every((entry) => entry[0] === "otomads")).toBe(true);
    // 两边加起来 = 该角色全部曲目
    expect(originals.length + otomads.length).toBe(cirno.music.length);
  });

  it("allowedTracks 按模式过滤；手选（pinned）不受影响", () => {
    const cirno = bundle.characters.find((character) => character.key === "cirno")!;
    const preset = defaultPreset(bundle.albums);

    const originals = allowedTracks(preset, cirno, undefined, bundle.albums, "originals").entries;
    const otomads = allowedTracks(preset, cirno, undefined, bundle.albums, "otomads").entries;
    // 同样不写死：断言两种模式的条目集合互不相交、且各自非空
    expect(originals.length).toBeGreaterThan(0);
    expect(otomads.length).toBeGreaterThan(0);
    expect(originals.every((entry) => entry[0] !== "otomads")).toBe(true);

    // pinned 直接返回（模式只影响"接下来能选哪些"，不打断已选的这一首）
    const pinned = otomads[0]!;
    expect(allowedTracks(preset, cirno, pinned, bundle.albums, "originals").entries).toEqual([pinned]);
  });

  it("effectivePin：手选属于另一个模式时回退到当前模式的第一首", () => {
    const cirno = bundle.characters.find((character) => character.key === "cirno")!;
    const preset = defaultPreset(bundle.albums);
    const otomadTrack = firstAllowedInMode(bundle.albums, cirno, "otomads")!;

    // 手选音MAD 曲目、当前是原曲模式 → 回退到原曲的第一首
    const fallback = effectivePin(preset, cirno, { cirno: otomadTrack }, bundle.albums, "originals");
    expect(fallback).not.toBeNull();
    expect(fallback![0]).not.toBe("otomads");

    // 切到音MAD 模式 → 手选生效
    expect(effectivePin(preset, cirno, { cirno: otomadTrack }, bundle.albums, "otomads")).toEqual(otomadTrack);
  });

  it("音MAD 模式下必须打开本地曲库（其余源保持用户设置）", () => {
    const overrides = { netease163: { enabled: false, order: 1 } };

    // 原曲：原样返回，不动用户设置
    expect(effectiveSourceOverrides(bundle.sources, overrides, "originals")).toEqual(overrides);

    // 音MAD：临时打开本地源（kind === "local"），其它键不变
    const forced = effectiveSourceOverrides(bundle.sources, overrides, "otomads");
    expect(forced.local!.enabled).toBe(true);
    expect(forced.netease163).toEqual({ enabled: false, order: 1 });
    // 不改写入参
    expect(overrides).toEqual({ netease163: { enabled: false, order: 1 } });
  });
});
