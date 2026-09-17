/** 游戏页统一的按钮样式：图标框、图标与文字的间距、内边距、高度全部对齐。
 *
 * 之前同一个页面里混着三种来源的按钮（MUI 默认小按钮 / ButtonGroup 里的小按钮 / ToggleButton），
 * 高度 31 vs 39、左右内边距 5 / 9 / 10 各不相同，图标与文字的间距也因为图标本身宽度不同而看着不一致。
 * 这里定一套常量，所有按钮共用。
 */
import Button, { type ButtonProps } from "@mui/material/Button";

/** 图标框大小（px）：所有按钮的图标都放进同样大的方框里，视觉间距才一致。 */
export const GAME_ICON_SIZE = 18;
/** 图标与文字之间的间距（px）。 */
export const GAME_ICON_GAP = 6;
/** 按钮高度（px）。 */
export const GAME_BUTTON_HEIGHT = 30;

/** 图标框 + 间距：MUI 默认只给 `margin-right`，图标本身宽度不一，这里统一成固定方框。 */
const iconSlot = {
  "& .MuiButton-startIcon": {
    marginLeft: 0,
    marginRight: `${GAME_ICON_GAP}px`,
    width: GAME_ICON_SIZE,
    height: GAME_ICON_SIZE,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    "& > *:nth-of-type(1)": { fontSize: GAME_ICON_SIZE },
  },
  "& .MuiButton-endIcon": {
    marginLeft: `${GAME_ICON_GAP}px`,
    marginRight: 0,
    width: GAME_ICON_SIZE,
    height: GAME_ICON_SIZE,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    "& > *:nth-of-type(1)": { fontSize: GAME_ICON_SIZE },
  },
} as const;

/** 所有游戏页按钮（含 ButtonGroup 里的）共用。 */
export const gameButtonSx = {
  height: GAME_BUTTON_HEIGHT,
  minHeight: GAME_BUTTON_HEIGHT,
  px: 1.25,
  py: 0,
  fontSize: "0.8125rem",
  lineHeight: 1.2,
  ...iconSlot,
} as const;

/** ToggleButton 也用同样的高度/内边距/字号。 */
export const gameToggleSx = {
  height: GAME_BUTTON_HEIGHT,
  minHeight: GAME_BUTTON_HEIGHT,
  px: 1.25,
  py: 0,
  fontSize: "0.8125rem",
  lineHeight: 1.2,
  ...iconSlot,
} as const;

/** ToggleButton 里的图标：与按钮同一套图标尺寸。 */
export const gameToggleIconSx = { fontSize: GAME_ICON_SIZE } as const;

export interface GameButtonProps extends ButtonProps {
  /** 覆盖统一样式时用（会合并在统一样式之后） */
  sx?: ButtonProps["sx"];
}

export function GameButton({ sx, ...rest }: GameButtonProps) {
  return (
    <Button
      size="small"
      disableElevation
      sx={[gameButtonSx, ...(Array.isArray(sx) ? sx : [sx])]}
      {...rest}
    />
  );
}
