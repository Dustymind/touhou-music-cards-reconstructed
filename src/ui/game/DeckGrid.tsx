/** 牌库网格：自己的牌正放，对手的旋转 180°；点击出牌，也可以拖动摆放（对齐上游拖拽）。 */
import { Box, Paper } from "@mui/material";
import { useState } from "react";

import type { CardSetRecord } from "../../data/types";
import { DRAG_MIME } from "../../game/drag";
import type { CardInfo, Slot } from "../../game/types";
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

export function DeckGrid(props: DeckGridProps) {
  const {
    deck, rows, columns, cardSet, cardFiles, width, upsideDown, interactive, cardStateOf,
    onCardClick, onEmptyClick, draggable, onCardDragStart, onSlotDrop,
  } = props;
  const [dropSlot, setDropSlot] = useState<number | null>(null);

  return (
    <Box
      data-testid={props.testId}
      // jsdom 没有布局，卡片宽度只能这样被测试读到（与 `net-digest` 的 data-digest 同一套路）
      data-card-width={width}
      sx={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, ${width}px)`,
        gridTemplateRows: `repeat(${rows}, auto)`,
        gap: "4px",
        justifyContent: "center",
      }}
    >
      {Array.from({ length: rows * columns }).map((_unused, slot) => {
        const card: CardInfo | null = deck[slot] ?? null;
        const state: CardState = card ? (cardStateOf?.(card) ?? "normal") : "placeholder";
        const file = card ? (cardFiles[card.characterKey]?.[card.cardIndex] ?? "") : "";
        const canDrag = Boolean(draggable && card);
        return (
          <Paper
            key={slot}
            variant="outlined"
            data-testid={card ? `${props.testId}-card-${slot}` : `${props.testId}-empty-${slot}`}
            onClick={() => {
              if (!interactive) return;
              if (card) onCardClick?.(slot, card);
              else onEmptyClick?.(slot);
            }}
            draggable={canDrag}
            onDragStart={(event) => {
              if (!canDrag || !card) return;
              // Firefox 需要 setData 才会真的开始拖
              event.dataTransfer.setData(DRAG_MIME, "card");
              event.dataTransfer.effectAllowed = "move";
              onCardDragStart?.(slot, card);
            }}
            onDragOver={(event) => {
              if (!onSlotDrop) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              if (dropSlot !== slot) setDropSlot(slot);
            }}
            onDragLeave={() => setDropSlot((current) => (current === slot ? null : current))}
            onDrop={(event) => {
              if (!onSlotDrop) return;
              event.preventDefault();
              setDropSlot(null);
              onSlotDrop(slot);
            }}
            sx={{
              p: "2px",
              position: "relative",
              cursor: interactive ? "pointer" : canDrag ? "grab" : "default",
              transform: upsideDown ? "rotate(180deg)" : "none",
              outline: dropSlot === slot ? "2px dashed" : "none",
              outlineColor: "primary.main",
              outlineOffset: "-2px",
            }}
          >
            {/* 内层填满槽位（`p: 2px` → 内容宽 = 宽度 - 4），未使用卡牌区用同样的算法 */}
            <CharacterCard
              cardSet={cardSet}
              file={file}
              state={state}
              width="100%"
              glitch={Boolean(props.glitch) && Boolean(card)}
            />
            {card && props.cheatSlot === slot && (
              <CheatRect width={width - 4} height={(width - 4) / 0.703} />
            )}
          </Paper>
        );
      })}
    </Box>
  );
}
