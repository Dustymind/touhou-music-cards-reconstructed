/** 对局外观设置（上游 `gameSetting`）：默认值、夹取、落盘与脏数据回落。 */
import { describe, expect, it } from "vitest";

import {
  CARD_WIDTH_PERCENTAGE, DEFAULT_GAME_SETTING, clampCardWidthPercentage, loadGameSetting, saveGameSetting,
} from "./gameSetting";

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => { map.delete(key); },
    setItem: (key: string, value: string) => { map.set(key, value); },
  };
}

describe("对局外观设置", () => {
  it("默认值与上游一致：卡片宽度 8%、牌库 3×8", () => {
    expect(DEFAULT_GAME_SETTING).toEqual({ cardWidthPercentage: 0.08, deckRows: 3, deckColumns: 8 });
    expect(CARD_WIDTH_PERCENTAGE).toEqual({ default: 0.08, min: 0.04, max: 0.40, step: 0.01 });
    expect(loadGameSetting(fakeStorage())).toEqual(DEFAULT_GAME_SETTING);
  });

  it("百分比夹在 0.04~0.40 并按 0.01 步进", () => {
    expect(clampCardWidthPercentage(0.081)).toBeCloseTo(0.08);
    expect(clampCardWidthPercentage(0.02)).toBe(0.04);
    expect(clampCardWidthPercentage(9)).toBe(0.40);
    expect(clampCardWidthPercentage(Number.NaN)).toBe(0.08);
  });

  it("存了就读回来；全默认时不写 localStorage（与上游一致）", () => {
    const storage = fakeStorage();
    saveGameSetting({ cardWidthPercentage: 0.12, deckRows: 5, deckColumns: 10 }, storage);
    expect(loadGameSetting(storage)).toEqual({ cardWidthPercentage: 0.12, deckRows: 5, deckColumns: 10 });
    saveGameSetting({ ...DEFAULT_GAME_SETTING }, storage);
    expect(storage.getItem("gameSetting")).toBeNull();
  });

  it("脏数据不炸：坏 JSON / 越界 / 类型不对都回落默认值", () => {
    // 越界＝非法（上游也是"超范围就忽略"），不回落到越界值，也不就地夹取
    expect(loadGameSetting(fakeStorage({ gameSetting: "{oops" }))).toEqual(DEFAULT_GAME_SETTING);
    expect(loadGameSetting(fakeStorage({ gameSetting: "[]" }))).toEqual(DEFAULT_GAME_SETTING);
    expect(loadGameSetting(fakeStorage({
      gameSetting: JSON.stringify({ cardWidthPercentage: 99, deckRows: 0, deckColumns: "8" }),
    }))).toEqual(DEFAULT_GAME_SETTING);   // 99 / 0 / "8" 都算非法，各自回落默认
  });
});
