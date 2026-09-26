/** 模式 3「自定义」的源清单 → 运行时数据集（契约 `docs/custom-mode-v1.md` C2/C3）。
 *
 * 清单是**使用者自己托管**的一份 JSON（`manifest.json`），一张卡一项：卡名 + 一张卡面 + 一首曲目。
 * 与 `packSnapshot.ts`（D145）同一个套路、同一种严格：**任何一条不满足 ⇒ 整份 `undefined`**，
 * 调用方回到空兜底（界面提示"必须填写自定义源链接"）—— 半信半疑地用一份坏清单，
 * 表现是"卡少了几张 / 看得见点不响"这种最难查的故障，fail-closed 至少是"这个模式空着"。
 *
 * 与音MAD 那份（`packSnapshot`）的三点不同：
 *
 * 1. **卡名、顺序、卡面都来自清单**（音MAD 那份的身份来自原曲数据集，S1）⇒ 指纹要把它们算进去；
 * 2. **音频地址写在同一张卡上**（F1 的 `audio`）：不查 `tracks` 媒体表 ⇒ 允许同名曲目、
 *    也允许两张卡共用一首（后者会被 `songConflicts` 判为互斥，一局里只允许一张在场，**这是有意的**）；
 * 3. **严格 1:1**：`card` 与 `covers` 都写这一张卡面 ⇒ 那个模式下卡数恒为 1，
 *    图集菜单里"一首一张"的多重卡牌天然退化成 1，不需要任何模式专用补丁。
 */
import { isRecord } from "../persist";
import { stableHash } from "../rng";
import { sourceRelativeUrl, versionedUrl } from "../music/manifestUrl";
import type { AlbumRecord, CharacterRecord, DataBundle, DataIndex, Extra, ModeDataset, MusicEntry } from "./types";
import { bits, fingerprint } from "./packSnapshot";

/** 模式 3 的专辑统一挂在这个 `pack` 上（`kind` 一律 `other`：这个模式的界面不出现类别开关） */
const CUSTOM_PACK = "custom";
/** 卡片条目的**附加信息**：同上，界面不出现类别开关，这里只要一个合法值 */
const CUSTOM_EXTRA: Extra = "角色曲";
/** 清单没写 `id` 时派生 key 的前缀（内容哈希 ⇒ 跨端同值、与数组顺序无关） */
const DERIVED_KEY_PREFIX = "custom-";

/** 清单解析之后的运行时形状：与 `PackSnapshot` 同形，好让 `withCustomManifest` 与 D145 那条路对齐。 */
export interface CustomManifest {
  albums: AlbumRecord[];
  characters: CharacterRecord[];
}

/** 非空字符串（去掉首尾空白后仍非空）。 */
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** 可选字段：没写 = `undefined`；写了但空 / 不是字符串 = **整份不合法**（返回 `null` 作信号）。 */
function optionalText(raw: Record<string, unknown>, key: string): string | undefined | null {
  if (raw[key] === undefined) return undefined;
  return text(raw[key]) ?? null;
}

/** 清单里的一张卡（字段都校验过了）。 */
interface ParsedCard {
  id?: string; name: string; face: string; audio: string; revision?: string;
  album: string; author?: string; title: string; source?: string;
}

const OPTIONAL_CARD_KEYS = ["id", "revision", "author", "source"] as const;

function parseCard(raw: unknown): ParsedCard | undefined {
  if (!isRecord(raw)) return undefined;
  const name = text(raw.name);
  const face = text(raw.face);
  const audio = text(raw.audio);
  const album = text(raw.album);
  const title = text(raw.title);
  // 五项必填（Q7：专辑必填；F1/F2：卡面与音频必填 —— 缺音频就是整份不合法）
  if (name === undefined || face === undefined || audio === undefined
    || album === undefined || title === undefined) return undefined;
  const card: ParsedCard = { name, face, audio, album, title };
  for (const key of OPTIONAL_CARD_KEYS) {
    const value = optionalText(raw, key);
    if (value === null) return undefined;
    if (value !== undefined) card[key] = value;
  }
  return card;
}

/** 派生 key：`(卡名|专辑|曲名|卡面)` 的稳定哈希 —— 与数组顺序无关，所以两端必然同值。 */
function derivedKey(card: ParsedCard): string {
  return DERIVED_KEY_PREFIX + bits(stableHash(`custom\n${[card.name, card.album, card.title, card.face].join("\u0001")}`));
}

/**
 * 清单 payload → 数据集；**形状不对一律返回 `undefined`**（调用方走空兜底）。
 *
 * `manifestUrl` 是清单**自己的地址**：卡面与音频写相对路径时按它那一层解析成绝对地址
 * （`sourceRelativeUrl`，D141 的口径）；写绝对 URL 时原样用。逐卡 `revision` 拼 `?v=`（D144），
 * 没写就用顶层的 `revision` 兜底。
 */
export function parseCustomManifest(payload: unknown, manifestUrl: string): CustomManifest | undefined {
  if (!isRecord(payload)) return undefined;
  if (payload.schema !== 1 || payload.mode !== "custom") return undefined;
  if (!Array.isArray(payload.cards) || payload.cards.length === 0) return undefined;
  if (payload.revision !== undefined && text(payload.revision) === undefined) return undefined;
  const fallbackRevision = text(payload.revision) ?? "";

  const albums: AlbumRecord[] = [];
  const albumByName = new Map<string, AlbumRecord>();
  const characters: CharacterRecord[] = [];
  const keys = new Set<string>();

  for (const raw of payload.cards) {
    const card = parseCard(raw);
    if (card === undefined) return undefined;
    const key = card.id ?? derivedKey(card);
    // `id` 写了就得唯一；派生 key 撞了（同一张卡写了两遍）同样整份拒掉
    if (keys.has(key)) return undefined;
    keys.add(key);

    // 专辑按**首次出现顺序**建：这个模式的专辑就是清单里的名字，没有单独的注册表
    let album = albumByName.get(card.album);
    if (album === undefined) {
      album = {
        key: card.album, name: card.album, kind: "other", pack: CUSTOM_PACK,
        order: albums.length + 1,
      };
      albumByName.set(card.album, album);
      albums.push(album);
    }
    const entry: MusicEntry = [album.name, card.title, CUSTOM_EXTRA];
    if (card.author !== undefined) entry.push(card.author);   // 空作者不入列表（Q7），非空才写第 4 位

    // 卡面与音频都在**校验阶段**解析成绝对地址：相对 ⇒ 按清单目录拼，绝对 ⇒ 原样（C3）
    const face = sourceRelativeUrl(manifestUrl, card.face);
    characters.push({
      key,
      name: card.name,
      order: characters.length,
      card: [face],
      covers: [face],
      searchNames: [card.name],
      music: [entry],
      audio: [versionedUrl(sourceRelativeUrl(manifestUrl, card.audio), card.revision ?? fallbackRevision)],
    });
  }
  return { albums, characters };
}

/**
 * 空兜底数据集 + 清单 → **生效的数据集**（返回新的 `DataBundle`，不改入参）。
 *
 * - 没有清单（没填源 / 源挂了 / 形状不对）⇒ 数据集逐字等于空兜底，`contentHash` 仍按同一套算法算
 *   （见 `customHash`）—— 于是"两端都没配源"必然同哈希，联机不会因为空而对不上；
 * - `sources` **沿用自带那份注册表**：源不归清单管（它是主仓库的真源 + 用户存档的键），
 *   运行时覆盖（设置页那一行 / `?customsource=` / 主机下发）已经在 `loadSourceTables` 之前生效了。
 */
export function withCustomManifest(baked: DataBundle, manifest: CustomManifest | undefined): DataBundle {
  const base = baked.datasets.custom;
  const albums = manifest ? manifest.albums : base.albums;
  const characters = manifest ? manifest.characters : base.characters;
  const custom: ModeDataset = {
    mode: "custom",
    index: withContentHash(base.index, albums, characters),
    albums,
    characters,
    sources: base.sources,
    characterByKey: new Map(characters.map((character) => [character.key, character])),
    albumByName: new Map(albums.map((album) => [album.name, album])),
  };
  return {
    shared: baked.shared,
    datasets: { originals: baked.datasets.originals, otomads: baked.datasets.otomads, custom },
  };
}

/** 复算 `counts` 与 `contentHash`（`schema` / `mode` 沿用兜底那个）。 */
function withContentHash(
  baked: DataIndex, albums: readonly AlbumRecord[], characters: readonly CharacterRecord[],
): DataIndex {
  const distinct = new Set<string>();
  let entries = 0;
  for (const character of characters) {
    entries += character.music.length;
    for (const entry of character.music) distinct.add(`${entry[0]}\u0001${entry[1]}`);
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
    contentHash: customHash(albums, characters),
  };
}

/**
 * 模式 3 生效数据集的**数据指纹**（联机握手比它；契约 C6）—— 覆盖：
 *
 * - **专辑表**：`key/name/kind/pack/order`（与 `packHash` 同一套投影）；
 * - **每张卡**：`key`、**卡名**、**顺序**、`card` / `covers`（= 解析后的卡面绝对地址）、
 *   `music`（专辑 / 曲名 / 作者）。
 *
 * 卡名与顺序**必须算进来**：这个模式的身份不像音MAD 那样由原曲数据集守（S1），
 * 它**就是**清单给的 —— 两端卡名/顺序不同，桌上的牌就不同。
 *
 * **不覆盖**：**音频地址与版本号**（换 CDN / 换宿主不该把两端拆开，与 D145 同口径）、
 * 清单来源 URL、页面来源。于是"同一份卡表 ⇒ 同一个哈希"，一人挂本机、一人挂 CDN 也能一起玩。
 *
 * 算法与标签（`custom`）**冻结在应用里**：改它 = 改握手口径，两端必须一起更新。
 */
export function customHash(
  albums: readonly AlbumRecord[], characters: readonly CharacterRecord[],
): string {
  return fingerprint("custom", albums, characters, (character) => [
    character.key, character.name, character.order, character.card, character.covers ?? null,
    character.music,
  ]);
}
