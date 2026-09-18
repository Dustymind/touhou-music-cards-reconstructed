/** 角色卡：远程图集 + 多 origin 兜底 + 状态底色（对齐上游 `CharacterCard`）。 */
import { Box, Paper, type SxProps } from "@mui/material";
import { memo, useEffect, useState } from "react";

import type { CardSetRecord } from "../../data/types";
import { CardAspectRatio, CardColors, MD2, NoFontFamily } from "../../theme/theme";
import { glitchTilt, isCheat, randomColor } from "../../cheat";

/** 卡面圆角：卡牌本体与选卡显示区边界共用（取 MD2 形状规格，避免两处各写一遍）。 */
export const CARD_BORDER_RADIUS = `${MD2.shape}px`;

export type CardState = "normal" | "hover" | "disabled" | "disabledHover" | "selected" | "correct" | "incorrect" | "placeholder";

const COLOR_BY_STATE: Record<CardState, string> = {
  placeholder: "transparent",
  normal: CardColors.Normal,
  hover: CardColors.Hover,
  disabled: CardColors.Disabled,
  disabledHover: CardColors.DisabledHover,
  selected: CardColors.Selected,
  correct: CardColors.Correct,
  incorrect: CardColors.Incorrect,
};

const GRAYSCALE: CardState[] = ["disabled", "disabledHover"];

/** 图集目录 + 文件名 → 绝对 URL（按 origin 列表拼）。 */
function cardUrl(cardSet: CardSetRecord, file: string, origin: string): string {
  const prefix = origin.endsWith("/") ? origin : `${origin}/`;
  const dir = cardSet.dir.endsWith("/") ? cardSet.dir : `${cardSet.dir}/`;
  return prefix + dir + encodeURIComponent(file);
}

interface CharacterCardProps {
  cardSet: CardSetRecord;
  file: string;
  width?: string;
  state?: CardState;
  /** 本地优先（用户自己放了图集时） */
  preferLocal?: boolean;
  glitch?: boolean;
  raised?: boolean;
  /** 不要外层纸框与投影，只留**一层**白底（游戏牌桌/选卡区/播放页牌堆用）。
   *  状态色仍按上游铺在这一层底上（抢对=绿、抢错=红、禁用=灰）。 */
  bare?: boolean;
  onClick?: () => void;
  sx?: SxProps;
  "data-testid"?: string;
}

function CharacterCardInner({
  cardSet, file, width = "100%", state = "normal", preferLocal = false, glitch = false,
  raised = false, bare = false, onClick, sx, ...rest
}: CharacterCardProps) {
  const origins = preferLocal ? [cardSet.localPrefix, ...cardSet.origins] : cardSet.origins;
  const [originIndex, setOriginIndex] = useState(0);
  useEffect(() => setOriginIndex(0), [cardSet.id, file, preferLocal]);

  const isPlaceholder = state === "placeholder" || !file;
  const origin = origins[Math.min(originIndex, origins.length - 1)] ?? cardSet.origins[0]!;
  // `bare` 的 normal 态就是一张白底卡（用户要求：卡牌只保留一层白色背景）
  const background = isCheat()
    ? randomColor(0.5, 1)
    : bare && state === "normal" ? CardColors.Normal : COLOR_BY_STATE[state];
  const grayscale = GRAYSCALE.includes(state);
  const rotation = glitch && !isPlaceholder ? glitchTilt(file) : 0;

  return (
    <Paper
      elevation={bare ? 0 : 2}
      onClick={onClick}
      data-testid={rest["data-testid"]}
      sx={{
        width,
        backgroundColor: background,
        borderRadius: bare ? CARD_BORDER_RADIUS : undefined,
        border: isPlaceholder ? "2px dashed gray" : "none",
        cursor: onClick ? "pointer" : "default",
        transition: "transform 0.3s ease, background-color 0.3s ease, filter 0.3s ease",
        transform: `${rotation ? `rotate(${rotation}deg)` : ""}${raised ? " translateY(-10%)" : ""}`.trim() || "none",
        fontFamily: NoFontFamily,
        ...sx,
      }}
    >
      <Box sx={{ width: "100%", position: "relative", aspectRatio: CardAspectRatio }}>
        {!isPlaceholder && (
          <Box
            component="img"
            src={cardUrl(cardSet, file, origin)}
            alt={file}
            draggable={false}
            onError={() => setOriginIndex((index) => index + 1)}
            sx={{
              width: "100%",
              height: "100%",
              position: "absolute",
              inset: 0,
              objectFit: "contain",
              userSelect: "none",
              filter: grayscale ? "grayscale(100%)" : "none",
            }}
          />
        )}
      </Box>
    </Paper>
  );
}

/** 记忆化：卡面在一个页面里可能同时存在上百张（牌桌 / 选卡面板 / 轮播），
 *  状态没变就不该重渲染（点一个开关把整屏卡都重画一遍会产生 click 长任务）。 */
export const CharacterCard = memo(CharacterCardInner);
