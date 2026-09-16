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

  useGameLoop(true);

  const pickStates = useMemo(() => {
    const states: Record<0 | 1, Record<number, CardState>> = { 0: {}, 1: {} };
    for (const event of game.pickEvents) {
      states[event.side][event.slot] = event.card.characterKey === game.currentKey ? "correct" : "incorrect";
    }
    return states;
  }, [game.pickEvents, game.currentKey]);

  const currentName = game.currentKey
    ? bundle.characterByKey.get(game.currentKey)?.name ?? game.currentKey
    : "—";
  const revealAnswer = game.state === "turnWinner" || game.state === "finished";
  const rotation = game.order.filter((key) => !game.temporaryDisabled[key]).length;

  const handleOwnCard = (slot: number, _card: CardInfo) => {
    if (game.state === "turnStart") {
      pick(0, slot);
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
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center", gap: 1 }}>
          <ToggleButtonGroup size="small" exclusive value={game.mode}
            onChange={(_event, value) => value && setMode(value)}>
            <ToggleButton value="solo" data-testid="mode-solo">Solo</ToggleButton>
            <ToggleButton value="cpu" data-testid="mode-cpu">CPU</ToggleButton>
          </ToggleButtonGroup>

          <ToggleButtonGroup
            size="small"
            exclusive
            value={game.traditional ? "traditional" : "leisure"}
            onChange={(_event, value) => value && setTraditional(value === "traditional")}
          >
            <ToggleButton value="traditional" data-testid="rule-traditional">Classic</ToggleButton>
            <ToggleButton value="leisure" data-testid="rule-leisure">Leisure</ToggleButton>
          </ToggleButtonGroup>

          <Chip size="small" label={`deck ${game.deckRows}×${game.deckColumns}`} data-testid="deck-size" />
          <Button size="small" onClick={() => resize(game.deckRows - 1, game.deckColumns)}>-row</Button>
          <Button size="small" onClick={() => resize(game.deckRows + 1, game.deckColumns)}>+row</Button>
          <Button size="small" onClick={() => resize(game.deckRows, game.deckColumns - 1)}>-col</Button>
          <Button size="small" onClick={() => resize(game.deckRows, game.deckColumns + 1)}>+col</Button>
          <Button size="small" onClick={() => fill(0)} data-testid="random-fill">Random Fill</Button>
          <Button size="small" onClick={() => fill(1)}>Fill CPU</Button>
          <Button size="small" onClick={() => clear(0)}>Clear Deck</Button>
          <Button size="small" onClick={() => shuffle(0)}>Shuffle Deck</Button>
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            variant="contained"
            onClick={start}
            disabled={game.state !== "selecting" || filledSlots(game.players[0]!.deck) === 0}
            data-testid="start-game"
          >
            Start
          </Button>
          <Button size="small" onClick={stop} disabled={game.state === "selecting"} data-testid="stop-game">
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
          onCardClick={(slot) => pick(1, slot)}
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
          onCardClick={handleOwnCard}
        />

        <Stack direction="row" spacing={1} sx={{ mt: 1.5, alignItems: "center", flexWrap: "wrap" }}>
          <Button size="small" variant="contained" onClick={next}
            disabled={game.state !== "turnStart" && game.state !== "turnWinner"} data-testid="next-turn">
            Next Turn
          </Button>
          <Button size="small" onClick={give} disabled={game.givesLeft === 0} data-testid="give-cards">
            Give randomly
          </Button>
          <Button size="small" onClick={filterByDeck} data-testid="filter-by-deck">
            {t(Localization.GameFilterByDeck)}
          </Button>
          <Chip size="small" variant="outlined" label={`pool ${pool.length}`} />
          <Chip size="small" variant="outlined" label={`rotation ${rotation}`} />
        </Stack>
      </Paper>
    </Stack>
  );
}
