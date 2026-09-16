/** 对战页：模式/规则设置 + 双方牌库 + 收集数 + 计时器 + 回合操作。 */
import {
  Alert, Box, Button, Chip, Divider, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";

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
import { DeckGrid } from "../game/DeckGrid";
import { UnusedCards } from "../game/UnusedCards";
import { LobbyPanel } from "../game/LobbyPanel";
import { useNet } from "../../net/useNet";
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

export function GamePanel({ bundle }: { bundle: DataBundle }) {
  const game = useGame((slice) => slice.game);
  const pool = useGame((slice) => slice.pool);
  const cpu = useGame((slice) => slice.cpu);
  const {
    init, setMode, setTraditional, setCpu, resize, fill, clear, shuffle, start, stop,
    pick, next, give, filterByDeck, setOrder, addCard, removeCard,
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
  const isClient = net.role === "client";
  /** 牌桌视角：客户端看自己的那一侧（主机/单机 = 0） */
  const myIndex: 0 | 1 = (isClient ? net.myIndex : 0) === 1 ? 1 : 0;
  const oppIndex: 0 | 1 = myIndex === 0 ? 1 : 0;
  const mine = game.players[myIndex]!;
  const theirs = game.players[oppIndex]!;
  /** 罚牌符号是主机视角的，客户端要翻过来 */
  const iOweCards = myIndex === 0 ? game.givesLeft > 0 : game.givesLeft < 0;
  const iReceiveCards = myIndex === 0 ? game.givesLeft < 0 : game.givesLeft > 0;

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
    filterByDeck: () => {
      if (isClient) net.intent({ kind: "filterMusicByDeck" });
      else filterByDeck();
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
  }), [isClient, net, myIndex, pick, resize, setMode, setTraditional, filterByDeck, fill, clear, shuffle,
    addCard, removeCard, moveDeckCard, giveCard, start, stop, next, give, game.turnStartTimestamp]);

  const cardFiles = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const character of bundle.characters) map[character.key] = character.card;
    return map;
  }, [bundle.characters]);

  const cardSet = bundle.cardSets[0]!;

  // 卡池 = 角色 × 卡面；顺带把轮播顺序灌进对局状态
  useEffect(() => {
    const cards: CardInfo[] = [];
    for (const character of bundle.characters) {
      character.card.forEach((_file, cardIndex) => cards.push({ characterKey: character.key, cardIndex }));
    }
    init(cards);
    setOrder(bundle.characters.map((character) => character.key));
  }, [bundle, init, setOrder]);

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
    ? bundle.characterByKey.get(game.currentKey)?.name ?? game.currentKey
    : "—";
  const revealAnswer = game.state === "turnWinner" || game.state === "finished";
  const rotation = game.order.filter((key) => !game.temporaryDisabled[key]).length;
  /** 卡池里还没进任何牌库/收集区的卡（上游"未使用卡牌"区） */
  const unused = useMemo(() => rules.unusedCards(game, pool), [game, pool]);
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
    <Stack spacing={2} sx={{ width: "100%", maxWidth: 1000, fontFamily: NoFontFamily }} ref={canvasRef}>
      <LobbyPanel />
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center", gap: 1 }}>
          <ToggleButtonGroup size="small" exclusive value={game.mode}
            onChange={(_event, value) => value && act.setMode(value)}>
            <ToggleButton value="solo" data-testid="mode-solo">{t(Localization.GameModeSolo)}</ToggleButton>
            <ToggleButton value="cpu" data-testid="mode-cpu">{t(Localization.GameModeCPU)}</ToggleButton>
          </ToggleButtonGroup>

          <ToggleButtonGroup
            size="small"
            exclusive
            value={game.traditional ? "traditional" : "leisure"}
            onChange={(_event, value) => value && act.setTraditional(value === "traditional")}
          >
            <ToggleButton value="traditional" data-testid="rule-traditional">
              {t(Localization.GameModeTraditional)}
            </ToggleButton>
            <ToggleButton value="leisure" data-testid="rule-leisure">
              {t(Localization.GameModeLeisure)}
            </ToggleButton>
          </ToggleButtonGroup>

          <Chip
            size="small"
            data-testid="deck-size"
            label={t(Localization.GameDeckSize, { rows: String(game.deckRows), columns: String(game.deckColumns) })}
          />
          <Button size="small" onClick={() => act.resize(game.deckRows - 1, game.deckColumns)}>
            {t(Localization.GameRowDecrease)}
          </Button>
          <Button size="small" onClick={() => act.resize(game.deckRows + 1, game.deckColumns)}>
            {t(Localization.GameRowIncrease)}
          </Button>
          <Button size="small" onClick={() => act.resize(game.deckRows, game.deckColumns - 1)}>
            {t(Localization.GameColumnDecrease)}
          </Button>
          <Button size="small" onClick={() => act.resize(game.deckRows, game.deckColumns + 1)}>
            {t(Localization.GameColumnIncrease)}
          </Button>
          {/* 自己的卡组 */}
          <Button size="small" disabled={!building}
            onClick={() => act.fill(myIndex)} data-testid="random-fill">
            {t(Localization.GameRandomFill)}
          </Button>
          <Button size="small" disabled={!building}
            onClick={() => act.shuffle(myIndex)} data-testid="shuffle-deck">
            {t(Localization.GameShuffleDeck)}
          </Button>
          <Button size="small" disabled={!building}
            onClick={() => act.clear(myIndex)} data-testid="clear-deck">
            {t(Localization.GameClearDeck)}
          </Button>
          {/* 电脑/对手的卡组：只有主机能改别人的牌库 */}
          {!isClient && (
            <>
              <Button size="small" disabled={!building}
                onClick={() => act.fill(oppIndex)} data-testid="fill-cpu-deck">
                {t(Localization.GameFillCPU)}
              </Button>
              <Button size="small" disabled={!building}
                onClick={() => act.shuffle(oppIndex)} data-testid="shuffle-cpu-deck">
                {t(Localization.GameShuffleCPUDeck)}
              </Button>
              <Button size="small" disabled={!building}
                onClick={() => act.clear(oppIndex)} data-testid="clear-cpu-deck">
                {t(Localization.GameClearCPUDeck)}
              </Button>
            </>
          )}
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            variant="contained"
            onClick={act.start}
            disabled={game.state !== "selecting" || filledSlots(game.players[0]!.deck) === 0}
            data-testid="start-game"
          >
            {t(Localization.GameStart)}
          </Button>
          <Button size="small" onClick={act.stop} disabled={game.state === "selecting"} data-testid="stop-game">
            {t(Localization.GameStop)}
          </Button>
        </Stack>

        {game.mode === "cpu" && (
          <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Typography variant="caption">{t(Localization.GameOpponentSettingMean)}</Typography>
            <TextField size="small" type="number" value={cpu.meanSeconds} sx={{ width: "6em" }}
              onChange={(event) => setCpu({ meanSeconds: Number(event.target.value) || 0 })}
              slotProps={{ htmlInput: { "aria-label": "cpu-mean" } }} />
            <Typography variant="caption">{t(Localization.GameOpponentSettingStdDev)}</Typography>
            <TextField size="small" type="number" value={cpu.stdDevSeconds} sx={{ width: "6em" }}
              onChange={(event) => setCpu({ stdDevSeconds: Number(event.target.value) || 0 })}
              slotProps={{ htmlInput: { "aria-label": "cpu-sigma" } }} />
            <Typography variant="caption">{t(Localization.GameOpponentSettingMistake)}</Typography>
            <TextField size="small" type="number" value={cpu.mistakeRate} sx={{ width: "6em" }}
              onChange={(event) => setCpu({ mistakeRate: Number(event.target.value) || 0 })}
              slotProps={{ htmlInput: { "aria-label": "cpu-mistake" } }} />
          </Stack>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
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
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            data-testid="card-smaller"
            disabled={cardWidthPercentage <= CARD_WIDTH_PERCENTAGE.min}
            onClick={() => setCardWidthPercentage((value) =>
              clampCardWidthPercentage(value - CARD_WIDTH_PERCENTAGE.step))}
          >
            {t(Localization.GameCardSmaller)}
          </Button>
          <Button
            size="small"
            data-testid="card-larger"
            disabled={cardWidthPercentage >= CARD_WIDTH_PERCENTAGE.max}
            onClick={() => setCardWidthPercentage((value) =>
              clampCardWidthPercentage(value + CARD_WIDTH_PERCENTAGE.step))}
          >
            {t(Localization.GameCardLarger)}
          </Button>
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

        <Typography variant="caption" color="text.secondary">
          {t(Localization.GameOpponentCollected, { count: String(theirs.collected.length) })}
        </Typography>
        {/* 卡片放大后牌库可能比容器宽：让它横向滚动，而不是把卡片缩小 */}
        <Box sx={{ overflowX: "auto", maxWidth: "100%" }}>
        <DeckGrid
          testId="deck-opponent"
          deck={theirs.deck}
          rows={game.deckRows}
          columns={game.deckColumns}
          cardSet={cardSet}
          cardFiles={cardFiles}
          width={cardWidth}
          upsideDown
          interactive={(building && !isClient) || game.state === "turnStart"
            || (game.state === "turnWinner" && iReceiveCards)}
          cardStateOf={cardStateOf}
          cheatSlot={cheatSlotOf(oppIndex)}
          glitch={glitch}
          onCardClick={(slot) => {
            if (game.state === "selecting") {
              if (!isClient) act.removeCardFrom(oppIndex, slot);
              return;
            }
            act.pick(oppIndex, slot);
          }}
          onEmptyClick={handleOpponentEmpty}
          draggable={false}
          onCardDragStart={handleOpponentCardDragStart}
          onSlotDrop={(slot) => handleSlotDrop(oppIndex, slot)}
        />
        </Box>

        <Divider sx={{ my: 1.5 }} />

        <Typography variant="caption" color="text.secondary">
          {t(Localization.GameSelfCollected, { count: String(mine.collected.length) })}
        </Typography>
        <Box sx={{ overflowX: "auto", maxWidth: "100%" }}>
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

        <UnusedCards
          cards={unused}
          cardSet={cardSet}
          cardFiles={cardFiles}
          // 与卡槽同尺寸（上游所有卡都用同一个 cardWidth）
          width={cardWidth}
          interactive={building}
          onPick={(card) => act.addCard(card)}
          onCardDragStart={(card) => beginDrag({ kind: "unused", card })}
          onDropCard={building ? handleDropOnUnused : undefined}
        />

        <Stack direction="row" spacing={1} sx={{ mt: 1.5, alignItems: "center", flexWrap: "wrap" }}>
          <Button size="small" variant="contained" onClick={act.next}
            disabled={game.state !== "turnStart" && game.state !== "turnWinner"} data-testid="next-turn">
            {t(Localization.GameNextTurn)}
          </Button>
          <Button size="small" onClick={act.give} disabled={game.givesLeft === 0} data-testid="give-cards">
            {t(Localization.GameGiveRandomly)}
          </Button>
          <Button size="small" onClick={act.filterByDeck} data-testid="filter-by-deck">
            {t(Localization.GameFilterByDeck)}
          </Button>
          <Chip size="small" variant="outlined"
            label={t(Localization.GamePoolCount, { count: String(pool.length) })} />
          <Chip size="small" variant="outlined"
            label={t(Localization.GameRotationCount, { count: String(rotation) })} />
        </Stack>
      </Paper>
    </Stack>
  );
}
