/** CPU 对手：反应时间分布 + 失误率（对齐上游 `cpuOpponentCountdown`）。 */
import type { Rng } from "../rng";
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
 *
 * `rng` **必须**由调用方给出（D104 去掉了 `Math.random` 默认值）：现在它来自
 * `useSeeds.derive("cpu", turnSeq)` —— 同一个种子 + 同一个回合必然规划出同一套动作，
 * 复盘/回放/测试都能复现，两端也不会各掷各的骰子。
 */
export function planCpuPick(
  state: GameState,
  cpuPlayer: number,
  settings: CpuSettings,
  rng: Rng,
): CpuPlan | null {
  const player = state.players[cpuPlayer];
  if (!player || state.currentKey === null) return null;
  const cards = player.deck.filter((slot): slot is CardInfo => slot !== null);
  if (cards.length === 0) return null;

  const delaySeconds = Math.max(
    0.1, settings.meanSeconds + (rng.float() * 2 - 1) * Math.sqrt(3) * settings.stdDevSeconds);
  const correct = cards.find((card) => card.characterKey === state.currentKey) ?? null;
  const willMistake = rng.percent(settings.mistakeRate) || correct === null;

  if (!willMistake && correct) {
    return { delayMs: delaySeconds * 1000, card: correct, willMistake: false };
  }
  const wrong = cards.filter((card) => card.characterKey !== state.currentKey);
  if (wrong.length === 0) {
    return { delayMs: delaySeconds * 1000, card: correct, willMistake: false };
  }
  return { delayMs: delaySeconds * 1000, card: rng.pick(wrong)!, willMistake: true };
}
