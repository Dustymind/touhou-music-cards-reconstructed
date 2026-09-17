/** 卡面图集：6 套收藏，切换后落盘（修上游"刷新就回到默认"的问题）。 */
import {
  Chip, Stack, Typography,
} from "@mui/material";

import { SectionCard } from "./SectionCard";
import type { DataBundle } from "../../../data/types";
import { Localization, localized, t } from "../../../i18n/localization";
import { useSession } from "../../../store/session";
import { NoFontFamily } from "../../../theme/theme";

export function CardSetSection({ bundle }: { bundle: DataBundle }) {
  const { cardCollection, setCardCollection, locale } = useSession();
  return (
    <SectionCard title={t(Localization.ConfigTabCardCollection)}>
      <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
        {bundle.cardSets.map((set) => (
          <Chip
            key={set.id}
            data-testid={`cardset-${set.id}`}
            label={localized(set.label, locale)}
            clickable
            color={cardCollection === set.id ? "primary" : "default"}
            variant={cardCollection === set.id ? "filled" : "outlined"}
            onClick={() => setCardCollection(set.id)}
          />
        ))}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, fontFamily: NoFontFamily }}>
        {(bundle.cardSets.find((set) => set.id === cardCollection) ?? bundle.cardSets[0])?.origins[0]}
      </Typography>
    </SectionCard>
  );
}
