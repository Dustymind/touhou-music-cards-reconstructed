/** 卡面图集菜单（MD2 选择控件）。
 *
 * 信息结构照上游 `ConfigTab`：每套图集的内部 id、说明文字、三张示例卡，图集之间用 1px 分隔线。
 * 但**选择控件按 MD2 换成单选组**——MD2 里"多选一"用 radio（按钮只用于触发动作），
 * 原来每行一个「使用 / 正在使用」按钮既不符合 MD2，也不如单选一眼看清当前选中项。
 *
 * 列出哪些图集**由数据决定**（D153）：`mode` 不匹配的、以及**源没给封面**的源封面图集
 * 这里根本不出现（"源不提供则不显示"）；当前生效的是哪一套由 `resolveCardSet` 统一裁 ——
 * 单选组的 value 用**生效值**，否则切模式后会出现"一套都没选中"。
 */
import { memo } from "react";
import { Box, Divider, FormControlLabel, Radio, RadioGroup, Stack, Typography } from "@mui/material";

import type { DataBundle } from "../../../data/types";
import { availableCardSets, cardFace, resolveCardSet } from "../../../data/cardFaces";
import { Localization, t } from "../../../i18n/localization";
import { useCurrentDataset } from "../../../data/useDataset";
import { useSession } from "../../../store/session";
import { CharacterCard } from "../../components/CharacterCard";
import { cardSetDescription } from "./cardSetDescriptions";
import { SectionPanel } from "./SectionCard";

/** 示例卡数量（上游也是三张）与宽度。 */
const EXAMPLE_COUNT = 3;
const EXAMPLE_WIDTH = 64;

function CardSetSectionInner({ bundle }: { bundle: DataBundle }) {
  const dataset = useCurrentDataset(bundle);
  const { cardCollection, setCardCollection } = useSession();

  /** 当前模式下能选的图集（源封面图集只有音MAD + 源真的给了封面才在里头）。 */
  const sets = availableCardSets(bundle.shared.cardSets, dataset);
  /** 真正生效的那一套（存的偏好可能在本模式下不可选 ⇒ 与游戏页/播放页同一口径）。 */
  const effective = resolveCardSet(bundle.shared.cardSets, cardCollection, dataset);

  /** 示例卡：取前三名角色、每套图集各渲染各自的第一张（图是 `cardFace` 算的，不写字面文件名）。 */
  const examples = dataset.characters
    .map((character) => ({ key: character.key, character }))
    .filter((example) => cardFace(example.character, effective, 0) !== "")
    .slice(0, EXAMPLE_COUNT);

  return (
    <SectionPanel id="cardset" title={t(Localization.ConfigTabCardCollection)}>
      {/* MD2：一组互斥选项用单选组；组本身有名字（无障碍） */}
      <RadioGroup
        value={effective.id}
        onChange={(_event, value) => setCardCollection(value)}
        aria-label={t(Localization.ConfigTabCardCollection)}
        // MD2：单选按钮与第一行文字顶对齐（不是整块内容垂直居中），整行占满宽度
        sx={{
          gap: 0,
          "& .MuiFormControlLabel-root": { alignItems: "flex-start", ml: 0, mr: 0, width: "100%" },
          // 标签内容要撑满整行，说明才会稳定占左侧、示例卡才能贴右
          "& .MuiFormControlLabel-label": { flex: 1, minWidth: 0 },
        }}
      >
        <Stack divider={<Divider flexItem />} spacing={2}>
          {sets.map((set) => (
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
                    // 撑满行宽 → 说明占满左侧剩余空间（位置不变、该换行就换行），
                    // 三张示例卡固定贴右（不参与伸缩）
                    sx={{ alignItems: "flex-start", width: "100%" }}
                  >
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      data-testid={`cardset-description-${set.id}`}
                      sx={{ flex: 1, "& a": { color: "primary.main" } }}
                    >
                      {cardSetDescription(set.id, set.origins[0] ?? "")}
                    </Typography>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: "flex-start", flexShrink: 0 }}
                    >
                      {examples.map((example) => (
                        <Box key={example.key} sx={{ width: EXAMPLE_WIDTH }}>
                          <CharacterCard
                            cardSet={set}
                            file={cardFace(example.character, set, 0)}
                            state="normal"
                          />
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

/** 分区之间互不牵连：展开一个分区不该把其它分区的长列表一起重渲染（memo 掉）。 */
export const CardSetSection = memo(CardSetSectionInner);
