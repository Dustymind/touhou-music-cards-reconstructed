/** 卡面画幅：**内置六套的原比例** + **自定义卡面**的常规 / 16:9 / 4:3 三档（D163 / D165）。
 *
 * 这一层钉三件事：三档的数值、"谁能换档"（内置六套不能）、以及"实际用哪一档"的回落链。
 * 真正画出来的形状（实测像素）见 `src/ui/cardGeometry.test.tsx`。
 */
import { describe, expect, it } from "vitest";

import {
  cardAspectRatio, cardRatioChoices, CardAspectRatio, CARD_RATIOS, CARD_RATIO_VALUES,
  DEFAULT_CUSTOM_RATIOS, effectiveCardRatio, isCardRatio,
} from "./cardRatio";

/** 内置图集（六套原版立绘那种）：既不是 localOnly 也不是 sourceOnly。 */
const BUILT_IN = {} as const;
/** 使用者自己放素材的图集（`local_only`）。 */
const LOCAL = { localOnly: true } as const;
/** 源按曲目给封面的图集（`source_only`）。 */
const SOURCE = { sourceOnly: true } as const;

describe("卡面画幅", () => {
  it("三档：常规（703:1000 竖版）/ 16:9 / 4:3，界面顺序固定", () => {
    expect(CARD_RATIOS).toEqual(["original", "16x9", "4x3"]);
    expect(CardAspectRatio).toBeCloseTo(703 / 1000, 12);
    expect(CARD_RATIO_VALUES.original).toBeCloseTo(703 / 1000, 12);
    expect(CARD_RATIO_VALUES["16x9"]).toBeCloseTo(16 / 9, 12);
    expect(CARD_RATIO_VALUES["4x3"]).toBeCloseTo(4 / 3, 12);
    // 常规是竖版，另外两档是横版，且 16:9 比 4:3 更扁
    expect(CARD_RATIO_VALUES.original).toBeLessThan(1);
    expect(CARD_RATIO_VALUES["4x3"]).toBeGreaterThan(1);
    expect(CARD_RATIO_VALUES["16x9"]).toBeGreaterThan(CARD_RATIO_VALUES["4x3"]);
  });

  it("`isCardRatio` 只认这三档（存档、清单 / 曲包里的键都过它）", () => {
    for (const good of CARD_RATIOS) expect(isCardRatio(good)).toBe(true);
    for (const bad of ["16:9", "original ", "", "ORIGINAL", "703x1000", null, undefined, 16 / 9, {}, []]) {
      expect(isCardRatio(bad), String(bad)).toBe(false);
    }
  });

  it("**内置六套不能换档**：没有 choices，`cardAspectRatio` 永远是原比例", () => {
    expect(cardRatioChoices(BUILT_IN)).toBeUndefined();
    expect(cardRatioChoices()).toBeUndefined();
    expect(cardRatioChoices(null)).toBeUndefined();
    for (const preference of ["", "original", "16x9", "4x3"] as const) {
      expect(effectiveCardRatio(BUILT_IN, preference)).toBeUndefined();
      expect(cardAspectRatio({ ratio: effectiveCardRatio(BUILT_IN, preference) }))
        .toBe(CardAspectRatio);
    }
    // 直接硬塞一个 ratio（坏数据）也回落原比例
    expect(cardAspectRatio({ ratio: "16:9" as never })).toBe(CardAspectRatio);
  });

  it("使用者 / 源给的素材能换三档，默认**常规**（不动开关就与今天一样）", () => {
    for (const set of [LOCAL, SOURCE]) {
      expect(cardRatioChoices(set)).toEqual(["original", "16x9", "4x3"]);
      expect(effectiveCardRatio(set, "")).toBe("original");
      expect(effectiveCardRatio(set, null)).toBe("original");
      expect(effectiveCardRatio(set, "16x9")).toBe("16x9");
      expect(effectiveCardRatio(set, "4x3")).toBe("4x3");
    }
    expect(DEFAULT_CUSTOM_RATIOS[0]).toBe("original");
  });

  it("图集自己写的 `ratios` 优先（第一项 = 它的默认档；模式 3 的合成图集就是这么写的）", () => {
    const custom = { sourceOnly: true, ratios: ["16x9", "4x3", "original"] as const };
    expect(cardRatioChoices(custom)).toEqual(["16x9", "4x3", "original"]);
    expect(effectiveCardRatio(custom, "")).toBe("16x9");        // 没选过 ⇒ 这套图集的默认档
    expect(effectiveCardRatio(custom, "original")).toBe("original");
    // 只有一档的图集 = 不能换（控件不出现）
    expect(cardRatioChoices({ localOnly: true, ratios: ["original"] })).toEqual(["original"]);
    // 写了但全是坏档 ⇒ 当作不能换（渲染层兜底，数据层另有硬校验）
    expect(cardRatioChoices({ localOnly: true, ratios: ["16:9" as never] })).toBeUndefined();
  });

  it("用户偏好不在允许列表里 ⇒ 回落到默认档（切模式换了图集也不会画错）", () => {
    expect(effectiveCardRatio({ localOnly: true, ratios: ["original", "4x3"] }, "16x9"))
      .toBe("original");
    expect(effectiveCardRatio({ localOnly: true, ratios: ["original", "4x3"] }, "4x3"))
      .toBe("4x3");
  });
});
