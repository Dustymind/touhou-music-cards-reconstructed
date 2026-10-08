/** 对局外观设置：默认值、夹取、落盘与脏数据回落（走 `persist.ts` 的版本化信封）。 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  CARD_WIDTH_PERCENTAGE, DEFAULT_GAME_SETTING, clampCardWidthPercentage, loadGameSetting, saveGameSetting,
} from "./gameSetting";

const KEY = "tmc.v1.game-setting";

/** 按 persist.ts 的信封格式塞一条存档。 */
function seedEnvelope(data: unknown, version = 1): void {
  localStorage.setItem(KEY, JSON.stringify({ v: version, data }));
}

describe("对局外观设置", () => {
  beforeEach(() => localStorage.clear());

  it("默认值：卡片宽度 8%、牌库 3×8", () => {
    expect(DEFAULT_GAME_SETTING).toEqual({ cardWidthPercentage: 0.08, deckRows: 3, deckColumns: 8 });
    expect(CARD_WIDTH_PERCENTAGE).toEqual({ default: 0.08, min: 0.04, max: 0.40, step: 0.01 });
    expect(loadGameSetting()).toEqual(DEFAULT_GAME_SETTING);
  });

  it("百分比夹在 0.04~0.40 并按 0.01 步进", () => {
    expect(clampCardWidthPercentage(0.081)).toBeCloseTo(0.08);
    expect(clampCardWidthPercentage(0.02)).toBe(0.04);
    expect(clampCardWidthPercentage(9)).toBe(0.40);
    expect(clampCardWidthPercentage(Number.NaN)).toBe(0.08);
  });

  it("存了就读回来", () => {
    saveGameSetting({ cardWidthPercentage: 0.12, deckRows: 5, deckColumns: 10 });
    expect(loadGameSetting()).toEqual({ cardWidthPercentage: 0.12, deckRows: 5, deckColumns: 10 });
  });

  it("脏数据不炸：坏 JSON / 不是对象 / 越界 / 类型不对都回落默认值", () => {
    localStorage.setItem(KEY, "{oops");
    expect(loadGameSetting()).toEqual(DEFAULT_GAME_SETTING);

    seedEnvelope([1, 2, 3]);
    expect(loadGameSetting()).toEqual(DEFAULT_GAME_SETTING);

    // 越界 = 非法（不就地夹取），各自回落默认
    seedEnvelope({ cardWidthPercentage: 99, deckRows: 0, deckColumns: "8" });
    expect(loadGameSetting()).toEqual(DEFAULT_GAME_SETTING);
  });

  it("版本不符且无迁移函数 ⇒ 回落默认值", () => {
    seedEnvelope({ cardWidthPercentage: 0.2, deckRows: 5, deckColumns: 10 }, 2);
    expect(loadGameSetting()).toEqual(DEFAULT_GAME_SETTING);
  });
});
