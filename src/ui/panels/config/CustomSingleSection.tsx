/** 模式 3 的「仅单曲模式」：**只有逐曲（= 逐卡）禁用**（契约 `docs/custom-mode-v1.md` C5）。
 *
 * 与另两个模式的分区形状差别是结构性的：这个模式一卡一首，所以**没有总开关**（"每个角色只播一首"
 * 本来就是它的常态）、**没有手选**（没得选），只剩"这张卡要不要"。
 * 禁用的卡**不进轮播、也不进卡池** —— 卡池那一侧由 `AppShell` 把同一份可用集合交给游戏页（Q5）。
 */
import { Chip, Stack, TextField, Typography } from "@mui/material";
import { useMemo, useState } from "react";

import type { CharacterRecord, DataBundle } from "../../../data/types";
import { Localization, t } from "../../../i18n/localization";
import { SectionPanel } from "./SectionCard";
import { LazyRow } from "../../components/LazyRow";
import { useCurrentDataset } from "../../../data/useDataset";
import { customSingleRows } from "../../../music/customSelection";
import { useCustomSingle } from "../../../store/customSingle";
import { memoOnLocale } from "../../memoOnLocale";

function CardRow({ row, onToggle }: {
  row: { character: CharacterRecord; disabled: boolean; credit: string };
  onToggle: () => void;
}) {
  const { character, disabled, credit } = row;
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", minHeight: 40 }}>
      <Typography variant="body2" noWrap sx={{ width: "10em", opacity: disabled ? 0.45 : 1 }}>
        {character.name}
      </Typography>
      {/* 副标题：曲名 · 专辑 · 作者（作者可以为空）。窄屏用省略号，不挤 chip */}
      <Typography
        variant="caption"
        color="text.secondary"
        noWrap
        sx={{ flex: 1, minWidth: 0, opacity: disabled ? 0.45 : 1 }}
      >
        {credit}
      </Typography>
      <Chip
        size="small"
        label={t(Localization.ConfigTabCustomDisable)}
        color={disabled ? "error" : "default"}
        variant={disabled ? "filled" : "outlined"}
        onClick={onToggle}
        data-testid={`custom-single-disable-${character.key}`}
      />
    </Stack>
  );
}

function CustomSingleSectionInner({ bundle }: { bundle: DataBundle }) {
  const single = useCustomSingle();
  const dataset = useCurrentDataset(bundle);
  const [query, setQuery] = useState("");
  const rows = useMemo(
    () => customSingleRows(dataset.characters, single.disabled, query),
    [dataset.characters, single.disabled, query],
  );

  return (
    <SectionPanel id="single" title={t(Localization.ConfigTabMusicSelectionSingle)}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        {t(Localization.ConfigTabCustomSingleHint)}
      </Typography>

      <TextField
        size="small"
        fullWidth
        label={t(Localization.ConfigTabSearchCharacter)}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        slotProps={{ htmlInput: { "aria-label": "custom-single-search" } }}
        sx={{ mb: 1 }}
      />

      {/* 行里只有文字 + 一个 chip（没有 MUI Select 那种重控件）⇒ 靠 `LazyRow` 的视口懒挂载就够，
          不需要 `SingleTrackSection` 那套分片补齐（那一套是为 121 个下拉框准备的） */}
      <Stack spacing={0.5} sx={{ maxHeight: 420, overflowY: "auto" }}>
        {rows.map((row) => (
          <LazyRow key={row.character.key} testId={`custom-single-row-${row.character.key}`}>
            <CardRow row={row} onToggle={() => single.toggle(row.character.key)} />
          </LazyRow>
        ))}
      </Stack>
    </SectionPanel>
  );
}

/** 分区之间互不牵连：展开一个分区不该把其它分区的长列表一起重渲染（memo 掉）。 */
export const CustomSingleSection = memoOnLocale(CustomSingleSectionInner);
