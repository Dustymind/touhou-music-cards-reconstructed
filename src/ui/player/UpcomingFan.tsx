/** "接下来"的卡片长条：与游戏卡槽共用 `CardStrip`（卡条下方可拖动滑块平移）。
 *
 * 与游戏卡槽一致：卡片**等距不重叠**、滑块在卡条下方不遮挡卡片、hover **只变底色不做抬起位移**。
 * 点击一张卡＝临时跳过（临时禁用，变灰）。
 */
import { Box } from "@mui/material";
import { useRef } from "react";

import { useElementWidth } from "../useElementWidth";

import type { CardSetRecord, DataBundle, ModeDataset } from "../../data/types";
import { cardCount, cardFace } from "../../data/cardFaces";
import { useCurrentDataset } from "../../data/useDataset";
import { cardAspectRatio } from "../../theme/cardRatio";
import { CardStrip, type StripCard } from "../components/CardStrip";

interface UpcomingFanProps {
  bundle: DataBundle;
  cardSet: CardSetRecord;
  order: readonly string[];
  currentKey: string | null;
  temporaryDisabled: Record<string, boolean>;
  onToggle: (key: string) => void;
  /** 可视宽度（不传就用容器实测宽度） */
  visibleWidth?: number;
}

/** 卡片宽度沿用上游 `min(windowWidth * 0.2, 150)`。 */
export function fanCardWidth(windowWidth: number): number {
  return Math.min(windowWidth * 0.2, 150);
}

/** 牌堆内容：按轮播顺序把每个角色的**卡池里那些**卡排开（等距、不重叠）。
 *
 *  张数用 `cardCount(character, cardSet)` —— 与对战页的卡池**同一个口径**（多重卡牌只在
 *  自定义卡面那套图集下生效），否则播放页的选择器会比对战页多/少几张。图用 `cardFace`。 */
export function fanLayout(
  dataset: ModeDataset,
  order: readonly string[],
  windowWidth: number,
  cardSet?: CardSetRecord,
): { cards: StripCard[]; cardWidth: number; cardHeight: number } {
  const cardWidth = fanCardWidth(windowWidth);
  const cards: StripCard[] = [];
  for (const key of order) {
    const character = dataset.characterByKey.get(key);
    if (!character) {
      cards.push({ id: `${key}-0`, characterKey: key, cardIndex: 0, file: "", state: "normal" });
      continue;
    }
    const count = cardCount(character, cardSet);
    for (let cardIndex = 0; cardIndex < count; cardIndex += 1) {
      cards.push({
        id: `${key}-${cardIndex}`, characterKey: key, cardIndex,
        file: cardFace(character, cardSet, cardIndex), state: "normal",
      });
    }
  }
  return { cards, cardWidth, cardHeight: cardWidth / cardAspectRatio(cardSet) };
}

export function UpcomingFan(props: UpcomingFanProps) {
  const dataset = useCurrentDataset(props.bundle);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measured = useElementWidth(containerRef, null, 0);
  const windowWidth = typeof window === "undefined" ? 1200 : window.innerWidth;
  const cardWidth = fanCardWidth(windowWidth);

  const visibleWidth = props.visibleWidth ?? Math.max(240, measured || Math.round(windowWidth * 0.62));

  const { cards } = fanLayout(dataset, props.order, windowWidth, props.cardSet);
  const withState: StripCard[] = cards.map((card) => {
    const disabled = Boolean(props.temporaryDisabled[card.characterKey]);
    return {
      ...card,
      state: disabled ? "disabled" : card.characterKey === props.currentKey ? "selected" : "normal",
      hoverState: disabled ? "disabledHover" : "hover",
    };
  });

  return (
    <Box ref={containerRef} sx={{ width: "100%" }}>
      <CardStrip
        cards={withState}
        cardSet={props.cardSet}
        width={cardWidth}
        visibleWidth={visibleWidth}
        interactive
        sliderLabel="Card Selection Slider"
        testId="upcoming-fan"
        stripTestId="upcoming-fan-strip"
        sliderTestId="upcoming-fan-slider"
        cardTestIdPrefix="upcoming-card"
        onCardClick={(card) => props.onToggle(card.characterKey)}
      />
    </Box>
  );
}
