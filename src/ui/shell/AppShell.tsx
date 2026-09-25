/** 应用外壳：页签栏（含 Alice 彩蛋按钮与「关于」弹窗入口）+ 当前页。 */
import InfoRounded from "@mui/icons-material/InfoRounded";
import {
  AppBar, Box, Button, Container, IconButton, Stack, Tab, Tabs, Toolbar, Typography, useMediaQuery,
} from "@mui/material";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Localization, localized, t } from "../../i18n/localization";
import { stableHash } from "../../rng";
import { TAB_ORDER, useSession, type TabId } from "../../store/session";
import { MD2, NoFontFamily } from "../../theme/theme";
import { trackId, type DataBundle, type MusicEntry } from "../../data/types";
import { usePreset } from "../../store/preset";
import { currentQueue, useQueue } from "../../store/queue";
import { selectSessionSeed, useSeeds } from "../../store/seeds";
import { useSources } from "../../music/useSources";
import { sourceStoreFor, useSourceOverrides } from "../../store/sources";
import { usePlayer } from "../../audio/usePlayer";
import { GAME_FADE_MS } from "../../audio/fade";
import { allowedTracks, mergeWithDefaults } from "../../music/selection";
import { datasetFor } from "../../data/useDataset";
import { withPackSnapshot } from "../../data/packSnapshot";
import { effectivePin } from "../../music/presetView";
import { singleStoreFor, useSingleTrack } from "../../store/single";
import { useGame } from "../../game/useGame";
import { turnSeed } from "../../game/rules";
import { useNet } from "../../net/useNet";
import { PlayerPanel } from "../panels/PlayerPanel";
import { ConfigPanel } from "../panels/ConfigPanel";
import { GamePanel } from "../panels/GamePanel";
import { ListPanel } from "../panels/ListPanel";
import { AboutDialog } from "../components/AboutDialog";
import { aboutContent } from "../../content/about";
import { packAuthorsFor } from "../../music/packAuthors";

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

/** 倒计时三声的偏移（毫秒，相对进入 `countdown` 那一刻）—— 与 `useGameLoop` 的 3000ms 对齐。 */
export const COUNTDOWN_TICK_MS = [0, 1000, 2000] as const;

/** 迟到容忍（毫秒）：后台标签页会把定时器节流成"回来时一次全放"，几声挤在一起就是连成一串 ✗。
 *  迟到超过这个量就跳过这一声 —— 宁缺毋滥，正常抖动（几十毫秒）不受影响（D125）。 */
export const TICK_LATE_TOLERANCE_MS = 350;

/** 这一声该不该响：`offsetMs` 是它本该响的时刻，`elapsedMs` 是进入倒计时后实际过了多久。 */
export function tickDue(elapsedMs: number, offsetMs: number): boolean {
  return elapsedMs - offsetMs <= TICK_LATE_TOLERANCE_MS;
}

/** 联机握手要比的**两个**数据哈希（一个模式一个，契约 `docs/otomads-separation-v1.md` §6 C3）。 */
export function dataHashes(bundle: DataBundle): Record<string, string> {
  return {
    originals: bundle.datasets.originals.index.contentHash,
    otomads: bundle.datasets.otomads.index.contentHash,
  };
}

export function AppShell({ bundle }: { bundle: DataBundle }) {
  /** 窄屏：页签折到第二行、彩蛋文案用短版（上游也是小屏显示 "Alice!"） */
  const isSmallScreen = useMediaQuery("(max-width: 599.95px)");
  /** 「关于」弹窗的开合：纯界面状态（不落盘、不进联机快照），所以留在组件里 */
  const [aboutOpen, setAboutOpen] = useState(false);
  const {
    tab, setTab, locale, cardCollection, musicMode, localMusicUrl,
    entryRequest, setEntryRequest,
  } = useSession();
  /**
   * 自带数据集（当前模式那份）：它决定**取哪些源表**。放在最前面是因为源现在也提供**曲目表**
   * （D145）—— 数据集要等源回答之后才能定下来。`withPackSnapshot` 不换音源注册表，所以
   * 用哪一份的 `sources` 取表都一样（这里用自带那份，依赖是同一个数组，不会自转）。
   */
  const bakedDataset = datasetFor(bundle, musicMode);
  const { overrides: sourceOverrides } = useSourceOverrides();
  const sources = useSources(bakedDataset.sources, sourceOverrides, localMusicUrl);

  /** 源给的曲目表（D145）：按回退顺序取第一个拿到了的源。注册表里音MAD 只有一个源，这是保守写法。 */
  const snapshot = useMemo(() => {
    for (const sourceId of sources.order) {
      const found = sources.tables[sourceId]?.snapshot;
      if (found !== undefined) return found;
    }
    return undefined;
  }, [sources.tables, sources.order]);

  /**
   * **生效的数据集** = 自带那份 + 源给的曲目表。取不到（老清单 / 源挂了 / 形状不对）就用自带那份。
   *
   * 中间态：首个可玩帧**不等源**（先按自带那份渲染，D145 §8.4 的裁定）；源回来之后整棵子树跟着
   * `liveBundle` 重渲染 —— 队列、预设、单曲存档都有各自的 sync/prune 跟着新表走，而
   * `window.__TMC_DATA_HASH__` 也在同一次重渲染里改写。建/加入房间是用户动作、必然更晚，
   * 所以握手期拿到的一定是**生效后**的哈希。
   */
  const liveBundle = useMemo(() => withPackSnapshot(bundle, snapshot), [bundle, snapshot]);
  const dataset = datasetFor(liveBundle, musicMode);
  const preset = usePreset();
  const queue = useQueue();
  const single = useSingleTrack();
  const net = useNet();
  /** 会话种子：单机 = 本机自己那份；联机 = **主机**下发、本机采用（D104） */
  const sessionSeed = useSeeds(selectSessionSeed);
  const game = useGame((slice) => slice.game);
  /**
   * 对局进行中（选牌阶段之外、尚未终局）：音乐交给**对局**驱动 ——
   * 回合角色决定听哪首，倒计时响铃，回合开始起播。上游此时也会锁住其它页签。
   */
  const gameActive = game.state !== "selecting" && game.state !== "finished";

  // 联机握手要用静态数据哈希：挂在 window 上，避免层层透传。
  // **用生效后的那份**（D145）：源给了曲目表就按它算 —— 否则一端有源、一端只有兜底时，
  // 明明曲目表一样却会在握手期被判"数据不一致"。
  useEffect(() => {
    (window as unknown as { __TMC_DATA_HASH__?: Record<string, string> }).__TMC_DATA_HASH__ =
      dataHashes(liveBundle);
  }, [liveBundle]);

  // 预设：持久化状态与新专辑默认勾选合并（首帧就要用它算队列，不能等 effect）
  const activePreset = useMemo(() => mergeWithDefaults(preset, dataset.albums), [preset, dataset.albums]);

  // 把合并结果写回 store：配置页读的是 store，首帧之后必须与 activePreset 一致
  // （否则界面会显示"全部未勾选"，而队列却按默认全选在跑 —— 浏览器实测踩到过）
  // 预设按模式分键（B）：切模式要 sync **新那把**，否则切过去第一眼还是"全部未勾选"
  useEffect(() => {
    preset.sync(dataset.albums);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveBundle, musicMode]);

  /** 仅单曲模式：每角色固定一首（未手选则取预设允许的第一首）。 */
  const pinned = useMemo(() => {
    if (!single.enabled) return {};
    const pins: Record<string, MusicEntry> = {};
    for (const character of dataset.characters) {
      const entry = effectivePin(activePreset, character, single.pins);
      if (entry) pins[character.key] = entry;
    }
    return pins;
  }, [single.enabled, single.pins, activePreset, dataset.characters]);

  // C：数据集只含本模式有曲目的角色，所以"可用"只剩"预设允许且未被单曲模式禁用"
  const usableKeys = useMemo(
    () => dataset.characters
      .filter((character) =>
        allowedTracks(activePreset, character).entries.length > 0
        && !single.disabledCharacters[character.key])
      .map((character) => character.key),
    [activePreset, dataset.characters, single.disabledCharacters],
  );

  // 队列跟着"可用角色集合"走：新增角色追加到末尾，消失的剔除，保留用户顺序。
  // 依赖用 **JSON 签名**：`usableKeys` 是数组，直接进依赖会跟着它的身份空转（R7①）
  const usableKeySignature = JSON.stringify(usableKeys);
  useEffect(() => {
    queue.syncKeys(usableKeys);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usableKeySignature]);

  // 音源表在上面（D145：源也提供曲目表，数据集要等它回来）—— 这里只剩"数据更新后清理死条目"。

  // 数据更新后清理存档里的死条目：注册表里没有的音源 id、数据集里没有的角色 key。
  // 两把 store 都按音乐模式分键，两处都取**当前模式**那一把，所以不会误删另一模式。
  // 依赖只放数据侧（`dataset` 换模式即换一份新对象）：store 句柄每次渲染都是新的，进了依赖会自转。
  useEffect(() => {
    const characterKeys = dataset.characters.map((character) => character.key);
    singleStoreFor(musicMode).getState().prune(characterKeys);

    // 点播请求存的是**角色 key**：那个角色已经不在数据集里了，请求就该让位（B2 的同一条原则）。
    // 按角色判，不要按音源 id 判 —— 音源注册表里永远没有角色 key，那样写会误清掉还在的角色。
    // 点播本身也要进依赖：请求是渲染之后才写进 session 的，只看数据集会拿旧闭包判（漏清）。
    const requested = entryRequest?.key;
    if (requested !== undefined && !characterKeys.includes(requested)) {
      useSession.getState().clearEntryRequest(requested);
    }
    sourceStoreFor(musicMode).getState().prune(dataset.sources.map((source) => source.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, entryRequest?.key]);

  // 列表页点播：把"选中的那一首"并进 pinned（播放器本来就有"角色 → 指定曲目"的机制），
  // 于是 entry 的解析结果就是用户点的那一首；单曲模式的 pin 仍然生效，点播优先。
  const pinnedWithRequest = useMemo(() => {
    if (!entryRequest) return pinned;
    return { ...pinned, [entryRequest.key]: entryRequest.entry };
  }, [pinned, entryRequest]);

  // 每个源自己的响度表（D130 + D139）：**源在 manifest 里声明的优先**（表跟着源部署，跨宿主都不用改应用），
  // 没声明才回落到注册表里那份（相对数据集目录）。源没表 ⇒ 播放层按 1 处理。
  const loudnessUrls = useMemo(() => {
    const out: Record<string, string> = {};
    for (const source of dataset.sources) {
      const url = sources.tables[source.id]?.loudnessUrl ?? source.loudnessUrl;
      if (url) out[source.id] = url;
    }
    return out;
  }, [dataset.sources, sources.tables]);

  // 外置曲库（音MAD 曲包）的曲目署名：**本地曲库助手没在跑就是空数组**（`packAuthorsFor` 里判的），
  // 空数组时弹窗里那一行整行不显示。`sources.tables` 换了身份（载入进度变化）就重算。
  // 用**生效后**的 bundle：源多给的曲目（含它们的作者）也要出现在署名里（D145）。
  const packAuthors = useMemo(
    () => packAuthorsFor(liveBundle, dataset, sources.tables),
    [liveBundle, dataset, sources.tables],
  );

  const player = usePlayer({
    dataset,
    loudnessUrls,
    tables: sources.tables,
    sourceOrder: sources.order,
    preset: activePreset,
    pinned: pinnedWithRequest,
    // 对局中：忽略音乐预设（= 全曲库 ✓），并排除本局已播过的曲目 ✓
    ignorePreset: gameActive,
    played: game.playedTracks,
    // 对局听回合角色，平时听轮播队列
    currentKey: gameActive ? game.currentKey : queue.currentKey,
    // 对局里用 (回合号, 角色) 派生的种子：两端必然选到同一首；平时用会话种子（联机时来自主机）
    seed: gameActive ? turnSeed(game.gameSeed, game.turnSeq, game.currentKey) : sessionSeed,
    setCurrent: queue.setCurrent,
    step: (direction) => queue.step(direction, queue.order),
  });

  // ---- 列表页点播：状态更新后 entry 才是新的一首，所以在 effect 里起播 ----
  const [playRequestSeq, setPlayRequestSeq] = useState(0);
  const playTrack = useCallback((key: string, entry: MusicEntry) => {
    setEntryRequest({ key, entry });      // 让播放器解析到这一首
    if (currentQueue().getState().currentKey !== key) queue.setCurrent(key);
    setPlayRequestSeq((value) => value + 1);
  }, [queue, setEntryRequest]);

  useEffect(() => {
    if (playRequestSeq === 0) return;
    player.playImmediate();
    // 只在点播次数变化时触发；player 每次渲染都是新对象
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playRequestSeq]);

  // ---- 记下本局播过的曲目：曲目确定后追加一次（两端按同一确定性结果 → 天然同步 ✓）----
  const playedTrackId = player.entry ? trackId(player.entry[0], player.entry[1]) : null;
  useEffect(() => {
    if (!gameActive || !playedTrackId) return;
    useGame.getState().markPlayed(playedTrackId);
  }, [gameActive, playedTrackId]);

  // ---- 对局驱动播放：倒计时响铃、回合开始起播、停局/终局停下 ----
  const phase = gameActive ? game.state : "off";
  const previousPhase = useRef(phase);
  useEffect(() => {
    const before = previousPhase.current;
    previousPhase.current = phase;
    if (before === phase) return;
    if (phase === "countdown") {
      player.fadeOutPause();                // 先停掉上一回合的曲子（短淡出，不硬切 ✓ D127）
      // 3 秒倒计时 = **三声**（每秒一声，用户要求；原来只响一声）
      const startedAt = Date.now();
      player.tick();
      const ticks = COUNTDOWN_TICK_MS.slice(1).map((offset) => window.setTimeout(() => {
        // 被节流过的定时器会挤在一起放：迟到太多就跳过，不在错的时间补响（D125）
        if (tickDue(Date.now() - startedAt, offset)) player.tick();
      }, offset));
      return () => ticks.forEach((id) => window.clearTimeout(id));
    }
    // 对局音频的起播短淡入、停播短淡出（D127）：回合切换频繁，硬切会"啪"一下 ✗
    if (phase === "turnStart") player.playImmediate({ fadeMs: GAME_FADE_MS });
    if (phase === "off") player.fadeOutPause();
    // player 每次渲染都是新对象，只按阶段变化触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const jumpToAlice = () => {
    const alice = dataset.characters.find((character) => character.key === "alice-margatroid");
    setTab("player");
    if (alice) queue.setCurrent(alice.key);
  };
  const names: Record<TabId, string> = {
    player: t(Localization.TabNamePlayer),
    list: t(Localization.TabNameList),
    config: t(Localization.TabNameConfigs),
    // 游戏页的键是 `TabNameMatch`（上游那个键名叫 About、文案却是 Match，已按内容改名）
    game: t(Localization.TabNameMatch),
  };

  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "background.default", fontFamily: NoFontFamily }}>
      {/* MD2 顶部应用栏：标题 + 页签 + 彩蛋按钮 */}
      {/* MD2 应用栏：宽屏一行（标题 + 页签 + 指纹 + 彩蛋），窄屏自动折成两行（标题 + 页签），
          否则 400px 宽的手机上页签会被标题/指纹压住点不到（实测过） */}
      <AppBar position="static">
        <Toolbar
          sx={{
            rowGap: 0,
            columnGap: { xs: 1, md: 2 },
            alignItems: "center",
            // 窄屏才允许折行；宽屏保持单行（原来 flexWrap 常开会把各项挤出基线，见 D59）
            flexWrap: { xs: "wrap", md: "nowrap" },
            px: { xs: 1.5, md: 2 },
          }}
        >
          <Typography variant="h6" sx={{ whiteSpace: "nowrap" }}>
            {t(Localization.ShellAppTitle)}
          </Typography>
          {/* DOM 顺序 = 宽屏顺序：标题 → 页签 → 指纹 → 彩蛋。
              窄屏靠 order 把页签挪到第二行（原来页签写在最后，宽屏会被挤到最右边 = "顶栏错位"） */}
          <Tabs
            value={tab}
            onChange={(_event, value: TabId) => setTab(value)}
            textColor="inherit"
            indicatorColor="primary"
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{
              order: { xs: 3, md: 0 },
              width: { xs: "100%", md: "auto" },
              flex: { md: 1 },
              minHeight: 48,
            }}
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
          {/* 窄屏：占位把彩蛋推到右边（宽屏由页签的 flex 撑开，不需要这个盒子） */}
          <Box sx={{ flex: 1, display: { xs: "block", md: "none" } }} />
          {/* 指纹是给联机自检看的，窄屏不占位（设置页"数据"分区里仍能看到） */}
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ whiteSpace: "nowrap", display: { xs: "none", md: "block" } }}
          >
            {t(Localization.ShellDataHash)} {dataset.index.contentHash.slice(0, 12)} · {locale}
          </Typography>
          <Button color="secondary" onClick={jumpToAlice} disabled={gameActive} sx={{ minWidth: 0 }}>
            {aliceLabel(isSmallScreen)}
          </Button>
          {/* MD2 应用栏的"关于"入口：48dp 触控区 + 24dp 图标（`MD2.iconButton` 的规格） */}
          <IconButton
            color="inherit"
            onClick={() => setAboutOpen(true)}
            aria-label={localized(aboutContent.title, locale)}
            data-testid="about-open"
            sx={{ width: MD2.iconButton.size, height: MD2.iconButton.size, flexShrink: 0 }}
          >
            <InfoRounded fontSize="small" sx={{ fontSize: MD2.iconButton.icon }} />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* 「关于」弹窗：内容真源 `src/content/about.ts`，Esc / 点遮罩 / 「关闭」按钮都能关 */}
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} packAuthors={packAuthors} />

      {/* MD2 响应式页边距：移动 16dp / 桌面 24dp */}
      <Container maxWidth={false} sx={{ px: { xs: 2, md: 3 }, py: 3 }}>
        <Stack spacing={3} sx={{ width: "100%" }}>
          {/* 四个面板都拿**生效后**的 bundle（D145）：它们内部各自 `useCurrentDataset(bundle)`，
              传自带那份的话，源多给的曲目就只在这一层可见、进不了列表/播放页/对局 */}
          {tab === "player" && (
            <PlayerPanel
            bundle={liveBundle}
            player={player}
            tables={sources.tables}
            order={queue.order}
            temporaryDisabled={queue.temporaryDisabled}
            currentKey={queue.currentKey}
            pin={queue.currentKey ? pinned[queue.currentKey] ?? null : null}
            cardCollection={cardCollection}
            onShuffle={() => {
              player.pause();
              // 换种子是权威端的事：客户端只能请求主机换，换完随配置下发（D104）
              if (net.role === "client") net.intent({ kind: "rerollQueue" });
              else queue.regenerate(usableKeys, true);
            }}
            onSort={() => { player.pause(); queue.regenerate(usableKeys, false); }}
            onToggleTemporary={(key) => queue.toggleTemporary(key)}
            />
          )}
          {tab === "list" && (
            <ListPanel
              bundle={liveBundle}
              onPlayTrack={playTrack}
              playingKey={gameActive ? game.currentKey : queue.currentKey}
              playingEntry={player.entry}
            />
          )}
          {tab === "config" && (
            <ConfigPanel bundle={liveBundle} tables={sources.tables} />
          )}
          {tab === "game" && <GamePanel bundle={liveBundle} />}
        </Stack>
      </Container>
    </Box>
  );
}
