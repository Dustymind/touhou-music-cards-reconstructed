/** 未使用卡牌区：卡池里还没进任何牌库/收集区的卡，点一张就放进自己的卡组（上游 `GameUnusedCards`）。
 *
 * 上游是拖拽（拖进牌位，点一下则落进第一个空位）；这里沿用本项目的点击式交互，
 * 行为与上游的"点击"分支一致（见 `docs/DECISIONS.md` D18）。
 */
import { Box, Paper, Typography } from "@mui/material";

import type { CardSetRecord } from "../../data/types";
import type { CardInfo } from "../../game/types";
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
  /** 只有选牌阶段能改卡组 */
  interactive: boolean;
  /** 卡池为空时也显示标题，方便看出"没牌可加" */
  testId?: string;
}

export function UnusedCards(props: UnusedCardsProps) {
  const { cards, cardSet, cardFiles, width, onPick, interactive } = props;
  return (
    <Box sx={{ mt: 1.5 }} data-testid={props.testId ?? "unused-cards"}>
      <Typography variant="caption" color="text.secondary">
        {t(Localization.GameUnusedCards, { count: String(cards.length) })}
      </Typography>
      {interactive && (
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          {t(Localization.GameDeckBuildHint)}
        </Typography>
      )}
      {/* 卡池可能有上百张，横着滚一屏就够了 */}
      <Box sx={{ display: "flex", gap: "4px", overflowX: "auto", py: 0.5, minHeight: width + 8 }}>
        {cards.map((card) => (
          <Paper
            key={`${card.characterKey}-${card.cardIndex}`}
            variant="outlined"
            data-testid={`unused-card-${card.characterKey}-${card.cardIndex}`}
            onClick={() => { if (interactive) onPick(card); }}
            sx={{ p: "2px", flex: "0 0 auto", cursor: interactive ? "pointer" : "default" }}
          >
            <CharacterCard
              cardSet={cardSet}
              file={cardFiles[card.characterKey]?.[card.cardIndex] ?? ""}
              state={"normal" as CardState}
              width={`${width - 8}px`}
            />
          </Paper>
        ))}
      </Box>
    </Box>
  );
}
