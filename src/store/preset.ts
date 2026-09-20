/** 选曲预设状态（M6 的配置页只负责把它接上界面）。
 *
 * **按音乐模式分键**（B）：`tmc.v1.preset.originals` 与 `tmc.v1.preset.otomads` 各一把。
 * 两个模式是两套专辑表，共用一张表会让"取消勾选"在切模式后莫名生效或失效；
 * 老存档（单键 `tmc.v1.preset`）归**原曲**（`legacyName`），音MAD 侧从默认值长起。
 */
import { create } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";

import type { AlbumRecord } from "../data/types";
import { defineStore, isRecord, pickBoolean, type StoreSpec } from "../persist";
import { CATEGORY_KEYS, defaultPreset, mergeWithDefaults, type PresetState, type Tri } from "../music/selection";
import type { MusicMode } from "../music/mode";
import { useMusicMode } from "./modeScope";

const TRIS: Tri[] = ["unset", "on", "off"];

const FALLBACK: PresetState = {
  albums: {}, hifuu: {}, category: { 角色曲: "unset", 道中曲: "unset", 更多道中曲: "unset" },
};

function validatePreset(raw: unknown): PresetState | null {
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
}

/** 某个音乐模式的存档规格（测试直接用它验校验与迁移）。 */
export function presetSpec(mode: MusicMode): StoreSpec<PresetState> {
  const base: StoreSpec<PresetState> = {
    name: `preset.${mode}`, version: 1, fallback: FALLBACK, validate: validatePreset,
  };
  // 老存档没有模式维度：归原曲（内容形状没变，所以不动版本号）
  return mode === "originals" ? { ...base, legacyName: "preset" } : base;
}

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

/** 造"某个音乐模式的预设表"这把 store。 */
function makeSlice(mode: MusicMode) {
  const handle = defineStore(presetSpec(mode));
  const initial = handle.load();

  const persist = (state: PresetState): void => {
    handle.save({ albums: state.albums, hifuu: state.hifuu, category: state.category });
  };

  return create<PresetSlice>((set, get) => ({
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
}

const slices: Record<MusicMode, UseBoundStore<StoreApi<PresetSlice>>> = {
  originals: makeSlice("originals"),
  otomads: makeSlice("otomads"),
};

/** 某个音乐模式那把（测试与非组件代码用）。 */
export function presetStoreFor(mode: MusicMode): UseBoundStore<StoreApi<PresetSlice>> {
  return slices[mode];
}

/** 当前音乐模式那把（组件用；切模式即换表）。 */
export function usePreset(): PresetSlice;
export function usePreset<T>(selector: (state: PresetSlice) => T): T;
export function usePreset<T>(selector?: (state: PresetSlice) => T): PresetSlice | T {
  const store = slices[useMusicMode()];
  return selector ? store(selector) : store();
}

/** 秘封父复选框的显示态：全选 / 全不选 / 半选（派生，不存值）。 */
export function hifuuParentState(preset: PresetState, albums: readonly AlbumRecord[]): "all" | "none" | "mixed" {
  const names = albums.filter((album) => album.kind === "hifuu").map((album) => album.name);
  if (names.length === 0) return "none";
  const checked = names.filter((name) => preset.hifuu[name]).length;
  if (checked === names.length) return "all";
  if (checked === 0) return "none";
  return "mixed";
}
