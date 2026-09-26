/** 卡面比例：**内置图集的原比例** + 模式 3「自定义」的两档横版比例（D163 / D164）。
 *
 * 这一层只钉"取哪一套比例"这条规则：图集写了档位就用它、缺省/非法一律回落到原比例。
 * 真正画出来的形状（实测像素）见 `src/ui/cardGeometry.test.tsx`。
 */
import { describe, expect, it } from "vitest";

import {
  cardAspectRatio, CardAspectRatio, CARD_RATIOS, CARD_RATIO_VALUES, DEFAULT_CARD_RATIO, isCardRatio,
} from "./cardRatio";

describe("卡面比例", () => {
  it("原比例仍是 703:1000（内置图集的缺省值，原曲/音MAD 的一切尺寸都靠它）", () => {
    expect(CardAspectRatio).toBeCloseTo(703 / 1000, 12);
    expect(cardAspectRatio()).toBe(CardAspectRatio);
    expect(cardAspectRatio(null)).toBe(CardAspectRatio);
    expect(cardAspectRatio({})).toBe(CardAspectRatio);
    expect(cardAspectRatio({ ratio: undefined })).toBe(CardAspectRatio);
  });

  it("两档横版比例：16:9（默认档）与 4:3，都是 `width / height`", () => {
    expect(CARD_RATIOS).toEqual(["16x9", "4x3"]);
    expect(DEFAULT_CARD_RATIO).toBe("16x9");
    expect(CARD_RATIO_VALUES["16x9"]).toBeCloseTo(16 / 9, 12);
    expect(CARD_RATIO_VALUES["4x3"]).toBeCloseTo(4 / 3, 12);
    // 两个档位确实不同形状：16:9 比 4:3 更扁
    expect(CARD_RATIO_VALUES["16x9"]).toBeGreaterThan(CARD_RATIO_VALUES["4x3"]);
    // 两档都是横版（原比例是竖版）
    expect(CARD_RATIO_VALUES["4x3"]).toBeGreaterThan(1);
    expect(CardAspectRatio).toBeLessThan(1);
  });

  it("图集写了档位就用它：16:9 / 4:3 各自算得出来", () => {
    expect(cardAspectRatio({ ratio: "16x9" })).toBeCloseTo(16 / 9, 12);
    expect(cardAspectRatio({ ratio: "4x3" })).toBeCloseTo(4 / 3, 12);
  });

  it("`isCardRatio` 只认这两档（存档、清单里的键都过它）", () => {
    expect(isCardRatio("16x9")).toBe(true);
    expect(isCardRatio("4x3")).toBe(true);
    for (const bad of ["16:9", "1.778", "", "16X9", null, undefined, 16 / 9, {}, []]) {
      expect(isCardRatio(bad), String(bad)).toBe(false);
    }
  });

  it("坏档位一律回落到原比例（不许算出 0 / 负 / NaN 的高度）", () => {
    for (const bad of ["16:9", "1.778", "", "wide", 0, -1, Number.NaN, Number.POSITIVE_INFINITY, null]) {
      expect(cardAspectRatio({ ratio: bad as never }), String(bad)).toBe(CardAspectRatio);
    }
  });
});
