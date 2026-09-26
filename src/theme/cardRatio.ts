/** 卡面比例：**内置图集的原比例** + 模式 3「自定义」可选的两种横版档位（D163 / D164）。
 *
 * 三种形状并存是有意的：
 *
 * - `CardAspectRatio`（703 / 1000，**竖版**）：上游 `Configs.ts` 的原比例，**内置图集**用它 ——
 *   原曲与音MAD 两个模式的一切尺寸都还是这个值，与改动前逐字相同；
 * - `"16x9"`（横版，**模式 3 的默认档**）：B 站封面、截图、同人图多数是这个形状；
 * - `"4x3"`（横版，模式 3 的另一个档）。
 *
 * 模式 3 的档位是**用户偏好**（设置页「卡面设置」里切，`store/session`），由 `resolveCardSet`
 * 落到生效图集的 `ratio` 上；其余模式不写 `ratio` ⇒ 原比例。
 *
 * **取法只有一条**：`cardAspectRatio(cardSet)` —— 组件里不许再直接写 `CardAspectRatio`：
 * 那样"模式 3 能切比例"这件事就会漏掉那一处，同一页上出现两种形状的卡。
 *
 * 放成一个**不引 MUI 的叶子模块**：`data/cardFaces.ts`（合成图集与比例、逐比例的卡面地址）
 * 也要用它，而 `theme/theme.ts` 会 `createTheme`（把整个 MUI 拖进数据层的依赖图里不划算）。
 */

/** 模式 3 的两种卡面比例档位（清单里 `cover` 的两把键、`CharacterRecord.coversByRatio` 同一套）。 */
export type CardRatio = "16x9" | "4x3";

/** 档位清单（**顺序 = 界面上的顺序**：默认档在前）。 */
export const CARD_RATIOS: readonly CardRatio[] = ["16x9", "4x3"];

/** 模式 3 的默认档（用户裁定"这个模式统一 16:9"，4:3 是留给竖一些的图的另一档）。 */
export const DEFAULT_CARD_RATIO: CardRatio = "16x9";

/** 档位 → 宽高比（`width / height`）。 */
export const CARD_RATIO_VALUES: Record<CardRatio, number> = { "16x9": 16 / 9, "4x3": 4 / 3 };

/** 内置图集的原比例（上游 `Configs.ts` 的 `CardAspectRatio`）：703:1000 的竖版卡面。 */
export const CardAspectRatio = 703 / 1000;

/** 这个值是不是一个认得的档位（存档、清单里的键都过它；坏值不许把高度算成 `NaN`）。 */
export function isCardRatio(value: unknown): value is CardRatio {
  return typeof value === "string" && (CARD_RATIOS as readonly string[]).includes(value);
}

/** 这套图集的卡面比例：写了自己的档位就用它，否则回落**原比例**（内置图集与空图集都是这条）。
 *
 *  数据层的守卫在 `validateCardSets`（非法档位直接拦下整份数据）；这里是渲染层的兜底。 */
export function cardAspectRatio(cardSet?: { ratio?: CardRatio } | null): number {
  const ratio = cardSet?.ratio;
  return isCardRatio(ratio) ? CARD_RATIO_VALUES[ratio] : CardAspectRatio;
}
