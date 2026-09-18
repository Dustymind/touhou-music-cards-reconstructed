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
import { CharacterCard } from "../components/CharacterCard";
import { CardAspectRatio } from "../../theme/theme";
import { DECK_GAP } from "./DeckGrid";
import { LazyRow } from "../components/LazyRow";

/** 按每行 `columns` 张切块（渲染时按行懒挂载）。 */
function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

interface UnusedCardsProps {
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

interface UnusedCardsProps2 extends UnusedCardsProps {
  /** `strip` = 单行 + 滑块（宽屏内联）；`grid` = 多行（窄屏面板，与牌桌卡槽同尺寸同列数） */
  layout?: "strip" | "grid";
  /** `grid` 布局的列数（与牌桌卡槽对齐） */
  columns?: number;
}

export function UnusedCards(props: UnusedCardsProps2) {
  const {
    cards, cardSet, cardFiles, width, visibleWidth, onPick, interactive, onCardDragStart, onDropCard,
    layout = "strip",
    columns,
  } = props;
  const [over, setOver] = useState(false);
  /** 网格布局下的 hover（只变底色，不做位移——与播放页、卡槽一致） */
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const cardHeight = Math.round(width / CardAspectRatio);

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
      {layout === "strip" ? (
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
      ) : (
        /* 多行：卡面尺寸、间距**与列数**都跟牌桌卡槽一致（同 width、同 DECK_GAP、同 columns）。
           按"行"切块并交给 LazyRow：滚到哪一行才挂载哪一行（121 张一次性挂载要 ~100ms 长任务） */
        <Box
          data-testid="unused-cards-grid"
          sx={{ display: "flex", flexDirection: "column", gap: `${DECK_GAP}px`, alignItems: "center", py: 0.5 }}
        >
          {chunk(cards, columns ?? 8).map((row, rowIndex) => (
            <LazyRow
              key={row[0] ? `${row[0].characterKey}-${row[0].cardIndex}` : rowIndex}
              placeholderHeight={cardHeight + DECK_GAP}
              margin={160}
            >
              <Box sx={{ display: "flex", gap: `${DECK_GAP}px` }}>
                {row.map((card) => {
                  const key = `${card.characterKey}-${card.cardIndex}`;
                  return (
                    <Box
                      key={key}
                      data-testid={`unused-card-${key}`}
                      draggable={interactive && Boolean(onCardDragStart)}
                      onDragStart={() => onCardDragStart?.(card)}
                      onClick={() => onPick(card)}
                      onMouseEnter={() => setHoveredKey(key)}
                      onMouseLeave={() => setHoveredKey((value) => (value === key ? null : value))}
                      sx={{ width, cursor: interactive ? "pointer" : "default" }}
                    >
                      <CharacterCard
                        cardSet={cardSet}
                        file={cardFiles[card.characterKey]?.[card.cardIndex] ?? ""}
                        state={hoveredKey === key ? "hover" : "normal"}
                      />
                    </Box>
                  );
                })}
              </Box>
            </LazyRow>
          ))}
        </Box>
      )}

    </Box>
  );
}
