/** 「关于」弹窗内容真源的守卫：填错的地方要**指名道姓**地报出来（哪一行、哪个字段）。
 *
 * 这几条正是 `src/content/about.ts` 头部写给用户的填写规则 —— 写在注释里容易忘，
 * 所以落成用例：改内容时哪条没守住，跑一次 `pnpm test` 就知道。
 */
import { describe, expect, it } from "vitest";

import { aboutContent, type AboutRow } from "./about";
import type { Localized } from "../i18n/localization";

/** 内容真源里的**普通行**（自动行没有 name / url，那些由运行时数据填）。 */
function entryRows(): Extract<AboutRow, { name: string }>[] {
  return aboutContent.rows.filter((row): row is Extract<AboutRow, { name: string }> => !("auto" in row));
}

/** 必填的"要写两份"的文案：标题与关闭按钮。 */
function requiredTexts(): [path: string, value: Localized][] {
  return [
    ["title", aboutContent.title],
    ["close", aboutContent.close],
  ];
}

/** 可选的标签（含自动行）：写了就必须两份都在（不能只填一半）。 */
function labels(): [path: string, value: Localized][] {
  return aboutContent.rows
    .map((row, index): [string, Localized] | null =>
      (row.label === undefined ? null : [`rows[${index}].label`, row.label]))
    .filter((entry): entry is [string, Localized] => entry !== null);
}

describe("关于弹窗的内容真源", () => {
  it("标题与关闭按钮：en / zh 都写了（不能只填一半）", () => {
    const missing = requiredTexts()
      .filter(([, value]) => value.en.trim() === "" || value.zh.trim() === "")
      .map(([path]) => path);
    expect(missing).toEqual([]);
  });

  it("行标签可以不写（那一行就只有内容一行）；**写了就必须两份都在**", () => {
    const halfFilled = labels()
      .filter(([, value]) => value.en.trim() === "" || value.zh.trim() === "")
      .map(([path]) => path);
    expect(halfFilled).toEqual([]);
  });

  it("每一普通行都有内容（`name` 不能留空），且至少有一行", () => {
    expect(aboutContent.rows.length).toBeGreaterThan(0);
    const empty = entryRows()
      .map((row) => (row.name.trim() === "" ? `rows[${aboutContent.rows.indexOf(row)}].name` : null))
      .filter((path): path is string => path !== null);
    expect(empty).toEqual([]);
  });

  it("地址要么不写/留空（那一行就是白色纯文字），要么是完整可解析的地址", () => {
    entryRows().forEach((row) => {
      // 不写 `url`、空串、只有空白 = 这一行没有链接（页面上不会出现空 `<a>`），都允许
      if ((row.url ?? "").trim() === "") return;
      const at = `rows[${aboutContent.rows.indexOf(row)}].url`;
      expect(row.url, at).toBe(row.url!.trim());
      expect(row.url, at).toMatch(/^(https:\/\/|mailto:)\S+$/);
      // 能 parse 才算地址写对了（拼错的域名/多余空格都在这里露出来）
      expect(() => new URL(row.url!), at).not.toThrow();
    });
  });

  it("自动行（`auto: pack-authors`）必须写标签，否则读者不知道那堆名字是什么", () => {
    const missing = aboutContent.rows
      .map((row, index) => ("auto" in row && row.label === undefined ? `rows[${index}].label` : null))
      .filter((path): path is string => path !== null);
    expect(missing).toEqual([]);
  });

  it("文案是纯文本（不认 Markdown，别在文字里写 `**粗体**` 这类标记）", () => {
    const offenders = [...requiredTexts(), ...labels()]
      .filter(([, value]) => /\*\*|\[.*\]\(.*\)/.test(`${value.en}\n${value.zh}`))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
