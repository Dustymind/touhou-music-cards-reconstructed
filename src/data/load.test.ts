import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DataLoadError, loadDataBundle, validateAlbums, validateCharacters, validateIndex,
  validateSources,
} from "./load";
import { displayTitle, splitTrackId, trackId, type CharacterRecord } from "./types";
import { cardAspectRatio, cardRatioChoices, CardAspectRatio } from "../theme/cardRatio";

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

  it("`audio`（模式 3 的逐卡音频，F1）要写就得是非空字符串数组", () => {
    const wrap = (list: unknown) => ({ schema: 1, characters: list });
    // 不写 = 原曲 / 音MAD 两份的形状（一个字段都不多）
    expect(validateCharacters(wrap([character()]), 1)).toHaveLength(1);
    expect(validateCharacters(wrap([character({ audio: ["https://x/a.mp3?v=1"] })]), 1)).toHaveLength(1);
    expect(() => validateCharacters(wrap([character({ audio: [] })]), 1)).toThrow(/audio/);
    expect(() => validateCharacters(wrap([character({ audio: ["  "] })]), 1)).toThrow(/audio/);
    expect(() => validateCharacters(wrap([character({ audio: "x" as never })]), 1)).toThrow(/audio/);
  });

  it("`coversByRatio`（逐档卡面链接，D165）要写就得是「认得的档 → 非空字符串数组」", () => {
    const wrap = (list: unknown) => ({ schema: 1, characters: list });
    // 不写 = 单链接形态（旧数据 / 手放的图）：三份数据集都可以不带这个字段
    expect(validateCharacters(wrap([character()]), 1)).toHaveLength(1);
    expect(validateCharacters(wrap([
      character({ coversByRatio: { original: ["https://x/a.jpg"], "16x9": ["https://x/w.jpg"] } }),
    ]), 1)).toHaveLength(1);
    expect(validateCharacters(wrap([character({ coversByRatio: { "4x3": ["https://x/t.jpg"] } })]), 1))
      .toHaveLength(1);
    // 认不得的档 / 空数组 / 数组里是空串 / 不是数组 / 不是对象 —— 一律报错
    // （这是个"按档位查表"的结构，键错等于查不到；数组与 `covers` 平行，空数组等于错位）
    expect(() => validateCharacters(wrap([
      character({ coversByRatio: { "16:9": ["https://x/w.jpg"] } as never }),
    ]), 1)).toThrow(/coversByRatio/);
    expect(() => validateCharacters(wrap([character({ coversByRatio: { "16x9": [] } })]), 1))
      .toThrow(/coversByRatio/);
    expect(() => validateCharacters(wrap([character({ coversByRatio: { "16x9": ["  "] } })]), 1))
      .toThrow(/coversByRatio/);
    expect(() => validateCharacters(wrap([character({ coversByRatio: { "16x9": "https://x/w.jpg" } as never })]), 1))
      .toThrow(/coversByRatio/);
    expect(() => validateCharacters(wrap([character({ coversByRatio: [] as never })]), 1))
      .toThrow(/coversByRatio/);
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

  it("图集的 `ratios`（能换哪几档画幅，D165）：可以不写；写了必须是非空、去重、认得的档位", async () => {
    const realFetch = globalThis.fetch.bind(globalThis);
    /** 给 `cardsets.json` 的第一套图集塞一个 `ratios`（其余照旧）。 */
    const stub = (ratios: unknown) => vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await realFetch(input as RequestInfo, init);
      if (!String(input).includes("cardsets.json")) return response;
      const payload = await response.json();
      payload.cardSets[0].ratios = ratios;
      return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
    }) as typeof fetch);

    // 合法列表原样带进数据集（渲染侧靠 `cardRatioChoices(set)` 决定控件出不出现）
    stub(["original", "16x9"]);
    const bundle = await loadDataBundle("./data");
    expect(bundle.shared.cardSets[0]!.ratios).toEqual(["original", "16x9"]);
    vi.unstubAllGlobals();

    // 认不得的档 / 空数组 / 重复 / 不是数组 ⇒ 直接拦下（不许让卡面高度无从算起）
    for (const bad of [["16:9"], [], ["16x9", "16x9"], "16x9", [7], null]) {
      stub(bad);
      await expect(loadDataBundle("./data"), String(bad)).rejects.toThrow(/ratios/);
      vi.unstubAllGlobals();
    }
  });

  it("出厂数据：六套内置图集都**不能换档**（原比例 703:1000），能换档的只有素材由使用者/源给的那几套", async () => {
    const bundle = await loadDataBundle("./data");
    expect(bundle.shared.cardSets.length).toBeGreaterThan(0);
    const builtIn = ["dairi", "dairi-sd", "enbu", "enbu-dolls", "thbwiki-sd", "zun"];
    const choices = new Map(bundle.shared.cardSets.map(
      (set) => [set.id, cardRatioChoices(set)]));
    for (const id of builtIn) {
      expect(choices.get(id), `${id} 不该能换档`).toBeUndefined();
    }
    // 素材由使用者/源给的两套（本地自放 + 源封面集）能换，且默认常规 = 今天的观感
    expect(choices.get("otomads")).toEqual(["original", "16x9", "4x3"]);
    expect(choices.get("otomads-cover")).toEqual(["original", "16x9", "4x3"]);
    for (const set of bundle.shared.cardSets) {
      expect(cardAspectRatio(set), set.id).toBe(CardAspectRatio);   // 数据里不带生效档位
    }
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
