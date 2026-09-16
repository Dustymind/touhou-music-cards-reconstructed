/** 对战计时器：3 秒回合倒计时 + CPU 出手调度（与本地/CPU 模式相关，联机时由传输层驱动）。 */
import { useEffect, useRef } from "react";

import { useGame } from "./useGame";

/** 回合之间的倒计时毫秒数（对齐上游 3000ms）。 */
export const TURN_COUNTDOWN_MS = 3000;

export function useGameLoop(enabled = true): void {
  const state = useGame((slice) => slice.game.state);
  const turnSeq = useGame((slice) => slice.game.turnSeq);
  const mode = useGame((slice) => slice.game.mode);
  const advanceCountdown = useGame((slice) => slice.advanceCountdown);
  const pick = useGame((slice) => slice.pick);
  const planCpu = useGame((slice) => slice.planCpu);
  const cpuTimer = useRef<number | null>(null);

  // 倒计时 → 进入下一回合
  useEffect(() => {
    if (!enabled || state !== "countdown") return undefined;
    const timer = window.setTimeout(() => advanceCountdown(), TURN_COUNTDOWN_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, state, turnSeq, advanceCountdown]);

  // CPU 出手：每次进入 turnStart 重新规划
  useEffect(() => {
    if (!enabled || mode !== "cpu" || state !== "turnStart") return undefined;
    const plan = planCpu(1);
    if (!plan || !plan.card) return undefined;
    cpuTimer.current = window.setTimeout(() => {
      const game = useGame.getState().game;
      if (game.state !== "turnStart") return;
      const slot = game.players[1]!.deck.findIndex(
        (card) => card && card.characterKey === plan.card!.characterKey && card.cardIndex === plan.card!.cardIndex);
      if (slot >= 0) pick(1, 1, slot);
    }, plan.delayMs);
    return () => {
      if (cpuTimer.current !== null) window.clearTimeout(cpuTimer.current);
    };
  }, [enabled, mode, state, turnSeq, pick, planCpu]);
}
