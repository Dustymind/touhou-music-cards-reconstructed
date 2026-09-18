/** 运行时数据形状（对应 `tools` 生成的 `public/data/*.json`）。 */

export const EXTRAS = ["角色曲", "道中曲", "更多道中曲", "秘封曲"] as const;
export type Extra = (typeof EXTRAS)[number];

/** `[专辑, 曲目, 附加信息]`——`曲目` 保留 `NN. ` 序号（见 docs/DECISIONS.md D6）。 */
/** `[专辑, 曲名, extra]`；第 4 位是**可选**的作者（音MAD 这类有作者信息的曲目才有）。 */
export type MusicEntry = [album: string, title: string, extra: Extra, author?: string];

export interface CharacterRecord {
  key: string;
  name: string;
  order: number;
  card: string[];
  searchNames: string[];
  music: MusicEntry[];
}

type AlbumKind = "game" | "fighting" | "hifuu" | "other";

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
}

export interface CardSetRecord {
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
  contentHash: string;
  counts: {
    characters: number; albums: number; trackEntries: number; distinctTracks: number;
    sources?: number; cardSets?: number;
  };
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
  index: DataIndex;
  characters: CharacterRecord[];
  albums: AlbumRecord[];
  sources: SourceRecord[];
  cardSets: CardSetRecord[];
  characterByKey: Map<string, CharacterRecord>;
  albumByName: Map<string, AlbumRecord>;
}
