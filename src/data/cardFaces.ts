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
 *
 * 5. **可选集是唯一的入口**（D155）：`availableCardSets` 决定"这个模式能选哪几套"，`resolveCardSet`
 *    的回落**只允许落在它的结果里** —— 没有可用图集就是**空图集**（不画图），不再回头去用 `sets[0]`。
 *    同理"哪些模式共用内置图集"由 `src/music/mode.ts` 的 `usesOwnCardFaces()` 明写。
 * 6. **卡面形状也跟着图集走**（D163）：模式 3 的合成图集声明 `aspectRatio` = 16:9 横版，
 *    其余图集不写就是原比例 703:1000。取法只有 `theme/cardRatio.ts` 的 `cardAspectRatio(set)`
 *    —— 卡条、牌桌、未使用卡牌区、底部面板、播放页的尺寸全部由它算，两种比例都要能画。
 */
import type { CardSetRecord, CharacterRecord, ModeDataset } from "./types";
import { usesOwnCardFaces } from "../music/mode";
import { DEFAULT_CARD_RATIO, type CardRatio } from "../theme/cardRatio";

/** 一个可用图集都没有时的兜底（测试里 `cardSets: []` 会走到）：不显示图，但不炸。 */
const NO_CARD_SET: CardSetRecord = {
  id: "", dir: "", label: { en: "", zh: "" }, localPrefix: "./", origins: [],
};

/** 模式 3（自带卡面）的**合成图集**：素材是清单给的**绝对 URL**，所以没有目录、没有 origin，
 *  也不进 `cardsets.json`（它是代码里的常量，不是一条数据 —— 契约 C3）。
 *
 *  `sourceOnly` 让 `CharacterCard` 原样用那条 URL、并按卡面比例 `cover`（与音MAD 的 B 站封面同一套）；
 *  每卡恰好一张（`card` 与 `covers` 都是它）⇒ 卡数恒为 1，取模轮转天然安全。
 *
 *  **比例不写在这里**：这个模式的卡图由使用者自己提供（横版居多），比例是**用户偏好**
 * （设置页「卡面设置」里 16:9 / 4:3 二选一，D164），由 :func:`resolveCardSet` 落到生效图集的
 * `ratio` 上。写死在这里的话，"切一档"就得改这份常量、渲染侧还得多一条特判。 */
export const CUSTOM_CARD_SET: CardSetRecord = {
  id: "custom-source", dir: "", label: { en: "Custom source", zh: "自定义源" },
  localPrefix: "./", origins: [], sourceOnly: true, mode: "custom",
};

/** 每个档位一个**常量**合成图集（引用稳定）。
 *
 *  ⚠️ 这一层缓存不是优化、是正确性：`GamePanel` 把 `cardSet` 放进"重建卡池"那个 effect 的依赖里，
 *  而 `resolveCardSet` 每次调用都新建一个 `{...CUSTOM_CARD_SET, ratio}` ⇒ 每次渲染都是新身份
 *  ⇒ effect 每次都跑 ⇒ `init()` 改状态 ⇒ 再渲染 …… 实测就是 `Maximum update depth exceeded`。
 *  同一档位返回同一个对象之后，"选中的图集 / 档位没变 ⇒ `cardSet` 引用不变"这条不变量成立。 */
const OWN_FACE_SETS = new Map<CardRatio, CardSetRecord>();

/** 模式 3 的生效图集 = 合成图集 + 用户选的档位（引用稳定，见上）。 */
export function customCardSet(ratio: CardRatio): CardSetRecord {
  const cached = OWN_FACE_SETS.get(ratio);
  if (cached !== undefined) return cached;
  const set: CardSetRecord = { ...CUSTOM_CARD_SET, ratio };
  OWN_FACE_SETS.set(ratio, set);
  return set;
}

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

/** 第 `index` 张卡的图（越界/负数一律回到第 0 张，**绝不返回 undefined**）。
 *
 *  **模式 3 的两种比例**（D164）：清单给了两份卡图时（`coversByRatio`），按图集当前的档位取那一份；
 *  只有一份（旧清单 / 手放的图 / 绝对直链）就退回 `covers[0]` —— 那一份在两个档位下都会画，
 *  只是比例不对时由 `CharacterCard` 的 `object-fit: cover` 居中裁掉多余的部分。 */
export function cardFace(
  character: CharacterRecord,
  cardSet: CardSetRecord | undefined,
  index: number,
): string {
  const covers = character.covers ?? [];
  const card = character.card;
  const safe = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0;
  if (cardSet?.sourceOnly) {
    const byRatio = cardSet.ratio === undefined ? undefined : character.coversByRatio?.[cardSet.ratio];
    return byRatio ?? covers[safe] ?? card[safe % card.length] ?? "";
  }
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

/** 当前模式下能选的图集：`mode` 不匹配的、以及**源没给素材**的 `sourceOnly` 图集都不出现。
 *
 *  **自带卡面的模式只有一套**（`CUSTOM_CARD_SET`）：这个模式的卡面来源就是清单本身，
 *  所以连"源还没给素材"这条回落也不适用 —— 没有数据时本来也没有卡要画（契约 C3）。 */
export function availableCardSets(
  sets: readonly CardSetRecord[],
  dataset: ModeDataset,
): CardSetRecord[] {
  if (usesOwnCardFaces(dataset.mode)) return [CUSTOM_CARD_SET];
  const covers = hasSourceCovers(dataset);
  // 走到这里就一定是"共用内置图集"的模式（上面那条挡掉了自带卡面的模式）：
  // `mode` 缺省 = 共享图集（上游那几套、用户本地自放那套），限定了模式的图集只在它自己那个模式里出现
  return sets.filter((set) =>
    (set.mode === undefined || set.mode === dataset.mode) && (!set.sourceOnly || covers));
}

/** 生效的图集：选中的那套在当前模式/当前源下可选就用它，否则回落到第一套可选的。
 *
 *  回落**只落在 `availableCardSets` 的结果里**，这个模式下可选集为空就是空图集（不画图，D155）。
 *  回落的只是**渲染**，用户存的偏好不动 —— 于是"音MAD 选了封面集、切回原曲"时不会白卡，
 *  切回音MAD 又自动用回封面集。
 *
 *  `ratio` 只对**自带卡面的模式**（模式 3）有意义：那个模式的卡图是使用者自己给的，
 *  比例是他在设置页选的档位（D164）—— 落在这里，于是卡牌、卡条、牌桌、底部面板、播放页
 *  五处**不用各记一遍偏好**（它们都从 `cardSet` 上读 `cardAspectRatio`）。
 *  另两个模式的内置图集不写 `ratio` ⇒ 原比例，行为逐字不变。
 *
 *  **返回值引用稳定**（同一个输入 ⇒ 同一个对象）：调用方（`GamePanel`）把它放进 effect 依赖，
 *  "每次都新建一个对象"会把重建卡池跑成死循环（见 `customCardSet` 的说明）。 */
export function resolveCardSet(
  sets: readonly CardSetRecord[],
  selectedId: string,
  dataset: ModeDataset,
  ratio: CardRatio = DEFAULT_CARD_RATIO,
): CardSetRecord {
  if (usesOwnCardFaces(dataset.mode)) return customCardSet(ratio);
  const usable = availableCardSets(sets, dataset);
  return usable.find((set) => set.id === selectedId) ?? usable[0] ?? NO_CARD_SET;
}

/** 查一位角色的第 `cardIndex` 张卡面（:func:`cardFaces` 那张表按角色收好之后的取法）。
 *
 *  **越界一律回到第 0 张**（D155）：表是按**数据最大口径**铺的（`maxCardCount`），但对端用着
 *  另一套图集（一首一张）、或存档里留着旧数据时，`cardIndex` 仍可能超出本端这张表 ——
 *  夹取之后至少画得出这个角色的第一张图，不夹取就是一张空白卡。
 *  表里没有这个角色才是空串（仍交给 `CharacterCard` 的占位行为）。 */
export function cardFileAt(
  files: Readonly<Record<string, readonly string[] | undefined>>,
  characterKey: string,
  cardIndex: number,
): string {
  const list = files[characterKey];
  return list?.[cardIndex] ?? list?.[0] ?? "";
}
