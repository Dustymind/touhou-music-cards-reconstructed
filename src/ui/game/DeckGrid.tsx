/** 牌库网格：自己的牌正放，对手的旋转 180°。
 *
 * 两层结构（对齐上游 canvas 的做法）：
 * - 底层是"格子"：空位虚线框、点击落点、拖放落点；
 * - 上层是"卡牌层"：每张卡按 `key = 角色-卡序` 持续存在，用绝对定位的 `left/top` 过渡滑到新格子。
 *
 * 之所以不直接用 CSS Grid 摆卡：`key` 绑在格子上的话，卡一换格子就是**另一个 DOM 节点**，
 * 没法做"牌滑过去"的动效（上游每张卡都是常驻元素 + `transition: left/top`，同一效果）。
 * 卡片自身的 hover 抬起/底色过渡由 `CharacterCard` 负责（上游 `transition: transform/background-color/filter`）。
 */
import { Box } from "@mui/material";
import { useState } from "react";

import type { CardSetRecord } from "../../data/types";
import { DRAG_MIME } from "../../game/drag";
import type { CardInfo, Slot } from "../../game/types";
import { CardAspectRatio } from "../../theme/theme";
import { CharacterCard, type CardState } from "../components/CharacterCard";
import { CheatRect } from "./CheatRect";

export interface DeckGridProps {
  deck: readonly Slot[];
  rows: number;
  columns: number;
  cardSet: CardSetRecord;
  /** 角色 key → 卡面文件名（来自数据） */
  cardFiles: Record<string, string[]>;
  width: number;
  upsideDown?: boolean;
  interactive?: boolean;
  /** 由**牌本身**决定状态（抢对的绿、抢错的红）；同一张卡在两侧都会染色 */
  cardStateOf?: (card: CardInfo | null) => CardState;
  onCardClick?: (slot: number, card: CardInfo) => void;
  onEmptyClick?: (slot: number) => void;
  /** 这一侧的牌能不能被拖走（选牌阶段自己的牌可以，交牌阶段也可以） */
  draggable?: boolean;
  onCardDragStart?: (slot: number, card: CardInfo) => void;
  /** 拖到某个槽位（空格子也能接） */
  onSlotDrop?: (slot: number) => void;
  /** 彩蛋：答案卡的槽位（会在它周围画一圈色块） */
  cheatSlot?: number | null;
  /** `?g=`：卡片随机倾斜 */
  glitch?: boolean;
  testId?: string;
}

/** 与上游 `canvasSpacing` 同量级；网格 gap 保持一致。 */
const GAP = 4;

export function DeckGrid(props: DeckGridProps) {
  const {
    deck, rows, columns, cardSet, cardFiles, width, upsideDown, interactive, cardStateOf,
    onCardClick, onEmptyClick, draggable, onCardDragStart, onSlotDrop,
  } = props;
  const [dropSlot, setDropSlot] = useState<number | null>(null);

  const cardHeight = width / CardAspectRatio;
  const total = rows * columns;
  const keyOf = (card: CardInfo): string => `${card.characterKey}-${card.cardIndex}`;
  const left = (slot: number): number => (slot % columns) * (width + GAP);
  const top = (slot: number): number => Math.floor(slot / columns) * (cardHeight + GAP);

  const dragOver = (slot: number) => (event: React.DragEvent): void => {
    if (!onSlotDrop) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dropSlot !== slot) setDropSlot(slot);
  };
  const dropOn = (slot: number) => (event: React.DragEvent): void => {
    if (!onSlotDrop) return;
    event.preventDefault();
    setDropSlot(null);
    onSlotDrop(slot);
  };

  return (
    <Box
      data-testid={props.testId}
      // jsdom 没有布局，卡片宽度只能这样被测试读到（与 `net-digest` 的 data-digest 同一套路）
      data-card-width={width}
      sx={{
        position: "relative",
        width: columns * width + (columns - 1) * GAP,
        height: rows * cardHeight + (rows - 1) * GAP,
        transform: upsideDown ? "rotate(180deg)" : "none",
      }}
    >
      {/* 格子层：空位样式、点击与拖放落点 */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, ${width}px)`,
          gridTemplateRows: `repeat(${rows}, ${cardHeight}px)`,
          gap: `${GAP}px`,
        }}
      >
        {Array.from({ length: total }).map((_unused, slot) => {
          const occupied = (deck[slot] ?? null) !== null;
          // 有卡的位置不留底、不描边（卡面自己就是画面）；空位只留一个虚线框当落点提示，
          // 且**不做悬浮动效**（用户要求：游戏盘卡槽不需要光标悬浮效果）
          return (
            <Box
              key={slot}
              data-testid={occupied ? undefined : `${props.testId}-empty-${slot}`}
              onClick={() => {
                if (!interactive || occupied) return;
                onEmptyClick?.(slot);
              }}
              onDragOver={dragOver(slot)}
              onDragLeave={() => setDropSlot((current) => (current === slot ? null : current))}
              onDrop={dropOn(slot)}
              sx={{
                border: occupied ? "none" : "1px dashed",
                borderColor: "divider",
                borderRadius: "4px",
                // 拖拽时的落点提示（只在真的拖着东西时出现，不是 hover 动效）
                outline: dropSlot === slot ? "2px dashed" : "none",
                outlineColor: "primary.main",
                outlineOffset: "-2px",
              }}
            />
          );
        })}
      </Box>

      {/* 卡牌层：常驻元素 + left/top 过渡 = 移动时滑过去 */}
      <Box sx={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {deck.map((card, slot) => {
          if (!card) return null;
          const key = keyOf(card);
          const canDrag = Boolean(draggable);
          return (
            <Box
              key={key}
              data-testid={`${props.testId}-card-${slot}`}
              // 同一张卡换格子时是**同一个 DOM 节点**（动画的前提），测试用这两个属性锁住
              data-card-key={key}
              data-slot={slot}
              onClick={() => {
                if (!interactive) return;
                onCardClick?.(slot, card);
              }}
              draggable={canDrag}
              onDragStart={(event) => {
                if (!canDrag) return;
                // Firefox 需要 setData 才会真的开始拖
                event.dataTransfer.setData(DRAG_MIME, "card");
                event.dataTransfer.effectAllowed = "move";
                onCardDragStart?.(slot, card);
              }}
              onDragOver={dragOver(slot)}
              onDragEnd={() => setDropSlot(null)}
              onDrop={dropOn(slot)}
              sx={{
                position: "absolute",
                left: left(slot),
                top: top(slot),
                width,
                // 牌库变化时"滑"到新格子（上游 `transition: left/top 0.3s ease`）
                transition: "left 0.4s ease, top 0.4s ease",
                pointerEvents: "auto",
                cursor: interactive ? "pointer" : canDrag ? "grab" : "default",
                outline: dropSlot === slot ? "2px dashed" : "none",
                outlineColor: "primary.main",
                outlineOffset: "-2px",
              }}
            >
              <CharacterCard
                cardSet={cardSet}
                file={cardFiles[card.characterKey]?.[card.cardIndex] ?? ""}
                state={cardStateOf?.(card) ?? "normal"}
                width="100%"
                glitch={Boolean(props.glitch)}
                // 牌桌上的卡也不要白底纸框：透明底 + 状态描边（抢对的绿/抢错的红变成圈）
                bare
              />
              {props.cheatSlot === slot && (
                <CheatRect width={width - 4} height={(width - 4) / CardAspectRatio} />
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
