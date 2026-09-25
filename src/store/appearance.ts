/** 外观偏好：亮/暗模式 + 主题色（设置页「外观」那一段）。**全局一份**，不按音乐模式分键
 *  （D110 里"故意不分键"的是 seed / sources / musicMode；主题跟当前在听哪一支曲子无关）。
 *
 *  持久化沿用 `persist.ts` 的版本化存储：逐键校验、非法值退回默认 —— 坏存档不会把界面搞黑。
 */
import { create } from "zustand";

import { defineStore, isRecord, pickString } from "../persist";
import {
  DEFAULT_THEME_MODE, isHexColor, normalizeHex, THEME_MODES, type ThemeMode,
} from "../theme/theme";

export interface AppearancePrefs {
  mode: ThemeMode;
  /** 自定义主题色（小写 `#rrggbb`）；**空串 = 用 MD2 基准色**（跟着亮/暗走）。 */
  primary: string;
}

const appearanceStore = defineStore<AppearancePrefs>({
  name: "appearance",
  version: 1,
  fallback: { mode: DEFAULT_THEME_MODE, primary: "" },
  validate(raw) {
    if (!isRecord(raw)) return null;
    // 缺字段 ⇒ 用默认值补齐，不因为少一个键就丢掉整份偏好（与 session 同口径）
    const mode = (pickString(raw.mode, THEME_MODES) as ThemeMode | null) ?? DEFAULT_THEME_MODE;
    const primary = isHexColor(raw.primary) ? normalizeHex(raw.primary) : "";
    return { mode, primary };
  },
});

interface AppearanceState extends AppearancePrefs {
  setMode: (mode: ThemeMode) => void;
  setPrimary: (color: string) => void;
  /** 回到 MD2 基准色（模式不变）。 */
  resetPrimary: () => void;
}

const initial = appearanceStore.load();

export const useAppearance = create<AppearanceState>((set, get) => ({
  mode: initial.mode,
  primary: initial.primary,

  setMode(mode) {
    set({ mode });
    appearanceStore.save({ ...pick(get()), mode });
  },
  setPrimary(color) {
    const primary = isHexColor(color) ? normalizeHex(color) : get().primary;
    set({ primary });
    appearanceStore.save({ ...pick(get()), primary });
  },
  resetPrimary() {
    set({ primary: "" });
    appearanceStore.save({ ...pick(get()), primary: "" });
  },
}));

function pick(state: AppearanceState): AppearancePrefs {
  return { mode: state.mode, primary: state.primary };
}
