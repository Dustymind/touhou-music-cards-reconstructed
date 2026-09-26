/** 卡面：**图集 × 数据集 → 每张卡用哪张图、以及有几张卡**（D153；含 2026-09-26 的行为优化）。
 *
 * 四条规则（改动前请连着读一遍，它们互相咬着）：
 *
 * 1. **多重卡牌只在"自定义卡面"下生效**（用户要求）：选中的图集是**源按曲目给卡面**的那套
 *    （`sourceOnly`，即音MAD 的 B 站封面集）时，一个角色才有 `covers.length` 张卡（一首一张）；
 *    其余图集（上游原版立绘、本地自放图集）回到**一个角色 `card.length` 张卡** —— 否则"打原版图集"
 *    会看到同一个角色的 N 张一样的立绘各占一张卡，既没意义也把牌堆撑大。
 * 2. **渲染与卡池分开算**（`cardFaces` vs `cardCount`）：渲染表按**数据最大**口径铺满，
 *    于是联机对面用着别的图集、发来一个更大的 `cardIndex` 时也画得出图，不会变成空卡面。
 * 3. **源封面图集（`sourceOnly`）**：第 i 张直接用源给的 `covers[i]`（绝对 https URL，
 *    `CharacterCard` 原样用，不拼目录、不做 URL 编码）。
 * 4. **其余图集**：用 `card` 按张数**轮转**（合成角色 —— 普莉兹姆利巴三姐妹那种 —— 正好按序轮到自己那张）。
 *
 * **互斥表不看当前图集**（`maxCardCount`）：一个角色"最多可能贡献几张卡"按**两种口径取最大**算。
 * 若按当前图集算，两端选了不同图集时会出现一边能放第二张、另一边不能 —— 那就破了
 * "一个角色在整张桌子上最多一张卡"这条不变式（D108）。
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

/** 这套图集的卡面是不是**按曲目给的**（= 源提供，`sourceOnly`）—— **多重卡牌的唯一开关**。 */
export function usesPerTrackFaces(cardSet: CardSetRecord | undefined): boolean {
  return cardSet?.sourceOnly === true;
}

/** 这个角色**最多可能**贡献几张卡：两种口径取最大（`covers.length` 与 `card.length`）。
 *
 *  只给互斥表用 —— **与当前选了哪套图集无关**（见文件头最后一条）。 */
export function maxCardCount(character: CharacterRecord): number {
  return Math.max(character.covers?.length ?? 0, character.card.length);
}

/** 这个角色在**当前图集**下进卡池几张卡（决定牌堆大小与 `cardIndex` 的取值范围）。
 *
 *  * 自定义卡面（`sourceOnly`，源按曲目给）⇒ 一首一张（`covers.length`；没有就退回原版卡面数）；
 *  * 其余图集 ⇒ 一个角色 `card.length` 张（原版立绘 1 张；合成角色 2–3 张）。
 *
 *  ⚠️ 卡池大小**跟着图集走**是有意的（用户要求）。换图集时牌堆会跟着变：变小时已有的牌
 *  **不会被丢弃**（`init` 只换 `pool`/`conflicts`，不动牌库），渲染走 :func:`cardFaces` 的铺满口径
 *  所以不会白卡，互斥表也仍按最大口径挡着。 */
export function cardCount(character: CharacterRecord, cardSet?: CardSetRecord): number {
  if (!usesPerTrackFaces(cardSet)) return character.card.length;
  return character.covers?.length ?? character.card.length;
}

/** 第 `index` 张卡的图（越界/负数一律回到第 0 张，**绝不返回 undefined**）。 */
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

/** 渲染用的卡面表：下标 → 图，长度按**数据最大**口径铺满（:func:`maxCardCount`）。
 *
 *  **比当前卡池长是故意的**：联机对面可能用着"自定义卡面"那套（一首一张），它发来的 `cardIndex`
 *  会超出本端卡池 —— 这样仍画得出图（原版立绘按序轮转），而不是一张空卡面。
 *  卡池本身**不看**这个长度，看 :func:`cardCount`。 */
export function cardFaces(character: CharacterRecord, cardSet: CardSetRecord | undefined): string[] {
  const count = maxCardCount(character);
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
