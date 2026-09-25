/** 轮播队列：顺序、临时跳过、当前角色。
 *
 * 种子不在这里（D104）：队列的随机顺序由 `src/store/seeds.ts` 的**会话种子**决定 ——
 * 单机时本机即权威，联机时主机生成并通过 `SessionConfig` 下发，客户端 `adoptSeed()` 后与本机同序。
 * 于是"重新抽选"在客户端不再是各抽各的 ✗，而是发意图让主机换种子（见 `useNet`）。
 *
 * **按音乐模式分键**（B）：`tmc.v1.queue.originals` / `.otomads` 各一把。两个模式能播的角色不同
 * （音MAD 只有 35 个），共用一条顺序会让"切模式就把队列收窄、切回来又要重排"变成常态；
 * 分键之后每个模式各自记住自己的顺序、临时禁用与当前角色。老存档（单键 `tmc.v1.queue`）归**原曲**。
 */
import { create } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";

import { defineStore, isRecord, pickBooleanMap, pickString, type StoreSpec } from "../persist";
import { shuffleWithSeed, type Seed } from "../rng";
import type { MusicMode } from "../music/mode";
import { currentMusicMode, useMusicMode } from "./modeScope";
import { useSeeds } from "./seeds";

interface Persisted {
  order: string[];
  temporaryDisabled: Record<string, boolean>;
  currentKey: string | null;
  /** D104 之前这里存过 `seed`（轮播种子）；现在归 `src/store/seeds.ts`，迁移代码在那边 */
  seed?: number;
}

const FRESH: Persisted = { order: [], temporaryDisabled: {}, currentKey: null };

function validateQueue(raw: unknown): Persisted | null {
  if (!isRecord(raw)) return null;
  const order = Array.isArray(raw.order)
    ? raw.order.filter((key): key is string => typeof key === "string")
    : null;
  if (!order) return null;
  const temporaryDisabled = pickBooleanMap(raw.temporaryDisabled);
  const currentKey = raw.currentKey === null ? null : pickString(raw.currentKey);
  return { order, temporaryDisabled, currentKey };
}

/** 某个音乐模式的存档规格。 */
export function queueSpec(mode: MusicMode): StoreSpec<Persisted> {
  const base: StoreSpec<Persisted> = { name: `queue.${mode}`, version: 1, fallback: FRESH, validate: validateQueue };
  return mode === "originals" ? { ...base, legacyName: "queue" } : base;
}

interface QueueState extends Persisted {
  /** 用"当前可用的角色 key"补齐/修正队列（新增角色追加到末尾，消失的剔除）。 */
  syncKeys: (keys: string[]) => void;
  /** 重排队列：`randomize` 时由权威端换一个新种子并洗牌；副本端不动（等主机配置）。 */
  regenerate: (keys: string[], randomize: boolean) => void;
  /** 副本端采用主机下发的种子 → 与本机同一顺序（不换种子，只按新种子重排） */
  adoptSeed: (seed: Seed) => void;
  setCurrent: (key: string | null) => void;
  toggleTemporary: (key: string) => void;
  clearTemporary: () => void;
  step: (direction: 1 | -1, allowed: string[]) => string | null;
}

/** 按会话种子重排：两端同种子 + 同 key 列表 → 同顺序。 */
function orderFor(keys: string[], seed: Seed): string[] {
  return shuffleWithSeed(keys, seed, "queue");
}

/** 造"某个音乐模式的轮播队列"这把 store。 */
function makeSlice(mode: MusicMode) {
  const handle = defineStore(queueSpec(mode));
  const initial = handle.load();

  const persist = (state: Persisted): void => {
    handle.save({
      order: state.order,
      temporaryDisabled: state.temporaryDisabled,
      currentKey: state.currentKey,
    });
  };

  return create<QueueState>((set, get) => ({
    order: initial.order,
    temporaryDisabled: initial.temporaryDisabled,
    currentKey: initial.currentKey,

    syncKeys(keys) {
      const known = new Set(keys);
      const order = get().order.filter((key) => known.has(key));
      for (const key of keys) if (!order.includes(key)) order.push(key);
      const temporaryDisabled: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(get().temporaryDisabled)) {
        if (known.has(key) && value) temporaryDisabled[key] = true;
      }
      const currentKey = get().currentKey && known.has(get().currentKey!)
        ? get().currentKey
        : (order[0] ?? null);
      set({ order, temporaryDisabled, currentKey });
      persist(get());
    },

    regenerate(keys, randomize) {
      if (!randomize) {
        // "重置顺序"不需要随机数，两端都能各自执行
        const order = keys.slice();
        set({ order, temporaryDisabled: {}, currentKey: order[0] ?? null });
        persist(get());
        return;
      }
      const seed = useSeeds.getState().roll();
      if (seed === null) return;              // 副本端：不能自己换种子，由主机换完下发
      const order = orderFor(keys, seed);
      set({ order, temporaryDisabled: {}, currentKey: order[0] ?? null });
      persist(get());
    },

    adoptSeed(seed) {
      const order = orderFor(get().order, seed);
      set({ order, temporaryDisabled: {}, currentKey: order[0] ?? null });
      persist(get());
    },

    setCurrent(key) {
      set({ currentKey: key });
      persist(get());
    },

    toggleTemporary(key) {
      const temporaryDisabled = { ...get().temporaryDisabled };
      if (temporaryDisabled[key]) delete temporaryDisabled[key];
      else temporaryDisabled[key] = true;
      set({ temporaryDisabled });
      persist(get());
    },

    clearTemporary() {
      set({ temporaryDisabled: {} });
      persist(get());
    },

    /** 环形推进，跳过临时禁用的角色；全被禁用时返回 null。 */
    step(direction, allowed) {
      const { order, temporaryDisabled, currentKey } = get();
      const usable = order.filter((key) => allowed.includes(key) && !temporaryDisabled[key]);
      if (usable.length === 0) return null;
      const index = currentKey ? usable.indexOf(currentKey) : -1;
      const nextIndex = index < 0
        ? (direction > 0 ? 0 : usable.length - 1)
        : (index + direction + usable.length) % usable.length;
      const nextKey = usable[nextIndex] ?? null;
      if (nextKey) get().setCurrent(nextKey);
      return nextKey;
    },
  }));
}

const slices: Record<MusicMode, UseBoundStore<StoreApi<QueueState>>> = {
  originals: makeSlice("originals"),
  otomads: makeSlice("otomads"),
};

/** 某个音乐模式那把（测试与非组件代码用）。 */
export function queueStoreFor(mode: MusicMode): UseBoundStore<StoreApi<QueueState>> {
  return slices[mode];
}

/** 当前音乐模式那把（**非组件**代码用：事件处理、联机回调）。 */
export function currentQueue(): UseBoundStore<StoreApi<QueueState>> {
  return slices[currentMusicMode()];
}

/** 当前音乐模式那把（组件用；切模式即换队列）。 */
export function useQueue(): QueueState;
export function useQueue<T>(selector: (state: QueueState) => T): T;
export function useQueue<T>(selector?: (state: QueueState) => T): QueueState | T {
  const store = slices[useMusicMode()];
  return selector ? store(selector) : store();
}
