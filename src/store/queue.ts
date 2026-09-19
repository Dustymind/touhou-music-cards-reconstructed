/** 轮播队列：顺序、临时跳过、当前角色。
 *
 * 种子不在这里（D104）：队列的随机顺序由 `src/store/seeds.ts` 的**会话种子**决定 ——
 * 单机时本机即权威，联机时主机生成并通过 `SessionConfig` 下发，客户端 `adoptSeed()` 后与本机同序。
 * 于是"重新抽选"在客户端不再是各抽各的 ✗，而是发意图让主机换种子（见 `useNet`）。
 */
import { create } from "zustand";

import { defineStore, isRecord, pickBoolean, pickString } from "../persist";
import { shuffleWithSeed, type Seed } from "../rng";
import { useSeeds } from "./seeds";

interface Persisted {
  order: string[];
  temporaryDisabled: Record<string, boolean>;
  currentKey: string | null;
  /** D104 之前这里存过 `seed`（轮播种子）；现在归 `src/store/seeds.ts`，迁移代码在那边 */
  seed?: number;
}

const queueStore = defineStore<Persisted>({
  name: "queue",
  version: 1,
  fallback: { order: [], temporaryDisabled: {}, currentKey: null },
  validate(raw) {
    if (!isRecord(raw)) return null;
    const order = Array.isArray(raw.order)
      ? raw.order.filter((key): key is string => typeof key === "string")
      : null;
    if (!order) return null;
    const disabledRaw = isRecord(raw.temporaryDisabled) ? raw.temporaryDisabled : {};
    const temporaryDisabled: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(disabledRaw)) {
      const flag = pickBoolean(value);
      if (flag !== null) temporaryDisabled[key] = flag;
    }
    const currentKey = raw.currentKey === null ? null : pickString(raw.currentKey);
    return { order, temporaryDisabled, currentKey };
  },
});

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

const initial = queueStore.load();

function persist(state: Persisted): void {
  queueStore.save({
    order: state.order,
    temporaryDisabled: state.temporaryDisabled,
    currentKey: state.currentKey,
  });
}

/** 按会话种子重排：两端同种子 + 同 key 列表 → 同顺序。 */
function orderFor(keys: string[], seed: Seed): string[] {
  return shuffleWithSeed(keys, seed, "queue");
}

export const useQueue = create<QueueState>((set, get) => ({
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
