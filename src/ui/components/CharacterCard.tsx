/** 角色卡：远程图集 + 多 origin 兜底 + 状态底色（对齐上游 `CharacterCard`）。 */
import { Box, Paper, type SxProps } from "@mui/material";
import { useEffect, useState } from "react";

import type { CardSetRecord } from "../../data/types";
import { CardAspectRatio, CardColors, NoFontFamily } from "../../theme/theme";
import { glitchTilt, isCheat, randomColor } from "../../cheat";

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
export function cardUrl(cardSet: CardSetRecord, file: string, origin: string): string {
  const prefix = origin.endsWith("/") ? origin : `${origin}/`;
  const dir = cardSet.dir.endsWith("/") ? cardSet.dir : `${cardSet.dir}/`;
  return prefix + dir + encodeURIComponent(file);
}

export interface CharacterCardProps {
  cardSet: CardSetRecord;
  file: string;
  width?: string;
  state?: CardState;
  /** 本地优先（用户自己放了图集时） */
  preferLocal?: boolean;
  glitch?: boolean;
  raised?: boolean;
  /** 只要卡面、不要底下的纸框（游戏里的选卡区/播放页牌堆用；底色改成描边圈） */
  bare?: boolean;
  onClick?: () => void;
  sx?: SxProps;
  "data-testid"?: string;
}

export function CharacterCard({
  cardSet, file, width = "100%", state = "normal", preferLocal = false, glitch = false,
  raised = false, bare = false, onClick, sx, ...rest
}: CharacterCardProps) {
  const origins = preferLocal ? [cardSet.localPrefix, ...cardSet.origins] : cardSet.origins;
  const [originIndex, setOriginIndex] = useState(0);
  useEffect(() => setOriginIndex(0), [cardSet.id, file, preferLocal]);

  const isPlaceholder = state === "placeholder" || !file;
  const origin = origins[Math.min(originIndex, origins.length - 1)] ?? cardSet.origins[0]!;
  const background = isCheat() ? randomColor(0.5, 1) : bare ? "transparent" : COLOR_BY_STATE[state];
  const grayscale = GRAYSCALE.includes(state);
  // `bare`：不铺底色，状态改用描边圈表达（不会糊住相邻卡牌的动效）
  const ring = bare && !isPlaceholder && !grayscale && state !== "normal"
    ? `0 0 0 3px ${COLOR_BY_STATE[state]}`
    : undefined;
  const rotation = glitch && !isPlaceholder ? glitchTilt(file) : 0;

  return (
    <Paper
      elevation={bare ? 0 : 2}
      onClick={onClick}
      data-testid={rest["data-testid"]}
      sx={{
        width,
        backgroundColor: background,
        boxShadow: ring,
        borderRadius: bare ? "6px" : undefined,
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
