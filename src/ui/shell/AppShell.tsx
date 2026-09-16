/** 应用外壳：页签栏（含 Alice 彩蛋按钮）+ 当前页。 */
import { Box, Button, Divider, Stack, Typography } from "@mui/material";

import { Localization, t } from "../../i18n/localization";
import { stableHash } from "../../cheat";
import { TAB_ORDER, useSession, type TabId } from "../../store/session";
import { NoFontFamily } from "../../theme/theme";
import type { DataBundle } from "../../data/types";
import { ConfigPanel } from "../panels/ConfigPanel";
import { GamePanel } from "../panels/GamePanel";
import { ListPanel } from "../panels/ListPanel";
import { PlayerPanel } from "../panels/PlayerPanel";

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

export function AppShell({ bundle, onAlice }: { bundle: DataBundle; onAlice?: () => void }) {
  const { tab, setTab, locale } = useSession();
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
            onClick={onAlice}
            sx={{ fontFamily: NoFontFamily, minWidth: "4em" }}
          >
            {aliceLabel(false)}
          </Button>
        </Stack>

        <Typography variant="caption" color="text.secondary">
          {t(Localization.ShellDataHash)} {bundle.index.contentHash.slice(0, 12)} · {locale}
        </Typography>

        {tab === "player" && <PlayerPanel bundle={bundle} />}
        {tab === "list" && <ListPanel bundle={bundle} />}
        {tab === "config" && <ConfigPanel bundle={bundle} />}
        {tab === "game" && <GamePanel bundle={bundle} />}
      </Stack>
    </Box>
  );
}
