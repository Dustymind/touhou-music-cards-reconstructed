/** 设置页（M4 版）：数据概览 + 音源开关/顺序（已落盘）+ 语言与图集。 */
import {
  Box, Chip, Divider, FormControlLabel, IconButton, Paper, Stack, Switch, Typography,
} from "@mui/material";
import { ArrowDownward, ArrowUpward } from "@mui/icons-material";

import type { DataBundle } from "../../data/types";
import { Localization, t, type Locale } from "../../i18n/localization";
import { effectiveOrder, useSession } from "../../store/session";
import { NoFontFamily } from "../../theme/theme";

export function ConfigPanel({ bundle }: { bundle: DataBundle }) {
  const { locale, setLocale, cardCollection, sourceOverrides, toggleSource, moveSource } = useSession();
  const ids = bundle.sources.map((source) => source.id);
  const order = effectiveOrder(sourceOverrides, ids);

  return (
    <Stack spacing={2} sx={{ width: "100%", maxWidth: 800, fontFamily: NoFontFamily }}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          {t(Localization.ShellDataSummary)}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
          <Chip label={`${bundle.index.counts.characters} ${t(Localization.ShellCharacters)}`} />
          <Chip label={`${bundle.index.counts.albums} ${t(Localization.ShellAlbums)}`} />
          <Chip label={`${bundle.index.counts.distinctTracks} ${t(Localization.ShellTracks)}`} />
          <Chip variant="outlined" label={`${t(Localization.ShellDataHash)}: ${bundle.index.contentHash.slice(0, 12)}`} />
        </Stack>
        <Divider sx={{ my: 1.5 }} />
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="body2">{t(Localization.ShellLanguage)}</Typography>
          {(["en", "zh"] as Locale[]).map((value) => (
            <Chip
              key={value}
              label={value}
              clickable
              color={locale === value ? "primary" : "default"}
              variant={locale === value ? "filled" : "outlined"}
              onClick={() => setLocale(value)}
            />
          ))}
          <Typography variant="caption" color="text.secondary">
            card collection: {cardCollection}
          </Typography>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          {t(Localization.ConfigTabMusicSource)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t(Localization.ConfigTabSourceOrder)} · {order.join(" → ")}
        </Typography>
        <Stack spacing={1} sx={{ mt: 1 }}>
          {bundle.sources.map((source) => {
            const override = sourceOverrides[source.id];
            const enabled = override?.enabled ?? source.enabled;
            const position = order.indexOf(source.id) + 1;
            return (
              <Box key={source.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Chip size="small" label={position} />
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {locale === "zh" ? source.label.zh : source.label.en}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {source.kind}
                  </Typography>
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={enabled}
                        onChange={(event) => toggleSource(source.id, event.target.checked, source.order)}
                      />
                    }
                    label={t(enabled ? Localization.ConfigTabSourceEnabled : Localization.ConfigTabSourceDisabled)}
                  />
                  <IconButton size="small" onClick={() => moveSource(source.id, -1, ids)} aria-label="up">
                    <ArrowUpward fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => moveSource(source.id, 1, ids)} aria-label="down">
                    <ArrowDownward fontSize="small" />
                  </IconButton>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {locale === "zh" ? source.description.zh : source.description.en}
                </Typography>
              </Box>
            );
          })}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {t(Localization.ShellNotYet)}
        </Typography>
      </Paper>
    </Stack>
  );
}
