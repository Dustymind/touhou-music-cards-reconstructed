/** 曲目表快照：源（manifest）在**运行时**提供"这个包有哪些曲目"（D145，C 路线）。
 *
 * 为什么要有它：曲目表原来在**构建期**写进 `public/data/otomads/`、随应用部署 ⇒ 加一首曲目要
 * 重跑 `pnpm data:build` → 提交 → 重新部署前端。改成源提供之后：加曲目 / 改裁切 / 换音频 =
 * **只动数据仓库 + 铺源**，主仓库一个字都不用改（连 pin 都不用动）。
 *
 * 三个刻意的边界：
 *
 * 1. **身份不搬进数据仓库**（契约 `docs/otomads-separation-v1.md` §5 S1）：应用启动时本来就把原曲
 *    数据集取全了（121 个角色的 name/order/card/searchNames），所以快照只需要给"角色 → 曲目"；
 *    真要"音MAD 自有身份"（S2）时，快照的角色条目可以**可选**地自带 `name`/`order`/`searchNames`。
 * 2. **形状必须与主仓库构建出来的自带数据逐字同形**（`music` 条目 = `tmc.build._pack_music`）：
 *    两边形状一旦漂移，就表现成"看得见、点不响"。数据仓库那边有同一份测试向量盯着（D145）。
 * 3. **不额外发请求**：快照就在源清单**同一个 payload** 里（和 D139 的 `loudness` 一个套路）。
 *
 * `contentHash` 由**应用**按"生效的数据集"算（`packHash`），不由源声明：这样"有源的一边"与
 * "只有兜底的一边"在同一份数据上算出来自然相同，数据仓库也不必复制主仓库 `tmc.build.content_hash`
 * 的算法。口径（覆盖什么、不覆盖什么）写死在 `packHash` 的注释里，并进契约。
 */
import { EXTRAS, trackId, type AlbumKind, type AlbumRecord, type CharacterRecord, type DataBundle, type DataIndex, type Extra, type ModeDataset, type MusicEntry } from "./types";
import { stableHash } from "../rng";
import { isRecord } from "../persist";

/** 快照里的一个角色：**只给"角色 → 曲目"**（+ 可选卡面覆盖）。 */
export interface PackSnapshotCharacter {
  key: string;
  /** `[专辑, 曲名, extra, 作者?, 多作者?]` —— 与 `CharacterRecord.music` 同一形状（D94/D135） */
  music: MusicEntry[];
  /** 音MAD 侧自己的卡面覆盖（曲包角色文件顶层的 `card = [...]`，D137）；**有才覆盖**共享身份的卡面 */
  card?: string[];
  /** 源给的**每首曲目一张**的封面直链（曲包每条 `[[track]]` 里的 `cover = "https://…"`，D153）：
   *  形状与 `music` **一一对应**（数组是运行时形状，真源里是 per-track）；有它就是"一首一张卡"
   *  （卡池与卡面见 `cardFaces.ts`）。 */
  covers?: string[];
  /** S2 预留：原曲数据集里没有这个角色时，快照可以自带身份（今天数据仓库不发这三个字段） */
  name?: string;
  order?: number;
  searchNames?: string[];
}

/** 源清单里那一段"包数据"（`albums` + `characters`）。 */
export interface PackSnapshot {
  albums: AlbumRecord[];
  characters: PackSnapshotCharacter[];
}

const ALBUM_KINDS: readonly AlbumKind[] = ["game", "fighting", "hifuu", "other"];

/** 非空字符串（去掉首尾空白后仍非空）。 */
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** 非空字符串数组（`card` / `searchNames` 用）。 */
function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const out: string[] = [];
  for (const item of value) {
    const name = text(item);
    if (name === undefined) return undefined;
    out.push(name);
  }
  return out;
}

function parseAlbum(raw: unknown): AlbumRecord | undefined {
  if (!isRecord(raw)) return undefined;
  const key = text(raw.key);
  const name = text(raw.name);
  const pack = text(raw.pack);
  const kind = raw.kind as AlbumKind;
  if (key === undefined || name === undefined || pack === undefined) return undefined;
  if (!ALBUM_KINDS.includes(kind)) return undefined;
  if (typeof raw.order !== "number" || !Number.isFinite(raw.order)) return undefined;
  if (raw.showAlbumName !== undefined && typeof raw.showAlbumName !== "boolean") return undefined;
  const album: AlbumRecord = { key, name, kind, pack, order: raw.order };
  if (typeof raw.showAlbumName === "boolean") album.showAlbumName = raw.showAlbumName;
  if (typeof raw.work === "string") album.work = raw.work;
  return album;
}

/** 一条曲目：与 `load.ts` 的 `validateCharacters` 同一套判据（形状必须与自带数据一致）。 */
function parseMusicEntry(raw: unknown): MusicEntry | undefined {
  if (!Array.isArray(raw) || raw.length < 3 || raw.length > 5) return undefined;
  const album = text(raw[0]);
  const title = text(raw[1]);
  const extra = raw[2];
  if (album === undefined || title === undefined) return undefined;
  if (!(EXTRAS as readonly unknown[]).includes(extra)) return undefined;
  const entry: MusicEntry = [album, title, extra as Extra];
  if (raw.length >= 4) {
    // 第 4 位与第 5 位**同源**（D135）：写了多作者就一定有署名整串，缺一个就是坏形状
    if (typeof raw[3] !== "string") return undefined;
    entry.push(raw[3]);
  }
  if (raw.length === 5) {
    const authors = stringList(raw[4]);
    if (authors === undefined) return undefined;
    entry.push(authors);
  }
  return entry;
}

function parseCharacter(raw: unknown): PackSnapshotCharacter | undefined {
  if (!isRecord(raw)) return undefined;
  const key = text(raw.key);
  if (key === undefined) return undefined;
  if (!Array.isArray(raw.music) || raw.music.length === 0) return undefined;
  const music: MusicEntry[] = [];
  for (const entry of raw.music) {
    const parsed = parseMusicEntry(entry);
    if (parsed === undefined) return undefined;
    music.push(parsed);
  }
  const character: PackSnapshotCharacter = { key, music };
  if (raw.card !== undefined) {
    const card = stringList(raw.card);
    if (card === undefined) return undefined;
    character.card = card;
  }
  if (raw.covers !== undefined) {
    const covers = stringList(raw.covers);
    if (covers === undefined) return undefined;
    character.covers = covers;
  }
  if (raw.name !== undefined) {
    const name = text(raw.name);
    if (name === undefined) return undefined;
    character.name = name;
  }
  if (raw.order !== undefined) {
    if (typeof raw.order !== "number" || !Number.isFinite(raw.order)) return undefined;
    character.order = raw.order;
  }
  if (raw.searchNames !== undefined) {
    const names = stringList(raw.searchNames);
    if (names === undefined) return undefined;
    character.searchNames = names;
  }
  return character;
}

/**
 * 源清单 payload → 曲目表快照；**形状不对一律返回 `undefined`**（调用方走自带那份兜底）。
 *
 * 严格是刻意的：半信半疑地用一份坏数据，表现是"曲目少了几首 / 点不响"这种最难查的故障，
 * 而退回自带那份至少是"今天的行为"（契约 §6：快照缺失 / 校验失败 / 源 error ⇒ 完全走今天那条路）。
 *
 * 两种 `undefined` 要分清：**没有那两个键** = 老清单（正常，走兜底）；**有但形状不对** = 源那边写坏了
 * （同样走兜底，但值得让数据侧知道 —— 两边测试里都盯着形状）。
 */
export function parsePackSnapshot(payload: unknown): PackSnapshot | undefined {
  if (!isRecord(payload)) return undefined;
  const rawAlbums = payload.albums;
  const rawCharacters = payload.characters;
  if (rawAlbums === undefined && rawCharacters === undefined) return undefined;   // 老清单：没有这一段
  if (!Array.isArray(rawAlbums) || rawAlbums.length === 0) return undefined;
  if (!Array.isArray(rawCharacters) || rawCharacters.length === 0) return undefined;

  const albums: AlbumRecord[] = [];
  const albumKeys = new Set<string>();
  for (const raw of rawAlbums) {
    const album = parseAlbum(raw);
    if (album === undefined || albumKeys.has(album.key)) return undefined;
    albumKeys.add(album.key);
    albums.push(album);
  }
  const characters: PackSnapshotCharacter[] = [];
  const characterKeys = new Set<string>();
  for (const raw of rawCharacters) {
    const character = parseCharacter(raw);
    if (character === undefined || characterKeys.has(character.key)) return undefined;
    characterKeys.add(character.key);
    characters.push(character);
  }
  return { albums, characters };
}

/** 快照坏掉时的默认回报方式：可读的一行，别静默（`withPackSnapshot` 的 `onProblem`）。 */
function warn(message: string): void {
  console.warn(`[packSnapshot] ${message}`);
}

/**
 * 自带数据集 + 快照 → **生效的数据集**（返回新的 `DataBundle`，不改入参）。
 *
 * - otomads 的 `characters`：逐个去**原曲数据集**取身份（name/order/card/searchNames），
 *   快照自带 `name`（S2）时用它兜底；**两者都没有 ⇒ 跳过这一条并报一句人话**（不静默丢）。
 *   快照的 `card` **有才覆盖**（D137 的音MAD 侧卡面）。
 * - otomads 的 `albums`：直接用快照那份（曲包自带的专辑）。
 * - `sources`：**沿用自带那份注册表** —— 注册表不归源管（它是主仓库的真源 + 用户存档的键）。
 * - `index`：`schema` / `mode` 沿用，`counts` 与 `contentHash` **按生效的数据重算**。
 *
 * 没有快照时同样返回新 bundle：数据集逐字不变，但 `contentHash` 也是按同一套算法算的
 * （见 `packHash`）—— 这样"有源的一边"与"只有兜底的一边"在同一份数据上必然得到同一个哈希，
 * 两端因此仍能联机（D145 §3 的口径）。
 */
export function withPackSnapshot(
  baked: DataBundle,
  snapshot: PackSnapshot | undefined,
  onProblem: (message: string) => void = warn,
): DataBundle {
  const base = baked.datasets.otomads;
  const originals = baked.datasets.originals;
  // 自定义那份**原样带过去**：它不归曲目表快照管（它的数据来自自己的清单，R2 另有一层重建）
  const custom = baked.datasets.custom;
  const albums = snapshot ? snapshot.albums : base.albums;
  const characters = snapshot
    ? snapshotCharacters(snapshot, originals, base, onProblem)
    : base.characters;
  const index = withContentHash(base.index, albums, characters);
  const otomads: ModeDataset = {
    mode: "otomads",
    index,
    albums,
    characters,
    sources: base.sources,
    characterByKey: new Map(characters.map((character) => [character.key, character])),
    albumByName: new Map(albums.map((album) => [album.name, album])),
  };
  return { shared: baked.shared, datasets: { originals, otomads, custom } };
}

/** 快照的角色条目 → 完整的角色记录（身份来自原曲数据集，缺了才用快照自带的）。
 *
 *  `bakedOtomads` 只在**源封面**（D153）那一处兜底：源清单还没带上 `covers`（老清单、或数据仓库还没铺新归档）
 *  时，自带数据集里构建期烘进去的封面继续生效 —— 否则"清单先到、封面后到"这段时间里，
 *  `hasSourceCovers` 会翻成 false，界面上的"B 站封面"图集整套消失、回落成上游立绘。
 *  身份字段（`name`/`order`/`card`/`searchNames`）**不从** `bakedOtomads` 取：那是 S1 的边界（契约 §5），
 *  它们的兜底仍是原曲数据集那份。
 */
function snapshotCharacters(
  snapshot: PackSnapshot,
  originals: ModeDataset,
  bakedOtomads: ModeDataset,
  onProblem: (message: string) => void,
): CharacterRecord[] {
  const out: CharacterRecord[] = [];
  for (const entry of snapshot.characters) {
    const identity = originals.characterByKey.get(entry.key);
    const name = identity?.name ?? entry.name;
    const card = entry.card ?? identity?.card ?? [];
    if (name === undefined || card.length === 0) {
      const missing = name === undefined ? "name" : "card";
      onProblem(`曲目表快照里的角色 ${entry.key} 在原曲数据集里没有、快照也没自带 ${missing}`
        + " ⇒ 这一条整条跳过（曲目不会出现）");
      continue;
    }
    const covers = entry.covers ?? bakedOtomads.characterByKey.get(entry.key)?.covers;
    out.push({
      key: entry.key,
      name,
      order: identity?.order ?? entry.order ?? 0,
      card,
      // 封面（D153）：源给了就用源的；源没给就沿用自带的（"有才覆盖"，与 card 同口径）
      ...(covers ? { covers } : {}),
      searchNames: identity?.searchNames ?? entry.searchNames ?? [],
      music: entry.music,
    });
  }
  // 与自带数据集同一个排序口径（`tmc.build.build_characters` 按 order 排）；同 order 时按键定序
  out.sort((a, b) => a.order - b.order || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return out;
}

/** 复算 `counts` 与 `contentHash`（`schema` / `mode` 沿用自带的那个）。 */
function withContentHash(
  baked: DataIndex, albums: readonly AlbumRecord[], characters: readonly CharacterRecord[],
): DataIndex {
  const distinct = new Set<string>();
  let entries = 0;
  for (const character of characters) {
    entries += character.music.length;
    for (const entry of character.music) distinct.add(trackId(entry[0], entry[1]));
  }
  return {
    ...baked,
    counts: {
      ...baked.counts,
      characters: characters.length,
      albums: albums.length,
      trackEntries: entries,
      distinctTracks: distinct.size,
    },
    contentHash: packHash(albums, characters),
  };
}

/**
 * 生效数据集的**数据指纹**（联机握手比它，主仓库 D145）—— 覆盖：
 *
 * - **专辑表**：`key/name/kind/pack/order/showAlbumName`（按 key 排序，与数组顺序无关）；
 * - **每个角色的曲目条目**：`key`、`card`（快照的卡面覆盖）、`covers`（源封面，D153）、
 *   `music`（按 key 排序）。
 *
 * `covers` **必须算进来**：它决定"自定义卡面"那套图集下这个角色有几张卡（一首一张），
 * 也是互斥表的**最大口径**（`maxCardCount`，见 `cardFaces.ts`）—— 也就是"桌上可能有哪些牌"的一部分，
 * 两端不一致会出现"一边抽得到、另一边没有"。
 * 它只在**音MAD** 那份里出现，原曲那份恒为 `null` ⇒ 两份的口径仍然一致。
 *
 * **不覆盖**：媒体地址（源可以挂在别的域名上、地址每台机器不同）、**音频版本号**（D144 的
 * `revision` 是"这台机器上那份文件"的 mtime 指纹）、身份字段（`name`/`order`/`searchNames` 属于
 * 主仓库的真源，由原曲那份哈希守）、页面来源。于是"**同一份曲目表 ⇒ 同一个哈希**"——
 * 一人用本机助手、一人用 CDN 也能一起玩（改了曲目表才会在握手期被拒）。
 *
 * 算法**冻结在应用里**：`src/rng` 的 `stableHash` 跑两个不同标签，各 31 位拼成 62 位（16 位十六进制）。
 * **不用 `crypto.subtle`** —— 它在非安全上下文（局域网 http，本项目单端口部署的常见形态）不存在。
 * 改这个函数 = 改握手口径：两端必须一起更新，且要像 D142/D143 那样进"状态签名"的思路里想一遍。
 */
export function packHash(
  albums: readonly AlbumRecord[], characters: readonly CharacterRecord[],
): string {
  return fingerprint("pack", albums, characters, (character) => [
    character.key, character.card, character.covers ?? null, character.music,
  ]);
}

/**
 * 数据指纹的**骨架**：同一套算法 + 一个**冻结的标签**，两个 31 位哈希拼成 62 位（16 位十六进制）。
 *
 * `project` 决定"一个角色里哪些字段算数"—— 两个模式覆盖的东西不同（音MAD 的身份由原曲数据集守，
 * 所以 `packHash` 不算 `name`/`order`；模式 3 的身份**就是**清单给的，所以 `customHash` 要算），
 * 但"排序 → 序列化 → 两个标签各哈希一次"这部分必须逐字相同：它就是握手口径本身。
 *
 * **标签与投影都是冻的**：改任何一个 = 改握手口径，两端必须一起更新（与 D142/D143 的状态签名同理）。
 */
export function fingerprint(
  tag: string, albums: readonly AlbumRecord[], characters: readonly CharacterRecord[],
  project: (character: CharacterRecord) => unknown[],
): string {
  const byKey = (a: { key: string }, b: { key: string }): number =>
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const canonical = JSON.stringify([
    [...albums].sort(byKey).map((album) => [album.key, album.name, album.kind, album.pack, album.order,
      album.showAlbumName !== false]),
    [...characters].sort(byKey).map(project),
  ]);
  return bits(stableHash(`${tag}-a\n${canonical}`)) + bits(stableHash(`${tag}-b\n${canonical}`));
}

/** 31 位 → 8 位十六进制（固定宽度，"拼起来"才是稳定字符串）。 */
export function bits(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}
