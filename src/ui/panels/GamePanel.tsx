/** 对战页：M7（单机/CPU）与 M8（联机）实现，这里只占位。 */
import { Paper, Stack, Typography } from "@mui/material";

import type { DataBundle } from "../../data/types";
import { Localization, t } from "../../i18n/localization";
import { NoFontFamily } from "../../theme/theme";

export function GamePanel({ bundle }: { bundle: DataBundle }) {
  const cards = bundle.characters.reduce((sum, character) => sum + character.card.length, 0);
  return (
    <Stack spacing={2} sx={{ width: "100%", maxWidth: 800, fontFamily: NoFontFamily }}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1">{t(Localization.TabNameAbout)}</Typography>
        <Typography variant="body2" color="text.secondary">
          {cards} cards / {bundle.characters.length} characters
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t(Localization.ShellNotYet)}
        </Typography>
      </Paper>
    </Stack>
  );
}
