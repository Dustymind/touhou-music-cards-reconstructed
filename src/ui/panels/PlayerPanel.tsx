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
import { Alert, Box, Button, Card, CardContent, Chip, Divider, Stack, Switch, TextField, Typography } from "@mui/material";
import { keyframes } from "@emotion/react";
import { UpcomingFan } from "../player/UpcomingFan";

import type { DataBundle, MusicEntry } from "../../data/types";
import { displayTitle } from "../../data/types";
import { Localization, t } from "../../i18n/localization";
import type { PlayerApi } from "../../audio/usePlayer";
import type { TableMap } from "../../music/sources";
import type { MusicMode } from "../../music/mode";
import { CardAspectRatio, fadeInSx, NoFontFamily } from "../../theme/theme";
import { CharacterCard } from "../components/CharacterCard";
import { glitchEnabled, preferLocalCards } from "../../runtime";
import { PlayerControl, TEXT_INSET_SX } from "../components/PlayerControl";

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

/** 桌面播放卡片的阅读宽度上限：整块居中时这一列不再被卡片撑满（tag / 控制条都在这个宽度内）。 */
const PLAYER_READING_WIDTH = 640;

function PlayerPanelInner(props: PlayerPanelProps) {
  const { bundle, player, order, temporaryDisabled, currentKey } = props;
  const cardSet = bundle.cardSets.find((set) => set.id === props.cardCollection) ?? bundle.cardSets[0]!;
  const character = bundle.characters.find((item) => item.key === currentKey) ?? null;

  // 桌面卡面宽度 = 信息列高度 × 卡面比例：用 ResizeObserver 跟随内容高度（CSS 里做不成 —— 
  // `align-self: stretch` + `aspect-ratio` 在 flex 行里会退化成 0 宽，卡面会压在右边文字上）
  const headRef = useRef<HTMLDivElement | null>(null);
  const [coverWidth, setCoverWidth] = useState(CURRENT_CARD_WIDTH);
  useEffect(() => {
    const element = headRef.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      const height = element.getBoundingClientRect().height;
      setCoverWidth(Math.max(120, Math.min(280, Math.round(height * CardAspectRatio))));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <Stack spacing={2} sx={{ width: "100%", fontFamily: NoFontFamily }}>
      <Card><CardContent>
        <Stack
          data-testid="player-head"
          // 窄屏纵向堆叠：原来卡面与信息并排，信息列只剩 ~176dp，控制条与音量滑杆直接被挤出卡片
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{
            // 用户要求：桌面**整块居中**（相对位置不变 —— 只是把这一组按自身宽度摆到卡片中间）
            // 桌面用 stretch：卡面的高度 = 右侧（曲名/角色名/tag/进度条/音量条/控件）累加高度
            alignItems: { xs: "center", sm: "stretch" },
            justifyContent: { xs: "center", sm: "center" },
          }}
        >
          <Box sx={{ flexShrink: 0, alignSelf: { xs: "center", sm: "flex-start" } }}>
            {character
              ? (
                // 只显示这个角色的第一张卡面（上游是叠放多张；用户要求卡牌区块不重合，其余在牌堆里看）
                <Box
                  key={currentKey}
                  data-testid="current-card"
                  sx={{
                    // 桌面：宽度由 ResizeObserver 按信息列高度换算（高度 × 卡面比例 = 宽度），
                    // 于是卡面高度正好等于右侧累加高度，且宽度是**真实占位**（不会压到右边文字上）
                    width: { xs: CURRENT_CARD_WIDTH, sm: coverWidth },
                    animation: `${slideIn} 0.3s ease-in-out`,
                  }}
                >
                  <CharacterCard
                    cardSet={cardSet}
                    file={character.card[0]!}
                    glitch={glitchEnabled()}
                    preferLocal={preferLocalCards()}
                    sx={{ width: "100%", height: { sm: "100%" } }}
                    data-testid="current-card-image"
                  />
                </Box>
              )
              : (
                <CharacterCard
                  cardSet={cardSet}
                  file=""
                  state="placeholder"
                  sx={{ width: { xs: CURRENT_CARD_WIDTH, sm: coverWidth } }}
                />
              )}
          </Box>
          {/* 曲名 / 角色名 / tag 之间的行距按用户要求放大（8dp → 12dp）。
              桌面给一个阅读宽度上限：否则这一列会把卡片撑满，"居中"看不出来 */}
          <Stack
            ref={headRef}
            spacing={1.5}
            sx={{ flex: { xs: 1, sm: "0 1 auto" }, width: { xs: "100%", sm: "auto" },
              minWidth: 0, maxWidth: { sm: PLAYER_READING_WIDTH } }}
          >
            {/* 曲名在上略大、角色名在下略小；整块与进度条圆点左边缘同一条竖线（TEXT_INSET_SX）。
                内缩只加在文字块上，控制条三行仍以列首为基准 —— 否则圆点中心对不上音量键中心 */}
            {/* 这一层既是"缩进到圆点左边缘"，也是文字块自己的行距容器 */}
            <Stack spacing={1.5} sx={TEXT_INSET_SX}>
            {/* 用户要求：**曲名在上、略大**（h6 = 20sp），**角色名在下、略小**（body2 = 14sp，次要色） */}
            {player.entry ? (
              <>
                <Typography
                  variant="h6"
                  data-testid="now-title"
                  sx={{ lineHeight: 1.3, textAlign: { xs: "center", sm: "left" } }}
                >
                  {displayTitle(player.entry[1])}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  data-testid="now-character"
                  sx={{ textAlign: { xs: "center", sm: "left" } }}
                >
                  {character?.name ?? "—"}
                </Typography>
                {/* 只用 gap：Stack 的 spacing 是给子项加 margin，换行后新行首项会多出左边距（实测 196 vs 188） */}
                <Stack
                  direction="row"
                  data-testid="player-tags"
                  sx={{
                    flexWrap: "wrap",
                    gap: 0.5,
                    // 窄屏：整块 tag 居中（宽度按内容收缩 + 左右自动外边距）；
                    // **块内**仍是正常换行 + 左对齐（不用 justifyContent: center —— 那会把每一行都居中 ✗）
                    width: "fit-content",
                    maxWidth: "100%",
                    mx: { xs: "auto", sm: 0 },
                  }}
                >
                  <Chip size="small" variant="outlined" label={player.entry[0]} />
                  <Chip size="small" label={player.entry[2]} />
                  {player.sourceId && <Chip size="small" color="primary" label={player.sourceId} />}
                </Stack>
              </>
            ) : (
              <>
                <Typography
                  variant="h6"
                  data-testid="now-title"
                  sx={{ lineHeight: 1.3, textAlign: { xs: "center", sm: "left" } }}
                >
                  {props.pin ? displayTitle(props.pin[1]) : "—"}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  data-testid="now-character"
                  sx={{ textAlign: { xs: "center", sm: "left" } }}
                >
                  {character?.name ?? "—"}
                </Typography>
              </>
            )}
            </Stack>
            {player.error && <Alert severity="warning" sx={{ py: 0, ...fadeInSx }}>{player.error}</Alert>}
            {/* 控制条固定在 tag 下方，自上而下：进度条 → 音量 → 播放控件
                （桌面左对齐、移动端居中；对齐由 PlayerControl 内部按断点处理） */}
            {/* 间距交给父级 Stack 的 spacing（8dp），这里不再额外加 mt，保证与上方 chip 的间距一致 */}
            <Box sx={{ width: "100%" }}>
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
