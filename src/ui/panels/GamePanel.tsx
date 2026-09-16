/** 对战页：模式/规则设置 + 双方牌库 + 收集数 + 计时器 + 回合操作。 */
import {
  Alert, Box, Button, Chip, Divider, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";

import type { DataBundle } from "../../data/types";
import { Localization, t } from "../../i18n/localization";
import type { CardInfo, JudgeState } from "../../game/types";
import { filledSlots } from "../../game/types";
import * as rules from "../../game/rules";
import { useGame } from "../../game/useGame";
import { useGameLoop } from "../../game/useGameLoop";
import type { CardState } from "../components/CharacterCard";
import { NoFontFamily } from "../../theme/theme";
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
    pick, next, give, filterByDeck, setOrder, moveCard, addCard, removeCard,
  } = useGame.getState();

  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [cardWidth, setCardWidth] = useState(56);
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
    /** 自定义卡组：把某一侧牌库里的一张拿出来（回到未使用卡牌） */
    removeCardFrom: (player: number, slot: number) => {
      if (isClient) net.intent({ kind: "removeCard", player, slot });
      else removeCard(player, slot);
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
    addCard, removeCard, start, stop, next, give, game.turnStartTimestamp]);

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

  const handleOpponentEmpty = (slot: number) => {
    if (game.state !== "turnWinner" || !iOweCards || selectedSlot === null) return;
    if (isClient) {
      // 客户端把"自己给对手"转成主机的 moveCard 语义（主机侧：1 → 0）
      net.intent({ kind: "give" });
    } else {
      moveCard(myIndex, selectedSlot, oppIndex, slot);
    }
    setSelectedSlot(null);
  };

  return (
    <Stack spacing={2} sx={{ width: "100%", maxWidth: 1000, fontFamily: NoFontFamily }}>
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
          <Button size="small" onClick={() => setCardWidth((w) => Math.max(32, w - 8))}>
            {t(Localization.GameCardSmaller)}
          </Button>
          <Button size="small" onClick={() => setCardWidth((w) => Math.min(112, w + 8))}>
            {t(Localization.GameCardLarger)}
          </Button>
        </Stack>

        {game.state === "finished" && (
          <Alert severity="success" sx={{ mb: 1 }} data-testid="game-finished">
            {t(Localization.GameFinishedWinner, {
              winner: game.winner === null
                ? t(Localization.GameWinnerDraw)
                : game.winner === 0 ? t(Localization.GameWinnerYou) : t(Localization.GameWinnerOpponent),
            })}
          </Alert>
        )}
        {game.state === "turnWinner" && game.givesLeft !== 0 && (
          <Alert severity="info" sx={{ mb: 1 }} data-testid="give-hint">
            {iOweCards
              ? t(Localization.GameInstructionGiveCards, { count: String(Math.abs(game.givesLeft)) })
              : t(Localization.GameInstructionReceiveCards, { count: String(Math.abs(game.givesLeft)) })}
          </Alert>
        )}

        <Typography variant="caption" color="text.secondary">
          {t(Localization.GameOpponentCollected, { count: String(theirs.collected.length) })}
        </Typography>
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
        />

        <Divider sx={{ my: 1.5 }} />

        <Typography variant="caption" color="text.secondary">
          {t(Localization.GameSelfCollected, { count: String(mine.collected.length) })}
        </Typography>
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
        />

        <UnusedCards
          cards={unused}
          cardSet={cardSet}
          cardFiles={cardFiles}
          width={Math.max(28, Math.round(cardWidth * 0.6))}
          interactive={building}
          onPick={(card) => act.addCard(card)}
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
