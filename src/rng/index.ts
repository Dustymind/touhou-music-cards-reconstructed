/** 全项目**唯一**的随机数实现（契约见 `docs/rng-v1.md`，决定见 `docs/DECISIONS.md` D104）。
 *
 * 规则很简单，但改动它会同时破坏"联机两端一致"与"存档可复现"，所以写死在文档里：
 *
 * 1. **确定性**：`createRng(seed)` 是同种子同序列的 PRNG（mulberry32，全程 32 位整数运算，
 *    没有浮点累积、没有引擎差异 → 浏览器 / Node / 不同版本都得出同一串数）。
 * 2. **派生**：跨端要"各自算出同一个结果"时，用 `deriveSeed(seed, ...labels)` 从**已同步**的种子
 *    派生，而不是自己写 `seed + n * 7919`、`seed % 2147483647` 这类近似算法（雪崩差、低位有规律）。
 * 3. **生成**：`newSeed()` 只能用密码学随机源，且**只有权威端**（联机主机 / 单机本机）调用；
 *    联机客户端一律"采用主机下发的种子"（`src/store/seeds.ts`）。
 * 4. **非种子场景**（房间号、peer id 后缀、纯装饰动效）走 `randomToken()` / `ephemeralRandom()`：
 *    它们不需要可复现，也不参与种子体系 —— 这样"哪里需要确定性"在代码里一眼可辨。
 *
 * 因此 `src/` 下除了本模块，**不允许出现 `Math.random`**（`src/rng/authority.test.ts` 会扫源码守住这条）。
 */

/** 种子取值域上界（含）：`[0, 2147483647]`，0x7fffffff。
 *  之所以是 31 位而不是 32 位：种子会进存档与状态摘要（`stateDigest` 里的 `seed=`），
 *  固定成非负 31 位可以避免"同一个种子两种写法"，也不用担心 JSON / 位运算的符号问题。 */
export const SEED_MAX = 2147483647;

/** 一个种子：`[0, SEED_MAX]` 的整数。 */
export type Seed = number;

/** 派生种子时参与混淆的标签（字符串 / 整数都行）。 */
export type SeedLabel = string | number;

/** 本模块的随机数句柄：**不是**种子，只是一串确定性的数。 */
export interface Rng {
  /** 下一个 32 位无符号整数 */
  next(): number;
  /** `[0, 1)` 的浮点 */
  float(): number;
  /** `[0, bound)` 的整数（`bound <= 0` 时返回 0） */
  intBelow(bound: number): number;
  /** 以 `chance`（百分比，0–100）的概率返回 true */
  percent(chance: number): boolean;
  /** 均匀取一个（空数组返回 null） */
  pick<T>(items: readonly T[]): T | null;
  /** Fisher–Yates 洗牌（返回新数组，不改原数组） */
  shuffle<T>(items: readonly T[]): T[];
}

/** 32 位混淆（murmur3 的 fmix32）：单比特改动就能雪崩到整个字。 */
function mix32(value: number): number {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** 标签 → 32 位数。FNV-1a 只作为"把字符串折成整数"的输入，真正的打散交给 `mix32`。 */
function labelBits(label: SeedLabel): number {
  if (typeof label === "number") return mix32(Math.trunc(label) >>> 0);
  let hash = 0x811c9dc5;
  for (let index = 0; index < label.length; index += 1) {
    hash ^= label.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return mix32(hash);
}

/**
 * 从种子派生子种子：`deriveSeed(s, "turn", 3, "cirno")`。
 *
 * 标签**有序**参与（"a","b" 与 "b","a" 必得不同结果），每个标签轮一次 `mix32`，
 * 最后 `>>> 1` 落回 31 位 —— 用移位而不是取模，避免低位偏置。
 */
export function deriveSeed(seed: Seed, ...labels: SeedLabel[]): Seed {
  let hash = mix32((seed >>> 0) ^ 0x9e3779b9);
  for (let index = 0; index < labels.length; index += 1) {
    hash = mix32(hash ^ labelBits(labels[index]!) ^ Math.imul(index + 1, 0x27d4eb2d));
  }
  return hash >>> 1;
}

/**
 * 确定性随机数：**同一种子必得同一序列**（跨浏览器 / 跨平台一致）。
 * 算法是 mulberry32；`docs/rng-v1.md` 里冻结了测试向量，改算法必须同时升级协议版本。
 */
export function createRng(seed: Seed): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  const float = (): number => next() / 4294967296;
  const intBelow = (bound: number): number => {
    const size = Math.floor(bound);
    if (!Number.isFinite(size) || size <= 0) return 0;
    // float() 落在 [0,1) → 索引必然合法；再夹一次是为了防"外部改过 bound"
    return Math.min(size - 1, Math.floor(float() * size));
  };
  return {
    next,
    float,
    intBelow,
    percent: (chance) => float() * 100 < chance,
    pick: <T,>(items: readonly T[]): T | null =>
      items.length === 0 ? null : items[intBelow(items.length)] ?? null,
    shuffle: <T,>(items: readonly T[]): T[] => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = intBelow(i + 1);
        const swap = out[i]!;
        out[i] = out[j]!;
        out[j] = swap;
      }
      return out;
    },
  };
}

/** 密码学随机源（`crypto.getRandomValues`）；没有它才回落到 `Math.random`（老环境 / 测试桩）。 */
function entropy32(): number {
  const source = globalThis.crypto;
  if (typeof source?.getRandomValues === "function") {
    const buffer = new Uint32Array(1);
    source.getRandomValues(buffer);
    return buffer[0]!;
  }
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

/**
 * **权威端**生成一个新种子（联机主机 / 单机本机）。
 *
 * 客户端**不允许**调用它来决定任何两端共享的东西 —— 客户端只会 `adopt()` 主机下发的种子
 * （`src/store/seeds.ts` 的 `draw()` / `roll()` 在副本端直接返回 null）。
 */
export function newSeed(): Seed {
  return entropy32() % (SEED_MAX + 1);
}

/** 非种子场景的 `[0,1)` 随机数：纯装饰动效用（抖动、随机底色、闪点位置）。 */
export function ephemeralRandom(): number {
  return entropy32() / 4294967296;
}

/** 非种子场景的 `[0, bound)` 整数：进程内临时下标等（跨端不需要一致）。 */
export function ephemeralIntBelow(bound: number): number {
  const size = Math.floor(bound);
  if (!Number.isFinite(size) || size <= 0) return 0;
  return Math.min(size - 1, Math.floor(ephemeralRandom() * size));
}

/** 房间号 / peer id 后缀这类**标识**：只要求不重复，不要求可复现，所以不叫 seed。 */
const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export function randomToken(length = 6): string {
  let token = "";
  for (let index = 0; index < length; index += 1) {
    token += TOKEN_ALPHABET[ephemeralIntBelow(TOKEN_ALPHABET.length)]!;
  }
  return token;
}

/** 从种子 + 标签取一个元素（内部就是"派生 → 建 Rng → 取一个"）。 */
export function pickWithSeed<T>(items: readonly T[], seed: Seed, ...labels: SeedLabel[]): T | null {
  return createRng(labels.length === 0 ? seed : deriveSeed(seed, ...labels)).pick(items);
}

/**
 * 稳定哈希：同一个字符串在任何端、任何版本都得同一个 31 位数（`[0, SEED_MAX]`）。
 *
 * 用于"展示层面也必须两端一致"的小选择：`?g=` 的卡片倾斜、顶部彩蛋文案的轮换。
 * 它不是种子（没有会话概念），所以固定以 0 为种子派生 —— 这样项目里所有"要一致"的
 * 数值都出自同一个混淆实现，不再各写一份 FNV + 取模（D104）。
 */
export function stableHash(input: string): Seed {
  return deriveSeed(0, "hash", input);
}

/** 从种子 + 标签洗牌（联机双方同种子同标签 → 同顺序）。 */
export function shuffleWithSeed<T>(items: readonly T[], seed: Seed, ...labels: SeedLabel[]): T[] {
  return createRng(labels.length === 0 ? seed : deriveSeed(seed, ...labels)).shuffle(items);
}

/**
 * 随机起播位置：跳过最后 10 秒（上游语义），短曲 / 时长未知从 0 开始。
 *
 * 位置由 `(种子, 曲目标签)` 派生 —— 每次换歌都换标签，所以同一首歌每次回到它都落在同一处，
 * 但**不同的歌不会都落在同一个比例上**（旧实现直接用 `seed` 线性映射，整盘曲子起点相同 ✗）。
 */
export function randomStartPosition(duration: number, seed: Seed, ...labels: SeedLabel[]): number {
  if (!Number.isFinite(duration) || duration < 10) return 0;
  const rng = createRng(deriveSeed(seed, "start", ...labels));
  return rng.float() * (duration - 10);
}
