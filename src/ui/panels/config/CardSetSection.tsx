/** 「卡面设置」分区（D164 从"卡面图集"改名）：**图集菜单**（原曲 / 音MAD）+ **卡面比例**（模式 3）。
 *
 * 信息结构照上游 `ConfigTab`：每套图集的内部 id、说明文字、三张示例卡，图集之间用 1px 分隔线。
 * 但**选择控件按 MD2 换成单选组**——MD2 里"多选一"用 radio（按钮只用于触发动作），
 * 原来每行一个「使用 / 正在使用」按钮既不符合 MD2，也不如单选一眼看清当前选中项。
 *
 * 列出哪些图集**由数据决定**（D153）：`mode` 不匹配的、以及**源没给封面**的源封面图集
 * 这里根本不出现（"源不提供则不显示"）；当前生效的是哪一套由 `resolveCardSet` 统一裁 ——
 * 单选组的 value 用**生效值**，否则切模式后会出现"一套都没选中"。
 *
 * **画幅控件**（D165）：只要当前生效的图集**能换画幅**（素材由使用者/源给的那些：本地自放图集、
 * 音MAD 的 B 站封面集、模式 3 的合成图集），这里就多一行「卡面比例」——
 * 常规 703:1000 / 16:9 / 4:3 三选一。**内置六套不出现它**（`library` 原版立绘就那一个形状）。
 * 控件下面放三张示例卡：切一下就能看到差别，而且示例卡走的是**同一个** `cardFace` + 生效图集，
 * 所以它显示的就是牌桌上真正会画的那张（含"按档位取哪一份链接"）。
 * 模式 3（自带卡面）没有图集可选 ⇒ 那个模式下这个分区就是那行只读说明 + 画幅控件。
 */
import {
  Box, Divider, FormControlLabel, Radio, RadioGroup, Stack, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";

import type { DataBundle } from "../../../data/types";
import { availableCardSets, cardFace, resolveCardSet } from "../../../data/cardFaces";
import { Localization, t } from "../../../i18n/localization";
import { useCurrentDataset } from "../../../data/useDataset";
import { useSession } from "../../../store/session";
import { usesOwnCardFaces } from "../../../music/mode";
import { CARD_RATIOS, cardRatioChoices, type CardRatio } from "../../../theme/cardRatio";
import { CharacterCard } from "../../components/CharacterCard";
import { cardSetDescription } from "./cardSetDescriptions";
import { SectionPanel } from "./SectionCard";
import { memoOnLocale } from "../../memoOnLocale";

/** 示例卡数量（上游也是三张）与宽度。 */
const EXAMPLE_COUNT = 3;
const EXAMPLE_WIDTH = 64;

/** 档位 → 文案键（`original` 也走 i18n：中文叫「常规」）。 */
const RATIO_LABELS = {
  original: "ConfigTabCardRatioOriginal",
  "16x9": "ConfigTabCardRatio16x9",
  "4x3": "ConfigTabCardRatio4x3",
} as const satisfies Record<CardRatio, keyof typeof Localization>;

function CardSetSectionInner({ bundle }: { bundle: DataBundle }) {
  const dataset = useCurrentDataset(bundle);
  const { cardCollection, setCardCollection, cardRatio, setCardRatio } = useSession();

  /** 当前模式下能选的图集（源封面图集只有音MAD + 源真的给了封面才在里头）。 */
  const sets = availableCardSets(bundle.shared.cardSets, dataset);
  /** 自带卡面的模式（模式 3）：没有图集可选，这个分区里只剩只读说明 + 画幅控件。 */
  const ownFaces = usesOwnCardFaces(dataset.mode);
  /** 真正生效的那一套（存的偏好可能在本模式下不可选 ⇒ 与游戏页/播放页同一口径）。 */
  const effective = resolveCardSet(bundle.shared.cardSets, cardCollection, dataset, cardRatio);

  /** 这套图集能换的画幅（内置六套没有 ⇒ 不出现控件）；数组第一项是它自己的默认档。 */
  const choices = cardRatioChoices(effective) ?? [];
  const ratioControl = choices.length > 1 && (
    <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
      <Typography variant="body2">{t(Localization.ConfigTabCardRatio)}</Typography>
      {/* MD2：多选一 ⇒ segmented control（与「外观」的模式开关同一套写法），左对齐、另起一行。
          选项只列这套图集允许的档位，顺序照 `CARD_RATIOS`（常规 → 16:9 → 4:3）。 */}
      <ToggleButtonGroup
        exclusive
        size="small"
        value={effective.ratio ?? choices[0]}
        onChange={(_event, next: CardRatio | null) => { if (next) setCardRatio(next); }}
        aria-label={t(Localization.ConfigTabCardRatio)}
        sx={{ alignSelf: "flex-start" }}
      >
        {CARD_RATIOS.filter((ratio) => choices.includes(ratio)).map((ratio) => (
          <ToggleButton key={ratio} value={ratio} data-testid={`card-ratio-${ratio}`}>
            {t(Localization[RATIO_LABELS[ratio]])}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Stack>
  );

  /** 示例卡：取前三名角色、每套图集各渲染各自的第一张（图是 `cardFace` 算的，不写字面文件名）。 */
  const examples = dataset.characters
    .map((character) => ({ key: character.key, character }))
    .filter((example) => cardFace(example.character, effective, 0) !== "")
    .slice(0, EXAMPLE_COUNT);

  /** 三张示例卡（图集菜单与比例控件共用；宽度都是 `EXAMPLE_WIDTH`）。 */
  const exampleCards = (set = effective) => (
    <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", flexShrink: 0 }}>
      {examples.map((example) => (
        <Box key={example.key} sx={{ width: EXAMPLE_WIDTH }}>
          <CharacterCard cardSet={set} file={cardFace(example.character, set, 0)} state="normal" />
        </Box>
      ))}
    </Stack>
  );

  if (ownFaces) {
    return (
      <SectionPanel id="cardset" title={t(Localization.ConfigTabCardSettings)}>
        <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
          <Typography variant="body2" color="text.secondary" data-testid="cardset-fixed">
            {t(Localization.ConfigTabCardSetFixed)}
          </Typography>
          {ratioControl}
          {/* 示例卡：这一行显示的就是**当前档位**下牌桌上会画的那张（含按档位取链接） */}
          {examples.length > 0 && exampleCards()}
        </Stack>
      </SectionPanel>
    );
  }

  return (
    <SectionPanel id="cardset" title={t(Localization.ConfigTabCardSettings)}>
      {/* MD2：一组互斥选项用单选组；组本身有名字（无障碍） */}
      <RadioGroup
        value={effective.id}
        onChange={(_event, value) => setCardCollection(value)}
        aria-label={t(Localization.ConfigTabCardSettings)}
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
                    {exampleCards(set)}
                  </Stack>
                </Stack>
              }
              sx={{ width: "100%", mx: 0 }}
            />
          ))}
        </Stack>
      </RadioGroup>
      {/* 选中的图集能换画幅（本地自放 / 源给的封面集）⇒ 图集列表下面再给一行控件 + 示例卡 */}
      {ratioControl && (
        <Stack spacing={2} sx={{ alignItems: "flex-start", mt: 2 }}>
          <Divider flexItem sx={{ width: "100%" }} />
          {ratioControl}
          {examples.length > 0 && exampleCards()}
        </Stack>
      )}
    </SectionPanel>
  );
}

/** 分区之间互不牵连：展开一个分区不该把其它分区的长列表一起重渲染（memo 掉）。 */
export const CardSetSection = memoOnLocale(CardSetSectionInner);
