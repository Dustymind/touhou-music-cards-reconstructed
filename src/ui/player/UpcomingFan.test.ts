/** 接下来牌堆的布局（上游卡片宽度 + 本项目的不重叠间距）。 */
import { describe, expect, it } from "vitest";

import type { DataBundle } from "../../data/types";
import { loadRealBundle } from "../../test-utils";
import { FAN_GAP, fanLayout } from "./UpcomingFan";

describe("UpcomingFan 布局", () => {
  it("卡片宽度 = min(窗口宽 20%, 150)，卡与卡之间留 6px 不重叠", () => {
    const bundle = { characterByKey: new Map([["a", { card: ["1.png", "2.png"] }], ["b", { card: ["3.png"] }]]) } as unknown as DataBundle;
    const layout = fanLayout(bundle, ["a", "b"], 1000);
    expect(layout.cardWidth).toBe(150);            // min(200, 150)
    expect(layout.cardHeight).toBeCloseTo(150 / 0.703);
    expect(layout.cards.map((card) => card.key)).toEqual(["a", "a", "b"]);
    // 每张卡都比前一张前进"卡宽 + 间距"：谁都不挡谁（用户要求修掉重合）
    expect(layout.cards[0]!.left).toBe(0);
    expect(layout.cards[1]!.left).toBe(150 + FAN_GAP);
    expect(layout.cards[2]!.left).toBe(2 * (150 + FAN_GAP));
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
