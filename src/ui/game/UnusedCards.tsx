/** 未使用卡牌区：卡池里还没进任何牌库/收集区的卡。
 *
 * 版式与滚动方式用共享的 `CardStrip`（上游 "Card Selection Slider" 的实现）：
 * 卡片等距排开、不重叠，下方滑块拖动平移整条卡槽，滑块不遮挡卡片。
 */
import { Box, Typography } from "@mui/material";
import { useState } from "react";

import type { CardSetRecord } from "../../data/types";
import type { CardInfo } from "../../game/types";
import { t, Localization } from "../../i18n/localization";
import { CardStrip, type StripCard } from "../components/CardStrip";

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

export function UnusedCards(props: UnusedCardsProps) {
  const {
    cards, cardSet, cardFiles, width, visibleWidth, onPick, interactive, onCardDragStart, onDropCard,
  } = props;
  const [over, setOver] = useState(false);

  const strip: StripCard[] = cards.map((card) => ({
    id: `${card.characterKey}-${card.cardIndex}`,
    characterKey: card.characterKey,
    cardIndex: card.cardIndex,
    file: cardFiles[card.characterKey]?.[card.cardIndex] ?? "",
    // 游戏选卡：hover 只变底色（与播放页一致），不做抬起位移
    state: "normal",
    hoverState: "hover",
  }));

  return (
    <Box
      sx={{ mt: 1.5 }}
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
      <CardStrip
        cards={strip}
        cardSet={cardSet}
        width={width}
        visibleWidth={visibleWidth}
        interactive={interactive}
        sliderLabel={t(Localization.GameCardSelectionSlider)}
        testId="unused-cards"
        stripTestId="unused-cards-strip"
        sliderTestId="card-selection-slider"
        cardTestIdPrefix="unused-card"
        draggable={interactive && Boolean(onCardDragStart)}
        dropActive={over}
        onCardClick={(card) => {
          const found = cards.find((entry) =>
            entry.characterKey === card.characterKey && entry.cardIndex === card.cardIndex);
          if (found) onPick(found);
        }}
        onCardDragStart={(card) => {
          const found = cards.find((entry) =>
            entry.characterKey === card.characterKey && entry.cardIndex === card.cardIndex);
          if (found) onCardDragStart?.(found);
        }}
      />
    </Box>
  );
}
