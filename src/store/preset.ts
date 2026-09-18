/** 选曲预设状态（M6 的配置页只负责把它接上界面）。 */
import { create } from "zustand";

import type { AlbumRecord } from "../data/types";
import { defineStore, isRecord, pickBoolean } from "../persist";
import { CATEGORY_KEYS, defaultPreset, mergeWithDefaults, type PresetState, type Tri } from "../music/selection";

const TRIS: Tri[] = ["unset", "on", "off"];

const presetStore = defineStore<PresetState>({
  name: "preset",
  version: 1,
  fallback: { albums: {}, hifuu: {}, category: { 角色曲: "unset", 道中曲: "unset", 更多道中曲: "unset" } },
  validate(raw) {
    if (!isRecord(raw)) return null;
    const boolMap = (value: unknown): Record<string, boolean> => {
      const out: Record<string, boolean> = {};
      if (!isRecord(value)) return out;
      for (const [key, flag] of Object.entries(value)) {
        const parsed = pickBoolean(flag);
        if (parsed !== null) out[key] = parsed;
      }
      return out;
    };
    const source = isRecord(raw.category) ? raw.category : {};
    const category = { 角色曲: "unset", 道中曲: "unset", 更多道中曲: "unset" } as PresetState["category"];
    for (const key of CATEGORY_KEYS) {
      const value = source[key];
      if (typeof value === "string" && (TRIS as string[]).includes(value)) category[key] = value as Tri;
    }
    return { albums: boolMap(raw.albums), hifuu: boolMap(raw.hifuu), category };
  },
});

interface PresetSlice extends PresetState {
  /** 用专辑表初始化/补齐（新增专辑默认勾选）。 */
  sync: (albums: readonly AlbumRecord[]) => void;
  setAlbum: (name: string, checked: boolean) => void;
  setHifuuAlbum: (name: string, checked: boolean) => void;
  /** 秘封曲父复选框：批量控制，不存自身状态。 */
  setAllHifuu: (albums: readonly AlbumRecord[], checked: boolean) => void;
  setCategory: (key: (typeof CATEGORY_KEYS)[number], value: Tri) => void;
  reset: (albums: readonly AlbumRecord[]) => void;
}

const initial = presetStore.load();

function persist(state: PresetState): void {
  presetStore.save({ albums: state.albums, hifuu: state.hifuu, category: state.category });
}

export const usePreset = create<PresetSlice>((set, get) => ({
  ...initial,

  sync(albums) {
    const merged = mergeWithDefaults(get(), albums);
    set(merged);
    persist(merged);
  },

  setAlbum(name, checked) {
    const albums = { ...get().albums, [name]: checked };
    set({ albums });
    persist({ ...get(), albums });
  },

  setHifuuAlbum(name, checked) {
    const hifuu = { ...get().hifuu, [name]: checked };
    set({ hifuu });
    persist({ ...get(), hifuu });
  },

  setAllHifuu(albums, checked) {
    const hifuu = { ...get().hifuu };
    for (const album of albums) if (album.kind === "hifuu") hifuu[album.name] = checked;
    set({ hifuu });
    persist({ ...get(), hifuu });
  },

  setCategory(key, value) {
    const category = { ...get().category, [key]: value };
    set({ category });
    persist({ ...get(), category });
  },

  reset(albums) {
    const fresh = defaultPreset(albums);
    set(fresh);
    persist(fresh);
  },
}));

/** 秘封父复选框的显示态：全选 / 全不选 / 半选（派生，不存值）。 */
export function hifuuParentState(preset: PresetState, albums: readonly AlbumRecord[]): "all" | "none" | "mixed" {
  const names = albums.filter((album) => album.kind === "hifuu").map((album) => album.name);
  if (names.length === 0) return "none";
  const checked = names.filter((name) => preset.hifuu[name]).length;
  if (checked === names.length) return "all";
  if (checked === 0) return "none";
  return "mixed";
}
