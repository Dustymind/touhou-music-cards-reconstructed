/** 对战页：模式/规则设置 + 双方牌库 + 收集数 + 计时器 + 回合操作。 */
import { memo } from "react";
import {
  Alert, Box, Card, CardContent, CardHeader, Chip, Divider, FormControlLabel, RadioGroup, Stack,
  Switch, TextField, Typography,
} from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import AddRounded from "@mui/icons-material/AddRounded";
import CardGiftcardRounded from "@mui/icons-material/CardGiftcardRounded";
import ClassRounded from "@mui/icons-material/ClassRounded";
import CasinoRounded from "@mui/icons-material/CasinoRounded";
import ClearRounded from "@mui/icons-material/ClearRounded";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import RemoveRounded from "@mui/icons-material/RemoveRounded";
import ShuffleRounded from "@mui/icons-material/ShuffleRounded";
import GroupsRounded from "@mui/icons-material/GroupsRounded";
import PersonRounded from "@mui/icons-material/PersonRounded";
import SmartToyRounded from "@mui/icons-material/SmartToyRounded";
import StarRounded from "@mui/icons-material/StarRounded";
import SkipNextRounded from "@mui/icons-material/SkipNextRounded";
import StopRounded from "@mui/icons-material/StopRounded";

import type { DataBundle } from "../../data/types";
import { Localization, t } from "../../i18n/localization";
import type { CardInfo, JudgeState } from "../../game/types";
import { filledSlots } from "../../game/types";
import * as rules from "../../game/rules";
import { useGame } from "../../game/useGame";
import { useGameLoop } from "../../game/useGameLoop";
import { beginDrag, currentDrag, endDrag, type DragPayload } from "../../game/drag";
import {
  CARD_WIDTH_PERCENTAGE, DEFAULT_GAME_SETTING, clampCardWidthPercentage, loadGameSetting, saveGameSetting,
} from "../../game/gameSetting";
import type { CardState } from "../components/CharacterCard";
import { fadeInSx, NoFontFamily } from "../../theme/theme";
import { DECK_GAP, DeckGrid } from "../game/DeckGrid";
import { UnusedCardsTray } from "../game/UnusedCardsTray";
import { useCurrentDataset } from "../../data/useDataset";
import { Reveal } from "../game/Reveal";
import { GameGroupLabel, GameRadioOption, NumberSelect } from "../game/GameControls";
import { buildSongConflicts } from "../../music/songConflicts";
import { DECK_LIMITS } from "../../game/gameSetting";
import { MD2 } from "../../theme/theme";
import {
  gameButtonsSx, gameGroupSx, gameLabelSx, gameRowSx, gameSwitchLabelSx, GameButton,
} from "../game/GameButton";
import { LobbyPanel } from "../game/LobbyPanel";
import { useNet } from "../../net/useNet";
import { useSession } from "../../store/session";
import { glitchEnabled } from "../../runtime";
import { isCheatReally } from "../../cheat";
import { markCountdownStart, TimerDisplay } from "../game/TimerDisplay";

/** 判定状态在界面上的名字（`en` 保持上游的原始枚举名，`zh` 给出中文）。 */
export const STATE_LABEL: Record<JudgeState, keyof typeof Localization> = {
  selecting: "GameStateSelecting",
  countdown: "GameStateCountdown",
  turnStart: "GameStateTurnStart",
  turnWinner: "GameStateTurnWinner",
  finished: "GameStateFinished",
};

/** 模式与规则的选项表（渲染成 MD2 单选组，不再每项写一段 JSX）。 */
const MODE_OPTIONS = [
  { value: "solo", icon: PersonRounded, label: Localization.GameModeSolo },
  { value: "cpu", icon: SmartToyRounded, label: Localization.GameModeCPU },
  { value: "multi", icon: GroupsRounded, label: Localization.GameModeMulti },
] as const;

const RULE_OPTIONS = [
  { value: "traditional", icon: ClassRounded, label: Localization.GameModeTraditional },
  { value: "leisure", icon: StarRounded, label: Localization.GameModeLeisure },
] as const;

function GamePanelInner({ bundle }: { bundle: DataBundle }) {
  const game = useGame((slice) => slice.game);
  const pool = useGame((slice) => slice.pool);
  const conflicts = useGame((slice) => slice.conflicts);
  const cpu = useGame((slice) => slice.cpu);
  const {
    init, setMode, setTraditional, setCpu, resize, fill, clear, shuffle, start, stop,
    pick, next, give, setFilterByDeck, setOrder, addCard, removeCard,
    moveDeckCard, giveCard,
  } = useGame.getState();

  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  /** 卡片宽度 = 容器宽度 × 百分比（上游 `cardWidthPercentage`，默认 0.08） */
  const [cardWidthPercentage, setCardWidthPercentage] = useState(
    () => loadGameSetting().cardWidthPercentage,
  );
  const [containerWidth, setContainerWidth] = useState(1000);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const cardWidth = Math.max(24, Math.round(containerWidth * cardWidthPercentage));
  const net = useNet();
  /** 单选组里的图标：与按钮同一套图标尺寸 */
  const gameIconSx = useMemo(() => ({ fontSize: MD2.button.iconSize }), []);

  /** 卡面图集（设置页"卡面图集"） */
  const cardCollection = useSession((slice) => slice.cardCollection);
  const isClient = net.role === "client";
  /** 牌桌视角：客户端看自己的那一侧（主机/单机 = 0） */
  const myIndex: 0 | 1 = (isClient ? net.myIndex : 0) === 1 ? 1 : 0;
  const oppIndex: 0 | 1 = myIndex === 0 ? 1 : 0;
  const mine = game.players[myIndex]!;
  const theirs = game.players[oppIndex]!;
  /** 罚牌符号是主机视角的，客户端要翻过来 */
  const iOweCards = myIndex === 0 ? game.givesLeft > 0 : game.givesLeft < 0;
  const iReceiveCards = myIndex === 0 ? game.givesLeft < 0 : game.givesLeft > 0;

  /** 单人：没有对方棋盘；电脑/多人：有对方棋盘。 */
  const showOpponentBoard = game.mode !== "solo";
  /** 只有"电脑"模式下本机才能改对方的卡组（多人模式里对方棋盘不可调整）。 */
  const canEditOpponentDeck = game.mode === "cpu" && !isClient;
  /** 联机栏只在"多人"模式下出现。 */
  const showLobby = game.mode === "multi";

  /** 联机客户端：动作改发意图；主机/单机：直接落本地状态。 */
  const act = useMemo(() => ({
    /** `side` 是被点的那张牌所在的一侧；抢拍者恒为本机（联机时主机以发送方为准）。
     *  对齐上游：牌可能躺在对手那一侧，抢到的人仍是点牌的人。 */
    pick: (side: 0 | 1, slot: number) => {
      if (isClient) net.intent({ kind: "pick", side, slot, timestamp: Math.max(0, Date.now() - game.turnStartTimestamp) });
      else pick(myIndex, side, slot);
    },
    resize: (rows: number, columns: number) => {
      if (isClient) net.intent({ kind: "adjustDeckSize", rows, columns });
      else resize(rows, columns);
    },
    setMode: (mode: typeof game.mode) => {
      if (isClient) net.intent({ kind: "setMode", mode });
      else setMode(mode);
    },
    setTraditional: (traditional: boolean) => {
      if (isClient) net.intent({ kind: "setTraditional", traditional });
      else setTraditional(traditional);
    },
    filterByDeck: (enabled: boolean) => {
      if (isClient) net.intent({ kind: "filterMusicByDeck", enabled });
      else setFilterByDeck(enabled);
    },
    /** 牌组编辑：主机直接落地，客户端发意图（主机侧只允许客户端动自己那一份） */
    fill: (player: number) => {
      if (isClient) net.intent({ kind: "fillDeck", player });
      else fill(player);
    },
    clear: (player: number) => {
      if (isClient) net.intent({ kind: "clearDeck", player });
      else clear(player);
    },
    shuffle: (player: number) => {
      if (isClient) net.intent({ kind: "shuffleDeck", player });
      else shuffle(player);
    },
    /** 自定义卡组：放一张卡进自己的牌库（槽位由规则选第一个空位） */
    addCard: (card: CardInfo) => {
      if (isClient) net.intent({ kind: "addCard", player: myIndex, card });
      else addCard(myIndex, card);
    },
    /** 自定义卡组：把一张卡放到**指定**槽位（拖动放置用；主机也能放到电脑卡组） */
    addCardTo: (player: number, card: CardInfo, slot: number) => {
      if (isClient) net.intent({ kind: "addCard", player, card, slot });
      else addCard(player, card, slot);
    },
    /** 自定义卡组：把某一侧牌库里的一张拿出来（回到未使用卡牌） */
    removeCardFrom: (player: number, slot: number) => {
      if (isClient) net.intent({ kind: "removeCard", player, slot });
      else removeCard(player, slot);
    },
    /** 拖动放置：挪动/交换两张牌（可跨牌库，主机侧有权限校验） */
    moveDeckCard: (fromPlayer: number, fromSlot: number, toPlayer: number, toSlot: number) => {
      if (isClient) net.intent({ kind: "moveDeckCard", player: fromPlayer, fromSlot, toPlayer, toSlot });
      else moveDeckCard(fromPlayer, fromSlot, toPlayer, toSlot);
    },
    /** 指定交牌：把手里的某张牌放到对手的空位（同时推进罚牌计数） */
    giveCard: (fromPlayer: number, fromSlot: number, toPlayer: number, toSlot: number) => {
      if (isClient) net.intent({ kind: "giveCard", fromSlot, toSlot });
      else giveCard(fromPlayer, fromSlot, toPlayer, toSlot);
    },
    start: () => {
      if (isClient) net.intent({ kind: "confirmStart" });
      else start();
    },
    stop: () => { if (!isClient) stop(); },
    next: () => {
      if (isClient) net.intent({ kind: "confirmNext" });
      else next();
    },
    give: () => {
      if (isClient) net.intent({ kind: "give" });
      else give();
    },
  }), [isClient, net, myIndex, pick, resize, setMode, setTraditional, setFilterByDeck, fill, clear, shuffle,
    addCard, removeCard, moveDeckCard, giveCard, start, stop, next, give, game.turnStartTimestamp]);

  const dataset = useCurrentDataset(bundle);

  const cardFiles = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const character of dataset.characters) map[character.key] = character.card;
    return map;
  }, [dataset.characters]);

  // 卡面图集跟随设置页的选择（原来写死第一套 → 设置里换图集对游戏页无效）
  const cardSet = bundle.shared.cardSets.find((set) => set.id === cardCollection) ?? bundle.shared.cardSets[0]!;

  // 卡池 = 当前数据集的角色 × 卡面（C：数据集只含本模式有曲目的角色，"没有对应音乐的角色"已不存在）；
  // 顺带把轮播顺序灌进对局状态。
  useEffect(() => {
    const usable = dataset.characters;
    const cards: CardInfo[] = [];
    for (const character of usable) {
      character.card.forEach((_file, cardIndex) => cards.push({ characterKey: character.key, cardIndex }));
    }
    // 卡池 + 曲目互斥表一起灌进去（D108）：同一首歌只允许一个角色、同角色只允许一张卡面
    init(cards, buildSongConflicts(usable));
    setOrder(usable.map((character) => character.key));
  }, [dataset, init, setOrder]);

  // 容器宽度：卡片大小按它的百分比算（上游 `containerRef.clientWidth`）
  useEffect(() => {
    const element = canvasRef.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => setContainerWidth(element.clientWidth));
    observer.observe(element);
    setContainerWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  // 载入上次的卡片大小与牌库尺寸（上游 localStorage 的 `gameSetting`）。
  // 牌库尺寸只在**用户自己改过**（存的不是默认值）时才套用：否则会盖掉调用方/联机同步过来的尺寸。
  useEffect(() => {
    const stored = loadGameSetting();
    setCardWidthPercentage(stored.cardWidthPercentage);
    const customised = stored.deckRows !== DEFAULT_GAME_SETTING.deckRows
      || stored.deckColumns !== DEFAULT_GAME_SETTING.deckColumns;
    if (customised && (stored.deckRows !== game.deckRows || stored.deckColumns !== game.deckColumns)) {
      act.resize(stored.deckRows, stored.deckColumns);
    }
    // 只在挂载时读一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveGameSetting({
      cardWidthPercentage,
      deckRows: game.deckRows,
      deckColumns: game.deckColumns,
    });
  }, [cardWidthPercentage, game.deckRows, game.deckColumns]);

  // 进入倒计时时重置计时锚点
  useEffect(() => {
    if (game.state === "countdown") markCountdownStart();
  }, [game.state, game.turnSeq]);

  // 只有单机/CPU 与主机跑计时器；客户端完全由主机快照驱动
  useGameLoop(!isClient);

  // 染色按**牌的实体**（角色 + 卡序）走，和上游一致：同一张卡出现在两侧牌库里就两侧都染色。
  const cardStateOf = useMemo(() => {
    const states = new Map<string, CardState>();
    for (const event of game.pickEvents) {
      states.set(
        `${event.card.characterKey}:${event.card.cardIndex}`,
        event.card.characterKey === game.currentKey ? "correct" : "incorrect",
      );
    }
    return (card: CardInfo | null): CardState =>
      card === null ? "normal" : states.get(`${card.characterKey}:${card.cardIndex}`) ?? "normal";
  }, [game.pickEvents, game.currentKey]);

  // 彩蛋：开启后把答案卡圈出来（对齐上游 CheatRect 行为）
  const cheat = isCheatReally();
  const cheatSlotOf = (player: number): number | null => {
    if (!cheat || game.currentKey === null) return null;
    const slot = game.players[player]!.deck.findIndex((card) => card?.characterKey === game.currentKey);
    return slot >= 0 ? slot : null;
  };
  const glitch = glitchEnabled();

  const currentName = game.currentKey
    ? dataset.characterByKey.get(game.currentKey)?.name ?? game.currentKey
    : "—";
  const revealAnswer = game.state === "turnWinner" || game.state === "finished";
  const rotation = game.order.filter((key) => !game.temporaryDisabled[key]).length;
  /** 卡池里还没进任何牌库/收集区的卡（上游"未使用卡牌"区） */
  const unused = useMemo(() => rules.unusedCards(game, pool), [game, pool]);
  /** 其中被曲目互斥挡下的（D108）：压暗、不能点选或拖入 */
  const blockedKeys = useMemo(
    () => rules.blockedCardKeys(game, pool, conflicts), [game, pool, conflicts]);
  const building = game.state === "selecting";

  const handleOwnCard = (slot: number, _card: CardInfo) => {
    if (game.state === "selecting") {
      // 自定义卡组：选牌阶段点自己的牌＝把它拿回"未使用卡牌"
      act.removeCardFrom(myIndex, slot);
      return;
    }
    if (game.state === "turnStart") {
      act.pick(myIndex, slot);
      return;
    }
    if (game.state === "turnWinner" && iOweCards) setSelectedSlot(slot);
  };

  /** 选牌阶段自己的牌可以拖去别的槽位；交牌阶段可以拖去对手空位。 */
  const canDragOwnCard = building || (game.state === "turnWinner" && iOweCards);

  const handleOwnCardDragStart = (slot: number, card: CardInfo) => {
    beginDrag({ kind: "deck", player: myIndex, slot, card });
  };

  const handleOpponentCardDragStart = (slot: number, card: CardInfo) => {
    // 只有选牌阶段、且是主机，才会把电脑牌库的卡拖出来
    beginDrag({ kind: "deck", player: oppIndex, slot, card });
  };

  /** 拖到某一侧的某个槽位：按上游语义落地（空格=放，有卡=交换，来自牌库拖到别处=移动）。 */
  const handleSlotDrop = (player: number, slot: number) => {
    const payload: DragPayload | null = currentDrag();
    endDrag();
    if (payload === null) return;

    if (game.state === "turnWinner") {
      // 交牌阶段：把自己的牌拖到对手的空位
      if (payload.kind !== "deck" || payload.player !== myIndex) return;
      if (player !== oppIndex || !iOweCards) return;
      if ((game.players[oppIndex]!.deck[slot] ?? null) !== null) return;
      act.giveCard(myIndex, payload.slot, oppIndex, slot);
      setSelectedSlot(null);
      return;
    }
    if (game.state !== "selecting") return;

    if (payload.kind === "unused") {
      // 从"未使用卡牌"拖进槽位：清掉占位的那张（上游不换回），再放进去
      if (isClient && player !== myIndex) return;
      if ((game.players[player]!.deck[slot] ?? null) !== null) act.removeCardFrom(player, slot);
      act.addCardTo(player, payload.card, slot);
      return;
    }
    // 牌库之间挪动/交换
    if (isClient && payload.player !== myIndex) return;
    if (!isClient && player !== myIndex && player !== oppIndex) return;
    act.moveDeckCard(payload.player, payload.slot, player, slot);
  };

  /** 把牌库里的卡拖回"未使用卡牌"区 = 拿出来 */
  const handleDropOnUnused = () => {
    const payload = currentDrag();
    endDrag();
    if (payload === null || payload.kind !== "deck") return;
    if (game.state !== "selecting") return;
    if (isClient && payload.player !== myIndex) return;
    act.removeCardFrom(payload.player, payload.slot);
  };

  const handleOpponentEmpty = (slot: number) => {
    if (game.state !== "turnWinner" || !iOweCards || selectedSlot === null) return;
    // 指定交牌：交的是选中的那一张，同时把罚牌计数往 0 推（联机时交给主机落地）
    act.giveCard(myIndex, selectedSlot, oppIndex, slot);
    setSelectedSlot(null);
  };

  return (
    <Stack spacing={2} sx={{ width: "100%", fontFamily: NoFontFamily }} ref={canvasRef}>
      <Reveal show={showLobby} testId="lobby-reveal">
        <LobbyPanel />
      </Reveal>
      {/* 对局设置：模式 / 规则 / 开始中止（上游把"切模式"和"开始中止"也放在一起） */}
      <Card data-testid="game-setup">
        <CardHeader title={t(Localization.ShellAppTitle)} titleTypographyProps={{ variant: "h6" }} />
        <CardContent>
        <Stack sx={gameRowSx}>
          <Stack sx={gameGroupSx}>
            <GameGroupLabel>{t(Localization.GameGroupMode)}</GameGroupLabel>
            <RadioGroup
              row
              value={game.mode}
              onChange={(_event, value) => act.setMode(value as typeof game.mode)}
            >
            {MODE_OPTIONS.map((option) => (
              <GameRadioOption
                key={option.value}
                value={option.value}
                label={t(option.label)}
                icon={option.icon}
                testId={`mode-${option.value}`}
                iconSx={gameIconSx}
              />
            ))}
            </RadioGroup>
          </Stack>

          <Stack sx={gameGroupSx}>
            <GameGroupLabel>{t(Localization.GameGroupRule)}</GameGroupLabel>
            <RadioGroup
              row
              value={game.traditional ? "traditional" : "leisure"}
              onChange={(_event, value) => act.setTraditional(value === "traditional")}
            >
            {RULE_OPTIONS.map((option) => (
              <GameRadioOption
                key={option.value}
                value={option.value}
                label={t(option.label)}
                icon={option.icon}
                testId={`rule-${option.value}`}
                iconSx={gameIconSx}
              />
            ))}
            </RadioGroup>
          </Stack>

          <Box sx={{ flex: 1 }} />
          <Stack sx={gameButtonsSx}>
          <GameButton
            size="small"
            variant="contained"
            color="primary"
            startIcon={<PlayArrowRounded />}
            onClick={act.start}
            disabled={game.state !== "selecting" || filledSlots(game.players[0]!.deck) === 0}
            data-testid="start-game"
          >
            {t(Localization.GameStart)}
          </GameButton>
          <GameButton
            size="small"
            color="error"
            startIcon={<StopRounded />}
            onClick={act.stop}
            disabled={game.state === "selecting"}
            data-testid="stop-game"
          >
            {t(Localization.GameStop)}
          </GameButton>
          </Stack>
        </Stack>

        {game.mode === "cpu" && (
          /* 三个参数用带 label 的 filled 输入框：filled 变体会为浮动标签留出上方空间，
             标签直接用 caption 写在旁边就会留出多余空位（用户反馈） */
          <Stack direction="row" spacing={2} sx={{ mt: 1, alignItems: "center", flexWrap: "wrap" }}>
            <TextField
              size="small"
              type="number"
              label={t(Localization.GameOpponentSettingMean)}
              value={cpu.meanSeconds}
              sx={{ width: "10em" }}
              onChange={(event) => setCpu({ meanSeconds: Number(event.target.value) || 0 })}
              slotProps={{ htmlInput: { "aria-label": "cpu-mean" } }}
            />
            <TextField
              size="small"
              type="number"
              label={t(Localization.GameOpponentSettingStdDev)}
              value={cpu.stdDevSeconds}
              sx={{ width: "10em" }}
              onChange={(event) => setCpu({ stdDevSeconds: Number(event.target.value) || 0 })}
              slotProps={{ htmlInput: { "aria-label": "cpu-sigma" } }}
            />
            <TextField
              size="small"
              type="number"
              label={t(Localization.GameOpponentSettingMistake)}
              value={cpu.mistakeRate}
              sx={{ width: "10em" }}
              onChange={(event) => setCpu({ mistakeRate: Number(event.target.value) || 0 })}
              slotProps={{ htmlInput: { "aria-label": "cpu-mistake" } }}
            />
          </Stack>
        )}
      </CardContent></Card>

      {/* 卡组设置：尺寸 / 卡牌大小 / 双方卡组操作（按上游"按钮成组、每侧一组"的风格重排） */}
      <Card data-testid="deck-setup">
        <CardHeader title={t(Localization.GameGroupDeck)} titleTypographyProps={{ variant: "h6" }} />
        <CardContent>
        <Stack spacing={1}>
          <Stack sx={gameRowSx}>
            <Stack sx={gameGroupSx}>
              <Chip
                size="small"
                data-testid="deck-size"
                sx={{ height: MD2.button.medium }}
                label={t(Localization.GameDeckSize, {
                  rows: String(game.deckRows), columns: String(game.deckColumns),
                })}
              />
            </Stack>
            {/* MD2 下拉选择：牌库行列（范围来自 DECK_LIMITS） */}
            <NumberSelect
              testId="deck-rows"
              label={t(Localization.GameRowsLabel)}
              value={game.deckRows}
              min={DECK_LIMITS.minRows}
              max={DECK_LIMITS.maxRows}
              onChange={(rows) => act.resize(rows, game.deckColumns)}
            />
            <NumberSelect
              testId="deck-columns"
              label={t(Localization.GameColumnsLabel)}
              value={game.deckColumns}
              min={DECK_LIMITS.minColumns}
              max={DECK_LIMITS.maxColumns}
              onChange={(columns) => act.resize(game.deckRows, columns)}
            />
            <Box sx={{ flex: 1 }} />
            <Stack sx={gameGroupSx}>
            <Typography sx={gameLabelSx}>
              {t(Localization.GameCardSizeLabel)}
            </Typography>
            <Stack sx={gameButtonsSx}>
              <GameButton
                data-testid="card-smaller"
                startIcon={<RemoveRounded />}
                disabled={cardWidthPercentage <= CARD_WIDTH_PERCENTAGE.min}
                onClick={() => setCardWidthPercentage((value) =>
                  clampCardWidthPercentage(value - CARD_WIDTH_PERCENTAGE.step))}
              >
                {t(Localization.GameCardSmaller)}
              </GameButton>
              <GameButton
                data-testid="card-larger"
                startIcon={<AddRounded />}
                disabled={cardWidthPercentage >= CARD_WIDTH_PERCENTAGE.max}
                onClick={() => setCardWidthPercentage((value) =>
                  clampCardWidthPercentage(value + CARD_WIDTH_PERCENTAGE.step))}
              >
                {t(Localization.GameCardLarger)}
              </GameButton>
            </Stack>
            </Stack>
          </Stack>

          <Stack sx={gameRowSx}>
            <Stack sx={gameGroupSx}>
              <Typography sx={gameLabelSx}>
                {t(Localization.GameSideYou)}
              </Typography>
              <Stack sx={gameButtonsSx}>
              <GameButton size="small" startIcon={<CasinoRounded />} disabled={!building}
                onClick={() => act.fill(myIndex)} data-testid="random-fill">
                {t(Localization.GameRandomFill)}
              </GameButton>
              <GameButton size="small" startIcon={<ShuffleRounded />} disabled={!building}
                onClick={() => act.shuffle(myIndex)} data-testid="shuffle-deck">
                {t(Localization.GameShuffleDeck)}
              </GameButton>
              <GameButton size="small" startIcon={<ClearRounded />} disabled={!building}
                onClick={() => act.clear(myIndex)} data-testid="clear-deck">
                {t(Localization.GameClearDeck)}
              </GameButton>
              </Stack>
            </Stack>

            {/* 电脑卡组：只有"电脑"模式下本机（非客户端）能调 */}
            {canEditOpponentDeck && (
              <Stack sx={gameGroupSx}>
                <Typography sx={gameLabelSx}>
                  {t(Localization.GameSideOpponent)}
                </Typography>
                <Stack sx={gameButtonsSx}>
                <GameButton size="small" startIcon={<CasinoRounded />} disabled={!building}
                  onClick={() => act.fill(oppIndex)} data-testid="fill-cpu-deck">
                  {t(Localization.GameFillCPU)}
                </GameButton>
                <GameButton size="small" startIcon={<ShuffleRounded />} disabled={!building}
                  onClick={() => act.shuffle(oppIndex)} data-testid="shuffle-cpu-deck">
                  {t(Localization.GameShuffleCPUDeck)}
                </GameButton>
                <GameButton size="small" startIcon={<ClearRounded />} disabled={!building}
                  onClick={() => act.clear(oppIndex)} data-testid="clear-cpu-deck">
                  {t(Localization.GameClearCPUDeck)}
                </GameButton>
                </Stack>
              </Stack>
            )}
          </Stack>
        </Stack>
      </CardContent></Card>

      <Card><CardContent>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
          <TimerDisplay state={game.state} turnStartTimestamp={game.turnStartTimestamp} />
          <Stack spacing={0.25}>
            <Typography variant="body2">
              {revealAnswer
                ? <>{t(Localization.GameAnswerLabel)} <b>{currentName}</b></>
                : t(Localization.GameNowPlaying, { name: game.state === "turnStart" ? "???" : "—" })}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t(Localization.GameTurnStatus, {
                turn: String(game.turnSeq),
                state: t(Localization[STATE_LABEL[game.state]]),
                gives: String(game.givesLeft),
              })}
            </Typography>
          </Stack>
        </Stack>

        {game.state === "finished" && (
          <Alert severity="success" sx={{ mb: 1, ...fadeInSx }} data-testid="game-finished">
            {t(Localization.GameFinishedWinner, {
              winner: game.winner === null
                ? t(Localization.GameWinnerDraw)
                : game.winner === 0 ? t(Localization.GameWinnerYou) : t(Localization.GameWinnerOpponent),
            })}
          </Alert>
        )}
        {game.state === "turnWinner" && game.givesLeft !== 0 && (
          <Alert severity="info" sx={{ mb: 1, ...fadeInSx }} data-testid="give-hint">
            {iOweCards
              ? t(Localization.GameInstructionGiveCards, { count: String(Math.abs(game.givesLeft)) })
              : t(Localization.GameInstructionReceiveCards, { count: String(Math.abs(game.givesLeft)) })}
          </Alert>
        )}

        {/* 对方棋盘：单人模式没有；出现/收起带高度 + 淡入动画 */}
        <Reveal show={showOpponentBoard} testId="opponent-board">
          <>
            <Typography variant="caption" color="text.secondary">
              {t(Localization.GameOpponentCollected, { count: String(theirs.collected.length) })}
            </Typography>
            {/* 卡片放大后牌库可能比容器宽：让它横向滚动；比容器窄时居中 */}
            <Box sx={{ overflowX: "auto", maxWidth: "100%", display: "flex", justifyContent: "center" }}>
              <DeckGrid
                testId="deck-opponent"
                deck={theirs.deck}
                rows={game.deckRows}
                columns={game.deckColumns}
                cardSet={cardSet}
                cardFiles={cardFiles}
                width={cardWidth}
                upsideDown
                interactive={(building && canEditOpponentDeck) || game.state === "turnStart"
                  || (game.state === "turnWinner" && iReceiveCards)}
                cardStateOf={cardStateOf}
                cheatSlot={cheatSlotOf(oppIndex)}
                glitch={glitch}
                onCardClick={(slot) => {
                  if (game.state === "selecting") {
                    // 多人模式下对方棋盘不可调整（只有电脑模式能拿牌）
                    if (canEditOpponentDeck) act.removeCardFrom(oppIndex, slot);
                    return;
                  }
                  act.pick(oppIndex, slot);
                }}
                onEmptyClick={handleOpponentEmpty}
                draggable={false}
                onCardDragStart={canEditOpponentDeck ? handleOpponentCardDragStart : undefined}
                onSlotDrop={canEditOpponentDeck || game.state === "turnWinner"
                  ? (slot) => handleSlotDrop(oppIndex, slot)
                  : undefined}
              />
            </Box>
          </>
        </Reveal>

        <Divider sx={{ my: 1.5 }} />

        <Typography variant="caption" color="text.secondary">
          {t(Localization.GameSelfCollected, { count: String(mine.collected.length) })}
        </Typography>
        <Box sx={{ overflowX: "auto", maxWidth: "100%", display: "flex", justifyContent: "center" }}>
        <DeckGrid
          testId="deck-you"
          deck={mine.deck}
          rows={game.deckRows}
          columns={game.deckColumns}
          cardSet={cardSet}
          cardFiles={cardFiles}
          width={cardWidth}
          interactive={building || game.state === "turnStart"
            || (game.state === "turnWinner" && iOweCards)}
          cardStateOf={cardStateOf}
          cheatSlot={cheatSlotOf(myIndex)}
          glitch={glitch}
          onCardClick={handleOwnCard}
          draggable={canDragOwnCard}
          onCardDragStart={handleOwnCardDragStart}
          onSlotDrop={(slot) => handleSlotDrop(myIndex, slot)}
        />
        </Box>

        <UnusedCardsTray
          columns={game.deckColumns}
          cards={unused}
          cardSet={cardSet}
          cardFiles={cardFiles}
          // 与卡槽同尺寸（上游所有卡都用同一个 cardWidth），窗口宽度对齐牌桌
          width={cardWidth}
          visibleWidth={game.deckColumns * cardWidth + (game.deckColumns - 1) * DECK_GAP}
          interactive={building}
          blockedKeys={blockedKeys}
          onPick={(card) => act.addCard(card)}
          onCardDragStart={(card) => beginDrag({ kind: "unused", card })}
          onDropCard={building ? handleDropOnUnused : undefined}
        />

        <Stack sx={{ ...gameRowSx, mt: 1.5 }}>
          <Stack sx={gameGroupSx}>
          <Typography sx={gameLabelSx}>
            {t(Localization.GameGroupTurn)}
          </Typography>
          <Stack sx={gameButtonsSx}>
          <GameButton size="small" variant="contained" startIcon={<SkipNextRounded />} onClick={act.next}
            disabled={game.state !== "turnStart" && game.state !== "turnWinner"} data-testid="next-turn">
            {t(Localization.GameNextTurn)}
          </GameButton>
          <GameButton size="small" startIcon={<CardGiftcardRounded />} onClick={act.give}
            disabled={game.givesLeft === 0} data-testid="give-cards">
            {t(Localization.GameGiveRandomly)}
          </GameButton>
          {/* MD2 开关 + 文本标签：与同组按钮同高（36dp）、垂直居中，组内间距仍是 8dp 栅格 */}
          <FormControlLabel
            data-testid="filter-by-deck"
            control={
              <Switch
                size="small"
                checked={game.filterByDeck}
                onChange={(event) => act.filterByDeck(event.target.checked)}
                slotProps={{ input: { "aria-label": "filter-by-deck" } }}
              />
            }
            label={t(Localization.GameFilterByDeck)}
            sx={gameSwitchLabelSx}
          />
          </Stack>
          </Stack>
          <Box sx={{ flex: 1 }} />
          <Chip size="small" variant="outlined" sx={{ height: MD2.button.medium }}
            label={t(Localization.GamePoolCount, { count: String(pool.length) })} />
          <Chip size="small" variant="outlined" sx={{ height: MD2.button.medium }}
            data-testid="rotation-count"
            label={t(Localization.GameRotationCount, { count: String(rotation) })} />
        </Stack>
      </CardContent></Card>
    </Stack>
  );
}

/** 面板级 memo：外壳状态（语言 / 音乐模式 / 分区展开）变化时不必重算整页。 */
export const GamePanel = memo(GamePanelInner);
