/** 未使用卡牌区：卡池里还没进任何牌库/收集区的卡。
 *
 * 滚动方式照抄上游 `GameTab.tsx`：卡片是一条**互相叠 30%** 的长条，
 * 下方一个 MUI `Slider`（上游的 "Card Selection Slider"）拖动它横向平移整条卡槽：
 * `offset = -sliderValue * (totalWidth - visibleWidth)`。
 * 滑块放在卡条**下面**、与卡条同宽，所以不会挡住卡槽。
 */
import { Box, Slider, Typography } from "@mui/material";
import { useState } from "react";

import type { CardSetRecord } from "../../data/types";
import type { CardInfo } from "../../game/types";
import { DRAG_MIME } from "../../game/drag";
import { CardAspectRatio } from "../../theme/theme";
import { t, Localization } from "../../i18n/localization";
import { CharacterCard, type CardState } from "../components/CharacterCard";

export interface UnusedCardsProps {
  cards: readonly CardInfo[];
  cardSet: CardSetRecord;
  cardFiles: Record<string, string[]>;
  /** 卡片宽度（px） */
  width: number;
  /** 可视窗口宽度（= 牌桌宽度，上游用的也是 `deckWidth`） */
  visibleWidth: number;
  /** 点一张卡 → 放进自己的卡组 */
  onPick: (card: CardInfo) => void;
  /** 开始拖一张卡 */
  onCardDragStart?: (card: CardInfo) => void;
  /** 把牌库里的卡拖回这里 = 拿出来 */
  onDropCard?: () => void;
  /** 只有选牌阶段能改卡组 */
  interactive: boolean;
  testId?: string;
}

/** 上游 `cardSelectionOverlap = cardWidth * 0.3`。 */
const OVERLAP_RATIO = 0.3;

export function UnusedCards(props: UnusedCardsProps) {
  const {
    cards, cardSet, cardFiles, width, visibleWidth, onPick, interactive, onCardDragStart, onDropCard,
  } = props;
  const [over, setOver] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [slider, setSlider] = useState(0);

  const step = width * (1 - OVERLAP_RATIO);
  const totalWidth = width + Math.max(0, cards.length - 1) * step;
  const maxOffset = Math.max(0, totalWidth - visibleWidth);
  const offset = -slider * maxOffset;

  return (
    <Box
      sx={{ mt: 1.5 }}
      data-testid={props.testId ?? "unused-cards"}
      // 和 DeckGrid 一样把宽度挂出来：jsdom 没有布局，测试只能这么读
      data-card-width={width}
      data-pan={slider.toFixed(3)}
      data-pan-offset={Math.round(offset)}
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

      {/* 卡条：与牌桌同宽、居中；卡片叠 30%，靠下面的滑块平移 */}
      <Box
        data-testid="unused-cards-strip"
        sx={{
          position: "relative",
          width: visibleWidth,
          height: width / CardAspectRatio,
          overflow: "hidden",
          mx: "auto",
          outline: over ? "2px dashed" : "none",
          outlineColor: "primary.main",
          outlineOffset: "-2px",
        }}
      >
        {cards.map((card, index) => {
          const id = `${card.characterKey}-${card.cardIndex}`;
          return (
            <Box
              key={id}
              data-testid={`unused-card-${id}`}
              onMouseEnter={() => setHovered(id)}
              onMouseLeave={() => setHovered((current) => (current === id ? null : current))}
              onClick={() => { if (interactive) onPick(card); }}
              draggable={interactive && Boolean(onCardDragStart)}
              onDragStart={(event) => {
                event.dataTransfer.setData(DRAG_MIME, "card");
                event.dataTransfer.effectAllowed = "move";
                onCardDragStart?.(card);
              }}
              sx={{
                position: "absolute",
                left: index * step + offset,
                top: 0,
                width,
                // 上游 `zIndex = 总数 - 序号`：左边的卡压在右边上面
                zIndex: cards.length - index,
                cursor: interactive ? "grab" : "default",
                transition: "left 0.3s ease",
              }}
            >
              <CharacterCard
                cardSet={cardSet}
                file={cardFiles[card.characterKey]?.[card.cardIndex] ?? ""}
                state={"normal" as CardState}
                width="100%"
                bare
                raised={hovered === id}
              />
            </Box>
          );
        })}
      </Box>

      {/* 上游的 "Card Selection Slider"：拖它平移卡槽；放在卡条下方，不会压住卡片 */}
      {interactive && (
        <Slider
          data-testid="card-selection-slider"
          aria-label={t(Localization.GameCardSelectionSlider)}
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
