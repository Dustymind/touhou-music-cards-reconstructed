/** 模式 3 的选曲语义（契约 C4/C5）：三元真值表逐格、空作者那一维、统计与列表。
 *
 * 最要紧的一条：**默认（两维都 unset）= 全开** —— 与另两个模式"专辑默认勾选、关掉才不选"的直觉不同，
 * 这里"没配置过"就是"不筛"。所以真值表要**逐格**钉住，不能只测一个方向。
 */
import { describe, expect, it } from "vitest";

import type { CharacterRecord } from "../data/types";
import {
  customAuthorsOf, customCardCredit, customCardEnabled, customPresetStats, customSingleRows,
  EMPTY_CUSTOM_PRESET, triAllows, type CustomPresetState,
} from "./customSelection";
import type { Tri } from "./selection";

/** 一张卡（模式 3 一卡一首；`author` 传 undefined 就是"没写作者"）。 */
function card(name: string, album: string, author?: string): CharacterRecord {
  return {
    key: `custom-${name}`, name, order: 0, card: [`https://x/${name}.jpg`],
    covers: [`https://x/${name}.jpg`], searchNames: [name],
    music: [author === undefined ? [album, `曲 ${name}`, "角色曲"] : [album, `曲 ${name}`, "角色曲", author]],
    audio: [`https://x/${name}.mp3`],
  };
}

function state(album: Tri, author: Tri): CustomPresetState {
  return { albums: { 旧作: album }, authors: { 甲: author } };
}

describe("customCardEnabled：专辑三元 × 作者三元（契约 C4 的真值表）", () => {
  const target = card("卡", "旧作", "甲");

  it.each<[Tri, Tri, boolean]>([
    ["unset", "unset", true],      // 默认全开
    ["on", "unset", true],         // `on` 压住"另一维未配置"
    ["unset", "on", true],
    ["on", "on", true],
    ["off", "unset", false],       // 一票否决
    ["unset", "off", false],
    ["off", "on", false],
    ["on", "off", false],
    ["off", "off", false],
  ])("专辑=%s 作者=%s ⇒ %s", (album, author, expected) => {
    expect(customCardEnabled(state(album, author), target)).toBe(expected);
  });

  it("**没有作者**的卡只看专辑那一维（作者维度对它不适用，Q7）", () => {
    const noAuthor = card("无作者", "旧作");
    expect(customCardEnabled(state("unset", "off"), noAuthor)).toBe(true);
    expect(customCardEnabled(state("on", "off"), noAuthor)).toBe(true);
    expect(customCardEnabled(state("off", "unset"), noAuthor)).toBe(false);
  });

  it("没出现过的键 = 没配置过（`undefined` 与 `unset` 同一档）", () => {
    expect(customCardEnabled(EMPTY_CUSTOM_PRESET, card("卡", "旧作", "甲"))).toBe(true);
    expect(customCardEnabled({ albums: {}, authors: { 甲: "off" } }, card("卡", "旧作", "甲"))).toBe(false);
  });

  it("`triAllows` 只有 `off` 挡人（`on` 与 `unset` 都放行）", () => {
    expect(triAllows(undefined)).toBe(true);
    expect(triAllows("unset")).toBe(true);
    expect(triAllows("on")).toBe(true);
    expect(triAllows("off")).toBe(false);
  });

  it("没有曲目的卡（理论上不会出现）判为不可用，不炸", () => {
    expect(customCardEnabled(EMPTY_CUSTOM_PRESET, { ...card("卡", "旧作"), music: [] })).toBe(false);
  });
});

describe("作者列表与统计", () => {
  const cards = [card("甲卡", "旧作", "张三"), card("乙卡", "新作", "李四"), card("丙卡", "旧作")];

  it("作者去重、按拼音/字母排序、**空作者不进列表**", () => {
    expect(customAuthorsOf(cards)).toEqual(["李四", "张三"]);   // l < z
    expect(customAuthorsOf([card("只有无作者", "旧作")])).toEqual([]);
  });

  it("统计：可用卡 / 全库卡 / 专辑数 / 作者数", () => {
    const all = customPresetStats(EMPTY_CUSTOM_PRESET, cards);
    expect(all).toEqual({ enabled: 3, total: 3, albums: 2, authors: 2 });
    // 关掉"旧作" ⇒ 只剩新作那张
    expect(customPresetStats({ albums: { 旧作: "off" }, authors: {} }, cards))
      .toEqual({ enabled: 1, total: 3, albums: 2, authors: 2 });
    // 关掉作者"张三" ⇒ 只有他那张掉队（无作者那张不受影响）
    expect(customPresetStats({ albums: {}, authors: { 张三: "off" } }, cards).enabled).toBe(2);
  });
});

describe("逐曲禁用列表（契约 C5）", () => {
  const cards = [card("爱丽丝", "旧作", "甲"), card("魔理沙", "新作", "乙")];

  it("一行一张卡：副标题 = 曲名 · 专辑 · 作者（作者为空就不出现那一段）", () => {
    const rows = customSingleRows(cards, {});
    expect(rows.map((row) => row.credit)).toEqual(["曲 爱丽丝 · 旧作 · 甲", "曲 魔理沙 · 新作 · 乙"]);
    expect(customCardCredit(card("无作者", "旧作"))).toBe("曲 无作者 · 旧作");
  });

  it("禁用表只认 `true`；没写过的卡默认可用", () => {
    const rows = customSingleRows(cards, { "custom-爱丽丝": true });
    expect(rows.map((row) => row.disabled)).toEqual([true, false]);
  });

  it("搜索按卡名 / key / 别名过滤", () => {
    expect(customSingleRows(cards, {}, "魔理").map((row) => row.character.name)).toEqual(["魔理沙"]);
    expect(customSingleRows(cards, {}, "custom-爱丽丝")).toHaveLength(1);
    expect(customSingleRows(cards, {}, "   ")).toHaveLength(2);
  });
});
