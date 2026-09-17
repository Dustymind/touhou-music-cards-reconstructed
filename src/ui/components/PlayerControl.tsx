/** 播放控制条（Material Design 2 媒体控制）：上一首 / 播放暂停 / 下一首 + 进度滑杆 +
 *  音量图标按钮（点开才显示音量滑杆，MD2 的媒体控制惯例）。 */
import { Box, IconButton, Slider, Stack, Typography } from "@mui/material";
import { Pause, PlayArrow, SkipNext, SkipPrevious, VolumeOff, VolumeUp } from "@mui/icons-material";
import { useState } from "react";

import { MD2, MonoFontFamily } from "../../theme/theme";

/** MD2 图标按钮：48dp 触控区 + 24dp 图标。 */
const ICON_BUTTON_SX = { width: MD2.iconButton.size, height: MD2.iconButton.size } as const;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export interface PlayerControlProps {
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  disabled?: boolean;
  onPlay: () => void;
  onPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
  onVolume: (value: number) => void;
}

export function PlayerControl(props: PlayerControlProps) {
  const { playing, currentTime, duration, volume, disabled } = props;
  const [volumeOpen, setVolumeOpen] = useState(false);

  return (
    <Stack spacing={1} sx={{ width: "100%" }} data-testid="player-control">
      <Stack direction="row" spacing={1} alignItems="center">
        <IconButton sx={ICON_BUTTON_SX} onClick={props.onPrevious} disabled={disabled} aria-label="previous">
          <SkipPrevious />
        </IconButton>
        <IconButton
          sx={ICON_BUTTON_SX}
          onClick={playing ? props.onPause : props.onPlay}
          disabled={disabled}
          aria-label={playing ? "pause" : "play"}
          data-testid="play-toggle"
        >
          {playing ? <Pause /> : <PlayArrow />}
        </IconButton>
        <IconButton sx={ICON_BUTTON_SX} onClick={props.onNext} disabled={disabled} aria-label="next">
          <SkipNext />
        </IconButton>
        <Typography variant="caption" sx={{ fontFamily: MonoFontFamily, minWidth: "5.5em" }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </Typography>
        <Box sx={{ flex: 1, px: 1 }}>
          <Slider
            size="small"
            min={0}
            max={Math.max(duration, 1)}
            step={0.01}
            value={Math.min(currentTime, Math.max(duration, 1))}
            onChange={(_event, value) => props.onSeek(Array.isArray(value) ? value[0]! : value)}
            disabled={disabled || duration <= 0}
            aria-label="seek"
          />
        </Box>
        {/* MD2：音量用图标按钮切换滑杆 */}
        <IconButton
          sx={ICON_BUTTON_SX}
          onClick={() => setVolumeOpen((open) => !open)}
          aria-label="volume-toggle"
          data-testid="volume-toggle"
        >
          {volume === 0 ? <VolumeOff /> : <VolumeUp />}
        </IconButton>
        {volumeOpen && (
          <Box sx={{ width: 120 }}>
            <Slider
              size="small"
              min={0}
              max={1}
              step={0.1}
              value={volume}
              onChange={(_event, value) => props.onVolume(Array.isArray(value) ? value[0]! : value)}
              aria-label="volume"
            />
          </Box>
        )}
      </Stack>
    </Stack>
  );
}
