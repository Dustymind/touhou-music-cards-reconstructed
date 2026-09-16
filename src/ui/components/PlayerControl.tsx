/** 播放控制条：播放/暂停、上一下一首、进度、音量（对齐上游 PlayerControl）。 */
import { Box, IconButton, Slider, Stack, Typography } from "@mui/material";
import { Pause, PlayArrow, SkipNext, SkipPrevious } from "@mui/icons-material";

import { MonoFontFamily } from "../../theme/theme";

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
  return (
    <Stack spacing={1} sx={{ width: "100%" }} data-testid="player-control">
      <Stack direction="row" spacing={1} alignItems="center">
        <IconButton size="small" onClick={props.onPrevious} disabled={disabled} aria-label="previous">
          <SkipPrevious />
        </IconButton>
        <IconButton
          size="small"
          onClick={playing ? props.onPause : props.onPlay}
          disabled={disabled}
          aria-label={playing ? "pause" : "play"}
          data-testid="play-toggle"
        >
          {playing ? <Pause /> : <PlayArrow />}
        </IconButton>
        <IconButton size="small" onClick={props.onNext} disabled={disabled} aria-label="next">
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
      </Stack>
    </Stack>
  );
}
