/** 设置页：数据概览 + 卡面图集 + 音乐源 + 音乐选择预设 + 仅单曲模式。 */
import {
  Chip, Divider, Stack, Typography,
} from "@mui/material";

import { SectionPanel } from "./config/SectionCard";
import type { DataBundle } from "../../data/types";
import { Localization, t, type Locale } from "../../i18n/localization";
import { useSession } from "../../store/session";
import { usePreset } from "../../store/preset";
import type { TableMap } from "../../music/sources";
import { presetStats } from "../../music/presetView";
import { NoFontFamily } from "../../theme/theme";
import { CardSetSection } from "./config/CardSetSection";
import { PresetSection } from "./config/PresetSection";
import { SingleTrackSection } from "./config/SingleTrackSection";
import { SourceSection } from "./config/SourceSection";

export function ConfigPanel({ bundle, tables }: { bundle: DataBundle; tables: TableMap }) {
  const { locale, setLocale } = useSession();
  const preset = usePreset();
  const stats = presetStats(preset, bundle.characters);

  return (
    <Stack sx={{ width: "100%", fontFamily: NoFontFamily, display: "flex", flexDirection: "column", gap: 2 }}>
      <SectionPanel id="data" title={t(Localization.ShellDataSummary)}>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
          <Chip label={`${bundle.index.counts.characters} ${t(Localization.ShellCharacters)}`} />
          <Chip label={`${bundle.index.counts.albums} ${t(Localization.ShellAlbums)}`} />
          <Chip label={`${bundle.index.counts.distinctTracks} ${t(Localization.ShellTracks)}`} />
          <Chip data-testid="enabled-tracks" color="primary"
            label={`${stats.enabledTracks}/${stats.totalTracks}`} />
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
        </Stack>
      </SectionPanel>

      <CardSetSection bundle={bundle} />
      <SourceSection bundle={bundle} tables={tables} />
      <PresetSection bundle={bundle} />
      <SingleTrackSection bundle={bundle} />
    </Stack>
  );
}
