/** 游戏页统一的按钮/分组样式（MD2 规格集中来自 `theme.ts` 的 MD2 常量）。 */
import Button, { type ButtonProps } from "@mui/material/Button";

import { MD2 } from "../../theme/theme";

/** 分组标题与控件、同组按钮、组与组之间的间距（px）——全页统一，都是 MD2 的 8dp 栅格或其倍数。 */
export const GAME_LABEL_GAP = MD2.grid;
export const GAME_BUTTON_GAP = MD2.grid;
export const GAME_GROUP_GAP = MD2.grid * 3;

/** 分组标题：与按钮同高、垂直居中，字号与按钮一致。 */
export const gameLabelSx = {
  height: MD2.button.medium,
  display: "inline-flex",
  alignItems: "center",
  lineHeight: 1.75,
  fontSize: "0.875rem",
  color: "text.secondary",
  whiteSpace: "nowrap",
} as const;

/** MD2 单选行（图标 + 文本）的标签：与按钮同高、垂直居中，右侧留 8dp。 */
export const gameRadioLabelSx = {
  height: MD2.button.medium,
  // MUI 的 FormControlLabel 默认 margin-left: -11px（把涟漪对齐到文字），会让单选组压到标题上
  ml: 0,
  mr: 1,
  "& .MuiFormControlLabel-label": { fontSize: "0.875rem", letterSpacing: "1.25px" },
} as const;

/** 一组"标题 + 控件"的横向容器：标题与控件之间的间距固定。 */
export const gameGroupSx = {
  display: "inline-flex",
  flexDirection: "row",
  alignItems: "center",
  gap: `${GAME_LABEL_GAP}px`,
} as const;

/** 一组里若干按钮的容器：同组按钮之间固定间距。 */
export const gameButtonsSx = {
  display: "inline-flex",
  flexDirection: "row",
  alignItems: "center",
  gap: `${GAME_BUTTON_GAP}px`,
} as const;

/** 一行里若干组的容器：组间间距固定，窄屏换行。 */
export const gameRowSx = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  flexWrap: "wrap",
  columnGap: `${GAME_GROUP_GAP}px`,
  rowGap: `${MD2.grid}px`,
} as const;

/** 图标框 + 间距：MUI 默认只给 `margin-right`，图标本身宽度不一，这里统一成固定方框。 */
const iconSlot = {
  "& .MuiButton-startIcon, & .MuiButton-endIcon": {
    width: MD2.button.iconSize,
    height: MD2.button.iconSize,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    "& > *:nth-of-type(1)": { fontSize: MD2.button.iconSize },
  },
  "& .MuiButton-startIcon": { marginLeft: 0, marginRight: `${MD2.button.iconGap}px` },
  "& .MuiButton-endIcon": { marginLeft: `${MD2.button.iconGap}px`, marginRight: 0 },
} as const;

/** 所有游戏页按钮（含 ButtonGroup 里的）共用。 */
export const gameButtonSx = {
  height: MD2.button.medium,
  minHeight: MD2.button.medium,
  px: 2,                  // MD2：左右各 16dp
  py: 0,
  fontSize: "0.875rem",   // MD2 button 14sp
  letterSpacing: "1.25px",
  textTransform: "uppercase",
  lineHeight: 1.75,
  ...iconSlot,
} as const;

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
