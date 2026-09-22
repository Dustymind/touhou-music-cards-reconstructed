/** 播放页：当前立绘（叠放卡面，切歌滑入）+ 曲目信息 + 控制条 + 接下来的牌堆扇形 + 播放设置。
 *
 * 动效对齐上游 `PlayerTab.tsx`：
 * - 接下来的牌堆是**重叠扇形**，每张卡绝对定位、`transition: left 0.5s ease-in-out, transform/background-color/filter 0.3s ease`，
 *   hover 抬起（`translateY(-10%)`）、点击＝临时跳过（临时禁用）；
 * - 当前角色的多张卡面**叠放**（上游 `CharacterCardStacked`）；
 * - 切歌时整块卡面滑入（上游是整条 `translateX` 轮播，这里用同长的 0.3s 滑入动画，见 DECISIONS D21）。
 */
import { memo, useEffect, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Divider, Stack, Switch, TextField, Typography } from "@mui/material";
import { keyframes } from "@emotion/react";
import { UpcomingFan, fanCardWidth } from "../player/UpcomingFan";

import type { AlbumRecord, DataBundle, MusicEntry } from "../../data/types";
import { useCurrentDataset } from "../../data/useDataset";
import { displayTitle } from "../../data/types";
import { Localization, t } from "../../i18n/localization";
import type { PlayerApi } from "../../audio/usePlayer";
import type { TableMap } from "../../music/sources";
import { fadeInSx, NoFontFamily } from "../../theme/theme";
import { CharacterCard } from "../components/CharacterCard";
import { glitchEnabled, preferLocalCards } from "../../runtime";
import { PlayerControl } from "../components/PlayerControl";

/** 切歌时卡片滑入（上游轮播的 `transform 0.3s ease-in-out` 同长同缓动）。 */
const slideIn = keyframes`
  from { opacity: 0; transform: translateX(12%); }
  to { opacity: 1; transform: translateX(0); }
`;

interface PlayerPanelProps {
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

/** 卡面 = 卡牌选择器卡宽 × 该倍率（用户指定 120%）。 */
const COVER_SCALE = 1.2;
/** 居中列里各行之间的间距（MD2 8dp 栅格）。 */
const PLAYER_LINE_GAP = { xs: 1, sm: 1.5 };
/** 控制区（进度条 / 音量条 / 播放控件）的宽度上限：三条滑杆共用一套尺寸。 */
const PLAYER_CONTROL_WIDTH = 420;

/** 播放页第二行：**有作者显示作者**；没有作者时看专辑的 `showAlbumName`（缺省 true），
 *  为 false 就整行不显示（例如音MAD 那批没有作者的曲目）。 */
function creditLine(entry: MusicEntry | null, albums: readonly AlbumRecord[]): string | null {
  if (!entry) return null;
  if (entry[3]) return entry[3];
  const album = albums.find((item) => item.name === entry[0]);
  return album?.showAlbumName === false ? null : entry[0];
}

function PlayerPanelInner(props: PlayerPanelProps) {
  const { bundle, player, order, temporaryDisabled, currentKey } = props;
  const dataset = useCurrentDataset(bundle);
  const cardSet = bundle.shared.cardSets.find((set) => set.id === props.cardCollection) ?? bundle.shared.cardSets[0]!;
  const character = dataset.characters.find((item) => item.key === currentKey) ?? null;

  // 卡面尺寸 = **卡牌选择器（"接下来"卡条）的卡宽 × 120%** —— 直接用选择器自己的尺寸函数，
  // 保证两边永远同一个口径（选择器 = `min(窗口宽×20%, 150)`，见 UpcomingFan.fanCardWidth）；
  // 用 resize 监听跟着卡片宽度走，窄屏宽屏同一套算法（用户要求两端统一布局）。
  const credit = creditLine(player.entry, dataset.albums);
  const [coverWidth, setCoverWidth] = useState(() =>
    Math.round(fanCardWidth(typeof window === "undefined" ? 1280 : window.innerWidth) * COVER_SCALE));
  useEffect(() => {
    const update = () => setCoverWidth(Math.round(fanCardWidth(window.innerWidth) * COVER_SCALE));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <Stack spacing={2} sx={{ width: "100%", fontFamily: NoFontFamily }}>
      <Card><CardContent>
        {/* 用户要求：**两端统一**的居中列 —— 卡面 → 曲名 → 作者/作品 → 角色名 → 进度条 → 音量条 → 播放控件 */}
        <Stack
          data-testid="player-head"
          spacing={PLAYER_LINE_GAP}
          sx={{ alignItems: "center", textAlign: "center", width: "100%" }}
        >
          {character
            ? (
              <Box
                key={currentKey}
                data-testid="current-card"
                sx={{ width: coverWidth, animation: `${slideIn} 0.3s ease-in-out` }}
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
            : (
              <CharacterCard
                cardSet={cardSet}
                file=""
                state="placeholder"
                sx={{ width: coverWidth }}
              />
            )}

          {/* 曲名（唯一的大字级） */}
          <Typography variant="h6" data-testid="now-title" sx={{ lineHeight: 1.3 }}>
            {player.entry ? displayTitle(player.entry[1]) : (props.pin ? displayTitle(props.pin[1]) : "—")}
          </Typography>

          {/* 作者不"白名单"（即非官作、标题里带 `作者 - 曲名`）→ 显示作者；否则显示作品（专辑）名 */}
          {credit && (
            <Typography variant="body2" color="text.secondary" data-testid="now-credit">
              {credit}
            </Typography>
          )}

          {/* 角色名 */}
          <Typography variant="subtitle2" data-testid="now-character">
            {character?.name ?? "—"}
          </Typography>

          {player.error && <Alert severity="warning" sx={{ py: 0, ...fadeInSx }}>{player.error}</Alert>}

          {/* 进度条 → 音量条 → 播放控件（自上而下，全部居中） */}
          <Box sx={{ width: "100%", maxWidth: PLAYER_CONTROL_WIDTH, mt: 0.5 }}>
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
          </Box>
        </Stack>
      </CardContent></Card>

      <Card><CardContent>
        <Stack direction="row" sx={{ alignItems: "center", mb: 1, gap: 1 }}>
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
        <Stack direction="row" sx={{ flexWrap: "wrap", alignItems: "center", gap: 2 }}>
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

/** 面板级 memo：外壳状态（语言 / 音乐模式 / 分区展开）变化时不必重算整页。 */
export const PlayerPanel = memo(PlayerPanelInner);
