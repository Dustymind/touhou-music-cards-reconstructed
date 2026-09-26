/** 角色卡：远程图集 + 多 origin 兜底 + 状态底色（对齐上游 `CharacterCard`）。 */
import { Box, Paper, type SxProps } from "@mui/material";
import { memo, useEffect, useState } from "react";

import type { CardSetRecord } from "../../data/types";
import { isCardUrl } from "../../data/cardFaces";
import { cardAspectRatio } from "../../theme/cardRatio";
import { CardColors, MD2, MD2_SLOT, NoFontFamily } from "../../theme/theme";
import { glitchTilt, isCheat, randomColor } from "../../cheat";

/** 卡面圆角：卡牌本体与选卡显示区边界共用（取 MD2 形状规格，避免两处各写一遍）。 */
export const CARD_BORDER_RADIUS = `${MD2.shape}px`;

export type CardState =
  | "normal" | "hover"
  | "disabled" | "disabledHover"
  /** 曲目互斥被挡下的卡（D108）：**保留配色**地压暗，与"真正禁用"的全灰区分开 */
  | "blocked" | "blockedHover"
  | "selected" | "correct" | "incorrect" | "placeholder";

const COLOR_BY_STATE: Record<CardState, string> = {
  placeholder: "transparent",
  normal: CardColors.Normal,
  hover: CardColors.Hover,
  disabled: CardColors.Disabled,
  disabledHover: CardColors.DisabledHover,
  // 底色仍是普通卡的白底：压暗只作用在卡面图上，不把整张卡涂成灰
  blocked: CardColors.Normal,
  blockedHover: CardColors.Hover,
  selected: CardColors.Selected,
  correct: CardColors.Correct,
  incorrect: CardColors.Incorrect,
};

/** 卡面图的滤镜：`disabled` 是全灰（不可用）；`blocked` 只轻度降饱和 + 压暗，
 *  角色配色一眼还认得出（用户要求"不是完全仅黑白灰"）。 */
const IMAGE_FILTER: Partial<Record<CardState, string>> = {
  disabled: "grayscale(100%)",
  disabledHover: "grayscale(100%)",
  blocked: "grayscale(35%) opacity(0.45)",
  blockedHover: "grayscale(35%) opacity(0.6)",
};

/** 图集目录 + 文件名 → 绝对 URL（按 origin 列表拼）。
 *
 *  **源给的卡面**（`sourceOnly`：音MAD 的 B 站封面、模式 3 的清单卡面）是一整条**已经解析好的地址**：
 *  原样返回 —— 既不能拼目录，也不能 `encodeURIComponent`（那会把 `://`、`/`、`@` 全编码掉，
 *  得到一条必然 404 的地址）。模式 3 的卡面可能是 `https://…`（清单写绝对地址），
 *  也可能是 `/…` 或 `a/b.png`（清单写相对路径 ⇒ 应用按**清单自己的目录**解析过，D157）——
 *  后两种都不是"文件名"，只有 `sourceOnly` 这个判据能把它们和内置图集的裸文件名分开。 */
function cardUrl(cardSet: CardSetRecord, file: string, origin: string): string {
  if (cardSet.sourceOnly || isCardUrl(file)) return file;
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
  // 本地图集（无远程 origin）只用 localPrefix；其余图集在"本地优先"时把 localPrefix 排在最前
  const origins = cardSet.localOnly || preferLocal
    ? [cardSet.localPrefix, ...cardSet.origins]
    : cardSet.origins;
  const [originIndex, setOriginIndex] = useState(0);
  useEffect(() => setOriginIndex(0), [cardSet.id, file, preferLocal]);

  const isPlaceholder = state === "placeholder" || !file;
  const origin = origins[Math.min(originIndex, origins.length - 1)] ?? cardSet.localPrefix;
  // `bare` 的 normal 态就是一张白底卡（用户要求：卡牌只保留一层白色背景）
  const background = isCheat()
    ? randomColor(0.5, 1)
    : bare && state === "normal" ? CardColors.Normal : COLOR_BY_STATE[state];
  const imageFilter = IMAGE_FILTER[state] ?? "none";
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
        border: isPlaceholder ? `${MD2_SLOT.width}px dashed` : "none",
        borderColor: MD2_SLOT.color,
        cursor: onClick ? "pointer" : "default",
        transition: "transform 0.3s ease, background-color 0.3s ease, filter 0.3s ease",
        transform: `${rotation ? `rotate(${rotation}deg)` : ""}${raised ? " translateY(-10%)" : ""}`.trim() || "none",
        fontFamily: NoFontFamily,
        ...sx,
      }}
    >
      {/* 卡面框的形状**跟着图集走**（D163）：内置图集 = 原比例 703:1000 竖版，
          模式 3 的合成图集 = 16:9 横版。取法只有 `cardAspectRatio`，别在这里写死常量。 */}
      <Box sx={{ width: "100%", position: "relative", aspectRatio: cardAspectRatio(cardSet) }}>
        {!isPlaceholder && (
          <Box
            component="img"
            src={cardUrl(cardSet, file, origin)}
            alt={file}
            draggable={false}
            /* B 站图床**按 Referer 拦**：带外部 Referer 一律 403（实测），不带就是 200。
               别的图集（r2bucket / github.io / jsdelivr）不依赖 Referer，所以统一不带最省事。 */
            referrerPolicy="no-referrer"
            onError={() => setOriginIndex((index) => index + 1)}
            sx={{
              width: "100%",
              height: "100%",
              position: "absolute",
              inset: 0,
              // 源给的图（音MAD 的 B 站封面、模式 3 的清单卡面）用 `cover` 铺满框：
              // 比例对了就是满的，比例不对也不留白边（居中裁掉多余的部分）。
              // 使用者自己放的那几套（localOnly）一旦切了档也是同一条：**运行时裁切**，
              // 而不是留白（否则切 16:9 会得到左右两条白边）。
              // 内置六套永远是 `contain`（不能换档）：那是整套立绘，宁可留白也不许裁。
              objectFit: cardSet.sourceOnly || cardSet.ratio !== undefined ? "cover" : "contain",
              userSelect: "none",
              filter: imageFilter,
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
