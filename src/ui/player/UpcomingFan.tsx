/** "接下来"的重叠牌堆（上游 `PlayerTab.tsx` 的 upcoming cards）。
 *
 * 上游把每张卡绝对定位在一条很长的横带上：同角色的多张卡叠 80%、角色之间叠 20%，
 * 靠 `transition: left 0.5s ease-in-out` 在切歌/跳过后整条带子滑过去；hover 抬起、点击＝临时跳过。
 * 这里照抄这套布局与动效；差别只有两处（见 `docs/DECISIONS.md` D21）：
 * 起点从**当前角色**开始（上游把当前角色再往左推 2 张卡宽，当前角色在可视区外），
 * 以及当前角色的卡用 `selected` 底色标一下。
 */
import { Box } from "@mui/material";
import { useEffect, useState } from "react";

import type { CardSetRecord, DataBundle } from "../../data/types";
import { CardAspectRatio } from "../../theme/theme";
import { CharacterCard, type CardState } from "../components/CharacterCard";

/** 抬起时卡片会向上探出 10%，容器顶部留出这么多像素，避免被裁切/压到上面的文字。 */
const LIFT_PADDING = 18;

export interface UpcomingFanProps {
  bundle: DataBundle;
  cardSet: CardSetRecord;
  order: readonly string[];
  currentKey: string | null;
  temporaryDisabled: Record<string, boolean>;
  onToggle: (key: string) => void;
}

interface FanCard {
  key: string;
  file: string;
  cardIndex: number;
  left: number;
  zIndex: number;
}

/** 上游的尺寸常量：`singleCardWp = min(windowWidth * 0.2, 150)`，同角色叠 80%、角色间叠 20%。 */
export function fanLayout(
  bundle: DataBundle,
  order: readonly string[],
  windowWidth: number,
): { cards: FanCard[]; cardWidth: number; cardHeight: number } {
  const cardWidth = Math.min(windowWidth * 0.2, 150);
  const inGroupOverlap = cardWidth * 0.8;
  const groupOverlap = cardWidth * 0.2;
  const cards: FanCard[] = [];
  let accumulate = 0;
  let counter = 0;
  for (const key of order) {
    const character = bundle.characterByKey.get(key);
    const files = character?.card.length ? character.card : [""];
    files.forEach((file, cardIndex) => {
      cards.push({ key, file, cardIndex, left: accumulate, zIndex: 10_000 - counter });
      counter += 1;
      accumulate += cardIndex < files.length - 1
        ? cardWidth - inGroupOverlap
        : cardWidth - groupOverlap;
    });
  }
  return { cards, cardWidth, cardHeight: cardWidth / CardAspectRatio };
}

/** 窗口宽度：上游同样监听 resize 来算卡片尺寸。 */
export function useWindowWidth(): number {
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 1200 : window.innerWidth));
  useEffect(() => {
    const onResize = (): void => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

export function UpcomingFan(props: UpcomingFanProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const windowWidth = useWindowWidth();
  const { cards, cardWidth, cardHeight } = fanLayout(props.bundle, props.order, windowWidth);

  return (
    <Box
      data-testid="upcoming-fan"
      data-card-width={Math.round(cardWidth)}
      // 顶部留出抬起的高度；横向可滚动（用户要求：选卡区要有滚动条，参考原版）
      sx={{
        position: "relative",
        width: "100%",
        height: cardHeight + LIFT_PADDING,
        overflowX: "auto",
        overflowY: "hidden",
        mt: 1,
        pt: `${LIFT_PADDING}px`,
      }}
    >
      {cards.map((card) => {
        const id = `${card.key}-${card.cardIndex}`;
        const disabled = Boolean(props.temporaryDisabled[card.key]);
        let state: CardState = "normal";
        if (hovered === id) state = disabled ? "disabledHover" : "hover";
        else if (disabled) state = "disabled";
        else if (card.key === props.currentKey) state = "selected";
        return (
          <Box
            key={id}
            data-testid={`upcoming-card-${id}`}
            onMouseEnter={() => setHovered(id)}
            onMouseLeave={() => setHovered((current) => (current === id ? null : current))}
            onClick={() => props.onToggle(card.key)}
            sx={{
              position: "absolute",
              left: card.left,
              top: LIFT_PADDING,
              width: cardWidth,
              zIndex: card.zIndex,
              // 上游原值：横向位移 0.5s，抬起/底色/灰度 0.3s
              transition: "left 0.5s ease-in-out, transform 0.3s ease, background-color 0.3s ease, filter 0.3s ease",
            }}
          >
            <CharacterCard
              cardSet={props.cardSet}
              file={card.file}
              state={state}
              width="100%"
              bare
              raised={hovered === id}
            />
          </Box>
        );
      })}
    </Box>
  );
}
