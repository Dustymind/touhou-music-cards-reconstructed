/** 音源开关与回退顺序（用户存档），**按音乐模式分键**。
 *
 * 契约 `docs/sources-separation-v1.md` §3/§4：每个模式的注册表与它的开关/顺序各归各的 ——
 * `tmc.v1.sources.originals`（老键 `tmc.v1.sources` 迁到这里）与 `tmc.v1.sources.otomads`。
 * 音MAD 那份**默认不写任何覆盖**：它注册表里的本地源本来就 `enabled = true`（由 `tmc.validate` 守）。
 */
import { create } from "zustand";

import { defineStore, isRecord, pickBoolean, pickNumber, pickString, type StoreSpec } from "../persist";
import type { MusicMode } from "../music/mode";
import { makeModeStores, type ModeHook } from "./modeScope";

interface SourceOverride {
  enabled: boolean;
  order: number;
}

type Overrides = Record<string, SourceOverride>;

/** 按覆盖表算出实际的 fallback 顺序（未覆盖的按注册表顺序排在后面）。 */
export function effectiveOrder(overrides: Overrides, allIds: string[]): string[] {
  const overridden = allIds
    .filter((id) => overrides[id])
    .sort((a, b) => (overrides[a]!.order) - (overrides[b]!.order));
  const rest = allIds.filter((id) => !overrides[id]);
  return [...overridden, ...rest];
}

function validateSources(raw: unknown): Overrides | null {
  if (!isRecord(raw)) return null;
  const out: Overrides = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue;
    const enabled = pickBoolean(value.enabled);
    const order = pickNumber(value.order, 0, 99);
    if (enabled === null || order === null) continue;
    out[id] = { enabled, order };
  }
  return out;
}

/** v0 曾经只存一个"启用的音源 id"（单选）；迁移成开关表。 */
function migrateLegacy(raw: unknown): Overrides | null {
  const legacy = pickString(raw);
  return legacy ? { [legacy]: { enabled: true, order: 1 } } : null;
}

/** 某个模式的存档规格（测试直接用它验校验与迁移）。 */
export function sourceSpec(mode: MusicMode): StoreSpec<Overrides> {
  const base: StoreSpec<Overrides> = {
    name: `sources.${mode}`, version: 1, fallback: {}, validate: validateSources, migrate: migrateLegacy,
  };
  // 老存档（单键 `tmc.v1.sources`）没有模式维度：归原曲（内容形状没变，所以不动版本号）
  return mode === "originals" ? { ...base, legacyName: "sources" } : base;
}

interface SourceSlice {
  /** 源 id → 覆盖（没写过的键 = 用注册表里的默认值） */
  overrides: Overrides;
  /** 开关某个源：只改 enabled，**不动**它在回退顺序里的位置。 */
  toggle: (id: string, enabled: boolean, allIds: string[]) => void;
  /** 上移/下移：交换相邻两个源的位置，其它源（含"默认关闭"的）保持原状。 */
  move: (id: string, direction: -1 | 1, allIds: string[], defaultEnabled: Record<string, boolean>) => void;
  /** 清理注册表里已经没有的源（数据更新后调用）。 */
  prune: (knownIds: readonly string[]) => void;
}

/** 造"某个模式的音源开关表"这把 store。 */
function makeSlice(mode: MusicMode) {
  const handle = defineStore(sourceSpec(mode));
  const initial = handle.load();

  return create<SourceSlice>((set, get) => ({
    overrides: initial,

    toggle(id, enabled, allIds) {
      const overrides = get().overrides;
      // 位置按"当前实际顺序"取，不要用注册表里的 order —— 否则开关一下就把用户排好的顺序冲掉
      const position = effectiveOrder(overrides, allIds).indexOf(id);
      const next: Overrides = {
        ...overrides,
        [id]: { enabled, order: position >= 0 ? position + 1 : (overrides[id]?.order ?? 1) },
      };
      set({ overrides: next });
      handle.save(next);
    },

    move(id, direction, allIds, defaultEnabled) {
      const overrides = get().overrides;
      const current = effectiveOrder(overrides, allIds);
      const index = current.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return;
      const swapped = [...current];
      [swapped[index], swapped[target]] = [swapped[target]!, swapped[index]!];
      const next: Overrides = {};
      for (const [position, sourceId] of swapped.entries()) {
        next[sourceId] = {
          // 没有覆盖过的源必须沿用**注册表里的默认开关**（本地源在原曲注册表里根本不存在；
          // 在音MAD 注册表里默认是开的，不能被当成"关着"）
          enabled: overrides[sourceId]?.enabled ?? defaultEnabled[sourceId] ?? true,
          order: position + 1,
        };
      }
      set({ overrides: next });
      handle.save(next);
    },

    /** 只留注册表里还有的 id。
     *
     * 死条目不会让界面跳号（`effectiveOrder` 只遍历注册表 id），但它会**永久留在 localStorage**：
     * 那个 id 将来回到注册表时，会带着旧开关 / 旧顺序复活。`move()` 本来就会把死条目顺手丢掉，
     * `toggle()` 却用展开把它续下来 —— 两条路径行为不一致，这里补一条明确的清理路径。
     */
    prune(knownIds) {
      const known = new Set(knownIds);
      const overrides = get().overrides;
      const next: Overrides = {};
      let dropped = false;
      for (const [id, override] of Object.entries(overrides)) {
        if (known.has(id)) next[id] = override;
        else dropped = true;
      }
      if (!dropped) return;                    // 没有死条目：不动 store、不写盘
      set({ overrides: next });
      handle.save(next);
    },
  }));
}

const sourceStores = makeModeStores<SourceSlice>(makeSlice);

/** 某个模式那把（测试与非组件代码用）。 */
export const sourceStoreFor = sourceStores.storeFor;

/** 当前音乐模式那把（组件用；切模式即换表）。 */
export const useSourceOverrides: ModeHook<SourceSlice> = sourceStores.useStore;
