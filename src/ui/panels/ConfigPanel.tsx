/** 设置页：数据概览 + 卡面图集 + 音乐源 + 音乐选择预设 + 仅单曲模式。 */
import { memo } from "react";
import {
  Chip, Divider, Stack, Typography,
} from "@mui/material";

import { SectionPanel } from "./config/SectionCard";
import type { DataBundle } from "../../data/types";
import { Localization, t, type Locale } from "../../i18n/localization";
import { useSession } from "../../store/session";
import { usePreset } from "../../store/preset";
import type { TableMap } from "../../music/sources";
import type { MusicMode } from "../../music/mode";
import { presetStats } from "../../music/presetView";
import { NoFontFamily } from "../../theme/theme";
import { CardSetSection } from "./config/CardSetSection";
import { PresetSection } from "./config/PresetSection";
import { SingleTrackSection } from "./config/SingleTrackSection";
import { SourceSection } from "./config/SourceSection";

function ConfigPanelInner({ bundle, tables, musicMode }: {
  bundle: DataBundle;
  tables: TableMap;
  musicMode: MusicMode;
}) {
  const { locale, setLocale } = useSession();
  const preset = usePreset();
  const stats = presetStats(preset, bundle.characters, bundle.albums, musicMode);

  return (
    <Stack sx={{ width: "100%", fontFamily: NoFontFamily, display: "flex", flexDirection: "column", gap: 2 }}>
      <SectionPanel id="data" title={t(Localization.ShellDataSummary)}>
        {/* 只用 gap，不用 spacing：Stack 的 spacing 是给子项加 margin，换行后新行第一项仍带左边距 → 行左边缘不齐 */}
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }} data-testid="data-chips">
          <Chip label={`${bundle.index.counts.characters} ${t(Localization.ShellCharacters)}`} />
          <Chip label={`${bundle.index.counts.albums} ${t(Localization.ShellAlbums)}`} />
          <Chip label={`${bundle.index.counts.distinctTracks} ${t(Localization.ShellTracks)}`} />
          <Chip data-testid="enabled-tracks" color="primary"
            label={`${stats.enabledTracks}/${stats.totalTracks}`} />
          <Chip variant="outlined" label={`${t(Localization.ShellDataHash)}: ${bundle.index.contentHash.slice(0, 12)}`} />
        </Stack>
        <Divider sx={{ my: 1.5 }} />
        <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
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
      <PresetSection bundle={bundle} musicMode={musicMode} />
      <SingleTrackSection bundle={bundle} musicMode={musicMode} />
    </Stack>
  );
}

/** 面板级 memo：外壳状态（语言 / 音乐模式 / 分区展开）变化时不必重算整页。 */
export const ConfigPanel = memo(ConfigPanelInner);
