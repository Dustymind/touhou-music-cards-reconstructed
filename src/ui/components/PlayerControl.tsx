/** 播放控制条（Material Design 2 媒体控制）。
 *
 *  固定在 tag（专辑 / 类别 / 音源 chip）下方，**自上而下三行**（用户指定顺序，任何视口都不变）：
 *  1. 进度条（已播时间 · 滑杆 · 总时长，长度上限照搬原版 `clamp(0px, 40%, 300px)`）
 *  2. 音量（**两端各一个加减按键**，常驻滑杆夹在中间，同一条长度规则）
 *  3. 播放控件（上一首 / 播放暂停 / 下一首）
 *
 *  对齐：**桌面以"各行的行首元素"为基准列左对齐**（文字列 / 进度条圆点 / 音量减键 / 上一首键），
 *  **移动端居中** —— 只有对齐方式随断点变，顺序、结构与长度都不变（不再"到处乱飞"）。
 */
import { Box, IconButton, Slider, Stack, Typography } from "@mui/material";
import { Pause, PlayArrow, SkipNext, SkipPrevious, VolumeDown, VolumeUp } from "@mui/icons-material";
import { MD2, MonoFontFamily } from "../../theme/theme";

/** MD2 图标按钮：48dp 触控区 + 24dp 图标。 */
const ICON_BUTTON_SX = { width: MD2.iconButton.size, height: MD2.iconButton.size } as const;

/** 时间文本（等宽字体，避免秒数跳动时整行抖动）。 */
/** 时间码：等宽字体 + **固定槽宽** —— 秒数跳动时滑杆不会左右抖，两条滑杆的宽度也才能算得准。 */
const TIME_SX = {
  fontFamily: MonoFontFamily,
  flex: "0 0 auto",
  fontSize: "0.75rem",
  lineHeight: 1.6,
} as const;

/* ---- 桌面端的左对齐规则（窄屏一律居中，不参与） ----------------------------------------
 * 三个基准，都从行首算起：
 *   · 音量减键（48dp）的中心 = 24dp  → 滑杆容器内缩 24dp，圆点**中心**正好落在这条竖线上；
 *   · 圆点会越过轨道左端 6dp（`size="small"` 实测）→ 圆点**左边缘** = 24 − 6 = 18dp；
 *   · 文字列（曲名 / 角色名 / tag）与圆点左边缘同一条竖线 → 内缩 18dp。
 * 所以只需要两个常量，且都从同一个 24 推出来。 */
const BUTTON_CENTER = MD2.iconButton.size / 2;
const THUMB_OVERHANG = 6;
/** 文字列内缩（桌面端）：曲名/角色名/tag 与进度条圆点左边缘同一条竖线。 */
export const TEXT_ALIGN_INSET = BUTTON_CENTER - THUMB_OVERHANG;

/** 三行共用：**统一行高 48dp**（MD2 最小触控区）+ 统一对齐。
 *  行高统一后，行与行之间的间距才是真正一致的（否则 28dp 的进度条行与 48dp 的按钮行
 *  视觉间隔会差一倍，"行间距不统一"）。 */
const ROW_SX = {
  alignItems: "center",
  justifyContent: { xs: "center", sm: "flex-start" },
  width: "100%",
  minWidth: 0,
  minHeight: MD2.iconButton.size,
} as const;

/** 文字列内缩（桌面端）：曲名/角色名/tag 与进度条圆点左边缘同一条竖线。 */
export const TEXT_INSET_SX = { pl: { xs: 0, sm: `${TEXT_ALIGN_INSET}px` } } as const;

/* ---- 两条滑杆"等长 + 对齐"的账（用户要求） ---------------------------------------------
 * 音量行 = [减键 48] [gap 4] [滑杆] [gap 4] [加键 48]   → 滑杆左右两侧共占 104dp
 * 进度行 = 左内缩 12 [已播 36] [gap 4] [滑杆] [gap 4] [总时长 48] → 也是 104dp ✓
 *   · 左内缩 12 = 图标在 48dp 按钮里的留白 → **已播时间码左边缘 = 减键图标左边缘** ✓
 *   · 总时长槽 48 再右内缩 12 → **总时长右边缘 = 加键图标右边缘** ✓
 * 两侧占位相同 ⇒ 两条滑杆的宽度与左右边缘**自动一致** ✓（宽度再由 flex 上限 300dp 截断）。 */
const ICON_INSET = (MD2.iconButton.size - MD2.iconButton.icon) / 2;      // 12
const GAP = 4;
const TIME_SLOT = 36;                                                    // "0:00"
const DURATION_SLOT = MD2.iconButton.size;                               // 48 —— 与音量键同宽
const SEEK_ROW_INSET_SX = { pl: `${ICON_INSET}px` } as const;
const SLIDER_SX = { flex: "1 1 auto", maxWidth: 300, minWidth: 0, display: "flex", alignItems: "center" } as const;
/** 行间距：与卡片里其它间距一样取 MD2 8dp 栅格。
 *  （曾经给进度条行补过 4dp 下内边距做"视觉等距"，用户要求撤回 —— 见 D79。） */
const ROW_GAP = 1;

/** 音量步长：与滑杆的 step 一致。 */
const VOLUME_STEP = 0.1;

const clampVolume = (value: number): number => Math.min(1, Math.max(0, Number(value.toFixed(2))));

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
    <Stack spacing={ROW_GAP} sx={{ width: "100%" }} data-testid="player-control">
      {/* 第一行：进度条 —— **时间码放在滑杆两端**（用户要求），滑杆吃掉中间剩下的宽度。
          窄屏靠 flex 收缩（`minWidth: 0`）保证不超距；桌面仍以列首为起点，与下面两行对齐。 */}
      <Stack direction="row" data-testid="player-row-seek" sx={{ ...ROW_SX, gap: `${GAP}px`, ...SEEK_ROW_INSET_SX }}>
        <Typography
          variant="caption"
          sx={{ ...TIME_SX, width: TIME_SLOT }}
          data-testid="playback-time"
        >
          {formatTime(currentTime)}
        </Typography>
        <Box sx={SLIDER_SX}>
          <Slider
            data-testid="seek-slider"
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
        <Typography
          variant="caption"
          sx={{
            ...TIME_SX,
            width: DURATION_SLOT,
            pr: `${ICON_INSET}px`,
            textAlign: "right",
          }}
          data-testid="playback-duration"
        >
          {formatTime(duration)}
        </Typography>
      </Stack>

      {/* 第二行：音量 —— **两端各一个加减按键**，滑杆夹在中间（与原版一致：
          `VolumeDown` · 滑杆 · `VolumeUp`；用户要求去掉静音按钮）。步长与滑杆一致（0.1）。 */}
      <Stack direction="row" data-testid="player-row-volume" sx={{ ...ROW_SX, gap: `${GAP}px` }}>
        <IconButton
          sx={ICON_BUTTON_SX}
          onClick={() => props.onVolume(clampVolume(volume - VOLUME_STEP))}
          disabled={disabled || volume <= 0}
          aria-label="volume-down"
          data-testid="volume-down"
        >
          <VolumeDown />
        </IconButton>
        <Box sx={SLIDER_SX}>
          <Slider
            data-testid="volume-slider"
            size="small"
            min={0}
            max={1}
            step={VOLUME_STEP}
            value={volume}
            onChange={(_event, value) => props.onVolume(Array.isArray(value) ? value[0]! : value)}
            disabled={disabled}
            aria-label="volume"
          />
        </Box>
        <IconButton
          sx={ICON_BUTTON_SX}
          onClick={() => props.onVolume(clampVolume(volume + VOLUME_STEP))}
          disabled={disabled || volume >= 1}
          aria-label="volume-up"
          data-testid="volume-up"
        >
          <VolumeUp />
        </IconButton>
      </Stack>

      {/* 第三行：播放控件 */}
      <Stack direction="row" data-testid="player-row-transport" sx={{ ...ROW_SX, gap: 1 }}>
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
      </Stack>
    </Stack>
  );
}
