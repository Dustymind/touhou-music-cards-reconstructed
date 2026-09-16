/** 播放页：M5 实现播放层与队列；这里先给出数据驱动的骨架。 */
import { Chip, Divider, Paper, Stack, Typography } from "@mui/material";

import type { DataBundle } from "../../data/types";
import { displayTitle } from "../../data/types";
import { Localization, t } from "../../i18n/localization";
import { NoFontFamily } from "../../theme/theme";

export function PlayerPanel({ bundle }: { bundle: DataBundle }) {
  const current = bundle.characters[0];
  if (!current) return null;
  return (
    <Stack spacing={2} sx={{ width: "100%", maxWidth: 800, fontFamily: NoFontFamily }}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="overline" color="text.secondary">
          {t(Localization.ListTabOrder)} #{current.order}
        </Typography>
        <Typography variant="h5">{current.name}</Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap" }}>
          <Chip size="small" label={`card: ${current.card.join(", ")}`} />
          <Chip size="small" label={`key: ${current.key}`} />
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          {t(Localization.ListTabTracks)}（{current.music.length}）
        </Typography>
        <Divider sx={{ mb: 1 }} />
        <Stack spacing={0.5}>
          {current.music.map(([album, title, extra]) => (
            <Stack key={`${album}/${title}`} direction="row" spacing={1} alignItems="baseline">
              <Chip size="small" variant="outlined" label={extra} />
              <Typography variant="body2">{displayTitle(title)}</Typography>
              <Typography variant="caption" color="text.secondary">
                {album}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Paper>

      <Typography variant="body2" color="text.secondary">
        {t(Localization.ShellNotYet)}
      </Typography>
    </Stack>
  );
}
