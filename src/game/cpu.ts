/** CPU 对手：反应时间分布 + 失误率（对齐上游 `cpuOpponentCountdown`）。 */
import type { CardInfo, GameState } from "./types";

export interface CpuSettings {
  /** 平均反应时间（秒） */
  meanSeconds: number;
  /** 标准差（秒）；实际延迟在 mean ± √3σ 内均匀分布 */
  stdDevSeconds: number;
  /** 失误率（百分比） */
  mistakeRate: number;
}

export const DEFAULT_CPU_SETTINGS: CpuSettings = {
  meanSeconds: 2.5,
  stdDevSeconds: 1,
  mistakeRate: 10,
};

export interface CpuPlan {
  delayMs: number;
  card: CardInfo | null;
  willMistake: boolean;
}

/**
 * 规划 CPU 这一回合的动作；返回 null 表示 CPU 无法出手（没有牌或没有正确卡）。
 * `rng` 注入便于测试与联机复现。
 */
export function planCpuPick(
  state: GameState,
  cpuPlayer: number,
  settings: CpuSettings,
  rng: () => number = Math.random,
): CpuPlan | null {
  const player = state.players[cpuPlayer];
  if (!player || state.currentKey === null) return null;
  const cards = player.deck.filter((slot): slot is CardInfo => slot !== null);
  if (cards.length === 0) return null;

  const delaySeconds = Math.max(0.1, settings.meanSeconds + (rng() * 2 - 1) * Math.sqrt(3) * settings.stdDevSeconds);
  const correct = cards.find((card) => card.characterKey === state.currentKey) ?? null;
  const willMistake = rng() * 100 < settings.mistakeRate || correct === null;

  if (!willMistake && correct) {
    return { delayMs: delaySeconds * 1000, card: correct, willMistake: false };
  }
  const wrong = cards.filter((card) => card.characterKey !== state.currentKey);
  if (wrong.length === 0) {
    return { delayMs: delaySeconds * 1000, card: correct, willMistake: false };
  }
  // rng 可能返回 1（自定义 rng / 边界值）→ 索引夹紧，避免 undefined
  const index = Math.min(wrong.length - 1, Math.floor(rng() * wrong.length));
  return { delayMs: delaySeconds * 1000, card: wrong[index]!, willMistake: true };
}
