/** 应用外壳：页签栏（含 Alice 彩蛋按钮）+ 当前页。 */
import {
  AppBar, Box, Button, Container, Stack, Tab, Tabs, Toolbar, Typography,
} from "@mui/material";

import { useEffect, useMemo, useRef } from "react";

import { Localization, t } from "../../i18n/localization";
import { stableHash } from "../../cheat";
import { TAB_ORDER, useSession, type TabId } from "../../store/session";
import { NoFontFamily } from "../../theme/theme";
import type { DataBundle, MusicEntry } from "../../data/types";
import { usePreset } from "../../store/preset";
import { useQueue } from "../../store/queue";
import { useSources } from "../../music/useSources";
import { usePlayer } from "../../audio/usePlayer";
import { allowedTracks, mergeWithDefaults } from "../../music/selection";
import { effectivePin } from "../../music/presetView";
import { useSingleTrack } from "../../store/single";
import { useGame } from "../../game/useGame";
import { turnSeed } from "../../game/rules";
import { PlayerPanel } from "../panels/PlayerPanel";
import { ConfigPanel } from "../panels/ConfigPanel";
import { GamePanel } from "../panels/GamePanel";
import { ListPanel } from "../panels/ListPanel";

const ALICE_LABELS = [
  "Alice is the best!",
  "We need more Alice!",
  "All hail Alice!",
  "Alice is right!",
  "Alice fumofumo~",
] as const;

/** 上游用页面级 PRNG 选一句；这里用稳定哈希，两端一致且可测。 */
export function aliceLabel(smallScreen: boolean): string {
  if (smallScreen) return "Alice!";
  return ALICE_LABELS[stableHash("Alice") % ALICE_LABELS.length]!;
}

export function AppShell({ bundle }: { bundle: DataBundle }) {
  const { tab, setTab, locale, cardCollection, sourceOverrides } = useSession();
  const preset = usePreset();
  const queue = useQueue();
  const single = useSingleTrack();
  const game = useGame((slice) => slice.game);
  /**
   * 对局进行中（选牌阶段之外、尚未终局）：音乐交给**对局**驱动 ——
   * 回合角色决定听哪首，倒计时响铃，回合开始起播。上游此时也会锁住其它页签。
   */
  const gameActive = game.state !== "selecting" && game.state !== "finished";

  // 联机握手要用静态数据哈希：挂在 window 上，避免层层透传
  useEffect(() => {
    (window as unknown as { __TMC_DATA_HASH__?: string }).__TMC_DATA_HASH__ = bundle.index.contentHash;
  }, [bundle.index.contentHash]);

  // 预设：持久化状态与新专辑默认勾选合并（首帧就要用它算队列，不能等 effect）
  const activePreset = useMemo(() => mergeWithDefaults(preset, bundle.albums), [preset, bundle.albums]);

  // 把合并结果写回 store：配置页读的是 store，首帧之后必须与 activePreset 一致
  // （否则界面会显示"全部未勾选"，而队列却按默认全选在跑 —— 浏览器实测踩到过）
  useEffect(() => {
    preset.sync(bundle.albums);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle]);

  /** 仅单曲模式：每角色固定一首（未手选则取预设允许的第一首）。 */
  const pinned = useMemo(() => {
    if (!single.enabled) return {};
    const pins: Record<string, MusicEntry> = {};
    for (const character of bundle.characters) {
      const entry = effectivePin(activePreset, character, single.pins);
      if (entry) pins[character.key] = entry;
    }
    return pins;
  }, [single.enabled, single.pins, activePreset, bundle.characters]);

  const usableKeys = useMemo(
    () => bundle.characters
      .filter((character) => allowedTracks(activePreset, character).entries.length > 0
        && !single.disabledCharacters[character.key])
      .map((character) => character.key),
    [activePreset, bundle.characters, single.disabledCharacters],
  );

  // 队列跟着"可用角色集合"走：新增角色追加到末尾，消失的剔除，保留用户顺序
  const usableKeySignature = usableKeys.join("|");
  useEffect(() => {
    queue.syncKeys(usableKeySignature ? usableKeySignature.split("|") : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usableKeySignature]);

  const sources = useSources(bundle.sources, sourceOverrides);

  const player = usePlayer({
    characters: bundle.characters,
    albums: bundle.albums,
    tables: sources.tables,
    sourceOrder: sources.order,
    preset: activePreset,
    pinned,
    // 对局听回合角色，平时听轮播队列
    currentKey: gameActive ? game.currentKey : queue.currentKey,
    // 对局里用 (回合号, 角色) 派生的种子：两端必然选到同一首
    seed: gameActive ? turnSeed(game.gameSeed, game.turnSeq, game.currentKey) : queue.seed,
    setCurrent: queue.setCurrent,
    step: (direction) => queue.step(direction, queue.order),
  });

  // ---- 对局驱动播放：倒计时响铃、回合开始起播、停局/终局停下 ----
  const phase = gameActive ? game.state : "off";
  const previousPhase = useRef(phase);
  useEffect(() => {
    const before = previousPhase.current;
    previousPhase.current = phase;
    if (before === phase) return;
    if (phase === "countdown") {
      player.pause();        // 先停掉上一回合的曲子
      player.ringBell();     // 3 秒倒计时响一声
      return;
    }
    if (phase === "turnStart") player.playImmediate();
    if (phase === "off") player.pause();
    // player 每次渲染都是新对象，只按阶段变化触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const jumpToAlice = () => {
    const alice = bundle.characters.find((character) => character.key === "alice-margatroid");
    setTab("player");
    if (alice) queue.setCurrent(alice.key);
  };
  const names: Record<TabId, string> = {
    player: t(Localization.TabNamePlayer),
    list: t(Localization.TabNameList),
    config: t(Localization.TabNameConfigs),
    game: t(Localization.TabNameAbout),
  };

  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "background.default", fontFamily: NoFontFamily }}>
      {/* MD2 顶部应用栏：标题 + 页签 + 彩蛋按钮 */}
      <AppBar position="static">
        <Toolbar sx={{ gap: 2, alignItems: "center" }}>
          <Typography variant="h6" sx={{ whiteSpace: "nowrap" }}>
            {t(Localization.ShellAppTitle)}
          </Typography>
          <Tabs
            value={tab}
            onChange={(_event, value: TabId) => setTab(value)}
            textColor="inherit"
            indicatorColor="primary"
            variant="scrollable"
            scrollButtons="auto"
            sx={{ flex: 1, minHeight: 48 }}
          >
            {TAB_ORDER.map((id) => (
              <Tab
                key={id}
                value={id}
                label={names[id]}
                disabled={gameActive && id !== "game"}
                data-testid={`tab-${id}`}
              />
            ))}
          </Tabs>
          <Typography variant="overline" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
            {t(Localization.ShellDataHash)} {bundle.index.contentHash.slice(0, 12)} · {locale}
          </Typography>
          <Button color="success" onClick={jumpToAlice} disabled={gameActive}>
            {aliceLabel(false)}
          </Button>
        </Toolbar>
      </AppBar>

      {/* MD2 响应式页边距：移动 16dp / 桌面 24dp */}
      <Container maxWidth={false} sx={{ px: { xs: 2, md: 3 }, py: 3 }}>
        <Stack spacing={3} sx={{ width: "100%" }}>
          {tab === "player" && (
            <PlayerPanel
            bundle={bundle}
            player={player}
            tables={sources.tables}
            order={queue.order}
            temporaryDisabled={queue.temporaryDisabled}
            currentKey={queue.currentKey}
            pin={queue.currentKey ? pinned[queue.currentKey] ?? null : null}
            cardCollection={cardCollection}
            onShuffle={() => { player.pause(); queue.regenerate(usableKeys, true); }}
            onSort={() => { player.pause(); queue.regenerate(usableKeys, false); }}
            onToggleTemporary={(key) => queue.toggleTemporary(key)}
          />
        )}
          {tab === "list" && <ListPanel bundle={bundle} />}
          {tab === "config" && <ConfigPanel bundle={bundle} tables={sources.tables} />}
          {tab === "game" && <GamePanel bundle={bundle} />}
        </Stack>
      </Container>
    </Box>
  );
}
