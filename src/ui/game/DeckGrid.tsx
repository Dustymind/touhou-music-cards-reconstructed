/** 牌库网格：自己的牌正放，对手的旋转 180°；点击出牌。 */
import { Box, Paper } from "@mui/material";

import type { CardSetRecord } from "../../data/types";
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
  /** 彩蛋：答案卡的槽位（会在它周围画一圈色块） */
  cheatSlot?: number | null;
  /** `?g=`：卡片随机倾斜 */
  glitch?: boolean;
  testId?: string;
}

export function DeckGrid(props: DeckGridProps) {
  const {
    deck, rows, columns, cardSet, cardFiles, width, upsideDown, interactive, cardStateOf,
    onCardClick, onEmptyClick,
  } = props;

  return (
    <Box
      data-testid={props.testId}
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
            sx={{
              p: "2px",
              position: "relative",
              cursor: interactive ? "pointer" : "default",
              transform: upsideDown ? "rotate(180deg)" : "none",
            }}
          >
            <CharacterCard
              cardSet={cardSet}
              file={file}
              state={state}
              width={`${width - 8}px`}
              glitch={Boolean(props.glitch) && Boolean(card)}
            />
            {card && props.cheatSlot === slot && (
              <CheatRect width={width - 8} height={(width - 8) / 0.703} />
            )}
          </Paper>
        );
      })}
    </Box>
  );
}
