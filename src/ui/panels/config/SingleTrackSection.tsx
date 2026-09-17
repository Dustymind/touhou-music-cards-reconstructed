/** 仅单曲模式：总开关 + 逐角色选曲（只列预设启用的曲目）+ 禁用角色。 */
import {
  Box, Card, CardContent, CardHeader, Chip, FormControl, FormControlLabel, MenuItem, Select, Stack, Switch, TextField, Typography,
} from "@mui/material";
import { useMemo, useState } from "react";

import type { DataBundle, MusicEntry } from "../../../data/types";
import { displayTitle, trackId } from "../../../data/types";
import { Localization, t } from "../../../i18n/localization";
import { usePreset } from "../../../store/preset";
import { useSingleTrack } from "../../../store/single";
import { singleModeRows } from "../../../music/presetView";

function entryLabel(entry: MusicEntry): string {
  return `${displayTitle(entry[1])} (${entry[0]})`;
}

export function SingleTrackSection({ bundle }: { bundle: DataBundle }) {
  const preset = usePreset();
  const single = useSingleTrack();
  const [query, setQuery] = useState("");

  const rows = useMemo(
    () => singleModeRows(preset, bundle.characters, single.pins, single.disabledCharacters, query),
    [preset, bundle.characters, single.pins, single.disabledCharacters, query],
  );

  return (
    <Card data-testid="single-section">
      <CardHeader
        title={t(Localization.ConfigTabMusicSelectionSingle)}
        titleTypographyProps={{ variant: "h6" }}
        action={<FormControlLabel
          control={
            <Switch
              size="small"
              checked={single.enabled}
              onChange={(event) => single.setEnabled(event.target.checked)}
              slotProps={{ input: { "aria-label": "single-mode" } }}
            />
          }
          label={<Typography variant="body2">{t(Localization.ConfigTabSingleMode)}</Typography>}
        />}
      />
      <CardContent>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Box sx={{ flex: 1 }} />
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={single.enabled}
              onChange={(event) => single.setEnabled(event.target.checked)}
              slotProps={{ input: { "aria-label": "single-mode-enabled" } }}
            />
          }
          label={t(Localization.ConfigTabSingleMode)}
        />
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {t(Localization.ConfigTabSingleHint)}
      </Typography>

      <TextField
        size="small"
        fullWidth
        sx={{ mt: 1, mb: 1 }}
        placeholder={t(Localization.ConfigTabSearchCharacter)}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        inputProps={{ "aria-label": "single-search" }}
      />

      <Stack spacing={0.5} sx={{ maxHeight: 420, overflowY: "auto" }}>
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
              <FormControl
                size="small"
                sx={{ flex: 1 }}
                disabled={allowed.length === 0}
                data-testid={`single-select-${character.key}`}
              >
                <Select
                  value={value}
                  displayEmpty
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
    </CardContent></Card>
  );
}
