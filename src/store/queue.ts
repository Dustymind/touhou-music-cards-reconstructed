/** 轮播队列：顺序、临时跳过、当前角色、随机种子（联机时种子由主机下发）。 */
import { create } from "zustand";

import { defineStore, isRecord, pickBoolean, pickNumber, pickString } from "../persist";
import { newSeed, shuffleWithSeed } from "../music/rng";

interface Persisted {
  order: string[];
  temporaryDisabled: Record<string, boolean>;
  currentKey: string | null;
  seed: number;
}

const queueStore = defineStore<Persisted>({
  name: "queue",
  version: 1,
  fallback: { order: [], temporaryDisabled: {}, currentKey: null, seed: 0 },
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
    const seed = pickNumber(raw.seed, 0, 2147483647) ?? 0;
    return { order, temporaryDisabled, currentKey, seed };
  },
});

interface QueueState extends Persisted {
  /** 用"当前可用的角色 key"补齐/修正队列（新增角色追加到末尾，消失的剔除）。 */
  syncKeys: (keys: string[]) => void;
  regenerate: (keys: string[], randomize: boolean) => void;
  setCurrent: (key: string | null) => void;
  toggleTemporary: (key: string) => void;
  clearTemporary: () => void;
  step: (direction: 1 | -1, allowed: string[]) => string | null;
  setSeed: (seed: number) => void;
}

const initial = queueStore.load();

function persist(state: QueueState): void {
  queueStore.save({
    order: state.order,
    temporaryDisabled: state.temporaryDisabled,
    currentKey: state.currentKey,
    seed: state.seed,
  });
}

export const useQueue = create<QueueState>((set, get) => ({
  ...initial,

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
    const next = { order, temporaryDisabled, currentKey, seed: get().seed || newSeed() };
    set(next);
    persist({ ...get(), ...next });
  },

  regenerate(keys, randomize) {
    const seed = newSeed();
    const order = randomize ? shuffleWithSeed(keys, seed) : keys.slice();
    const next = {
      order,
      temporaryDisabled: {},
      currentKey: order[0] ?? null,
      seed,
    };
    set(next);
    persist({ ...get(), ...next });
  },

  setCurrent(key) {
    set({ currentKey: key });
    persist({ ...get(), currentKey: key });
  },

  toggleTemporary(key) {
    const temporaryDisabled = { ...get().temporaryDisabled };
    if (temporaryDisabled[key]) delete temporaryDisabled[key];
    else temporaryDisabled[key] = true;
    set({ temporaryDisabled });
    persist({ ...get(), temporaryDisabled });
  },

  clearTemporary() {
    set({ temporaryDisabled: {} });
    persist({ ...get(), temporaryDisabled: {} });
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

  setSeed(seed) {
    set({ seed });
    persist({ ...get(), seed });
  },
}));
