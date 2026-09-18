/** 载入并校验 `public/data/*.json`。
 *
 * 与上游的差别：上游把三份 JSON 直接塞进内存、字段形态靠 TS 侧宽松容错；
 * 这里在**入口**做一次结构校验，坏数据立刻给出可读错误，而不是等渲染时才炸。
 */
import {
  type AlbumRecord,
  type CardSetRecord,
  type CharacterRecord,
  type DataBundle,
  type DataIndex,
  EXTRAS,
  type Extra,
  type SourceRecord,
} from "./types";

export class DataLoadError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "DataLoadError";
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new DataLoadError(`${url} → HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new DataLoadError(`${url} 不是合法 JSON`, error);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DataLoadError(message);
}

export function validateIndex(raw: unknown): DataIndex {
  assert(raw && typeof raw === "object", "index.json 结构不对");
  const index = raw as DataIndex;
  assert(index.schema === 1, `数据 schema 版本不支持：${String(index.schema)}`);
  assert(typeof index.contentHash === "string" && index.contentHash.length > 8, "index.json 缺 contentHash");
  assert(index.counts && typeof index.counts.characters === "number", "index.json 缺 counts");
  return index;
}

export function validateCharacters(raw: unknown, expected: number): CharacterRecord[] {
  const list = (raw as { characters?: unknown } | null)?.characters;
  assert(Array.isArray(list), "characters.json 缺少 characters 数组");
  assert(list.length === expected,
    `characters.json 记录数与 index 不符（${list.length} vs ${expected}）`);
  const characters = list as CharacterRecord[];
  const keys = new Set<string>();
  for (const character of characters) {
    assert(typeof character.key === "string" && character.key.length > 0, "角色缺 key");
    assert(!keys.has(character.key), `角色 key 重复：${character.key}`);
    keys.add(character.key);
    assert(Array.isArray(character.card) && character.card.length > 0, `${character.key} 缺卡面`);
    assert(Array.isArray(character.music) && character.music.length > 0, `${character.key} 缺曲目`);
    for (const entry of character.music) {
      // `[专辑, 曲名, extra]`，第 4 位是**可选**的作者（音MAD 这类曲目才有）
      assert(Array.isArray(entry) && (entry.length === 3 || entry.length === 4),
        `${character.key} 曲目条目形状不对`);
      assert((EXTRAS as readonly string[]).includes(entry[2]),
        `${character.key} 的附加信息非法：${String(entry[2])}`);
      assert(entry.length === 3 || typeof entry[3] === "string",
        `${character.key} 的作者字段必须是字符串`);
    }
  }
  return characters;
}

export function validateAlbums(raw: unknown): AlbumRecord[] {
  const list = (raw as { albums?: unknown } | null)?.albums;
  assert(Array.isArray(list), "albums.json 缺少 albums 数组");
  return list as AlbumRecord[];
}

export function validateSources(raw: unknown): SourceRecord[] {
  const sources = (raw as { sources?: unknown })?.sources;
  assert(Array.isArray(sources) && sources.length > 0, "sources.json 结构不对");
  const orders = new Set<number>();
  for (const source of sources as SourceRecord[]) {
    assert(typeof source.id === "string", "音源缺 id");
    assert(!orders.has(source.order), `音源 order 重复：${source.order}`);
    orders.add(source.order);
  }
  return sources as SourceRecord[];
}

function validateCardSets(raw: unknown): CardSetRecord[] {
  const payload = raw as { default?: unknown; cardSets?: unknown } | null;
  assert(Array.isArray(payload?.cardSets) && payload.cardSets.length > 0, "cardsets.json 缺少 cardSets");
  const sets = payload.cardSets as CardSetRecord[];
  const ids = new Set<string>();
  for (const set of sets) {
    assert(typeof set.id === "string" && set.id.length > 0, "图集缺 id");
    assert(!ids.has(set.id), `图集 id 重复：${set.id}`);
    ids.add(set.id);
    assert(Array.isArray(set.origins) && set.origins.length > 0, `图集 ${set.id} 没有 origin`);
    assert(typeof set.dir === "string" && set.dir.length > 0, `图集 ${set.id} 缺目录`);
  }
  assert(typeof payload.default === "string" && ids.has(payload.default),
    `图集默认值非法：${String(payload.default)}`);
  return sets;
}

/** 载入全部运行时数据；`base` 默认相对当前页面（部署到子目录也可用）。 */
export async function loadDataBundle(base = "./data"): Promise<DataBundle> {
  const url = (name: string) => `${base.replace(/\/$/, "")}/${name}`;
  const index = validateIndex(await fetchJson(url("index.json")));
  const [rawCharacters, rawAlbums, rawSources, rawCardSets] = await Promise.all([
    fetchJson(url("characters.json")),
    fetchJson(url("albums.json")),
    fetchJson(url("sources.json")),
    fetchJson(url("cardsets.json")),
  ]);
  const characters = validateCharacters(rawCharacters, index.counts.characters);
  const albums = validateAlbums(rawAlbums);
  const sources = validateSources(rawSources);
  const cardSets = validateCardSets(rawCardSets);

  const characterByKey = new Map(characters.map((c) => [c.key, c]));
  const albumByName = new Map(albums.map((a) => [a.name, a]));
  for (const album of albums) {
    assert(album.kind !== "hifuu" || album.name.length > 0, "秘封专辑缺名字");
  }
  return { index, characters, albums, sources, cardSets, characterByKey, albumByName };
}

/** 某角色的曲目按附加信息分组（预设 UI 与统计用）。 */
export function groupByExtra(character: CharacterRecord): Record<Extra, number> {
  const counts = { 角色曲: 0, 道中曲: 0, 更多道中曲: 0, 秘封曲: 0 } as Record<Extra, number>;
  for (const [, , extra] of character.music) counts[extra] += 1;
  return counts;
}
