/** 对战页：模式/规则设置 + 双方牌库 + 收集数 + 计时器 + 回合操作。 */
import {
  Alert, Box, Button, Chip, Divider, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";

import type { DataBundle } from "../../data/types";
import { Localization, t } from "../../i18n/localization";
import type { CardInfo } from "../../game/types";
import { filledSlots } from "../../game/types";
import { useGame } from "../../game/useGame";
import { useGameLoop } from "../../game/useGameLoop";
import type { CardState } from "../components/CharacterCard";
import { NoFontFamily } from "../../theme/theme";
import { DeckGrid } from "../game/DeckGrid";
import { LobbyPanel } from "../game/LobbyPanel";
import { useNet } from "../../net/useNet";
import { glitchEnabled } from "../../runtime";
import { isCheatReally } from "../../cheat";
import { markCountdownStart, TimerDisplay } from "../game/TimerDisplay";

export function GamePanel({ bundle }: { bundle: DataBundle }) {
  const game = useGame((slice) => slice.game);
  const pool = useGame((slice) => slice.pool);
  const cpu = useGame((slice) => slice.cpu);
  const {
    init, setMode, setTraditional, setCpu, resize, fill, clear, shuffle, start, stop,
    pick, next, give, filterByDeck, setOrder, moveCard,
  } = useGame.getState();

  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [cardWidth, setCardWidth] = useState(56);
  const net = useNet();
  const isClient = net.role === "client";

  /** 联机客户端：动作改发意图；主机/单机：直接落本地状态。 */
  const act = useMemo(() => ({
    pick: (side: 0 | 1, slot: number) => {
      if (isClient) net.intent({ kind: "pick", side, slot, timestamp: Math.max(0, Date.now() - game.turnStartTimestamp) });
      else pick(side, slot);
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
    fill: (player: number) => { if (!isClient) fill(player); },
    clear: (player: number) => { if (!isClient) clear(player); },
    shuffle: (player: number) => { if (!isClient) shuffle(player); },
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
  }), [isClient, net, pick, resize, setMode, setTraditional, filterByDeck, fill, clear, shuffle, start, stop, next, give, game.turnStartTimestamp]);

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

  const pickStates = useMemo(() => {
    const states: Record<0 | 1, Record<number, CardState>> = { 0: {}, 1: {} };
    for (const event of game.pickEvents) {
      states[event.side][event.slot] = event.card.characterKey === game.currentKey ? "correct" : "incorrect";
    }
    return states;
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

  const handleOwnCard = (slot: number, _card: CardInfo) => {
    if (game.state === "turnStart") {
      act.pick(0, slot);
      return;
    }
    if (game.state === "turnWinner" && game.givesLeft > 0) setSelectedSlot(slot);
  };

  const handleOpponentEmpty = (slot: number) => {
    if (game.state !== "turnWinner" || game.givesLeft >= 0 || selectedSlot === null) return;
    moveCard(0, selectedSlot, 1, slot);
    setSelectedSlot(null);
  };

  return (
    <Stack spacing={2} sx={{ width: "100%", maxWidth: 1000, fontFamily: NoFontFamily }}>
      <LobbyPanel />
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center", gap: 1 }}>
          <ToggleButtonGroup size="small" exclusive value={game.mode}
            onChange={(_event, value) => value && act.setMode(value)}>
            <ToggleButton value="solo" data-testid="mode-solo">Solo</ToggleButton>
            <ToggleButton value="cpu" data-testid="mode-cpu">CPU</ToggleButton>
          </ToggleButtonGroup>

          <ToggleButtonGroup
            size="small"
            exclusive
            value={game.traditional ? "traditional" : "leisure"}
            onChange={(_event, value) => value && act.setTraditional(value === "traditional")}
          >
            <ToggleButton value="traditional" data-testid="rule-traditional">Classic</ToggleButton>
            <ToggleButton value="leisure" data-testid="rule-leisure">Leisure</ToggleButton>
          </ToggleButtonGroup>

          <Chip size="small" label={`deck ${game.deckRows}×${game.deckColumns}`} data-testid="deck-size" />
          <Button size="small" onClick={() => act.resize(game.deckRows - 1, game.deckColumns)}>-row</Button>
          <Button size="small" onClick={() => act.resize(game.deckRows + 1, game.deckColumns)}>+row</Button>
          <Button size="small" onClick={() => act.resize(game.deckRows, game.deckColumns - 1)}>-col</Button>
          <Button size="small" onClick={() => act.resize(game.deckRows, game.deckColumns + 1)}>+col</Button>
          <Button size="small" onClick={() => act.fill(0)} data-testid="random-fill">Random Fill</Button>
          <Button size="small" onClick={() => act.fill(1)}>Fill CPU</Button>
          <Button size="small" onClick={() => act.clear(0)}>Clear Deck</Button>
          <Button size="small" onClick={() => act.shuffle(0)}>Shuffle Deck</Button>
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            variant="contained"
            onClick={act.start}
            disabled={game.state !== "selecting" || filledSlots(game.players[0]!.deck) === 0}
            data-testid="start-game"
          >
            Start
          </Button>
          <Button size="small" onClick={act.stop} disabled={game.state === "selecting"} data-testid="stop-game">
            Stop
          </Button>
        </Stack>

        {game.mode === "cpu" && (
          <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Typography variant="caption">CPU mean(s)</Typography>
            <TextField size="small" type="number" value={cpu.meanSeconds} sx={{ width: "6em" }}
              onChange={(event) => setCpu({ meanSeconds: Number(event.target.value) || 0 })}
              slotProps={{ htmlInput: { "aria-label": "cpu-mean" } }} />
            <Typography variant="caption">σ(s)</Typography>
            <TextField size="small" type="number" value={cpu.stdDevSeconds} sx={{ width: "6em" }}
              onChange={(event) => setCpu({ stdDevSeconds: Number(event.target.value) || 0 })}
              slotProps={{ htmlInput: { "aria-label": "cpu-sigma" } }} />
            <Typography variant="caption">mistake(%)</Typography>
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
              {revealAnswer ? <>Answer: <b>{currentName}</b></> : <>Now playing: {game.state === "turnStart" ? "???" : "—"}</>}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              turn #{game.turnSeq} · {game.state} · gives {game.givesLeft}
            </Typography>
          </Stack>
          <Box sx={{ flex: 1 }} />
          <Button size="small" onClick={() => setCardWidth((w) => Math.max(32, w - 8))}>Card -</Button>
          <Button size="small" onClick={() => setCardWidth((w) => Math.min(112, w + 8))}>Card +</Button>
        </Stack>

        {game.state === "finished" && (
          <Alert severity="success" sx={{ mb: 1 }} data-testid="game-finished">
            Finished! Winner: {game.winner === null ? "draw" : game.winner === 0 ? "You" : "Opponent"}
          </Alert>
        )}
        {game.state === "turnWinner" && game.givesLeft !== 0 && (
          <Alert severity="info" sx={{ mb: 1 }} data-testid="give-hint">
            {game.givesLeft > 0
              ? `You must give ${game.givesLeft} card(s): click your card, then an empty slot on the opponent side — or press Next to give randomly.`
              : `You will receive ${-game.givesLeft} card(s) — press Next.`}
          </Alert>
        )}

        <Typography variant="caption" color="text.secondary">
          Opponent · collected {game.players[1]!.collected.length}
        </Typography>
        <DeckGrid
          testId="deck-opponent"
          deck={game.players[1]!.deck}
          rows={game.deckRows}
          columns={game.deckColumns}
          cardSet={cardSet}
          cardFiles={cardFiles}
          width={cardWidth}
          upsideDown
          interactive={game.state === "turnStart" || (game.state === "turnWinner" && game.givesLeft < 0)}
          cardStates={pickStates[1]}
          cheatSlot={cheatSlotOf(1)}
          glitch={glitch}
          onCardClick={(slot) => act.pick(1, slot)}
          onEmptyClick={handleOpponentEmpty}
        />

        <Divider sx={{ my: 1.5 }} />

        <Typography variant="caption" color="text.secondary">
          You · collected {game.players[0]!.collected.length}
        </Typography>
        <DeckGrid
          testId="deck-you"
          deck={game.players[0]!.deck}
          rows={game.deckRows}
          columns={game.deckColumns}
          cardSet={cardSet}
          cardFiles={cardFiles}
          width={cardWidth}
          interactive={game.state === "turnStart" || (game.state === "turnWinner" && game.givesLeft > 0)}
          cardStates={pickStates[0]}
          cheatSlot={cheatSlotOf(0)}
          glitch={glitch}
          onCardClick={handleOwnCard}
        />

        <Stack direction="row" spacing={1} sx={{ mt: 1.5, alignItems: "center", flexWrap: "wrap" }}>
          <Button size="small" variant="contained" onClick={act.next}
            disabled={game.state !== "turnStart" && game.state !== "turnWinner"} data-testid="next-turn">
            Next Turn
          </Button>
          <Button size="small" onClick={act.give} disabled={game.givesLeft === 0} data-testid="give-cards">
            Give randomly
          </Button>
          <Button size="small" onClick={act.filterByDeck} data-testid="filter-by-deck">
            {t(Localization.GameFilterByDeck)}
          </Button>
          <Chip size="small" variant="outlined" label={`pool ${pool.length}`} />
          <Chip size="small" variant="outlined" label={`rotation ${rotation}`} />
        </Stack>
      </Paper>
    </Stack>
  );
}
