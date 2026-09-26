/** 模式 3 的选曲预设：**专辑三元 + 作者三元**（契约 `docs/custom-mode-v1.md` C4）。
 *
 * **不走 `makeModeStores()`**（B 那套"每个模式一把"的装配）：这个模式的预设形状与另两个模式不同
 * （两维都是三态，没有"专辑勾选 + 秘封碟 + 类别开关"），硬套同一把 store 只会让两边都变形。
 * **键名与另两把刻意不同**（`tmc.v1.custom-preset`，不是 `tmc.v1.preset.custom`）：
 * `preset.custom` 已经被 `makeModeStores()` 生成的那把**模式 2 形状**的表占着（队列与音源在模式 3 下
 * 真的会用它们那一套键）。两把形状不同的 store 挤同一个键 ⇒ 谁后写谁把对方清空（各自的校验器
 * 都只会把对方的字段读成空表，**不报错**）。新的模式没有老存档，所以也不需要考虑 `legacyName`。
 *
 * **没有 `sync()`**：另两个模式需要它是因为"新专辑默认勾选"要**写进表里**（配置页读的是 store）。
 * 这里两维的缺省值就是 `unset`（= 不筛，见 `customSelection.ts` 的真值表），与"键不存在"完全等价 ⇒
 * 界面读 `state.albums[name] ?? "unset"` 即可，不必把一堆 `unset` 灌进存档。
 */
import { create } from "zustand";

import { defineStore, isRecord, type StoreSpec } from "../persist";
import { EMPTY_CUSTOM_PRESET, type CustomPresetState } from "../music/customSelection";
import type { Tri } from "../music/selection";

const TRIS: readonly string[] = ["unset", "on", "off"];

/** 只留显式的 `on` / `off`：`unset`（= 没配置过）**不落盘**，与"键不存在"完全等价。 */
function explicitOnly(map: Record<string, Tri>): Record<string, Tri> {
  const out: Record<string, Tri> = {};
  for (const [key, value] of Object.entries(map)) {
    if (value !== "unset") out[key] = value;
  }
  return out;
}

/** 解析存档里的两维：只认三态里的合法值，且只留显式的那两档。 */
function pickTris(raw: unknown): Record<string, Tri> {
  const out: Record<string, Tri> = {};
  if (!isRecord(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && TRIS.includes(value) && value !== "unset") {
      out[key] = value as Tri;
    }
  }
  return out;
}

/** 校验（测试直接用它验坏存档不会带进内存）。 */
export function validateCustomPreset(raw: unknown): CustomPresetState | null {
  if (!isRecord(raw)) return null;
  return { albums: pickTris(raw.albums), authors: pickTris(raw.authors) };
}

/** 存档规格。 */
export function customPresetSpec(): StoreSpec<CustomPresetState> {
  return {
    name: "custom-preset", version: 1,
    fallback: { ...EMPTY_CUSTOM_PRESET }, validate: validateCustomPreset,
  };
}

interface CustomPresetSlice extends CustomPresetState {
  setAlbumTri: (name: string, value: Tri) => void;
  setAuthorTri: (name: string, value: Tri) => void;
  /** 回到"两维都没配置"（= 全开）。 */
  reset: () => void;
}

const handle = defineStore(customPresetSpec());

export const useCustomPreset = create<CustomPresetSlice>((set, get) => {
  const persist = (state: CustomPresetState): void => {
    handle.save({ albums: explicitOnly(state.albums), authors: explicitOnly(state.authors) });
  };

  return {
    ...handle.load(),

    setAlbumTri(name, value) {
      const albums = { ...get().albums, [name]: value };
      set({ albums });
      persist({ albums, authors: get().authors });
    },

    setAuthorTri(name, value) {
      const authors = { ...get().authors, [name]: value };
      set({ authors });
      persist({ albums: get().albums, authors });
    },

    reset() {
      set({ albums: {}, authors: {} });
      persist(EMPTY_CUSTOM_PRESET);
    },
  };
});
