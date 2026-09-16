/** 计时器：倒计时显示 3→1，回合内显示已过秒数（100ms 节拍，Inconsolata 等宽）。 */
import { Box, Typography } from "@mui/material";
import { useEffect, useState } from "react";

import type { JudgeState } from "../../game/types";
import { TURN_COUNTDOWN_MS } from "../../game/useGameLoop";
import { MonoFontFamily } from "../../theme/theme";

export function TimerDisplay({
  state, turnStartTimestamp,
}: {
  state: JudgeState;
  turnStartTimestamp: number;
}) {
  const [, force] = useState(0);
  useEffect(() => {
    if (state !== "countdown" && state !== "turnStart") return undefined;
    const timer = window.setInterval(() => force((value) => value + 1), 100);
    return () => window.clearInterval(timer);
  }, [state]);

  let text = "0.00";
  if (state === "countdown") {
    const elapsed = Date.now() - countdownAnchor();
    text = String(Math.max(1, Math.ceil((TURN_COUNTDOWN_MS - elapsed) / 1000)));
  } else if (state === "turnStart" && turnStartTimestamp > 0) {
    text = ((Date.now() - turnStartTimestamp) / 1000).toFixed(2);
  }

  return (
    <Box sx={{ backgroundColor: "#000000ff", px: 1.5, py: 0.5, borderRadius: 1 }} data-testid="game-timer">
      <Typography variant="h5" sx={{ fontFamily: MonoFontFamily, color: "#ffffffff", lineHeight: 1.2 }}>
        {text}
      </Typography>
    </Box>
  );
}

/** 倒计时锚点：由 GamePanel 在进入 countdown 时写入，避免在这里再拉一份状态。 */
let anchor = 0;
export function markCountdownStart(now = Date.now()): void {
  anchor = now;
}
function countdownAnchor(): number {
  if (anchor === 0) anchor = Date.now();
  return anchor;
}
