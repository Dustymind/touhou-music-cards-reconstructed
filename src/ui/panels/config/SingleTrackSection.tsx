/** 仅单曲模式：总开关 + 逐角色选曲（只列预设启用的曲目）+ 禁用角色。 */
import {
  Chip, FormControl, FormControlLabel, MenuItem, Select, Stack, Switch, TextField, Typography,
} from "@mui/material";
import { useMemo, useState } from "react";

import type { DataBundle, MusicEntry } from "../../../data/types";
import { displayTitle, trackId } from "../../../data/types";
import { Localization, t } from "../../../i18n/localization";
import { SectionPanel } from "./SectionCard";
import { usePreset } from "../../../store/preset";
import { useSingleTrack } from "../../../store/single";
import { singleModeRows } from "../../../music/presetView";
import type { MusicMode } from "../../../music/mode";

function entryLabel(entry: MusicEntry): string {
  return `${displayTitle(entry[1])} (${entry[0]})`;
}

export function SingleTrackSection({ bundle, musicMode }: { bundle: DataBundle; musicMode: MusicMode }) {
  const preset = usePreset();
  const single = useSingleTrack();
  const [query, setQuery] = useState("");

  const rows = useMemo(
    () => singleModeRows(preset, bundle.characters, single.pins, single.disabledCharacters, query,
      bundle.albums, musicMode),
    [preset, bundle.characters, single.pins, single.disabledCharacters, query, bundle.albums, musicMode],
  );

  return (
    <SectionPanel id="single" title={t(Localization.ConfigTabMusicSelectionSingle)}>
      {/* 开关行：开关在左、说明在右（原来只有一个右对齐的开关 + 空的左半边） */}
      <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap", mb: 1 }}>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={single.enabled}
              onChange={(event) => single.setEnabled(event.target.checked)}
              slotProps={{ input: { "aria-label": "single-mode" } }}
            />
          }
          label={t(Localization.ConfigTabSingleMode)}
        />
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          {t(Localization.ConfigTabSingleHint)}
        </Typography>
      </Stack>

      <TextField
        size="small"
        fullWidth
        label={t(Localization.ConfigTabSearchCharacter)}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        slotProps={{ htmlInput: { "aria-label": "single-search" } }}
        sx={{ mb: 1 }}
      />

      <Stack
        spacing={0.5}
        sx={{
          maxHeight: 420,
          overflowY: "auto",
          opacity: single.enabled ? 1 : 0.5,
          pointerEvents: single.enabled ? "auto" : "none",
        }}
      >
        {rows.map(({ character, allowed, pinned, disabled }) => {
          const current = pinned ?? allowed[0] ?? null;
          const value = current ? trackId(current[0], current[1]) : "";
          return (
            <Stack key={character.key} direction="row" spacing={1} alignItems="center">
              <Typography
                variant="body2"
                noWrap
                sx={{ width: "12em", textAlign: "right", opacity: disabled ? 0.45 : 1 }}
              >
                {character.name}
              </Typography>
              {/* 这一栏没有浮动标签，用 outlined：filled 会为标签留出上方空间，
                  导致文本下移、看着不居中（用户反馈） */}
              <FormControl
                size="small"
                variant="outlined"
                sx={{ flex: 1 }}
                disabled={allowed.length === 0}
                data-testid={`single-select-${character.key}`}
              >
                <Select
                  value={value}
                  displayEmpty
                  // 主题把 MuiSelect 的默认 variant 设成了 filled（defaultProps 会压过 FormControl 的
                  // context），所以这里要显式给 outlined，否则又会拿到 filled 的上方标签留白
                  variant="outlined"
                  inputProps={{ "aria-label": `single-${character.key}` }}
                  onChange={(event) => {
                    const chosen = allowed.find((entry) => trackId(entry[0], entry[1]) === event.target.value);
                    single.setPin(character.key, chosen ?? null);
                  }}
                >
                  {allowed.length === 0 && (
                    <MenuItem value="" disabled>{t(Localization.ConfigTabSingleNoTracks)}</MenuItem>
                  )}
                  {allowed.map((entry) => (
                    <MenuItem key={trackId(entry[0], entry[1])} value={trackId(entry[0], entry[1])}>
                      {entryLabel(entry)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Chip
                size="small"
                label={t(Localization.ConfigTabSingleDisable)}
                color={disabled ? "error" : "default"}
                variant={disabled ? "filled" : "outlined"}
                onClick={() => single.toggleCharacter(character.key)}
                data-testid={`single-disable-${character.key}`}
              />
            </Stack>
          );
        })}
      </Stack>
    </SectionPanel>
  );
}
