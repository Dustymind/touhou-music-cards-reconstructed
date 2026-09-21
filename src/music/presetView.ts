/** 预设界面用的派生逻辑（分组、统计、单曲模式行）—— 纯函数，便于测试与复用。 */
import type { AlbumRecord, CharacterRecord, Extra, MusicEntry } from "../data/types";
import { allowedTracks, isTrackEnabled, type PresetState } from "./selection";

interface AlbumGroups {
  /** 秘封曲组（12 张秘封倶楽部 CD） */
  hifuu: AlbumRecord[];
  /** CD 组：格斗作 / arrange 碟 + 其它官方 CD（先 CD） */
  cd: AlbumRecord[];
  /** 官作 OST（后官作） */
  game: AlbumRecord[];
}

const byOrder = (a: AlbumRecord, b: AlbumRecord): number => a.order - b.order;

/** 界面顺序：秘封曲组 → （三个三态开关）→ CD → 官作。 */
export function groupAlbums(albums: readonly AlbumRecord[]): AlbumGroups {
  return {
    hifuu: albums.filter((album) => album.kind === "hifuu").slice().sort(byOrder),
    cd: albums.filter((album) => album.kind === "fighting" || album.kind === "other").slice().sort(byOrder),
    game: albums.filter((album) => album.kind === "game").slice().sort(byOrder),
  };
}

interface PresetStats {
  enabledTracks: number;
  totalTracks: number;
  charactersWithTracks: number;
  totalCharacters: number;
  /** 按附加信息统计的可用/总数 */
  byExtra: Record<Extra, { enabled: number; total: number }>;
}

export function presetStats(
  preset: PresetState,
  characters: readonly CharacterRecord[],
): PresetStats {
  const byExtra: PresetStats["byExtra"] = {
    角色曲: { enabled: 0, total: 0 },
    道中曲: { enabled: 0, total: 0 },
    更多道中曲: { enabled: 0, total: 0 },
    秘封曲: { enabled: 0, total: 0 },
  };
  let enabledTracks = 0;
  let totalTracks = 0;
  let charactersWithTracks = 0;
  for (const character of characters) {
    let usable = 0;
    for (const [album, , extra] of character.music) {
      totalTracks += 1;
      byExtra[extra].total += 1;
      if (isTrackEnabled(preset, album, extra)) {
        enabledTracks += 1;
        usable += 1;
        byExtra[extra].enabled += 1;
      }
    }
    if (usable > 0) charactersWithTracks += 1;
  }
  return {
    enabledTracks,
    totalTracks,
    charactersWithTracks,
    totalCharacters: characters.length,
    byExtra,
  };
}

/** 仅单曲模式的一行：角色 + 预设允许的曲目 + 当前手选。 */
interface SingleModeRow {
  character: CharacterRecord;
  allowed: MusicEntry[];
  pinned: MusicEntry | null;
  disabled: boolean;
}

export function singleModeRows(
  preset: PresetState,
  characters: readonly CharacterRecord[],
  pins: Record<string, MusicEntry | undefined>,
  disabled: Record<string, boolean>,
  query = "",
): SingleModeRow[] {
  const needle = query.trim().toLowerCase();
  return characters
    .slice()
    .sort((a, b) => a.order - b.order)
    .filter((character) => {
      if (!needle) return true;
      return [character.name, character.key, ...character.searchNames]
        .some((name) => name.toLowerCase().includes(needle));
    })
    .map((character) => ({
      character,
      allowed: allowedTracks(preset, character).entries,
      pinned: pins[character.key] ?? null,
      disabled: Boolean(disabled[character.key]),
    }));
}

/** 单曲模式下该角色要播的那首：手选优先，否则取预设允许的第一首。 */
export function effectivePin(
  preset: PresetState,
  character: CharacterRecord,
  pins: Record<string, MusicEntry | undefined>,
): MusicEntry | null {
  // 手选的那首若不属于当前模式：读档时归一化（每个模式各自的存档，见 D110），这里直接取
  return pins[character.key] ?? allowedTracks(preset, character).entries[0] ?? null;
}
