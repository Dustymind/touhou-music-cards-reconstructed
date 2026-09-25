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
import { memo, useCallback, useEffect, useRef, useState } from "react";

import type { CardSetRecord } from "../../data/types";
import { DRAG_MIME } from "../../game/drag";
import { CardAspectRatio } from "../../theme/theme";
import { MD2_BORDER } from "../../theme/theme";
import { CARD_BORDER_RADIUS, CharacterCard, type CardState } from "./CharacterCard";

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
  /** 此刻不能选（曲目互斥被挡，D108）：不响应点击与拖拽，光标 `not-allowed` */
  disabled?: boolean;
}

interface CardStripProps {
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

interface StripLayout {
  step: number;
  totalWidth: number;
  maxOffset: number;
}

/** MUI 默认滑块拇指直径 20px → 半径 10px；滑轨两端各内缩这么多，
 *  推到 0 / 1 时拇指外缘正好与卡牌显示区的左右边界齐平。 */
const SLIDER_THUMB_RADIUS = 10;

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
  const disabled = Boolean(card.disabled);
  return (
    <Box
      data-testid={testId}
      data-disabled={disabled ? "true" : undefined}
      onMouseEnter={() => props.onHover(card.id)}
      onMouseLeave={() => props.onHover(null)}
      onClick={() => { if (interactive && !disabled) props.onClick(card); }}
      draggable={draggable && !disabled}
      onDragStart={(event) => {
        if (!draggable || disabled) return;
        event.dataTransfer.setData(DRAG_MIME, "card");
        event.dataTransfer.effectAllowed = "move";
        props.onDragStart(card);
      }}
      sx={{
        position: "absolute",
        left,
        top: 0,
        width,
        cursor: disabled ? "not-allowed" : interactive ? "grab" : "default",
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
  const stripRef = useRef<HTMLDivElement | null>(null);
  /** 卡条**实际**渲染宽度：外面可能因为 `max-width: 100%` 把它压窄，
   *  滑块必须按实际宽度内缩，否则拇指会探出卡片边缘。 */
  const [stripWidth, setStripWidth] = useState(visibleWidth);

  // 回调放进 ref：卡片是 memo 的，父组件每次渲染都换新函数会把它全部打回重渲染
  const clickRef = useRef(props.onCardClick);
  clickRef.current = props.onCardClick;
  const dragRef = useRef(props.onCardDragStart);
  dragRef.current = props.onCardDragStart;
  const handleClick = useCallback((card: StripCard) => clickRef.current?.(card), []);
  const handleDragStart = useCallback((card: StripCard) => dragRef.current?.(card), []);
  const handleHover = useCallback((id: string | null) => setHovered(id), []);

  useEffect(() => {
    const element = stripRef.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => setStripWidth(element.clientWidth));
    observer.observe(element);
    setStripWidth(element.clientWidth);
    return () => observer.disconnect();
  }, [visibleWidth]);

  const { step, maxOffset } = stripLayout(cards.length, width, gap, stripWidth);
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
          borderColor: MD2_BORDER,
          borderRadius: 1,
          // 上下留 4px；左右留 12px：MUI 滑块拇指半径 10px，否则推到两端会顶出边框
          py: 0.5,
          px: 1.5,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          maxWidth: "100%",
        }}
      >
        <Box
          data-testid={stripTestId}
          ref={stripRef}
          sx={{
            position: "relative",
            width: visibleWidth,
            height: width / CardAspectRatio,
            maxWidth: "100%",
            overflow: "hidden",
            // 与卡牌同款圆角：滚动到边界时被裁掉的卡片不会露出直角
            borderRadius: CARD_BORDER_RADIUS,
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
          // 自绘滑轨 + MUI 滑块：滑轨**与卡牌显示区左右边界齐平**（原生滚动条那种"轨 + 钮"），
          // 滑块本体两端各内缩一个拇指半径，于是拇指外缘也正好落在同一条线上。
          <Box
            sx={{
              position: "relative",
              width: stripWidth,
              maxWidth: "100%",
              mx: "auto",
              mt: 0.5,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <Box
              data-testid={`${sliderTestId}-rail`}
              sx={{
                position: "absolute",
                left: 0,
                right: 0,
                top: "50%",
                height: 4,
                borderRadius: 2,
                backgroundColor: "primary.main",
                opacity: 0.35,
                transform: "translateY(-50%)",
              }}
            />
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
              sx={{
                position: "relative",
                // 按卡条实际宽度内缩一个拇指半径：拇指外缘与卡片边缘齐平
                width: Math.max(40, stripWidth - SLIDER_THUMB_RADIUS * 2),
                maxWidth: "100%",
                // MUI 自带的轨与进度条会短一个拇指半径，这里藏掉，用上面那条自绘滑轨
                "& .MuiSlider-rail": { display: "none" },
                "& .MuiSlider-track": { display: "none" },
                // 单击/悬停/拖动都不留光圈（MUI 的 ripple 画在拇指的 box-shadow 上）；
                // 只保留键盘 focus-visible 的提示，鼠标操作完不会常驻一圈
                "& .MuiSlider-thumb": {
                  "&:hover, &.Mui-active": { boxShadow: "none" },
                },
              }}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}
