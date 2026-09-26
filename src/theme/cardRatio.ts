/** 卡面画幅：**内置六套的原比例** + **自定义卡面**可选的三种档位（D163 / D165）。
 *
 * 三档并存是有意的：
 *
 * - `"original"`（703 / 1000，**竖版**）：上游 `Configs.ts` 的原比例。**内置的六套原版图集**
 *   （dairi / dairi-sd / enbu / enbu-dolls / thbwiki-sd / zun）永远用它，一个开关都没有；
 * - `"16x9"`（横版）：B 站封面、截图、同人图多数是这个形状；
 * - `"4x3"`（横版）：另一个常见形状。
 *
 * **谁能换**：素材由使用者/源提供的图集 —— `localOnly`（自己把图丢进 `public/…`）与
 * `sourceOnly`（源按曲目给封面，音MAD 的 B 站封面集与模式 3 的清单卡面都算）。判据收在
 * `cardRatioChoices()`，**内置六套两种都不是** ⇒ 不参与（这条有单测钉着，见 `cardFaces.test.ts`）。
 *
 * **取法只有一条**：`cardAspectRatio(cardSet)` —— 组件里不许再直接写常量：
 * 那样"某套图集能换档"这件事就会漏掉那一处，同一页上出现两种形状的卡。
 *
 * 放成一个**不引 MUI 的叶子模块**：数据层的 `cardFaces.ts` 也要用它，而 `theme/theme.ts`
 * 会 `createTheme`（把整个 MUI 拖进数据层的依赖图里不划算）。
 */

/** 卡面画幅档位（清单 / 曲包 `cover` 对象的键、`CharacterRecord.coversByRatio` 同一套）。 */
export type CardRatio = "original" | "16x9" | "4x3";

/** 档位清单（**顺序 = 界面上的顺序**：常规 → 16:9 → 4:3）。 */
export const CARD_RATIOS: readonly CardRatio[] = ["original", "16x9", "4x3"];

/** 档位 → 宽高比（`width / height`）。 */
export const CARD_RATIO_VALUES: Record<CardRatio, number> = {
  original: 703 / 1000, "16x9": 16 / 9, "4x3": 4 / 3,
};

/** 内置图集的原比例（上游 `Configs.ts` 的 `CardAspectRatio`）：703:1000 的竖版卡面。 */
export const CardAspectRatio = CARD_RATIO_VALUES.original;

/** **自动义卡面**默认允许的三档（`localOnly` / `sourceOnly` 图集没自己写 `ratios` 时用它）：
 *  第一项 = 默认档 ⇒ 常规，也就是"今天的观感"，用户不动开关就什么都不变。 */
export const DEFAULT_CUSTOM_RATIOS: readonly CardRatio[] = ["original", "16x9", "4x3"];

/** 这个值是不是一个认得的档位（存档、清单里的键都过它；坏值不许把高度算成 `NaN`）。 */
export function isCardRatio(value: unknown): value is CardRatio {
  return typeof value === "string" && (CARD_RATIOS as readonly string[]).includes(value);
}

/** 这套图集**能换哪几档**：`undefined` = 不能换（内置图集、空图集），否则是允许的档位列表，
 *  **第一项是默认档**。
 *
 *  图集自己写了 `ratios`（模式 3 的合成图集写的是 `["16x9","4x3","original"]` ⇒ 默认横版）
 *  就用它；没写但素材是使用者/源给的（`localOnly` / `sourceOnly`）用
 *  :data:`DEFAULT_CUSTOM_RATIOS`（默认常规）；其余（内置六套）不能换。 */
export function cardRatioChoices(
  set?: { ratios?: readonly CardRatio[]; localOnly?: boolean; sourceOnly?: boolean } | null,
): readonly CardRatio[] | undefined {
  if (set?.ratios !== undefined && set.ratios.length > 0) {
    return set.ratios.filter(isCardRatio).length === set.ratios.length ? set.ratios : undefined;
  }
  return set?.localOnly === true || set?.sourceOnly === true ? DEFAULT_CUSTOM_RATIOS : undefined;
}

/** 这套图集**实际**用哪一档：用户的偏好能用就用，否则回落到这套图集的默认档；
 *  不能换档的图集（内置六套）返回 `undefined` ⇒ `cardAspectRatio` 给原比例。 */
export function effectiveCardRatio(
  set?: { ratios?: readonly CardRatio[]; localOnly?: boolean; sourceOnly?: boolean } | null,
  preference?: CardRatio | "" | null,
): CardRatio | undefined {
  const choices = cardRatioChoices(set);
  if (choices === undefined) return undefined;
  return isCardRatio(preference) && choices.includes(preference) ? preference : choices[0];
}

/** 这套图集的卡面比例：写了生效档位就用它，否则回落**原比例**（内置图集与空图集都是这条）。
 *
 *  数据层的守卫在 `validateCardSets`（非法档位直接拦下整份数据）；这里是渲染层的兜底。 */
export function cardAspectRatio(cardSet?: { ratio?: CardRatio } | null): number {
  const ratio = cardSet?.ratio;
  return isCardRatio(ratio) ? CARD_RATIO_VALUES[ratio] : CardAspectRatio;
}
