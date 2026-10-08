/** 载入并校验 `data/public/data/*.json`。
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
  type ModeDataset,
  type SourceRecord,
  type TrackRecord,
} from "./types";
import { MUSIC_MODES, type MusicMode } from "../music/mode";
import { isCardRatio } from "../theme/cardRatio";

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

export function validateIndex(raw: unknown, expected: MusicMode): DataIndex {
  assert(raw && typeof raw === "object", `${expected}/index.json 结构不对`);
  const index = raw as DataIndex;
  assert(index.schema === 2, `数据 schema 版本不支持：${String(index.schema)}（S4 起 = 2）`);
  assert(index.mode === expected, `index.json 的 mode 不对：${String(index.mode)} ≠ ${expected}`);
  assert(typeof index.contentHash === "string" && index.contentHash.length > 8, "index.json 缺 contentHash");
  assert(index.counts && typeof index.counts.characters === "number", "index.json 缺 counts");
  return index;
}

/** 生成物里的角色记录：`music` 是曲id 字符串数组（物化见 loadDataset）。 */
type RawCharacter = Omit<CharacterRecord, "music"> & { music: string[] };

export function validateCharacters(raw: unknown, expected: number): RawCharacter[] {
  const list = (raw as { characters?: unknown } | null)?.characters;
  assert(Array.isArray(list), "characters.json 缺少 characters 数组");
  assert(list.length === expected,
    `characters.json 记录数与 index 不符（${list.length} vs ${expected}）`);
  const characters = list as RawCharacter[];
  const keys = new Set<string>();
  for (const character of characters) {
    assert(typeof character.key === "string" && character.key.length > 0, "角色缺 key");
    assert(!keys.has(character.key), `角色 key 重复：${character.key}`);
    keys.add(character.key);
    assert(Array.isArray(character.card) && character.card.length > 0, `${character.key} 缺卡面`);
    assert(Array.isArray(character.music) && character.music.length > 0, `${character.key} 缺曲目`);
    // 源给的封面（音MAD 才有，D153）：要写就得是非空字符串数组。**不要求长度等于曲目数** ——
    // 客户端按 `covers.length` 决定卡数、缺失的位置各有回落（cardFaces.ts），源只写了一半也能用。
    assert(character.covers === undefined
      || (Array.isArray(character.covers) && character.covers.length > 0
          && character.covers.every((url) => typeof url === "string" && url.trim() !== "")),
      `${character.key} 的 covers 必须是非空字符串数组`);
    // 每张卡**自己的**音频地址（模式 3 才有，F1）：与 `covers` 同一套形状断言。
    // 分工要说清：模式 3 真正的守门人是 `customManifest.ts` 的严格校验（这份"构建期生成物"
    // 在模式 3 恒为空），这里这条只是**形状对称** + 万一将来把清单烘进生成物时的兜底。
    assert(character.audio === undefined
      || (Array.isArray(character.audio) && character.audio.length > 0
          && character.audio.every((url) => typeof url === "string" && url.trim() !== "")),
      `${character.key} 的 audio 必须是非空字符串数组`);
    for (const entry of character.music) {
      // S2 起生成物里是**曲id 字符串**（曲目信息在 tracks.json），load 时按 TrackIndex 物化
      assert(typeof entry === "string" && entry.length > 0,
        `${character.key} 的曲目条目不是曲id`);
    }
  }
  return characters;
}

export function validateTracks(raw: unknown): Record<string, TrackRecord> {
  const payload = raw as { tracks?: unknown } | null;
  assert(payload && typeof payload.tracks === "object" && payload.tracks !== null,
    "tracks.json 缺少 tracks 对象");
  const tracks = payload.tracks as Record<string, TrackRecord>;
  for (const [id, track] of Object.entries(tracks)) {
    assert(typeof track === "object" && track !== null, `曲id ${id} 的条目不是对象`);
    assert(typeof track.album === "string" && typeof track.title === "string",
      `曲id ${id} 缺专辑/曲名`);
    assert((EXTRAS as readonly string[]).includes(track.extra),
      `曲id ${id} 的附加信息非法：${String(track.extra)}`);
    assert(track.author === undefined || typeof track.author === "string",
      `曲id ${id} 的作者字段必须是字符串`);
    assert(track.authors === undefined
      || (Array.isArray(track.authors) && track.authors.length > 0
          && track.authors.every((name) => typeof name === "string" && name.trim() !== "")),
      `曲id ${id} 的多作者字段必须是非空字符串数组`);
  }
  return tracks;
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
    // 本地图集（localOnly）没有远程 origin：素材由用户放进 public/<dir>/，只用 localPrefix
    assert(Array.isArray(set.origins), `图集 ${set.id} 的 origins 不是数组`);
    assert(set.localOnly || set.sourceOnly ? true : set.origins.length > 0,
      `图集 ${set.id} 没有 origin（本地图集请标 localOnly）`);
    // 源封面图集（sourceOnly，D153）：素材是源给的绝对 URL ⇒ 既不要目录也不要 origin
    if (set.sourceOnly) {
      assert(set.origins.length === 0, `图集 ${set.id} 标了 sourceOnly 却又写了 origins`);
      assert(set.dir === undefined || typeof set.dir === "string",
        `图集 ${set.id} 的 dir 必须是字符串`);
    } else {
      assert(typeof set.dir === "string" && set.dir.length > 0, `图集 ${set.id} 缺目录`);
    }
    assert(set.mode === undefined || MUSIC_MODES.includes(set.mode),
      `图集 ${set.id} 的 mode 非法：${String(set.mode)}`);
    // 这套图集能换哪几档（D165）：**可以不写**（缺省时按 localOnly/sourceOnly 判，内置六套 = 不能换）；
    // 写了就得是非空的、全是认得的档、且不重复 —— 认不得的档会让卡面高度无从算起。
    if (set.ratios !== undefined) {
      assert(Array.isArray(set.ratios) && set.ratios.length > 0,
        `图集 ${set.id} 的 ratios 必须是非空数组`);
      for (const ratio of set.ratios) {
        assert(isCardRatio(ratio), `图集 ${set.id} 的 ratios 有认不得的档位：${String(ratio)}`);
      }
      assert(new Set(set.ratios).size === set.ratios.length,
        `图集 ${set.id} 的 ratios 有重复项`);
    }
  }
  assert(typeof payload.default === "string" && ids.has(payload.default),
    `图集默认值非法：${String(payload.default)}`);
  return sets;
}

/** 载入**某个模式**的数据集（`base` 是该数据集所在目录：原曲 `./data`，音MAD `./data/otomads`）。 */
async function loadDataset(base: string, expected: MusicMode): Promise<ModeDataset> {
  const url = (name: string) => `${base.replace(/\/$/, "")}/${name}`;
  const index = validateIndex(await fetchJson(url("index.json")), expected);
  const [rawCharacters, rawAlbums, rawSources, rawTracks] = await Promise.all([
    fetchJson(url("characters.json")),
    fetchJson(url("albums.json")),
    fetchJson(url("sources.json")),
    fetchJson(url("tracks.json")),
  ]);
  const tracks = validateTracks(rawTracks);
  const characters = validateCharacters(rawCharacters, index.counts.characters)
    .map((character) => ({
      ...character,
      // 曲id[] → MusicEntry[]（物化：TrackIndex 里没有的曲id 当场报错，绝不半信半疑地用）
      music: character.music.map((id) => {
        const track = tracks[id];
        assert(track !== undefined, `${character.key} 的曲id 不在 TrackIndex 里：${id}`);
        return { id, ...track };
      }),
    }));
  const albums = validateAlbums(rawAlbums);
  // 每个源自己的响度表：注册表里的 `loudnessUrl` 相对**数据集目录**解析（契约 D130）
  const sources = validateSources(rawSources).map((source) => ({
    ...source,
    loudnessUrl: source.loudnessUrl ? url(source.loudnessUrl) : undefined,
  }));
  const characterByKey = new Map(characters.map((character) => [character.key, character]));
  const albumByName = new Map(albums.map((album) => [album.name, album]));
  for (const album of albums) {
    assert(album.kind !== "hifuu" || album.name.length > 0, "秘封专辑缺名字");
  }
  return { mode: expected, index, characters, albums, sources, tracks, characterByKey, albumByName };
}

/** 载入全部运行时数据：**三个模式的数据集一起取**（契约 §4 策略 A：没有"切模式取数据失败"这条路）。
 *
 * `base` 默认相对当前页面（部署到子目录也可用）；音MAD 在 `<base>/otomads/`，自定义在 `<base>/custom/`
 * （那份**恒为空**：数据要等使用者填了源链接、由 `customManifest.ts` 在运行时重建）。
 */
export async function loadDataBundle(base = "./data"): Promise<DataBundle> {
  const url = (name: string) => `${base.replace(/\/$/, "")}/${name}`;
  // 每个模式都要有：各份都由 `loadDataset` 自己取 `index.json`，缺一份就在那里抛
  // `DataLoadError`（`xxx/index.json → HTTP 404`）—— 所以这里不必再补一遍"存在性"断言
  const [originals, otomads, custom, rawCardSets] = await Promise.all([
    loadDataset(url(""), "originals"),
    loadDataset(url("otomads"), "otomads"),
    loadDataset(url("custom"), "custom"),
    fetchJson(url("cardsets.json")),
  ]);
  const cardSets = validateCardSets(rawCardSets);
  return { shared: { cardSets }, datasets: { originals, otomads, custom } };
}

