/** 播放页：当前立绘（叠放卡面，切歌滑入）+ 曲目信息 + 控制条 + 接下来的牌堆扇形 + 播放设置。
 *
 * 动效对齐上游 `PlayerTab.tsx`：
 * - 接下来的牌堆是**重叠扇形**，每张卡绝对定位、`transition: left 0.5s ease-in-out, transform/background-color/filter 0.3s ease`，
 *   hover 抬起（`translateY(-10%)`）、点击＝临时跳过（临时禁用）；
 * - 当前角色的多张卡面**叠放**（上游 `CharacterCardStacked`）；
 * - 切歌时整块卡面滑入（上游是整条 `translateX` 轮播，这里用同长的 0.3s 滑入动画，见 DECISIONS D21）。
 */
import { Alert, Box, Button, Chip, Divider, Paper, Stack, Switch, TextField, Typography } from "@mui/material";
import { keyframes } from "@emotion/react";
import { UpcomingFan } from "../player/UpcomingFan";

import type { DataBundle, MusicEntry } from "../../data/types";
import { displayTitle } from "../../data/types";
import { Localization, t } from "../../i18n/localization";
import type { PlayerApi } from "../../audio/usePlayer";
import type { TableMap } from "../../music/sources";
import { CardAspectRatio, fadeInSx, NoFontFamily } from "../../theme/theme";
import { CharacterCard } from "../components/CharacterCard";
import { glitchEnabled, preferLocalCards } from "../../runtime";
import { PlayerControl } from "../components/PlayerControl";

/** 切歌时卡片滑入（上游轮播的 `transform 0.3s ease-in-out` 同长同缓动）。 */
const slideIn = keyframes`
  from { opacity: 0; transform: translateX(12%); }
  to { opacity: 1; transform: translateX(0); }
`;



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
  onToggleTemporary: (key: string) => void;
  cardCollection: string;
}

/** 当前卡面的宽度与叠放位移（上游叠放卡面用固定 box 宽度百分比，这里给像素值）。 */
const CURRENT_CARD_WIDTH = 140;
const STACK_OFFSET = 26;

export function PlayerPanel(props: PlayerPanelProps) {
  const { bundle, player, order, temporaryDisabled, currentKey } = props;
  const cardSet = bundle.cardSets.find((set) => set.id === props.cardCollection) ?? bundle.cardSets[0]!;
  const character = bundle.characters.find((item) => item.key === currentKey) ?? null;

  return (
    <Stack spacing={2} sx={{ width: "100%", maxWidth: 900, fontFamily: NoFontFamily }}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={2} alignItems="flex-start">
          <Box sx={{ flexShrink: 0 }}>
            {character
              ? (
                // 叠放这个角色的全部卡面（上游 `CharacterCardStacked`）：`left` 过渡让展开/切歌有位移感
                <Box
                  key={currentKey}
                  data-testid="current-card"
                  sx={{
                    position: "relative",
                    height: CURRENT_CARD_WIDTH / CardAspectRatio,
                    width: CURRENT_CARD_WIDTH + (character.card.length - 1) * STACK_OFFSET,
                    animation: `${slideIn} 0.3s ease-in-out`,
                  }}
                >
                  {character.card.map((file, index) => (
                    <Box
                      key={file}
                      sx={{
                        position: "absolute",
                        left: index * STACK_OFFSET,
                        top: 0,
                        width: CURRENT_CARD_WIDTH,
                        zIndex: index,
                        transition: "left 0.4s ease, transform 0.3s ease",
                      }}
                    >
                      <CharacterCard
                        cardSet={cardSet}
                        file={file}
                        glitch={glitchEnabled()}
                        preferLocal={preferLocalCards()}
                        data-testid={index === 0 ? "current-card-image" : undefined}
                      />
                    </Box>
                  ))}
                </Box>
              )
              : <CharacterCard cardSet={cardSet} file="" state="placeholder" sx={{ width: CURRENT_CARD_WIDTH }} />}
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
            {player.error && <Alert severity="warning" sx={{ py: 0, ...fadeInSx }}>{player.error}</Alert>}
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
        <UpcomingFan
          bundle={bundle}
          cardSet={cardSet}
          order={order}
          currentKey={currentKey}
          temporaryDisabled={temporaryDisabled}
          onToggle={props.onToggleTemporary}
        />
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
            {t(Localization.PlayerTabRotation, {
              tracks: String(order.length),
              sources: String(Object.keys(props.tables).length),
            })}
          </Typography>
        </Stack>
      </Paper>
    </Stack>
  );
}
