/** 音乐模式：原曲（originals）/ 音MAD（otomads）。
 *
 * 口径照改版仓库（v2 工作区）的 `MusicMode`，但**判定方式换成显式的曲包归属**：
 * v2 用"这个曲目键在不在本地表里"来推断，属于启发式；本项目在 `data/packs/*.toml`
 * 里给曲包自带的专辑打 `pack` 标记（见 `tools/src/tmc/packs.py`），所以
 *
 *   曲目的模式 = 它所属专辑的 `pack`；`pack = "originals"` → 原曲，其它 → 该曲包的模式。
 *
 * 行为对齐 v2：
 * - 模式只决定"接下来能选哪些曲目"，**不打断正在播放的这一首**；
 * - 换模式不改动已保存的单曲选择（只在读档时把**明确**属于另一模式的选曲换成第一个可用项）；
 * - 当前模式下没有可用曲目的角色不进轮播。
 */
import type { AlbumRecord, CharacterRecord, MusicEntry, SourceRecord } from "../data/types";

export type MusicMode = "originals" | "otomads";

export const MUSIC_MODES: MusicMode[] = ["originals", "otomads"];
export const DEFAULT_MUSIC_MODE: MusicMode = "originals";
/** 默认曲包（专辑 `pack` 字段缺省时的归属）。 */
export const ORIGINALS_PACK = "originals";

/** 专辑名 → 曲包 id。未注册的专辑按原曲处理（数据缺失时不至于把曲目藏起来）。 */
export function packOfAlbum(albums: readonly AlbumRecord[], album: string): string {
  return albums.find((entry) => entry.name === album)?.pack ?? ORIGINALS_PACK;
}

/** 曲包 id → 音乐模式（`originals` 之外都是 otomads 侧的曲包）。 */
export function modeOfPack(pack: string): MusicMode {
  return pack === ORIGINALS_PACK ? "originals" : "otomads";
}

/** 单个曲目属于哪个模式。 */
export function modeOfEntry(albums: readonly AlbumRecord[], entry: MusicEntry): MusicMode {
  return modeOfPack(packOfAlbum(albums, entry[0]));
}

/** 该曲目在当前模式下是否可用。 */
export function isEntryAllowedInMode(
  albums: readonly AlbumRecord[],
  entry: MusicEntry,
  mode: MusicMode,
): boolean {
  return modeOfEntry(albums, entry) === mode;
}

/** 角色在当前模式下是否有至少一首可用曲目（预设勾选之外的模式过滤）。 */
export function hasTracksInMode(
  albums: readonly AlbumRecord[],
  character: CharacterRecord,
  mode: MusicMode,
): boolean {
  return character.music.some((entry) => isEntryAllowedInMode(albums, entry, mode));
}

/** 按模式过滤曲目；`otomads` 模式只留曲包曲目，`originals` 只留镜像曲目。 */
export function filterByMode(
  albums: readonly AlbumRecord[],
  entries: readonly MusicEntry[],
  mode: MusicMode,
): MusicEntry[] {
  return entries.filter((entry) => isEntryAllowedInMode(albums, entry, mode));
}

/** 某模式下第一个可用曲目（切换模式后修选曲用）。 */
export function firstAllowedInMode(
  albums: readonly AlbumRecord[],
  character: CharacterRecord,
  mode: MusicMode,
): MusicEntry | null {
  return character.music.find((entry) => isEntryAllowedInMode(albums, entry, mode)) ?? null;
}

/**
 * 模式对音源的隐含要求：曲包曲目的地址来自**本地曲库**（`kind === "local"`），
 * 所以 otomads 模式下必须把本地源打开，否则那批曲目解析不出地址。
 *
 * 与 v2 一致：本地专辑源"不参与镜像切换"——这里也不改写用户的开关，只是在
 * 传给加载器时**临时**打开本地源（用户看到的状态仍是自己的设置）。
 */
export function effectiveSourceOverrides(
  sources: readonly SourceRecord[],
  overrides: Record<string, { enabled: boolean; order: number }>,
  mode: MusicMode,
): Record<string, { enabled: boolean; order: number }> {
  if (mode !== "otomads") return overrides;
  const next: Record<string, { enabled: boolean; order: number }> = {};
  for (const [id, value] of Object.entries(overrides)) next[id] = { ...value };
  for (const source of sources) {
    if (source.kind !== "local") continue;
    next[source.id] = { enabled: true, order: next[source.id]?.order ?? source.order };
  }
  return next;
}
