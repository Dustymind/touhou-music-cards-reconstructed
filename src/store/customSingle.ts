/** 模式 3 的「仅单曲模式」：**只有逐曲（= 逐卡）禁用**（契约 `docs/custom-mode-v1.md` C5）。
 *
 * 与另两个模式的区别是结构性的，不是偏好差异：
 *
 * - **没有总开关**：这个模式一卡一首，"每个角色只播一首"本来就是它的常态（开关没有意义）；
 * - **没有手选**：同样因为一卡一首，没得选；
 * - 只剩**逐卡禁用**：禁用的卡**不进轮播、也不进卡池**（Q5）。
 *
 * **键名也因此与另两把不同**（`tmc.v1.custom-single-track`，不是 `tmc.v1.single-track.custom`）：
 * 后者已经被 `makeModeStores()` 生成的那把**模式 2 形状**的表占着，两把形状不同的 store 挤同一个键
 * 会互相清空（各自的校验器都把对方的字段读成空表，**不报错**）。
 */
import { create } from "zustand";

import { defineStore, isRecord, pickBoolean, type StoreSpec } from "../persist";
import { useSession } from "./session";

interface CustomSingleState {
  /** 被禁用的卡 key → `true`（只存 `true`，与 `single.ts` 的 `disabledCharacters` 同一个口径） */
  disabled: Record<string, true>;
}

const FRESH: CustomSingleState = { disabled: {} };

export function validateCustomSingle(raw: unknown): CustomSingleState | null {
  if (!isRecord(raw)) return null;
  const disabled: Record<string, true> = {};
  if (isRecord(raw.disabled)) {
    for (const [key, value] of Object.entries(raw.disabled)) {
      if (pickBoolean(value)) disabled[key] = true;
    }
  }
  return { disabled };
}

/** 存档规格。 */
export function customSingleSpec(): StoreSpec<CustomSingleState> {
  return { name: "custom-single-track", version: 1, fallback: { ...FRESH }, validate: validateCustomSingle };
}

interface CustomSingleSlice extends CustomSingleState {
  /** 禁用 / 取消禁用一张卡。 */
  toggle: (key: string) => void;
  /** 清理已不存在的卡（数据更新后调用）；没有死条目时**不动 store、不写盘**。 */
  prune: (knownKeys: readonly string[]) => void;
}

const handle = defineStore(customSingleSpec());

export const useCustomSingle = create<CustomSingleSlice>((set, get) => ({
  ...handle.load(),

  toggle(key) {
    const disabled = { ...get().disabled };
    if (disabled[key]) delete disabled[key];
    else disabled[key] = true;
    set({ disabled });
    handle.save({ disabled });
    // 设置页明确重新配置了这张卡 ⇒ 列表页那条点播让位（否则它会继续盖住"已禁用"，B2 的同一条）
    useSession.getState().clearEntryRequest(key);
  },

  prune(knownKeys) {
    const known = new Set(knownKeys);
    const disabled: Record<string, true> = {};
    let dropped = false;
    for (const key of Object.keys(get().disabled)) {
      if (known.has(key)) disabled[key] = true;
      else dropped = true;
    }
    if (!dropped) return;
    set({ disabled });
    handle.save({ disabled });
  },
}));
