/** 可拖动滑块的卡片长条：游戏卡槽与播放页"接下来"共用。
 *
 * 版式照上游 `GameTab.tsx` 的 "Card Selection Slider"：卡片等距排成一条（本项目**不重叠**，
 * 用户要求），窗口宽度固定、卡片超出部分裁掉；下方一个 MUI `Slider`（`min 0 / max 1 / step 0.001`）
 * 拖动它平移整条卡槽：`offset = -sliderValue * (totalWidth - visibleWidth)`。
 * 滑块与卡条同宽、位于卡条**下方**，所以不会遮挡卡片。
 * Hover 只改背景色（不做抬起位移）。
 */
import { Box, Slider } from "@mui/material";
import { useState } from "react";

import type { CardSetRecord } from "../../data/types";
import { DRAG_MIME } from "../../game/drag";
import { CardAspectRatio } from "../../theme/theme";
import { CharacterCard, type CardState } from "./CharacterCard";

export interface StripCard {
  /** 稳定 id：`角色-卡序` */
  id: string;
  characterKey: string;
  cardIndex: number;
  file: string;
  /** 常态底色 */
  state: CardState;
  /** hover 时的底色（游戏卡槽是 `hover`，播放页禁用项是 `disabledHover`） */
  hoverState?: CardState;
}

export interface CardStripProps {
  cards: readonly StripCard[];
  cardSet: CardSetRecord;
  /** 卡片宽度（px） */
  width: number;
  /** 可视窗口宽度（游戏 = 牌桌宽；播放页 = 容器宽） */
  visibleWidth: number;
  /** 卡与卡的间距 */
  gap?: number;
  interactive: boolean;
  /** 滑块的 aria-label */
  sliderLabel: string;
  /** 根节点的 data-testid（`data-pan` / `data-pan-offset` / `data-card-width` 都挂在这里） */
  testId: string;
  /** 卡条容器与滑块的 data-testid（默认由 `testId` 派生） */
  stripTestId?: string;
  sliderTestId?: string;
  /** 每张卡的 data-testid 前缀（`<prefix>-<角色>-<卡序>`） */
  cardTestIdPrefix: string;
  onCardClick?: (card: StripCard) => void;
  draggable?: boolean;
  onCardDragStart?: (card: StripCard) => void;
  /** 拖放落点（游戏卡槽用来接收"拖回来的卡"） */
  dropActive?: boolean;
}

export interface StripLayout {
  step: number;
  totalWidth: number;
  maxOffset: number;
}

/** 等距排布：`step = 卡宽 + 间距`；总宽 = 首张 + 其余每张一个 step。 */
export function stripLayout(count: number, width: number, gap: number, visibleWidth: number): StripLayout {
  const step = width + gap;
  const totalWidth = width + Math.max(0, count - 1) * step;
  return { step, totalWidth, maxOffset: Math.max(0, totalWidth - visibleWidth) };
}

export function CardStrip(props: CardStripProps) {
  const {
    cards, cardSet, width, visibleWidth, gap = 6, interactive, sliderLabel, testId, cardTestIdPrefix,
  } = props;
  const stripTestId = props.stripTestId ?? `${testId}-strip`;
  const sliderTestId = props.sliderTestId ?? `${testId}-slider`;
  const [hovered, setHovered] = useState<string | null>(null);
  const [slider, setSlider] = useState(0);

  const { step, maxOffset } = stripLayout(cards.length, width, gap, visibleWidth);
  const offset = -slider * maxOffset;

  return (
    <Box
      data-testid={testId}
      // 和 DeckGrid 一样把宽度挂出来：jsdom 没有布局，测试只能这么读
      data-card-width={width}
      data-pan={slider.toFixed(3)}
      data-pan-offset={Math.round(offset)}
    >
      <Box
        data-testid={stripTestId}
        sx={{
          position: "relative",
          width: visibleWidth,
          height: width / CardAspectRatio,
          overflow: "hidden",
          mx: "auto",
          outline: props.dropActive ? "2px dashed" : "none",
          outlineColor: "primary.main",
          outlineOffset: "-2px",
        }}
      >
        {cards.map((card, index) => {
          const hoveredHere = hovered === card.id;
          return (
            <Box
              key={card.id}
              data-testid={`${cardTestIdPrefix}-${card.id}`}
              onMouseEnter={() => setHovered(card.id)}
              onMouseLeave={() => setHovered((current) => (current === card.id ? null : current))}
              onClick={() => { if (interactive) props.onCardClick?.(card); }}
              draggable={Boolean(props.draggable)}
              onDragStart={(event) => {
                if (!props.draggable) return;
                event.dataTransfer.setData(DRAG_MIME, "card");
                event.dataTransfer.effectAllowed = "move";
                props.onCardDragStart?.(card);
              }}
              sx={{
                position: "absolute",
                left: index * step + offset,
                top: 0,
                width,
                zIndex: cards.length - index,
                cursor: interactive ? "grab" : "default",
                transition: "left 0.3s ease",
              }}
            >
              <CharacterCard
                cardSet={cardSet}
                file={card.file}
                state={hoveredHere ? card.hoverState ?? "hover" : card.state}
                width="100%"
                bare
              />
            </Box>
          );
        })}
      </Box>

      {interactive && (
        <Slider
          data-testid={sliderTestId}
          aria-label={sliderLabel}
          min={0}
          max={1}
          step={0.001}
          value={slider}
          onChange={(_event, value) => setSlider(value as number)}
          sx={{ width: visibleWidth, mx: "auto", display: "block", mt: 0.5 }}
        />
      )}
    </Box>
  );
}
