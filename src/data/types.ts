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
  kind: "remote" | "local";
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
export interface SharedData {
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

/** 界面显示用的曲名：去掉 `NN. ` 序号（存档里保留原文）。 */
export function displayTitle(title: string): string {
  return title.replace(/^\s*\d+\.\s*/, "");
}

export interface DataBundle {
  shared: SharedData;
  /** 按模式索引的数据集：`originals` 与 `otomads` 各一份（启动时都取，契约 §4 策略 A） */
  datasets: Record<MusicMode, ModeDataset>;
}
