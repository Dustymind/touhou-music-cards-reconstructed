/** 牌库网格：自己的牌正放，对手的旋转 180°；点击出牌。 */
import { Box, Paper } from "@mui/material";

import type { CardSetRecord } from "../../data/types";
import type { CardInfo, Slot } from "../../game/types";
import { CharacterCard, type CardState } from "../components/CharacterCard";

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
  /** `slot → 状态`（抢对的绿、抢错的红） */
  cardStates?: Record<number, CardState>;
  onCardClick?: (slot: number, card: CardInfo) => void;
  onEmptyClick?: (slot: number) => void;
  testId?: string;
}

export function DeckGrid(props: DeckGridProps) {
  const {
    deck, rows, columns, cardSet, cardFiles, width, upsideDown, interactive, cardStates,
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
        const state: CardState = card ? (cardStates?.[slot] ?? "normal") : "placeholder";
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
              cursor: interactive ? "pointer" : "default",
              transform: upsideDown ? "rotate(180deg)" : "none",
            }}
          >
            <CharacterCard cardSet={cardSet} file={file} state={state} width={`${width - 8}px`} />
          </Paper>
        );
      })}
    </Box>
  );
}
