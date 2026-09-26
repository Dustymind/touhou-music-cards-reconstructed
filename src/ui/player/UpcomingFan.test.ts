/** 卡片长条（游戏卡槽与播放页"接下来"共用）的版式与动效属性。 */
import { describe, expect, it } from "vitest";

import { CUSTOM_CARD_SET } from "../../data/cardFaces";
import { CardAspectRatio, CARD_RATIO_VALUES } from "../../theme/cardRatio";
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
    const dataset = (await loadRealBundle()).datasets.originals;
    const order = dataset.characters.slice(0, 5).map((character) => character.key);
    const expected = dataset.characters.slice(0, 5)
      .reduce((sum, character) => sum + character.card.length, 0);
    const { cards, cardWidth } = fanLayout(dataset, order, 1200);
    expect(cards).toHaveLength(expected);
    expect(cardWidth).toBe(150);
    expect(cards[0]!.id).toBe(`${order[0]}-0`);
    expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
  });

  it("真实数据：整条牌堆的张数 = 全部卡面数", async () => {
    const dataset = (await loadRealBundle()).datasets.originals;
    const order = dataset.characters.map((character) => character.key);
    const total = dataset.characters.reduce((sum, character) => sum + character.card.length, 0);
    expect(fanLayout(dataset, order, 1200).cards).toHaveLength(total);
  });

  it("卡面高度 = 卡宽 ÷ 图集比例：不传图集 = 原比例 703:1000，模式 3 的两档 = 16:9 / 4:3（D164）", async () => {
    const dataset = (await loadRealBundle()).datasets.originals;
    const order = dataset.characters.slice(0, 3).map((character) => character.key);
    const width = fanCardWidth(1200);

    // 不传图集（没有图集可言的路径）⇒ 原比例，与改动前逐字相同
    expect(fanLayout(dataset, order, 1200).cardHeight).toBeCloseTo(width / CardAspectRatio, 6);
    // 模式 3 的两档（同一宽度下都比竖版矮，16:9 又比 4:3 扁）
    const wide = fanLayout(dataset, order, 1200, { ...CUSTOM_CARD_SET, ratio: "16x9" });
    const tall = fanLayout(dataset, order, 1200, { ...CUSTOM_CARD_SET, ratio: "4x3" });
    expect(wide.cardHeight).toBeCloseTo(width / CARD_RATIO_VALUES["16x9"], 6);
    expect(tall.cardHeight).toBeCloseTo(width / CARD_RATIO_VALUES["4x3"], 6);
    expect(wide.cardHeight).toBeLessThan(tall.cardHeight);
    expect(tall.cardHeight).toBeLessThan(fanLayout(dataset, order, 1200).cardHeight);
  });
});
