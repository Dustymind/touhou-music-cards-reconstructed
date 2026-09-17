/** 选曲解析：由「专辑勾选 + 秘封碟勾选 + 三个三态开关」推导出每个角色可用的曲目。
 *
 * 规则见 `docs/rules-classification-v1.md` 与方案 §6.1（优先级：单曲模式手选 > 三态显式 > 专辑/秘封碟勾选）。
 * 这里是纯函数：M6 的配置页只负责把界面状态喂进来。
 */
import type { AlbumRecord, CharacterRecord, Extra, MusicEntry } from "../data/types";
import { filterByMode, isEntryAllowedInMode, type MusicMode } from "./mode";

export type Tri = "unset" | "on" | "off";

/** 三个三态开关只管非秘封的三类；秘封曲由秘封碟勾选决定。 */
export type CategorySwitch = Exclude<Extra, "秘封曲">;

export interface PresetState {
  /** 专辑名 → 是否勾选（非秘封专辑） */
  albums: Record<string, boolean>;
  /** 秘封碟名 → 是否勾选 */
  hifuu: Record<string, boolean>;
  category: Record<CategorySwitch, Tri>;
}

export const CATEGORY_KEYS: CategorySwitch[] = ["角色曲", "道中曲", "更多道中曲"];

/** 默认预设：所有专辑/秘封碟都勾选，三个开关都是「不配置」。 */
export function defaultPreset(albums: readonly AlbumRecord[]): PresetState {
  const state: PresetState = { albums: {}, hifuu: {}, category: { 角色曲: "unset", 道中曲: "unset", 更多道中曲: "unset" } };
  for (const album of albums) {
    if (album.kind === "hifuu") state.hifuu[album.name] = true;
    else state.albums[album.name] = true;
  }
  return state;
}

/** 把持久化状态与"新专辑默认勾选"合并：持久化里显式写过的值优先。 */
export function mergeWithDefaults(
  persisted: Partial<PresetState> | null | undefined,
  albums: readonly AlbumRecord[],
): PresetState {
  const base = defaultPreset(albums);
  return {
    albums: { ...base.albums, ...(persisted?.albums ?? {}) },
    hifuu: { ...base.hifuu, ...(persisted?.hifuu ?? {}) },
    category: { ...base.category, ...(persisted?.category ?? {}) },
  };
}

/** 单个曲目是否被选中（不含单曲模式的手选，那一步在 `allowedTracks` 里优先处理）。 */
export function isTrackEnabled(preset: PresetState, album: string, extra: Extra): boolean {
  if (extra === "秘封曲") {
    // 秘封曲只受 12 个碟的勾选控制；父复选框是批量控制，不存自身状态
    return preset.hifuu[album] ?? false;
  }
  const sw = preset.category[extra as CategorySwitch];
  if (sw === "on") return true;   // 显式启用：压过专辑勾选
  if (sw === "off") return false; // 显式禁用：一票否决
  return preset.albums[album] ?? false;
}

export interface AllowedTracks {
  entries: MusicEntry[];
  /** 被单曲模式固定下来的那首（若有） */
  pinned: MusicEntry | null;
}

/** 某角色在当前预设下可用的曲目；`pinned` 传入单曲模式的选择。
 *
 * `albums` + `mode` 用于**音乐模式**过滤（原曲 / 音MAD）：模式只决定"接下来能选哪些"，
 * 不打断正在播放的曲目（所以过滤只发生在这里、不反向改写状态）。 */
export function allowedTracks(
  preset: PresetState,
  character: CharacterRecord,
  pinned?: MusicEntry | null,
  albums?: readonly AlbumRecord[],
  mode?: MusicMode,
): AllowedTracks {
  if (pinned) {
    // 手选的那首若不属于当前模式，仍然按"当前模式不可用"处理（与 v2 的读数一致：
    // 归一化只在读档时做，播放中的这一首不打断）
    return { entries: [pinned], pinned };
  }
  const entries = character.music.filter(([album, , extra]) => isTrackEnabled(preset, album, extra));
  const filtered = albums && mode ? filterByMode(albums, entries, mode) : entries;
  return { entries: filtered, pinned: null };
}

/** 该曲目在当前预设 + 当前模式下是否可用（游戏内选曲、播放都用它）。 */
export function isTrackUsable(
  preset: PresetState,
  albums: readonly AlbumRecord[],
  entry: MusicEntry,
  mode: MusicMode,
): boolean {
  const [, , extra] = entry;
  return isTrackEnabled(preset, entry[0], extra) && isEntryAllowedInMode(albums, entry, mode);
}

/** 统计：全库可用曲目数（配置页显示预设效果）。 */
export function countEnabled(
  preset: PresetState,
  characters: readonly CharacterRecord[],
  albums?: readonly AlbumRecord[],
  mode?: MusicMode,
): { enabled: number; total: number } {
  let enabled = 0;
  let total = 0;
  for (const character of characters) {
    for (const [album, , extra] of character.music) {
      // 统计只数当前模式下的曲目：切到音MAD 时"全库可用"的分母也跟着变
      if (albums && mode && !isEntryAllowedInMode(albums, [album, "", extra], mode)) continue;
      total += 1;
      if (isTrackEnabled(preset, album, extra)) enabled += 1;
    }
  }
  return { enabled, total };
}
