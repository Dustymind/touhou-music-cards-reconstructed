/** 播放页：当前立绘（叠放卡面，切歌滑入）+ 曲目信息 + 控制条 + 接下来的牌堆扇形 + 播放设置。
 *
 * 动效对齐上游 `PlayerTab.tsx`：
 * - 接下来的牌堆是**重叠扇形**，每张卡绝对定位、`transition: left 0.5s ease-in-out, transform/background-color/filter 0.3s ease`，
 *   hover 抬起（`translateY(-10%)`）、点击＝临时跳过（临时禁用）；
 * - 当前角色的多张卡面**叠放**（上游 `CharacterCardStacked`）；
 * - 切歌时整块卡面滑入（上游是整条 `translateX` 轮播，这里用同长的 0.3s 滑入动画，见 DECISIONS D21）。
 */
import { Alert, Box, Button, Card, CardContent, Chip, Divider, Stack, Switch, TextField, Typography } from "@mui/material";
import { keyframes } from "@emotion/react";
import { UpcomingFan } from "../player/UpcomingFan";

import type { DataBundle, MusicEntry } from "../../data/types";
import { displayTitle } from "../../data/types";
import { Localization, t } from "../../i18n/localization";
import type { PlayerApi } from "../../audio/usePlayer";
import type { TableMap } from "../../music/sources";
import type { MusicMode } from "../../music/mode";
import { fadeInSx, NoFontFamily } from "../../theme/theme";
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
  /** 音乐模式（原曲 / 音MAD）：只影响"接下来能选哪些曲目" */
  musicMode: MusicMode;
}

/** 当前卡面的宽度（上游按容器百分比，这里给像素值）。 */
const CURRENT_CARD_WIDTH = 140;

export function PlayerPanel(props: PlayerPanelProps) {
  const { bundle, player, order, temporaryDisabled, currentKey } = props;
  const cardSet = bundle.cardSets.find((set) => set.id === props.cardCollection) ?? bundle.cardSets[0]!;
  const character = bundle.characters.find((item) => item.key === currentKey) ?? null;

  return (
    <Stack spacing={2} sx={{ width: "100%", fontFamily: NoFontFamily }}>
      <Card><CardContent>
        <Stack direction="row" spacing={2} alignItems="flex-start">
          <Box sx={{ flexShrink: 0 }}>
            {character
              ? (
                // 只显示这个角色的第一张卡面（上游是叠放多张；用户要求卡牌区块不重合，其余在牌堆里看）
                <Box
                  key={currentKey}
                  data-testid="current-card"
                  sx={{
                    width: CURRENT_CARD_WIDTH,
                    animation: `${slideIn} 0.3s ease-in-out`,
                  }}
                >
                  <CharacterCard
                    cardSet={cardSet}
                    file={character.card[0]!}
                    glitch={glitchEnabled()}
                    preferLocal={preferLocalCards()}
                    data-testid="current-card-image"
                  />
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
      </CardContent></Card>

      <Card><CardContent>
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
      </CardContent></Card>

      <Card><CardContent>
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
      </CardContent></Card>
    </Stack>
  );
}
