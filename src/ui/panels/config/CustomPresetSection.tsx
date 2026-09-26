/** 模式 3 的音乐选择：**专辑三元 + 作者三元**（契约 `docs/custom-mode-v1.md` C4）。
 *
 * 与另两个模式的分区形状差别是结构性的：这里没有秘封碟、没有类别开关（角色曲/道中曲/…），
 * 也没有专辑复选 —— 一卡一首、卡名自定，能筛的只有"这张卡的专辑"与"这张卡的作者"两维。
 * 两维的**默认都是 `unset` = 全开**（与"专辑默认勾选"的另两个模式相反，见 `customSelection.ts` 的真值表）。
 */
import { Divider, Stack, Typography } from "@mui/material";
import { memo, useMemo } from "react";

import type { DataBundle } from "../../../data/types";
import { Localization, t } from "../../../i18n/localization";
import { SectionPanel } from "./SectionCard";
import { LazyRow } from "../../components/LazyRow";
import { useCurrentDataset } from "../../../data/useDataset";
import {
  customAlbumRows, customAuthorsOf, customPresetStats,
} from "../../../music/customSelection";
import { useCustomPreset } from "../../../store/customPreset";
import { TriToggle } from "./TriToggle";

/** 一行 = 名字 + 三态控件。窄屏（320dp）下这一行会**折行**（`flexWrap`）而不是横向溢出：
 *  三档按钮本身约 220px，留给名字的空间在窄屏上不够 —— 折行是 MD2 里这种"标签 + 分段控件"的标准退让。 */
function TriRow({ label, value, onChange, testId }: {
  label: string;
  value: "unset" | "on" | "off";
  onChange: (value: "unset" | "on" | "off") => void;
  testId: string;
}) {
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5, minHeight: 40 }}
    >
      <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: "6em" }}>{label}</Typography>
      <TriToggle testId={testId} value={value} onChange={onChange} />
    </Stack>
  );
}

function CustomPresetSectionInner({ bundle }: { bundle: DataBundle }) {
  const preset = useCustomPreset();
  const dataset = useCurrentDataset(bundle);
  const stats = useMemo(
    () => customPresetStats(preset, dataset.characters),
    [preset, dataset.characters],
  );
  const albums = useMemo(() => customAlbumRows(dataset.albums), [dataset.albums]);
  const authors = useMemo(() => customAuthorsOf(dataset.characters), [dataset.characters]);

  return (
    <SectionPanel id="preset" title={t(Localization.ConfigTabMusicSelectionPresets)}>
      <Typography variant="caption" color="text.secondary" data-testid="custom-preset-stats">
        {t(Localization.ConfigTabCustomPresetStats, {
          enabled: String(stats.enabled),
          total: String(stats.total),
          albums: String(stats.albums),
          authors: String(stats.authors),
        })}
      </Typography>

      <Divider sx={{ my: 1.5 }} />

      <Typography variant="subtitle2">{t(Localization.ConfigTabCustomAlbums)}</Typography>
      <Stack spacing={0} sx={{ mt: 0.5 }} data-testid="custom-album-list">
        {albums.map((album) => (
          <LazyRow key={album.key} placeholderHeight={40}>
            <TriRow
              label={album.name}
              testId={`custom-album-${album.key}`}
              value={preset.albums[album.name] ?? "unset"}
              onChange={(value) => preset.setAlbumTri(album.name, value)}
            />
          </LazyRow>
        ))}
      </Stack>

      <Divider sx={{ my: 1.5 }} />

      {/* 空作者不进作者列表（Q7）：这类卡只看专辑那一维 */}
      <Typography variant="subtitle2">{t(Localization.ConfigTabCustomAuthors)}</Typography>
      <Stack spacing={0} sx={{ mt: 0.5 }} data-testid="custom-author-list">
        {authors.map((author) => (
          <LazyRow key={author} placeholderHeight={40}>
            <TriRow
              label={author}
              testId={`custom-author-${author}`}
              value={preset.authors[author] ?? "unset"}
              onChange={(value) => preset.setAuthorTri(author, value)}
            />
          </LazyRow>
        ))}
      </Stack>
    </SectionPanel>
  );
}

/** 分区之间互不牵连：展开一个分区不该把其它分区的长列表一起重渲染（memo 掉）。 */
export const CustomPresetSection = memo(CustomPresetSectionInner);
