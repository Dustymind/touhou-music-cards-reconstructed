/** 设置页：数据概览 + 卡面图集 + 音乐源 + 音乐选择预设 + 仅单曲模式。 */
import {
  Chip, Divider, Stack, Typography,
} from "@mui/material";

import { SectionPanel } from "./config/SectionCard";
import type { DataBundle } from "../../data/types";
import { useCurrentDataset } from "../../data/useDataset";
import { Localization, t, type Locale } from "../../i18n/localization";
import { useSession } from "../../store/session";
import { usePreset } from "../../store/preset";
import type { TableMap } from "../../music/sources";
import { presetStats } from "../../music/presetView";
import { NoFontFamily } from "../../theme/theme";
import { AppearanceSection } from "./config/AppearanceSection";
import { CardSetSection } from "./config/CardSetSection";
import { CustomPresetSection } from "./config/CustomPresetSection";
import { CustomSingleSection } from "./config/CustomSingleSection";
import { PresetSection } from "./config/PresetSection";
import { SingleTrackSection } from "./config/SingleTrackSection";
import { SourceSection } from "./config/SourceSection";
import { memoOnLocale } from "../memoOnLocale";

function ConfigPanelInner({ bundle, tables }: {
  bundle: DataBundle;
  tables: TableMap;
}) {
  const { locale, setLocale, musicMode } = useSession();
  const preset = usePreset();
  const dataset = useCurrentDataset(bundle);
  const stats = presetStats(preset, dataset.characters);

  return (
    <Stack sx={{ width: "100%", fontFamily: NoFontFamily, display: "flex", flexDirection: "column", gap: 2 }}>
      <SectionPanel id="data" title={t(Localization.ShellDataSummary)}>
        {/* 只用 gap，不用 spacing：Stack 的 spacing 是给子项加 margin，换行后新行第一项仍带左边距 → 行左边缘不齐 */}
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }} data-testid="data-chips">
          <Chip label={`${dataset.index.counts.characters} ${t(Localization.ShellCharacters)}`} />
          <Chip label={`${dataset.index.counts.albums} ${t(Localization.ShellAlbums)}`} />
          <Chip label={`${dataset.index.counts.distinctTracks} ${t(Localization.ShellTracks)}`} />
          <Chip data-testid="enabled-tracks" color="primary"
            label={`${stats.enabledTracks}/${stats.totalTracks}`} />
          <Chip variant="outlined" label={`${t(Localization.ShellDataHash)}: ${dataset.index.contentHash.slice(0, 12)}`} />
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

      {/* 外观（亮/暗 + 主题色）紧挨着「数据」—— 都是全局偏好，与曲目/音源那些分开 */}
      <AppearanceSection />
      {musicMode === "custom" ? (
        // 模式 3：卡面就是清单里那张（每卡一张、不可更换）⇒ 图集菜单在这个模式下不可用（契约 C3）。
        // 分区照旧保留一行标题：设置页的节奏（五个可折叠分区）不变，用户也不会以为"这里坏了"。
        <SectionPanel id="cardset" title={t(Localization.ConfigTabCardCollection)}>
          <Typography variant="body2" color="text.secondary" data-testid="cardset-fixed">
            {t(Localization.ConfigTabCardSetFixed)}
          </Typography>
        </SectionPanel>
      ) : (
        <CardSetSection bundle={bundle} />
      )}
      <SourceSection bundle={bundle} tables={tables} />
      {/* 选择语义按模式分派：模式 3 只有"专辑/作者三元"与"逐卡禁用"两维（契约 C4/C5），
          另两个模式的"专辑勾选 + 类别三态 + 秘封碟"与"总开关 + 手选"在这个模式下没有意义 */}
      {musicMode === "custom" ? (
        <>
          <CustomPresetSection bundle={bundle} />
          <CustomSingleSection bundle={bundle} />
        </>
      ) : (
        <>
          <PresetSection bundle={bundle} />
          <SingleTrackSection bundle={bundle} />
        </>
      )}
    </Stack>
  );
}

/** 面板级 memo：外壳状态（语言 / 音乐模式 / 分区展开）变化时不必重算整页。 */
export const ConfigPanel = memoOnLocale(ConfigPanelInner);
