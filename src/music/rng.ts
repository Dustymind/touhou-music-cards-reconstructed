/** 可复现的伪随机：单机时用于"多首选一首"与随机起播；联机时由主机下发种子。 */
export type Seed = number;

/** mulberry32：小、快、跨端一致（同一 seed 必得同一序列）。 */
export function createRng(seed: Seed): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newSeed(): Seed {
  return Math.floor(Math.random() * 2147483647);
}

/** 从候选里按种子取一个（空数组返回 null）。 */
export function pickWithSeed<T>(items: readonly T[], seed: Seed): T | null {
  if (items.length === 0) return null;
  const rng = createRng(seed);
  return items[Math.floor(rng() * items.length)] ?? null;
}

/** 随机起播位置：跳过最后 10 秒（上游语义）；短曲从 0 开始。 */
export function randomStartPosition(duration: number, seed: Seed): number {
  if (!Number.isFinite(duration) || duration < 10) return 0;
  const ratio = (seed % 2147483647) / 2147483647;
  return ratio * (duration - 10);
}

/** Fisher–Yates，按种子洗牌（联机双方同种子 → 同顺序）。 */
export function shuffleWithSeed<T>(items: readonly T[], seed: Seed): T[] {
  const rng = createRng(seed);
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i]!;
    out[i] = out[j]!;
    out[j] = a;
  }
  return out;
}
