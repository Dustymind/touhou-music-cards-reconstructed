/** 卡片长条（游戏卡槽与播放页"接下来"共用）的版式与动效属性。 */
import { describe, expect, it } from "vitest";

import { loadRealBundle } from "../../test-utils";
import { stripLayout } from "../components/CardStrip";
import { fanCardWidth, fanLayout } from "./UpcomingFan";

describe("卡片长条版式", () => {
  it("卡片宽度 = min(窗口宽 20%, 150)", () => {
    expect(fanCardWidth(1000)).toBe(150);   // min(200, 150)
    expect(fanCardWidth(600)).toBe(120);
  });

  it("等距排布：step = 卡宽 + 间距，卡片之间不重叠；超出可视宽度才有可平移量", () => {
    const layout = stripLayout(10, 150, 6, 800);
    expect(layout.step).toBe(156);
    expect(layout.totalWidth).toBe(150 + 9 * 156);
    expect(layout.maxOffset).toBe(layout.totalWidth - 800);
    // 装得下时没有可平移量（滑块推到底也不动）
    expect(stripLayout(3, 150, 6, 800).maxOffset).toBe(0);
  });

  it("牌堆内容：每个角色的每张卡面都在，且按顺序给出稳定 id", async () => {
    const bundle = await loadRealBundle();
    const order = bundle.characters.slice(0, 5).map((character) => character.key);
    const expected = bundle.characters.slice(0, 5)
      .reduce((sum, character) => sum + character.card.length, 0);
    const { cards, cardWidth } = fanLayout(bundle, order, 1200);
    expect(cards).toHaveLength(expected);
    expect(cardWidth).toBe(150);
    expect(cards[0]!.id).toBe(`${order[0]}-0`);
    expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
  });

  it("真实数据：整条牌堆的张数 = 全部卡面数", async () => {
    const bundle = await loadRealBundle();
    const order = bundle.characters.map((character) => character.key);
    const total = bundle.characters.reduce((sum, character) => sum + character.card.length, 0);
    expect(fanLayout(bundle, order, 1200).cards).toHaveLength(total);
  });
});
