/** 应用外壳：页签栏（含 Alice 彩蛋按钮）+ 当前页。 */
import { Box, Button, Divider, Stack, Typography } from "@mui/material";

import { useEffect, useMemo } from "react";

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

  // 联机握手要用静态数据哈希：挂在 window 上，避免层层透传
  useEffect(() => {
    (window as unknown as { __TMC_DATA_HASH__?: string }).__TMC_DATA_HASH__ = bundle.index.contentHash;
  }, [bundle.index.contentHash]);

  // 预设：持久化状态与新专辑默认勾选合并（首帧就要用它算队列，不能等 effect）
  const activePreset = useMemo(() => mergeWithDefaults(preset, bundle.albums), [preset, bundle.albums]);

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
    currentKey: queue.currentKey,
    seed: queue.seed,
    setCurrent: queue.setCurrent,
    step: (direction) => queue.step(direction, queue.order),
  });

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
    <Box sx={{ display: "flex", justifyContent: "center", p: 2, fontFamily: NoFontFamily }}>
      <Stack spacing={2} sx={{ width: "100%", maxWidth: 1000, alignItems: "center" }}>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexWrap: "wrap" }}>
          {TAB_ORDER.map((id, index) => (
            <Box key={id} sx={{ display: "flex", alignItems: "center" }}>
              {index > 0 && <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />}
              <Button
                size="small"
                variant={tab === id ? "contained" : "text"}
                onClick={() => setTab(id)}
                sx={{ fontFamily: NoFontFamily, minWidth: "4em" }}
              >
                {names[id]}
              </Button>
            </Box>
          ))}
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Button
            size="small"
            color="success"
            variant="text"
            onClick={jumpToAlice}
            sx={{ fontFamily: NoFontFamily, minWidth: "4em" }}
          >
            {aliceLabel(false)}
          </Button>
        </Stack>

        <Typography variant="caption" color="text.secondary">
          {t(Localization.ShellDataHash)} {bundle.index.contentHash.slice(0, 12)} · {locale}
        </Typography>

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
            onSelect={(key) => queue.setCurrent(key)}
            onToggleTemporary={(key) => queue.toggleTemporary(key)}
          />
        )}
        {tab === "list" && <ListPanel bundle={bundle} />}
        {tab === "config" && <ConfigPanel bundle={bundle} tables={sources.tables} />}
        {tab === "game" && <GamePanel bundle={bundle} />}
      </Stack>
    </Box>
  );
}
