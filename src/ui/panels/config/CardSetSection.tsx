/** 卡面图集菜单（MD2 选择控件）。
 *
 * 信息结构照上游 `ConfigTab`：每套图集的内部 id、说明文字、三张示例卡，图集之间用 1px 分隔线。
 * 但**选择控件按 MD2 换成单选组**——MD2 里"多选一"用 radio（按钮只用于触发动作），
 * 原来每行一个「使用 / 正在使用」按钮既不符合 MD2，也不如单选一眼看清当前选中项。
 */
import { Box, Divider, FormControlLabel, Radio, RadioGroup, Stack, Typography } from "@mui/material";

import type { DataBundle } from "../../../data/types";
import { Localization, t } from "../../../i18n/localization";
import { useSession } from "../../../store/session";
import { CharacterCard } from "../../components/CharacterCard";
import { cardSetDescription } from "./cardSetDescriptions";
import { SectionPanel } from "./SectionCard";

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
    <SectionPanel id="cardset" title={t(Localization.ConfigTabCardCollection)}>
      {/* MD2：一组互斥选项用单选组；组本身有名字（无障碍） */}
      <RadioGroup
        value={cardCollection}
        onChange={(_event, value) => setCardCollection(value)}
        aria-label={t(Localization.ConfigTabCardCollection)}
        // MD2：单选按钮与第一行文字顶对齐（不是整块内容垂直居中），整行占满宽度
        sx={{
          gap: 0,
          "& .MuiFormControlLabel-root": { alignItems: "flex-start", ml: 0, mr: 0, width: "100%" },
        }}
      >
        <Stack divider={<Divider flexItem />} spacing={2}>
          {bundle.cardSets.map((set) => (
            <FormControlLabel
              key={set.id}
              value={set.id}
              data-testid={`cardset-row-${set.id}`}
              control={<Radio data-testid={`cardset-radio-${set.id}`} size="small" sx={{ mt: 0.25 }} />}
              // MD2：标题（subtitle2）+ 说明（body2，中强调）+ 示例卡，整体与单选按钮对齐
              label={
                <Stack spacing={0.5} sx={{ flex: 1, py: 0.5 }}>
                  {/* MD2 两行列表：主文本 body1、次文本 body2（中强调） */}
                  <Typography variant="body1" data-testid={`cardset-title-${set.id}`}>
                    {set.id}
                  </Typography>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                    sx={{ alignItems: "flex-start" }}
                  >
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      data-testid={`cardset-description-${set.id}`}
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
              }
              sx={{ width: "100%", mx: 0 }}
            />
          ))}
        </Stack>
      </RadioGroup>
    </SectionPanel>
  );
}
