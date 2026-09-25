import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DataLoadError, loadDataBundle, validateAlbums, validateCharacters, validateIndex,
  validateSources,
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
    expect(() => validateIndex({ schema: 2, mode: "originals", contentHash: "abcdefghij", counts: { characters: 1 } }, "originals"))
      .toThrow(DataLoadError);
    // 数据集自带 mode：与调用方期望不符就是坏数据（C：一模式一份）
    expect(() => validateIndex({ schema: 1, mode: "otomads", contentHash: "abcdefghij", counts: { characters: 1 } }, "originals"))
      .toThrow(DataLoadError);
    const index = validateIndex({
      schema: 1, mode: "originals", contentHash: "abcdefghij",
      counts: { characters: 1, albums: 1, trackEntries: 1, distinctTracks: 1 },
    }, "originals");
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

describe("loadDataBundle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("缺一份数据集就报错，不会静默少一份", async () => {
    // C 之后两套数据集一起取（契约 §4 策略 A）；少一份必须是**可读的失败**，
    // 而不是"少了一份照样开" —— 缺的就是 index.json，错误里要指出是哪个 URL
    const realFetch = globalThis.fetch.bind(globalThis);
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("otomads/index.json")) return new Response("missing", { status: 404 });
      return realFetch(input as RequestInfo, init);
    }) as typeof fetch);

    await expect(loadDataBundle("./data")).rejects.toThrow(/otomads\/index\.json/);
  });

  it("每个源的响度表按数据集 base 解析（D130）", async () => {
    // 表由源的所有者生成、路径写在源的注册表里（相对数据集目录）；主仓库只把它拷进同一个 base。
    // 这里把 `/sub/dir` 映射回真实生成物：数据集从别的 base 载入时，表地址也跟着那个 base ✓
    const realFetch = globalThis.fetch.bind(globalThis);
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), globalThis.location.origin);
      url.pathname = url.pathname.replace(/^\/sub\/dir/, "/data");
      return realFetch(url, init);
    }) as typeof fetch);

    const bundle = await loadDataBundle("/sub/dir");
    const table = (data: typeof bundle) =>
      data.datasets.otomads.sources.find((source) => source.loudnessUrl)?.loudnessUrl;
    expect(table(bundle)).toBe("/sub/dir/otomads/loudness/otomads.json");
    // 同一个 `url()`：带尾斜杠的 base 归一化之后还是同一个地址（不该出现 `//`）
    const trailing = await loadDataBundle("/sub/dir/");
    expect(table(trailing)).toBe("/sub/dir/otomads/loudness/otomads.json");
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
});
