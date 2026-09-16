/** 播放页：当前立绘 + 曲目信息 + 控制条 + 接下来 + 抽选/重置 + 播放设置。 */
import { Alert, Box, Button, Chip, Divider, Paper, Stack, Switch, TextField, Typography } from "@mui/material";

import type { DataBundle, MusicEntry } from "../../data/types";
import { displayTitle } from "../../data/types";
import { Localization, t } from "../../i18n/localization";
import type { PlayerApi } from "../../audio/usePlayer";
import type { TableMap } from "../../music/sources";
import { NoFontFamily } from "../../theme/theme";
import { CharacterCard } from "../components/CharacterCard";
import { PlayerControl } from "../components/PlayerControl";

export interface PlayerPanelProps {
  bundle: DataBundle;
  player: PlayerApi;
  tables: TableMap;
  order: readonly string[];
  temporaryDisabled: Record<string, boolean>;
  currentKey: string | null;
  pin: MusicEntry | null;
  onShuffle: () => void;
  onSort: () => void;
  onSelect: (key: string) => void;
  onToggleTemporary: (key: string) => void;
  cardCollection: string;
}

export function PlayerPanel(props: PlayerPanelProps) {
  const { bundle, player, order, temporaryDisabled, currentKey } = props;
  const cardSet = bundle.cardSets.find((set) => set.id === props.cardCollection) ?? bundle.cardSets[0]!;
  const character = bundle.characters.find((item) => item.key === currentKey) ?? null;
  const upcoming = order.filter((key) => key !== currentKey);

  return (
    <Stack spacing={2} sx={{ width: "100%", maxWidth: 900, fontFamily: NoFontFamily }}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={2} alignItems="flex-start">
          <Box sx={{ width: 160, flexShrink: 0 }}>
            {character
              ? <CharacterCard cardSet={cardSet} file={character.card[0]!} data-testid="current-card" />
              : <CharacterCard cardSet={cardSet} file="" state="placeholder" />}
          </Box>
          <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" noWrap>{character?.name ?? "—"}</Typography>
            {player.entry ? (
              <>
                <Typography variant="body1">{displayTitle(player.entry[1])}</Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 0.5 }}>
                  <Chip size="small" variant="outlined" label={player.entry[0]} />
                  <Chip size="small" label={player.entry[2]} />
                  {player.sourceId && <Chip size="small" color="primary" label={player.sourceId} />}
                </Stack>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {props.pin ? displayTitle(props.pin[1]) : "—"}
              </Typography>
            )}
            {player.error && <Alert severity="warning" sx={{ py: 0 }}>{player.error}</Alert>}
            <PlayerControl
              playing={player.playback === "playing" || player.playback === "countingDown"}
              currentTime={player.currentTime}
              duration={player.duration}
              volume={player.volume}
              disabled={!player.entry}
              onPlay={player.play}
              onPause={player.pause}
              onPrevious={player.previous}
              onNext={player.next}
              onSeek={player.seek}
              onVolume={player.setVolume}
            />
          </Stack>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="subtitle2">{t(Localization.PlayerTabUpcoming)}</Typography>
          <Box sx={{ flex: 1 }} />
          <Button size="small" onClick={props.onShuffle}>{t(Localization.PlayerTabShuffle)}</Button>
          <Button size="small" onClick={props.onSort}>{t(Localization.PlayerTabSort)}</Button>
        </Stack>
        <Divider sx={{ mb: 1 }} />
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
          {upcoming.map((key) => {
            const item = bundle.characters.find((character) => character.key === key);
            if (!item) return null;
            const disabled = Boolean(temporaryDisabled[key]);
            return (
              <Chip
                key={key}
                size="small"
                variant={disabled ? "outlined" : "filled"}
                color={disabled ? "default" : "primary"}
                label={item.name}
                onClick={() => props.onSelect(key)}
                onDelete={() => props.onToggleTemporary(key)}
                sx={disabled ? { textDecoration: "line-through", opacity: 0.6 } : undefined}
              />
            );
          })}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", alignItems: "center" }}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Switch
              size="small"
              checked={player.setting.randomStart}
              onChange={(event) => player.setSetting({ randomStart: event.target.checked })}
            />
            <Typography variant="body2">{t(Localization.PlayerTabRandomStart)}</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Switch
              size="small"
              checked={player.setting.countdown}
              onChange={(event) => player.setSetting({ countdown: event.target.checked })}
            />
            <Typography variant="body2">{t(Localization.PlayerTabCountdown)}</Typography>
          </Stack>
          <TextField
            size="small"
            type="number"
            label={t(Localization.PlayerTabPlaybackDurationLabel)}
            value={player.setting.durationSeconds}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              player.setSetting({ durationSeconds: Number.isNaN(parsed) || parsed < 0 ? 0 : parsed });
            }}
            sx={{ width: "14em" }}
          />
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary">
            {order.length} in rotation · {Object.keys(props.tables).length} sources
          </Typography>
        </Stack>
      </Paper>
    </Stack>
  );
}
