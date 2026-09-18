/** "接下来"的卡片长条：与游戏卡槽共用 `CardStrip`（卡条下方可拖动滑块平移）。
 *
 * 与游戏卡槽一致：卡片**等距不重叠**、滑块在卡条下方不遮挡卡片、hover **只变底色不做抬起位移**。
 * 点击一张卡＝临时跳过（临时禁用，变灰）。
 */
import { Box } from "@mui/material";
import { useEffect, useRef, useState } from "react";

import type { CardSetRecord, DataBundle } from "../../data/types";
import { CardAspectRatio } from "../../theme/theme";
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

/** 牌堆内容：按轮播顺序把每个角色的每张卡面排开（等距、不重叠）。 */
export function fanLayout(
  bundle: DataBundle,
  order: readonly string[],
  windowWidth: number,
): { cards: StripCard[]; cardWidth: number; cardHeight: number } {
  const cardWidth = fanCardWidth(windowWidth);
  const cards: StripCard[] = [];
  for (const key of order) {
    const character = bundle.characterByKey.get(key);
    const files = character?.card.length ? character.card : [""];
    files.forEach((file, cardIndex) => {
      cards.push({ id: `${key}-${cardIndex}`, characterKey: key, cardIndex, file, state: "normal" });
    });
  }
  return { cards, cardWidth, cardHeight: cardWidth / CardAspectRatio };
}

export function UpcomingFan(props: UpcomingFanProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState(0);
  const windowWidth = typeof window === "undefined" ? 1200 : window.innerWidth;
  const cardWidth = fanCardWidth(windowWidth);

  // 可视宽度 = 容器实测宽度（jsdom 里量不到就用兜底值）
  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => setMeasured(element.clientWidth));
    observer.observe(element);
    setMeasured(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  const visibleWidth = props.visibleWidth ?? Math.max(240, measured || Math.round(windowWidth * 0.62));

  const { cards } = fanLayout(props.bundle, props.order, windowWidth);
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
