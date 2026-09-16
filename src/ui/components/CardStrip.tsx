/** 可拖动滑块的卡片长条：游戏卡槽与播放页"接下来"共用。
 *
 * 版式照上游 `GameTab.tsx` 的 "Card Selection Slider"：卡片等距排成一条（本项目**不重叠**，
 * 用户要求），窗口宽度固定、卡片超出部分裁掉；下方一个 MUI `Slider`（`min 0 / max 1 / step 0.001`）
 * 拖动它平移整条卡槽：`offset = -sliderValue * (totalWidth - visibleWidth)`。
 * 滑块与卡条同宽、位于卡条**下方**，所以不遮挡卡片；整块套一个外框并居中。
 * Hover 只改背景色（不做抬起位移）。
 *
 * 性能：卡片位置是**静态**的（`left = 序号 × step` 永不变化），平移只用**一个** `translateX`
 * 加在整行上；拖动时先把 transform 直接写到 DOM（`ref`），React 侧只在拖动结束提交一次，
 * 加上卡片组件 `memo`，所以拖滑块不会触发上百个卡片节点重排/重渲染。
 */
import { Box, Slider } from "@mui/material";
import { memo, useCallback, useRef, useState } from "react";

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

interface StripCardViewProps {
  card: StripCard;
  cardSet: CardSetRecord;
  width: number;
  left: number;
  interactive: boolean;
  draggable: boolean;
  hovered: boolean;
  testId: string;
  onHover: (id: string | null) => void;
  onClick: (card: StripCard) => void;
  onDragStart: (card: StripCard) => void;
}

/** 单张卡：`memo` 之后，拖滑块（父组件重渲染）不会重新渲染卡片内容。 */
const StripCardView = memo(function StripCardView(props: StripCardViewProps) {
  const { card, cardSet, width, left, interactive, draggable, hovered, testId } = props;
  return (
    <Box
      data-testid={testId}
      onMouseEnter={() => props.onHover(card.id)}
      onMouseLeave={() => props.onHover(null)}
      onClick={() => { if (interactive) props.onClick(card); }}
      draggable={draggable}
      onDragStart={(event) => {
        if (!draggable) return;
        event.dataTransfer.setData(DRAG_MIME, "card");
        event.dataTransfer.effectAllowed = "move";
        props.onDragStart(card);
      }}
      sx={{
        position: "absolute",
        left,
        top: 0,
        width,
        cursor: interactive ? "grab" : "default",
      }}
    >
      <CharacterCard
        cardSet={cardSet}
        file={card.file}
        state={hovered ? card.hoverState ?? "hover" : card.state}
        width="100%"
        bare
      />
    </Box>
  );
});

export function CardStrip(props: CardStripProps) {
  const {
    cards, cardSet, width, visibleWidth, gap = 6, interactive, sliderLabel, testId, cardTestIdPrefix,
  } = props;
  const stripTestId = props.stripTestId ?? `${testId}-strip`;
  const sliderTestId = props.sliderTestId ?? `${testId}-slider`;

  const [hovered, setHovered] = useState<string | null>(null);
  const [pan, setPan] = useState(0);
  const [dragging, setDragging] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);

  // 回调放进 ref：卡片是 memo 的，父组件每次渲染都换新函数会把它全部打回重渲染
  const clickRef = useRef(props.onCardClick);
  clickRef.current = props.onCardClick;
  const dragRef = useRef(props.onCardDragStart);
  dragRef.current = props.onCardDragStart;
  const handleClick = useCallback((card: StripCard) => clickRef.current?.(card), []);
  const handleDragStart = useCallback((card: StripCard) => dragRef.current?.(card), []);
  const handleHover = useCallback((id: string | null) => setHovered(id), []);

  const { step, maxOffset } = stripLayout(cards.length, width, gap, visibleWidth);
  const offset = -pan * maxOffset;

  /** 拖动中：直接把 transform 写到 DOM，绕开 React 重渲染；松手后才落状态。 */
  const applyOffset = (value: number, commit: boolean): void => {
    const row = rowRef.current;
    if (row) row.style.transform = `translateX(${-value * maxOffset}px)`;
    if (commit) setPan(value);
  };

  return (
    <Box
      data-testid={testId}
      // 和 DeckGrid 一样把宽度挂出来：jsdom 没有布局，测试只能这么读
      data-card-width={width}
      data-pan={pan.toFixed(3)}
      data-pan-offset={Math.round(offset)}
      sx={{ display: "flex", justifyContent: "center" }}
    >
      {/* 选卡区域：外框 + 居中（用户要求） */}
      <Box
        data-testid={`${testId}-frame`}
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          p: 0.5,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          maxWidth: "100%",
        }}
      >
        <Box
          data-testid={stripTestId}
          sx={{
            position: "relative",
            width: visibleWidth,
            height: width / CardAspectRatio,
            maxWidth: "100%",
            overflow: "hidden",
            outline: props.dropActive ? "2px dashed" : "none",
            outlineColor: "primary.main",
            outlineOffset: "-2px",
          }}
        >
          {/* 整行一个 transform：拖滑块只动这一个节点 */}
          <Box
            ref={rowRef}
            data-testid={`${stripTestId}-row`}
            style={{ transform: `translateX(${offset}px)` }}
            sx={{
              position: "absolute",
              inset: 0,
              willChange: "transform",
              transition: dragging ? "none" : "transform 0.3s ease",
            }}
          >
            {cards.map((card, index) => (
              <StripCardView
                key={card.id}
                card={card}
                cardSet={cardSet}
                width={width}
                left={index * step}
                interactive={interactive}
                draggable={Boolean(props.draggable)}
                hovered={hovered === card.id}
                testId={`${cardTestIdPrefix}-${card.id}`}
                onHover={handleHover}
                onClick={handleClick}
                onDragStart={handleDragStart}
              />
            ))}
          </Box>
        </Box>

        {interactive && (
          <Slider
            data-testid={sliderTestId}
            aria-label={sliderLabel}
            min={0}
            max={1}
            step={0.001}
            value={pan}
            onChange={(_event, value) => {
              setDragging(true);
              applyOffset(value as number, false);
              setPan(value as number);
            }}
            onChangeCommitted={(_event, value) => {
              setDragging(false);
              applyOffset(value as number, true);
            }}
            sx={{ width: visibleWidth, maxWidth: "100%", display: "block", mt: 0.5 }}
          />
        )}
      </Box>
    </Box>
  );
}
