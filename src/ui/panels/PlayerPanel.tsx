/** 播放页：当前立绘（叠放卡面，切歌滑入）+ 曲目信息 + 控制条 + 接下来的牌堆扇形 + 播放设置。
 *
 * 动效对齐上游 `PlayerTab.tsx`：
 * - 接下来的牌堆是**重叠扇形**，每张卡绝对定位、`transition: left 0.5s ease-in-out, transform/background-color/filter 0.3s ease`，
 *   hover 抬起（`translateY(-10%)`）、点击＝临时跳过（临时禁用）；
 * - 当前角色的多张卡面**叠放**（上游 `CharacterCardStacked`）；
 * - 切歌时整块卡面滑入（上游是整条 `translateX` 轮播，这里用同长的 0.3s 滑入动画，见 DECISIONS D21）。
 */
import { useEffect, useRef, useState } from "react";
import { memo } from "react";
import { Alert, Box, Button, Card, CardContent, Divider, Stack, Switch, TextField, Typography } from "@mui/material";
import { keyframes } from "@emotion/react";
import { UpcomingFan } from "../player/UpcomingFan";

import type { DataBundle, MusicEntry } from "../../data/types";
import { displayTitle } from "../../data/types";
import { Localization, t } from "../../i18n/localization";
import type { PlayerApi } from "../../audio/usePlayer";
import type { TableMap } from "../../music/sources";
import type { MusicMode } from "../../music/mode";
import { fadeInSx, NoFontFamily } from "../../theme/theme";
import { CARD_WIDTH_PERCENTAGE } from "../../game/gameSetting";
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
  /** 音乐模式（原曲 / 音MAD）：只影响"接下来能选哪些曲目" */
  musicMode: MusicMode;
}

/** 当前卡面的宽度（上游按容器百分比，这里给像素值）。 */
const CURRENT_CARD_WIDTH = 140;

/** 卡面相对"卡牌选择器"的显示倍率（用户指定 120%）。 */
const COVER_SCALE = 1.2;
/** 居中列里各行之间的间距（MD2 8dp 栅格）。 */
const PLAYER_LINE_GAP = { xs: 1, sm: 1.5 };
/** 控制区（进度条 / 音量条 / 播放控件）的宽度上限：三条滑杆共用一套尺寸。 */
const PLAYER_CONTROL_WIDTH = 420;

/** 音MAD 类曲目的标题是 `作者 - 曲名`：作者不在"官作白名单"里 → 取作者，曲名去掉前缀。 */
function splitCredit(title: string): { author: string | null; title: string } {
  const matched = /^([^-]{1,40}?)\s+-\s+(.+)$/.exec(title);
  return matched ? { author: matched[1]!.trim(), title: matched[2]!.trim() } : { author: null, title };
}

/** 卡片上显示的曲名（音MAD 去掉 `作者 - ` 前缀）。 */
function trackTitle(title: string): string {
  return splitCredit(title).title;
}

/** 第二行：非官作（有作者）显示作者，否则显示作品（专辑）名。 */
function creditLine(entry: MusicEntry | null, _character: unknown): string {
  if (!entry) return "—";
  return splitCredit(entry[1]).author ?? entry[0];
}

function PlayerPanelInner(props: PlayerPanelProps) {
  const { bundle, player, order, temporaryDisabled, currentKey } = props;
  const cardSet = bundle.cardSets.find((set) => set.id === props.cardCollection) ?? bundle.cardSets[0]!;
  const character = bundle.characters.find((item) => item.key === currentKey) ?? null;

  // 卡面尺寸 = **卡牌选择器的 120%**（卡牌选择器 = 牌桌/轮播用的同一个卡宽比例）。
  // 用 ResizeObserver 跟着卡片宽度走，窄屏宽屏同一套算法（用户要求两端统一布局）。
  // 观测的是**卡片内容区**（整宽），不是居中的那一列 —— 列本身宽度随内容收缩，观测它会越算越小 ✗
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [coverWidth, setCoverWidth] = useState(CURRENT_CARD_WIDTH);
  useEffect(() => {
    const element = cardRef.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      const container = element.getBoundingClientRect().width;
      setCoverWidth(Math.round(container * CARD_WIDTH_PERCENTAGE.default * COVER_SCALE));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <Stack spacing={2} sx={{ width: "100%", fontFamily: NoFontFamily }}>
      <Card><CardContent ref={cardRef}>
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
            {player.entry ? displayTitle(trackTitle(player.entry[1])) : (props.pin ? displayTitle(props.pin[1]) : "—")}
          </Typography>

          {/* 作者不"白名单"（即非官作、标题里带 `作者 - 曲名`）→ 显示作者；否则显示作品（专辑）名 */}
          <Typography variant="body2" color="text.secondary" data-testid="now-credit">
            {creditLine(player.entry, character)}
          </Typography>

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
