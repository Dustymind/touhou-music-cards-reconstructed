/** 卡面图集：按原版 `ConfigTab` 的样式列出每套图集（名称 + 使用按钮 + 说明 + 三张示例卡）。
 *
 * 上游结构：一行是「图集名（左）+ 选择按钮（右）」，下面一行是「说明（左半）+ 三张示例卡（右半）」，
 * 图集之间用分隔线。这里保持同样的信息结构，外观走 MD2（卡片、`Divider`、`Button` 的
 * contained/outlined 语义）；中文模式的按钮文案用原版（「使用」/「正在使用」）。
 */
import { Box, Button, Divider, Stack, Typography } from "@mui/material";

import type { DataBundle } from "../../../data/types";
import { Localization, t } from "../../../i18n/localization";
import { useSession } from "../../../store/session";
import { CharacterCard } from "../../components/CharacterCard";
import { cardSetDescription } from "./cardSetDescriptions";
import { SectionCard } from "./SectionCard";

/** 示例卡数量（上游也是三张）与宽度。 */
const EXAMPLE_COUNT = 3;
const EXAMPLE_WIDTH = 64;

export function CardSetSection({ bundle }: { bundle: DataBundle }) {
  const { cardCollection, setCardCollection } = useSession();

  /** 示例卡：取前三名角色的第一张卡面（文件名与图集无关，目录由所选图集决定）。 */
  const examples = bundle.characters
    .filter((character) => (character.card[0] ?? "") !== "")
    .slice(0, EXAMPLE_COUNT)
    .map((character) => ({ key: character.key, file: character.card[0]! }));

  return (
    <SectionCard title={t(Localization.ConfigTabCardCollection)}>
      <Stack divider={<Divider flexItem />} spacing={2}>
        {bundle.cardSets.map((set) => {
          const selected = cardCollection === set.id;
          return (
            <Stack key={set.id} spacing={1} data-testid={`cardset-row-${set.id}`}>
              <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                <Typography variant="body1" sx={{ flex: 1 }}>{set.id}</Typography>
                <Button
                  data-testid={`cardset-${set.id}`}
                  variant={selected ? "contained" : "outlined"}
                  disabled={selected}
                  onClick={() => setCardCollection(set.id)}
                >
                  {t(selected ? Localization.ConfigTabSelected : Localization.ConfigTabSelect)}
                </Button>
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ flex: 1, "& a": { color: "primary.main" } }}
                >
                  {cardSetDescription(set.id, set.origins[0] ?? "")}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  {examples.map((example) => (
                    <Box key={example.key} sx={{ width: EXAMPLE_WIDTH }}>
                      <CharacterCard cardSet={set} file={example.file} state="normal" />
                    </Box>
                  ))}
                </Stack>
              </Stack>
            </Stack>
          );
        })}
      </Stack>
    </SectionCard>
  );
}
