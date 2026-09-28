/** 外置曲库署名的收集与排序，以及"本地助手没在跑就不显示"这道门槛。 */
import { describe, expect, it } from "vitest";

import type { AlbumRecord, CharacterRecord, DataBundle, ModeDataset, MusicEntry, SourceRecord } from "../data/types";
import type { MusicMode } from "./mode";
import { collectPackAuthors, packAuthorsFor } from "./packAuthors";
import { sortKeyOf } from "./authorOrder";
import { loadRealBundle } from "../test-utils";
import type { TableMap } from "./sources";

const ALBUM: AlbumRecord = { key: "otomads", name: "otomads", kind: "other", pack: "otomads", order: 100 };

/** 一个角色 + 若干曲目（`author` 传 `undefined` 就是"这首没写作者"）。 */
function character(key: string, authors: (string | undefined)[]): CharacterRecord {
  return {
    key, name: key, order: 1, card: [], searchNames: [],
    music: authors.map((author, index): MusicEntry => ({
      id: `${key}_otomad_${String(index + 1).padStart(3, "0")}`,
      album: "otomads", title: `曲 ${index}`, extra: "角色曲",
      ...(author === undefined ? {} : { author }),
    })),
  };
}

function dataset(mode: MusicMode, characters: CharacterRecord[], sources: SourceRecord[]): ModeDataset {
  return {
    mode,
    index: {
      schema: 1, mode, contentHash: `hash-${mode}`,
      counts: { characters: characters.length, albums: 1, trackEntries: 0, distinctTracks: 0 },
    },
    characters, albums: [ALBUM], sources, tracks: {},
    characterByKey: new Map(characters.map((entry) => [entry.key, entry])),
    albumByName: new Map([[ALBUM.name, ALBUM]]),
  };
}

const LOCAL_SOURCE: SourceRecord = {
  id: "local", label: { en: "Local library", zh: "本地曲库" }, tableUrl: "manifest.json",
  kind: "local", order: 1, enabled: true, proxyable: false,
  description: { en: "local", zh: "本地" },
};

/** 只造要用到的三份数据集：原曲那份没有 author 字段，音MAD 那份才有；自定义那份恒为空。 */
function bundle(otomadsCharacters: CharacterRecord[], originalsCharacters: CharacterRecord[] = []): DataBundle {
  return {
    shared: { cardSets: [] },
    datasets: {
      originals: dataset("originals", originalsCharacters, []),
      otomads: dataset("otomads", otomadsCharacters, [LOCAL_SOURCE]),
      custom: dataset("custom", [], []),
    },
  };
}

/** 本地源表的几种状态（`ready` + 有曲目 = "助手真的在跑"）。 */
function tables(status: "idle" | "loading" | "ready" | "error", tracks = 1): TableMap {
  const entries = new Map<string, string>();
  for (let index = 0; index < tracks; index += 1) entries.set(`k${index}`, `http://127.0.0.1:8011/media/${index}.mp3`);
  return { local: { id: "local", status, entries } };
}

describe("collectPackAuthors", () => {
  it("收集、去重，并忽略没有作者的曲目", () => {
    const data = bundle([
      character("cirno", ["川先僧", "川先僧", undefined]),
      character("reimu", ["鞍山侯国玉电乐团", "   ", "きゅーみぅ"]),
    ]);
    // 鞍(an) < 川(chuan)，假名排最后
    expect(collectPackAuthors(data)).toEqual(["鞍山侯国玉电乐团", "川先僧", "きゅーみぅ"]);
  });

  it("按『英文 / 拼音首字母』排序：汉字按拼音、拉丁名按字母，**两者混排**在同一 A→Z 里", () => {
    const data = bundle([
      character("a", ["ねむちゃんぐ", "张伟", "Chyan_184", "鞍山侯国玉电乐团", "拔剑Sketon", "打酱油的小火柴"]),
    ]);
    expect(collectPackAuthors(data)).toEqual([
      "鞍山侯国玉电乐团",      // a（ān）
      "拔剑Sketon",           // b（bá）
      "Chyan_184",            // c（拉丁字母 c）
      "打酱油的小火柴",        // d（dǎ）
      "张伟",                 // z（zhāng）
      "ねむちゃんぐ",          // 假名：排在字母之后
    ]);
  });

  it("曲包写了 `authors = [...]`（第 5 位）→ 按数组**逐个署名**，不是一整串", () => {
    const data = bundle([{
      key: "cirno", name: "cirno", order: 1, card: [], searchNames: [],
      music: [
        { id: "cirno_otomad_001", album: "otomads", title: "合写的", extra: "角色曲", author: "乙 & 甲", authors: ["乙", "甲"] },   // 老写法 + 新数组（同源）
        { id: "cirno_otomad_002", album: "otomads", title: "单独的", extra: "角色曲", author: "丙" },
        { id: "cirno_otomad_003", album: "otomads", title: "没作者", extra: "角色曲" },
      ],
    }]);
    // 「乙 & 甲」拆成两个人（并按首字母排序），整串本身不再算一个署名
    expect(collectPackAuthors(data)).toEqual(["丙", "甲", "乙"]);
  });

  it("合写署名原样保留（`A & B` 是一条，不拆成两个人）", () => {
    const data = bundle([character("cirno", ["打酱油的小火柴 & 长叶松烯", "打酱油的小火柴"])]);
    expect(collectPackAuthors(data)).toHaveLength(2);
  });

  it("原曲数据集里的曲目不算外置曲库（那里根本没有 author 字段）", () => {
    const data = bundle([], [character("cirno", [undefined, undefined])]);
    expect(collectPackAuthors(data)).toEqual([]);
  });
});

describe("真实数据（public/data/otomads/characters.json）", () => {
  it("真实曲包的署名去重后 50+ 个，且首字母混排真的生效", async () => {
    const bundle = await loadRealBundle();
    const sorted = collectPackAuthors(bundle);
    expect(new Set(sorted).size).toBe(sorted.length);      // 去重过了
    expect(sorted.length).toBeGreaterThan(50);             // 2026-09 拆完合写后是 70 个
    const at = (name: string): number => sorted.indexOf(name);
    // 跨脚本的 A→Z：a(鞍) < b(拔) < c(Chyan) < d(打) < …
    expect(at("鞍山侯国玉电乐团")).toBeLessThan(at("拔剑Sketon"));
    expect(at("拔剑Sketon")).toBeLessThan(at("Chyan_184"));
    expect(at("Chyan_184")).toBeLessThan(at("打酱油的小火柴"));
    // 假名（认不出首字母）排在所有字母键之后
    const lastLetterKeyed = sorted.filter((name) => sortKeyOf(name) !== "~").length;
    expect(sorted.findIndex((name) => sortKeyOf(name) === "~")).toBe(lastLetterKeyed);
  });
});

describe("packAuthorsFor（本地源门槛）", () => {
  const data = bundle([character("cirno", ["川先僧"])]);

  it("本地源还没载入 / 载入失败 / 表是空的 → 空数组（关于页那一段整行不显示）", () => {
    const otomads = data.datasets.otomads;
    expect(packAuthorsFor(data, otomads, {})).toEqual([]);                       // 表都还没建
    expect(packAuthorsFor(data, otomads, tables("idle"))).toEqual([]);
    expect(packAuthorsFor(data, otomads, tables("error"))).toEqual([]);
    expect(packAuthorsFor(data, otomads, tables("ready", 0))).toEqual([]);       // 载入成功但一首都没有
  });

  it("本地源载入成功（ready 且有曲目）→ 给出署名", () => {
    expect(packAuthorsFor(data, data.datasets.otomads, tables("ready"))).toEqual(["川先僧"]);
  });

  it("原曲模式（当前数据集里没有本地源）→ 空数组：那一段只在音MAD 模式下出现", () => {
    expect(packAuthorsFor(data, data.datasets.originals, tables("ready"))).toEqual([]);
  });

  it("本地源被用户关掉（enabled = false）→ 空数组", () => {
    const otomads: ModeDataset = { ...data.datasets.otomads, sources: [{ ...LOCAL_SOURCE, enabled: false }] };
    expect(packAuthorsFor(data, otomads, tables("ready"))).toEqual([]);
  });
});
