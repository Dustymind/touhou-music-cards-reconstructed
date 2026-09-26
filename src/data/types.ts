/** 运行时数据形状（对应 `tools` 生成的 `public/data/*.json`）。 */
import type { MusicMode } from "../music/mode";

export const EXTRAS = ["角色曲", "道中曲", "更多道中曲", "秘封曲"] as const;
export type Extra = (typeof EXTRAS)[number];

/** `[专辑, 曲目, 附加信息]`——`曲目` 保留 `NN. ` 序号（见 docs/DECISIONS.md D6）。 */
/** `[专辑, 曲名, extra]`；第 4 位是**可选**的作者（音MAD 这类有作者信息的曲目才有）。
 *
 * 第 5 位是**可选的多作者数组**（D135）：只有曲包写了 `authors = [...]` 时才有。
 * 它与第 4 位**同源** —— 第 4 位是 `" & ".join(authors)`，也就是磁盘上那个
 * `作者 - 曲名.mp3` 的 stem 写法（响度表与单曲存档都按它取，**不能排序、不能改连接符**）；
 * 第 5 位才是"给显示排序用"的数组。 */
export type MusicEntry = [
  album: string, title: string, extra: Extra, author?: string, authors?: string[],
];

export interface CharacterRecord {
  key: string;
  name: string;
  order: number;
  card: string[];
  /** 源给的**每首曲目一张**的封面直链（音MAD 侧才有；绝对 https URL，见 D153）。
   *
   *  它决定**自定义卡面**那套图集（`sourceOnly`）下这个角色有几张卡（`covers.length`，一首一张）；
   *  别的图集回到 `card.length` 张。两者的算法收在 `src/data/cardFaces.ts`：
   *  `cardCount`（卡池）/ `cardFace`（取图）/ `maxCardCount`（互斥表用的最大口径）。
   *  身份字段跨模式一致（契约 §5 S1），这个字段是**卡面那一类**的例外。 */
  covers?: string[];
  /** 每张卡**自己的**音频地址（模式 3 才有，F1）：与 `music` **一一对应**（`audio[i]` ↔ `music[i]`），
   *  与 `covers` 同一套设计。**校验阶段就解析成绝对 URL**（含 D144 的 `?v=`），播放时直接用，
   *  不再走 `(专辑, 曲名)` 查表 ⇒ 这个模式允许同名曲目、也允许两张卡共用一首。
   *  原曲 / 音MAD 两份数据**不带这个字段** ⇒ 两边口径与哈希都不变。 */
  audio?: string[];
  searchNames: string[];
  music: MusicEntry[];
}

/** 专辑种类：`game` 游戏正作 / `fighting` 格斗作 / `hifuu` 秘封 / `other` 其它（曲包自带的多半是 other）。 */
export type AlbumKind = "game" | "fighting" | "hifuu" | "other";

export interface AlbumRecord {
  key: string;
  name: string;
  kind: AlbumKind;
  pack: string;
  order: number;
  work?: string;
  /** 专辑名要不要显示（缺省 true）。false 且曲目没作者时，播放页那一行整行不显示 */
  showAlbumName?: boolean;
}

export interface SourceRecord {
  id: string;
  label: { en: string; zh: string };
  tableUrl: string;
  /** `remote` 远程镜像 / `local` 可被「本地曲库地址」覆盖的源 / `custom` 使用者自己填的源（模式 3） */
  kind: "remote" | "local" | "custom";
  order: number;
  enabled: boolean;
  proxyable: boolean;
  description: { en: string; zh: string };
  /** 该源自己的响度表（相对数据集目录解析）。源没声明就没有表 ⇒ 系数按 1（契约 D130） */
  loudnessUrl?: string;
}

export interface CardSetRecord {
  /** 本地图集：素材由用户自己放进 `public/<dir>/`，**没有远程 origin**（origins 为空） */
  localOnly?: boolean;
  /** 素材由**源**提供（manifest 快照里的 `covers`，绝对 URL）⇒ 没有目录、没有 origin。
   *  **源没给就不该出现在界面上**（`cardFaces.ts` 的 `availableCardSets` 守这条）。 */
  sourceOnly?: boolean;
  /** 只在某个音乐模式可选（缺省 = 两个模式都能选）。音MAD 封面图集 = `"otomads"`。 */
  mode?: MusicMode;
  id: string;
  dir: string;
  label: { en: string; zh: string };
  /** 用户自己放了图集时优先用（默认 "./"） */
  localPrefix: string;
  /** 远程 origin，按顺序兜底 */
  origins: string[];
}

export interface DataIndex {
  schema: number;
  /** 这份数据集属于哪个音乐模式（C：一个模式一份，见 docs/otomads-separation-v1.md） */
  mode: MusicMode;
  contentHash: string;
  counts: {
    characters: number; albums: number; trackEntries: number; distinctTracks: number;
    sources?: number; cardSets?: number;
  };
}

/** 某个音乐模式的**完整数据集**：只含本模式的曲目与专辑，自己的 counts 与哈希。 */
export interface ModeDataset {
  mode: MusicMode;
  index: DataIndex;
  characters: CharacterRecord[];
  albums: AlbumRecord[];
  /** 本模式的音源注册表（原曲 = 三个远程镜像；音MAD = 本地曲库助手） */
  sources: SourceRecord[];
  characterByKey: Map<string, CharacterRecord>;
  albumByName: Map<string, AlbumRecord>;
}

/** 与模式无关的资源：卡面图集是全站共享的（素材只有一套）。 */
interface SharedData {
  cardSets: CardSetRecord[];
}

/** 内部曲目身份：`专辑\u0001曲目`（同步、持久化、查表都用它）。 */
export function trackId(album: string, title: string): string {
  return `${album}\u0001${title}`;
}

export function splitTrackId(id: string): [string, string] {
  const at = id.indexOf("\u0001");
  return [id.slice(0, at), id.slice(at + 1)];
}

/** 这条曲目在这个角色的 `music` 里的下标（找不到 = `-1`）。
 *
 *  `covers[i]`（源封面，D153）与 `audio[i]`（模式 3 的逐卡音频，F1）都按这个下标与 `music[i]` 对齐 ——
 *  三处（播放页取卡面、播放层取音频、以后可能还有别的）必须是**同一个算法**，所以收在这里。 */
export function entryIndexOf(
  character: CharacterRecord | null | undefined, entry: MusicEntry | null | undefined,
): number {
  if (!character || !entry) return -1;
  return character.music.findIndex((item) => item[0] === entry[0] && item[1] === entry[1]);
}

/** 界面显示用的曲名：去掉 `NN. ` 序号（存档里保留原文）。 */
export function displayTitle(title: string): string {
  return title.replace(/^\s*\d+\.\s*/, "");
}

export interface DataBundle {
  shared: SharedData;
  /** 按模式索引的数据集：**三个模式各一份**（启动时都取，契约 §4 策略 A）。
   *  `custom` 那份恒为空兜底，运行时由源清单整体重建（`customManifest.ts`）。 */
  datasets: Record<MusicMode, ModeDataset>;
}
