/** 选曲解析：由「专辑勾选 + 秘封碟勾选 + 三个三态开关」推导出每个角色可用的曲目。
 *
 * 规则见 `docs/rules-classification-v1.md` 与方案 §6.1（优先级：单曲模式手选 > 三态显式 > 专辑/秘封碟勾选）。
 * 这里是纯函数：M6 的配置页只负责把界面状态喂进来。
 */
import type { AlbumRecord, CharacterRecord, Extra, MusicEntry } from "../data/types";

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

/** 某角色在当前预设下可用的曲目；`pinned` 传入单曲模式的选择。 */
export function allowedTracks(
  preset: PresetState,
  character: CharacterRecord,
  pinned?: MusicEntry | null,
): AllowedTracks {
  if (pinned) return { entries: [pinned], pinned };
  const entries = character.music.filter(([album, , extra]) => isTrackEnabled(preset, album, extra));
  return { entries, pinned: null };
}

/** 统计：全库可用曲目数（配置页显示预设效果）。 */
export function countEnabled(
  preset: PresetState,
  characters: readonly CharacterRecord[],
): { enabled: number; total: number } {
  let enabled = 0;
  let total = 0;
  for (const character of characters) {
    for (const [album, , extra] of character.music) {
      total += 1;
      if (isTrackEnabled(preset, album, extra)) enabled += 1;
    }
  }
  return { enabled, total };
}
