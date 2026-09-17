/** 音乐选择预设：秘封曲多层勾选 + 三个三态开关 + 「先 CD 再官作」的专辑复选。 */
import {
  Button, Checkbox, Chip, Divider, FormControlLabel, Stack, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";

import type { AlbumRecord, DataBundle } from "../../../data/types";
import { Localization, t } from "../../../i18n/localization";
import { SectionPanel } from "./SectionCard";
import { CATEGORY_KEYS, type Tri } from "../../../music/selection";
import { groupAlbums, presetStats } from "../../../music/presetView";
import type { MusicMode } from "../../../music/mode";
import { hifuuParentState, usePreset } from "../../../store/preset";
import { NoFontFamily } from "../../../theme/theme";

const TRI_ORDER: Tri[] = ["unset", "on", "off"];

function triLabel(value: Tri): string {
  if (value === "on") return t(Localization.ConfigTabTriOn);
  if (value === "off") return t(Localization.ConfigTabTriOff);
  return t(Localization.ConfigTabTriUnset);
}

function AlbumRows({
  albums, checked, onToggle,
}: {
  albums: readonly AlbumRecord[];
  checked: (album: AlbumRecord) => boolean;
  onToggle: (album: AlbumRecord, value: boolean) => void;
}) {
  return (
    <Stack spacing={0}>
      {albums.map((album) => (
        <FormControlLabel
          key={album.key}
          sx={{ ml: 1 }}
          control={
            <Checkbox
              size="small"
              checked={checked(album)}
              onChange={(event) => onToggle(album, event.target.checked)}
              inputProps={{ "aria-label": `album-${album.key}` }}
            />
          }
          label={<Typography variant="body2">{album.name}</Typography>}
        />
      ))}
    </Stack>
  );
}

export function PresetSection({ bundle, musicMode }: { bundle: DataBundle; musicMode: MusicMode }) {
  const preset = usePreset();
  const groups = groupAlbums(bundle.albums);
  const stats = presetStats(preset, bundle.characters, bundle.albums, musicMode);
  const hifuuState = hifuuParentState(preset, bundle.albums);
  const allAlbums = [...groups.cd, ...groups.game];

  const setAll = (values: readonly AlbumRecord[], value: boolean) => {
    for (const album of values) preset.setAlbum(album.name, value);
  };

  return (
    <SectionPanel id="preset" title={t(Localization.ConfigTabMusicSelectionPresets)}>
      <Typography variant="caption" color="text.secondary" data-testid="preset-stats">
        {t(Localization.ConfigTabPresetStats, {
          enabled: String(stats.enabledTracks),
          total: String(stats.totalTracks),
          characters: String(stats.charactersWithTracks),
        })}
      </Typography>

      <Divider sx={{ my: 1.5 }} />

      {/* 秘封曲：父复选框是批量控制（不存值，显示态由 12 个子项派生） */}
      <FormControlLabel
        control={
          <Checkbox
            checked={hifuuState === "all"}
            indeterminate={hifuuState === "mixed"}
            onChange={(event) => preset.setAllHifuu(bundle.albums, event.target.checked)}
            inputProps={{ "aria-label": "hifuu-parent" }}
          />
        }
        label={<Typography variant="subtitle2">{t(Localization.ConfigTabPresetHifuu)}</Typography>}
      />
      <Stack direction="row" spacing={0.5} sx={{ ml: 4, mb: 1 }}>
        <Button size="small" onClick={() => preset.setAllHifuu(bundle.albums, true)}>
          {t(Localization.ConfigTabPresetSelectAll)}
        </Button>
        <Button size="small" onClick={() => preset.setAllHifuu(bundle.albums, false)}>
          {t(Localization.ConfigTabPresetSelectNone)}
        </Button>
        <Chip size="small" variant="outlined" label={`${groups.hifuu.length}`} />
      </Stack>
      <Stack spacing={0} sx={{ ml: 4 }}>
        {groups.hifuu.map((album) => (
          <FormControlLabel
            key={album.key}
            sx={{ ml: 1 }}
            control={
              <Checkbox
                size="small"
                checked={Boolean(preset.hifuu[album.name])}
                onChange={(event) => preset.setHifuuAlbum(album.name, event.target.checked)}
                inputProps={{ "aria-label": `hifuu-${album.key}` }}
              />
            }
            label={<Typography variant="body2">{album.name}</Typography>}
          />
        ))}
      </Stack>

      <Divider sx={{ my: 1.5 }} />

      {/* 三个无子项三态开关（夹在秘封曲与 CD/官作之间） */}
      <Stack spacing={1}>
        {CATEGORY_KEYS.map((key) => (
          <Stack key={key} direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" sx={{ width: "7em" }}>{key}</Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={preset.category[key]}
              onChange={(_event, value: Tri | null) => value && preset.setCategory(key, value)}
            >
              {TRI_ORDER.map((value) => (
                <ToggleButton key={value} value={value} sx={{ px: 2, fontFamily: NoFontFamily }}
                  data-testid={`tri-${key}-${value}`}>
                  {triLabel(value)}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Stack>
        ))}
      </Stack>

      <Divider sx={{ my: 1.5 }} />

      {/* 先 CD，再官作 */}
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="subtitle2">{t(Localization.ConfigTabPresetCD)}</Typography>
        <Button size="small" onClick={() => setAll(groups.cd, true)}>
          {t(Localization.ConfigTabPresetSelectAll)}
        </Button>
        <Button size="small" onClick={() => setAll(groups.cd, false)}>
          {t(Localization.ConfigTabPresetSelectNone)}
        </Button>
      </Stack>
      <AlbumRows
        albums={groups.cd}
        checked={(album) => Boolean(preset.albums[album.name])}
        onToggle={(album, value) => preset.setAlbum(album.name, value)}
      />

      <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
        <Typography variant="subtitle2">{t(Localization.ConfigTabPresetGame)}</Typography>
        <Button size="small" onClick={() => setAll(groups.game, true)}>
          {t(Localization.ConfigTabPresetSelectAll)}
        </Button>
        <Button size="small" onClick={() => setAll(groups.game, false)}>
          {t(Localization.ConfigTabPresetSelectNone)}
        </Button>
      </Stack>
      <AlbumRows
        albums={groups.game}
        checked={(album) => Boolean(preset.albums[album.name])}
        onToggle={(album, value) => preset.setAlbum(album.name, value)}
      />

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        {allAlbums.length} albums · {t(Localization.ShellDataHash)} {bundle.index.contentHash.slice(0, 8)}
      </Typography>
    </SectionPanel>
  );
}
