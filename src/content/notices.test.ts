/** 公告内容真源的守卫：填错的地方要**指名道姓**地报出来（哪一条、哪个字段）。
 *
 * 这几条正是 `src/content/notices.ts` 头部写给用户的填写规则 —— 写在注释里容易忘，
 * 所以落成用例：改内容时哪条没守住，跑一次 `pnpm test` 就知道。
 *
 * 正文现在是 `notices/*.md` 真文件（`notices.ts` 用 Vite `?raw` 读进来），
 * 所以这里还多守一条**行尾**：`.md` 是给人编辑的，Windows 上很容易变成 CRLF。
 */
import { describe, expect, it } from "vitest";

import { buildNoticeContent, normalizeNoticeBody, noticeContent, type NoticeContent } from "./notices";
import type { Localized } from "../i18n/localization";

/** id 会拼进本地存储键（`tmc.v1.notice.<id>`），所以字符集必须收窄。 */
const ID_PATTERN = /^[a-z0-9-]+$/;
/** `YYYY-MM-DD`（**两位**月/日，`2099-1-1` 不收）。 */
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 某年某月的天数。闰年按公历规则 4/100/400 判。 */
function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}

/**
 * 是不是**真实存在的日历日**（`2026-02-31` 不是；`2024-02-29` 是，`2026-02-29` 不是）。
 *
 * ⚠️ 这里**故意不碰 `Date`** —— 踩过一次真坑（见 `docs/DECISIONS.md` D183）。
 * 原先写的是 `new Date(`${value}T00:00:00`).toISOString().slice(0, 10) === value`，
 * 那是"**本地时区解析、UTC 口径输出**"的混搭：CI 跑在 UTC 上一直绿，
 * 本机 `Asia/Shanghai`(UTC+8) 下 `2099-01-01` 会被算成 `2098-12-31` ⇒ 假红。
 * 只加一个 `Z` 治不了根 —— CI 在 UTC 上照样绿，去掉 `Z` 谁也拦不住。
 * 纯算术判日期**不受时区影响**，在哪种环境下结论都一样，所以这里不用 `Date`。
 */
function isRealCalendarDate(value: string): boolean {
  const matched = DATE_PATTERN.exec(value);
  if (matched === null) return false;
  const month = Number(matched[2]);
  if (month < 1 || month > 12) return false;
  const day = Number(matched[3]);
  return day >= 1 && day <= daysInMonth(Number(matched[1]), month);
}

const notices = noticeContent.notices;

/** 某条公告里所有"要写两份"的文案（写了就必须两份都在）。 */
function localizedFields(notice: NoticeContent): [string, Localized][] {
  return [
    ["title", notice.title],
    ...(notice.close === undefined ? [] : ([["close", notice.close]] as [string, Localized][])),
    ...(notice.dismiss === undefined ? [] : ([["dismiss", notice.dismiss]] as [string, Localized][])),
  ];
}

/** 指到某一条的某个字段（报错信息里用）。 */
const at = (index: number, field: string): string => `notices[${index}].${field}`;

describe("公告的内容真源", () => {
  it("至少有一条公告", () => {
    expect(notices.length).toBeGreaterThan(0);
  });

  it("每条 id 非空、唯一，且只含小写字母/数字/短横线（它会成为存储键的一部分）", () => {
    const offenders = notices
      .map((notice, index) => (ID_PATTERN.test(notice.id) ? null : at(index, "id")))
      .filter((path): path is string => path !== null);
    expect(offenders).toEqual([]);

    const ids = notices.map((notice) => notice.id);
    expect(new Set(ids).size, "id 有重复").toBe(ids.length);
  });

  it("标题（以及写了的话，关闭/不再显示的文案）：en / zh 都写了（不能只填一半）", () => {
    const halfFilled: string[] = [];
    notices.forEach((notice, index) => {
      for (const [field, value] of localizedFields(notice)) {
        if (value.en.trim() === "" || value.zh.trim() === "") halfFilled.push(at(index, field));
      }
    });
    expect(halfFilled).toEqual([]);
  });

  it("每条正文非空", () => {
    const empty = notices
      .map((notice, index) => (notice.body.trim() === "" ? at(index, "body") : null))
      .filter((path): path is string => path !== null);
    expect(empty).toEqual([]);
  });

  it("时间窗（可省）写了就是合法日期，且 from 不晚于 until", () => {
    notices.forEach((notice, index) => {
      for (const field of ["from", "until"] as const) {
        const value = notice[field];
        if (value === undefined) continue;
        // `2026-02-31` 这种"看着像但不存在"的日子由校验器抓（不打 `Date`，见上面注释）
        expect(isRealCalendarDate(value), at(index, field)).toBe(true);
      }
      if (notice.from !== undefined && notice.until !== undefined) {
        // 两个都是 `YYYY-MM-DD`，字典序 = 时间序 —— 与 `noticeInWindow` 同一口径
        expect(notice.from <= notice.until, `${at(index, "from")} 晚于 until`).toBe(true);
      }
    });
  });

  it("日期校验器：抓得出不存在的日子，且不随本机时区变化", () => {
    // 该绿的
    for (const ok of ["2026-01-01", "2024-02-29", "2099-01-01", "2000-02-29"]) {
      expect(isRealCalendarDate(ok), ok).toBe(true);
    }
    // 该红的：滚月的日子（`Date` 会悄悄滚到 3 月）、越界的月/日、格式不对
    for (const bad of ["2026-02-31", "2026-02-29", "2026-13-01", "2026-00-10", "2026-01-32", "2099-1-1", "2099/01/01", ""]) {
      expect(isRealCalendarDate(bad), bad).toBe(false);
    }
    // 百年不闰、四百年再闰
    expect(isRealCalendarDate("2100-02-29")).toBe(false);
  });
});

describe("正文来自 `notices/*.md` 真文件", () => {
  it("normalizeNoticeBody：CRLF / CR 统一成 LF，去掉首尾空行，**不动**中间的空行与缩进", () => {
    expect(normalizeNoticeBody("a\r\nb")).toBe("a\nb");
    expect(normalizeNoticeBody("a\rb")).toBe("a\nb");          // 老式 Mac 换行也收掉
    expect(normalizeNoticeBody("\n\n正文\n\n")).toBe("正文");   // 文件末尾那个换行不是内容
    expect(normalizeNoticeBody("a\n\n  b")).toBe("a\n\n  b");  // 中间的空行 / 缩进原样保留
  });

  it("每条正文里都没有残留的 `\\r`（`.md` 被存成 CRLF 也守得住）", () => {
    // 没有这条守卫的话，CRLF 会让 `\r` 混进正文，还会把"行尾两个空格 = 硬换行"弄坏
    // （行尾变成 `\r` 而不是空格）—— 而它在界面上是**看不见**的，很难查。
    const offenders = notices
      .map((notice, index) => (notice.body.includes("\r") ? at(index, "body") : null))
      .filter((path): path is string => path !== null);
    expect(offenders).toEqual([]);
  });

  it("正文不是 `.ts` 里内联的长字符串（`.md` 才是唯一真源）", () => {
    // 防"改回内联"：内联的正文和 .md 容易各改一半。这里只要求正文里不含 TS 转义痕迹。
    expect(notices.some((notice) => notice.body.includes("\\n"))).toBe(false);
  });

  it("拼装：某条公告的正文取不到 ⇒ **直接抛**，不许静默给个空正文", () => {
    // `noticeMeta` 的 `bodyFile` 与磁盘文件名对不上时，这是唯一的响亮失败点。
    // 静默给空正文的话，症状是"公告弹出来是空白的"或"根本不弹"，很难查到这里。
    expect(() => buildNoticeContent({ "welcome-2026-10.md": "只有这一份" })).toThrow(/draft\.md/);
  });
});
