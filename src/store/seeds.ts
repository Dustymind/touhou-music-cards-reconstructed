/** 种子权威（见 `docs/DECISIONS.md` D104）：**谁是服务端谁生成种子**。
 *
 * 一条会话里只有一个权威种子：
 * - 单机：本机就是权威（`authority`），种子落盘，重启后同一批派生结果不变；
 * - 联机：**主机**是权威，种子随 `SessionConfig` 下发；客户端进房后变成 `replica`，只 `adopt()` 主机给的种子，
 *   自己想抽种子（`draw()` / `roll()`）会拿到 `null` —— 客户端不该掷骰子，等主机快照即可。
 *
 * 两种"用到种子"的写法，别混：
 * | 方法 | 谁调用 | 结果从哪来 | 典型场景 |
 * |---|---|---|---|
 * | `draw(label)` | 只有权威端 | 本机现抽（nonce 递增），**结果**随快照同步 | 随机补满、打乱牌库、开局洗牌、随机交牌 |
 * | `derive(label)` | 两端都可以 | 从**已同步**的种子纯派生，不消耗 nonce | 每回合选哪首、CPU 这一回合怎么出手 |
 */
import { create } from "zustand";

import { defineStore, isRecord, pickNumber } from "../persist";
import { SEED_MAX, deriveSeed, newSeed, type Seed, type SeedLabel } from "../rng";

/** 权威端（联机主机 / 单机本机）或副本端（联机客户端）。 */
type SeedAuthority = "authority" | "replica";

interface Persisted {
  ownSeed: Seed;
}

const seedStore = defineStore<Persisted>({
  name: "seed",
  version: 1,
  fallback: { ownSeed: 0 },
  validate(raw) {
    if (!isRecord(raw)) return null;
    const ownSeed = pickNumber(raw.ownSeed, 0, SEED_MAX);
    return ownSeed === null ? null : { ownSeed };
  },
});

/** 只接受合法种子；线上/存档来的脏值一律拒掉，不回落到"半随机"。 */
function toSeed(raw: unknown): Seed | null {
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= SEED_MAX ? raw : null;
}

/** 首次运行的种子引导：读存档 → 没有就现抽一个，并落盘。
 *
 * 模块加载时执行一次；**也是测试入口** —— 测试跑在真实浏览器里，`vi.resetModules()` 不会重跑
 * ESM 的顶层副作用，所以这段逻辑必须能被直接调用，否则这些用例只能靠"重载模块"来测。
 */
export function bootstrapSeed(): Seed {
  const stored = seedStore.load();
  if (stored.ownSeed !== 0) return stored.ownSeed;
  const ownSeed = newSeed();
  seedStore.save({ ownSeed });
  return ownSeed;
}

const initial = { ownSeed: bootstrapSeed() };

interface SeedState {
  /** 本机自己的种子（落盘）：单机时它就是权威种子；联机开房时会被下发给客户端 */
  ownSeed: Seed;
  /** 采用主机下发的种子（**不落盘**：离开房间后本机还是自己那份） */
  adoptedSeed: Seed | null;
  authority: SeedAuthority;
  /** 权威端每 `draw()` 一次 +1：同一次点击里的多个随机动作也要拿到不同子种子 */
  nonce: number;

  /** 当前生效的会话种子（副本优先用主机给的） */
  sessionSeed: () => Seed;
  /** 权威端：抽一个"本次动作专用"的子种子；副本端返回 null（等主机快照） */
  draw: (label: SeedLabel, ...labels: SeedLabel[]) => Seed | null;
  /** 两端都可用的纯派生：输入必须都是**已同步**的值，否则两端会分叉 */
  derive: (label: SeedLabel, ...labels: SeedLabel[]) => Seed;
  /** 权威端：换一个全新的种子（重新抽选 / 换房间）；副本端返回 null */
  roll: () => Seed | null;
  /** 副本端：采用主机下发的种子 */
  adopt: (seed: Seed) => void;
  /** 开房 / 加入 / 离开房间时切换角色 */
  setAuthority: (authority: SeedAuthority) => void;
}

export const useSeeds = create<SeedState>((set, get) => ({
  ownSeed: initial.ownSeed,
  adoptedSeed: null,
  authority: "authority",
  nonce: 0,

  sessionSeed: () => get().adoptedSeed ?? get().ownSeed,

  draw(label, ...labels) {
    if (get().authority === "replica") return null;
    const nonce = get().nonce;
    set({ nonce: nonce + 1 });
    return deriveSeed(get().ownSeed, "action", label, ...labels, nonce);
  },

  derive(label, ...labels) {
    return deriveSeed(get().sessionSeed(), "derive", label, ...labels);
  },

  roll() {
    if (get().authority === "replica") return null;
    const seed = newSeed();
    set({ ownSeed: seed, adoptedSeed: null });
    seedStore.save({ ownSeed: seed });
    return seed;
  },

  adopt(seed) {
    const value = toSeed(seed);
    if (value === null) return;
    set({ adoptedSeed: value });
  },

  setAuthority(authority) {
    set({ authority, adoptedSeed: null, nonce: 0 });
  },
}));

/** 只读选择器：当前生效的会话种子（组件里用，避免把整个 store 拉进依赖）。 */
export function selectSessionSeed(state: SeedState): Seed {
  return state.adoptedSeed ?? state.ownSeed;
}

// 开发/E2E 调试钩子（仅 dev 构建挂到 window，生产构建里不存在）：联机时用来核对
// "主机换种子 → 客户端采用"这条链路，见 e2e/smoke.spec.ts 的重新抽选用例。
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __TMC_SEEDS__?: unknown }).__TMC_SEEDS__ = useSeeds;
}
