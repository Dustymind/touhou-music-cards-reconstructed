/** 卡面：**图集 × 数据集 → 每张卡用哪张图**（D153）。
 *
 * 三条规则（改动前请连着读一遍，它们互相咬着）：
 *
 * 1. **卡数是数据决定的，不随图集变**：`covers.length || card.length`。牌库/牌桌上的身份是
 *    `(characterKey, cardIndex)`，所以卡数一变，存档里的序号、联机快照、染色就全对不上 ——
 *    换图集**只能换图**。
 * 2. **源封面图集（`sourceOnly`）**：第 i 张直接用源给的 `covers[i]`（绝对 https URL，
 *    `CharacterCard` 原样用，不拼目录、不做 URL 编码）。
 * 3. **其余图集**（含音MAD 模式下的**原版卡面**）：用 `card` 按张数**轮转**。音MAD 角色现在有
 *    多张卡（一首一张），原版图只有一两张时这就是"同一个角色的不同卡"；合成角色（普莉兹姆利巴
 *    三姐妹那种）正好按序轮到他自己的那张。
 *
 * 卡池变大了会不会破坏"同一角色只能有一张卡"？不会 —— `buildSongConflicts` 的自链接按
 * `card.length > 1` 建，音MAD 侧现在**每张卡都是独立的一张**，互斥表按 `characterKey` 判定，
 * 于是补满牌库时同一角色仍然只会被抽到一张（`rules.randomFill` 的逐张判定）。
 */
import type { CardSetRecord, CharacterRecord, ModeDataset } from "./types";

/** 一个可用图集都没有时的兜底（测试里 `cardSets: []` 会走到）：不显示图，但不炸。 */
const NO_CARD_SET: CardSetRecord = {
  id: "", dir: "", label: { en: "", zh: "" }, localPrefix: "./", origins: [],
};

/** 这一条卡面是不是**完整 URL**（源封面就是）。`CharacterCard` 据此跳过"拼目录"那一步。 */
export function isCardUrl(file: string): boolean {
  return /^https?:\/\//i.test(file);
}

/** 这个角色在卡池里有几张卡：**源封面优先**（一首一封面），没有就按原版卡面数。 */
export function cardCount(character: CharacterRecord): number {
  return character.covers?.length ?? character.card.length;
}

/** 第 `index` 张卡的图（越界/负数一律按第一张算，绝不返回 undefined）。 */
export function cardFace(
  character: CharacterRecord,
  cardSet: CardSetRecord | undefined,
  index: number,
): string {
  const covers = character.covers ?? [];
  const card = character.card;
  const safe = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0;
  if (cardSet?.sourceOnly) return covers[safe] ?? card[safe % card.length] ?? "";
  return card[safe % card.length] ?? covers[safe] ?? "";
}

/** 一个角色在当前图集下的**全部**卡面（长度 = :func:`cardCount`，下标与牌库一致）。 */
export function cardFaces(character: CharacterRecord, cardSet: CardSetRecord | undefined): string[] {
  const count = cardCount(character);
  const out: string[] = [];
  for (let index = 0; index < count; index += 1) out.push(cardFace(character, cardSet, index));
  return out;
}

/** 这份数据集有没有"源给的封面"（音MAD 侧才有）。**图集可不可选就看它**：源不提供 ⇒ 不显示。 */
export function hasSourceCovers(dataset: ModeDataset): boolean {
  return dataset.characters.some((character) => (character.covers?.length ?? 0) > 0);
}

/** 当前模式下能选的图集：`mode` 不匹配的、以及**源没给素材**的 `sourceOnly` 图集都不出现。 */
export function availableCardSets(
  sets: readonly CardSetRecord[],
  dataset: ModeDataset,
): CardSetRecord[] {
  const covers = hasSourceCovers(dataset);
  return sets.filter((set) =>
    (set.mode === undefined || set.mode === dataset.mode)
    && (!set.sourceOnly || covers));
}

/** 生效的图集：选中的那套在当前模式/当前源下可选就用它，否则回落到第一套可选的。
 *
 *  回落的只是**渲染**，用户存的偏好不动 —— 于是"音MAD 选了封面集、切回原曲"时不会白卡，
 *  切回音MAD 又自动用回封面集。 */
export function resolveCardSet(
  sets: readonly CardSetRecord[],
  selectedId: string,
  dataset: ModeDataset,
): CardSetRecord {
  const usable = availableCardSets(sets, dataset);
  return usable.find((set) => set.id === selectedId) ?? usable[0] ?? sets[0] ?? NO_CARD_SET;
}
