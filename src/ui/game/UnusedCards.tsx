/** 未使用卡牌区：卡池里还没进任何牌库/收集区的卡，点一张就放进自己的卡组（上游 `GameUnusedCards`）。
 *
 * 上游是拖拽（拖进牌位，点一下则落进第一个空位）；这里沿用本项目的点击式交互，
 * 行为与上游的"点击"分支一致（见 `docs/DECISIONS.md` D18）。
 */
import { Box, Paper, Typography } from "@mui/material";
import { useState } from "react";

import type { CardSetRecord } from "../../data/types";
import type { CardInfo } from "../../game/types";
import { DRAG_MIME } from "../../game/drag";
import { t, Localization } from "../../i18n/localization";
import { CharacterCard, type CardState } from "../components/CharacterCard";

export interface UnusedCardsProps {
  cards: readonly CardInfo[];
  cardSet: CardSetRecord;
  cardFiles: Record<string, string[]>;
  /** 卡片宽度（px） */
  width: number;
  /** 点一张卡 → 放进自己的卡组 */
  onPick: (card: CardInfo) => void;
  /** 开始拖一张卡 */
  onCardDragStart?: (card: CardInfo) => void;
  /** 把牌库里的卡拖回这里 = 拿出来 */
  onDropCard?: () => void;
  /** 只有选牌阶段能改卡组 */
  interactive: boolean;
  /** 卡池为空时也显示标题，方便看出"没牌可加" */
  testId?: string;
}

export function UnusedCards(props: UnusedCardsProps) {
  const { cards, cardSet, cardFiles, width, onPick, interactive, onCardDragStart, onDropCard } = props;
  const [over, setOver] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <Box
      sx={{ mt: 1.5 }}
      data-testid={props.testId ?? "unused-cards"}
      // 和 DeckGrid 一样把宽度挂出来：jsdom 没有布局，测试只能这么读
      data-card-width={width}
      onDragOver={(event) => {
        if (!onDropCard) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        if (!onDropCard) return;
        event.preventDefault();
        setOver(false);
        onDropCard();
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {t(Localization.GameUnusedCards, { count: String(cards.length) })}
      </Typography>
      {interactive && (
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          {t(Localization.GameDeckBuildHint)}
        </Typography>
      )}
      {/* 卡池可能有上百张，横着滚一屏就够了 */}
      <Box
        sx={{
          display: "flex", gap: "4px", overflowX: "auto", py: 0.5, minHeight: width + 8,
          borderRadius: 1,
          outline: over ? "2px dashed" : "none",
          outlineColor: "primary.main",
          outlineOffset: "-2px",
        }}
      >
        {cards.map((card) => (
          <Paper
            key={`${card.characterKey}-${card.cardIndex}`}
            variant="outlined"
            data-testid={`unused-card-${card.characterKey}-${card.cardIndex}`}
            onMouseEnter={() => setHovered(`${card.characterKey}-${card.cardIndex}`)}
            onMouseLeave={() => setHovered((current) =>
              (current === `${card.characterKey}-${card.cardIndex}` ? null : current))}
            onClick={() => { if (interactive) onPick(card); }}
            draggable={interactive && Boolean(onCardDragStart)}
            onDragStart={(event) => {
              event.dataTransfer.setData(DRAG_MIME, "card");
              event.dataTransfer.effectAllowed = "move";
              onCardDragStart?.(card);
            }}
            sx={{ p: "2px", width: `${width}px`, flex: "0 0 auto", cursor: interactive ? "grab" : "default" }}
          >
            <CharacterCard
              cardSet={cardSet}
              file={cardFiles[card.characterKey]?.[card.cardIndex] ?? ""}
              state={"normal" as CardState}
              width="100%"
              // hover 抬起：与牌桌/播放页同一套动效（CharacterCard 自带 transform 过渡）
              raised={hovered === `${card.characterKey}-${card.cardIndex}`}
            />
          </Paper>
        ))}
      </Box>
    </Box>
  );
}
