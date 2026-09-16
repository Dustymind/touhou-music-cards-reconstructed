/** 接下来牌堆的布局（上游 `PlayerTab.tsx` 的尺寸常量）与动效属性。 */
import { describe, expect, it } from "vitest";

import type { DataBundle } from "../../data/types";
import { loadRealBundle } from "../../test-utils";
import { fanLayout } from "./UpcomingFan";

describe("UpcomingFan 布局", () => {
  it("卡片宽度 = min(窗口宽 20%, 150)，同角色叠 80%、角色间叠 20%", () => {
    const bundle = { characterByKey: new Map([["a", { card: ["1.png", "2.png"] }], ["b", { card: ["3.png"] }]]) } as unknown as DataBundle;
    const layout = fanLayout(bundle, ["a", "b"], 1000);
    expect(layout.cardWidth).toBe(150);            // min(200, 150)
    expect(layout.cardHeight).toBeCloseTo(150 / 0.703);
    expect(layout.cards.map((card) => card.key)).toEqual(["a", "a", "b"]);
    // 同角色第二张前进 20% 卡宽，换角色前进 80% 卡宽
    expect(layout.cards[0]!.left).toBe(0);
    expect(layout.cards[1]!.left).toBeCloseTo(150 * 0.2);
    expect(layout.cards[2]!.left).toBeCloseTo(150 * 0.2 + 150 * 0.8);
    // zIndex 递减，保证左边的卡压在右边上面（上游 `totalCards - counter`）
    expect(layout.cards[0]!.zIndex).toBeGreaterThan(layout.cards[2]!.zIndex);
  });

  it("窄窗口时按 20% 缩：1000px 以下不再是 150", () => {
    const bundle = { characterByKey: new Map([["a", { card: ["1.png"] }]]) } as unknown as DataBundle;
    expect(fanLayout(bundle, ["a"], 600).cardWidth).toBe(120);
  });

  it("真实数据：每个角色的每张卡面都在牌堆里", async () => {
    const bundle = await loadRealBundle();
    const order = bundle.characters.slice(0, 5).map((character) => character.key);
    const expected = bundle.characters.slice(0, 5)
      .reduce((sum, character) => sum + character.card.length, 0);
    expect(fanLayout(bundle, order, 1200).cards).toHaveLength(expected);
  });
});
