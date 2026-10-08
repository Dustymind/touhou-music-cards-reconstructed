/** 公告内容真源的守卫：填错的地方要**指名道姓**地报出来（哪一条、哪个字段）。
 *
 * 这几条正是 `src/content/notices.ts` 头部写给用户的填写规则 —— 写在注释里容易忘，
 * 所以落成用例：改内容时哪条没守住，跑一次 `pnpm test` 就知道。
 *
 * **元数据与正文都在 `notices/*.md` 里**（D187 起：开头的 `---` frontmatter 是唯一真源），
 * 所以本文件还多守两块：
 *
 * - **frontmatter 的解析与报错**（缺 id、字段名拼错、YAML 语法错 ⇒ 要指到行号）；
 * - **行尾**：`.md` 是给人编辑的，Windows 上很容易变成 CRLF。
 */
import { describe, expect, it } from "vitest";

import {
  buildNoticeContent,
  normalizeNoticeBody,
  NOTICE_FILES,
  noticeContent,
  parseNoticeFile,
  stripFrontmatter,
  type NoticeContent,
} from "./notices";
import type { Localized } from "../i18n/localization";
import { parseMarkdown, type MarkdownBlock } from "../ui/markdown";

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

  it("标题（以及写了的话，关闭的文案）：en / zh 都写了（不能只填一半）", () => {
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

  it("时间窗与**排序用的 `date`**（都可省）写了就是合法日期，且 from 不晚于 until", () => {
    notices.forEach((notice, index) => {
      // `date` 与 from / until 一起校验：它同样必须是个真实存在的日历日
      // （排序靠它，`2026-02-31` 这种"看着像但不存在"的会让顺序莫名其妙）
      for (const field of ["from", "until", "date"] as const) {
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

  it("normalizeNoticeBody：**顺手剥掉 frontmatter**，别把 `id:` 那一坨漏进正文", () => {
    // 剥 frontmatter 放在 normalizeNoticeBody 里（而不是渲染器里）：渲染器不认 `---`，
    // 漏进去会变成界面顶上一段 `id: xxx` 的乱码。
    const source = "---\nid: x\ntitle: { en: X, zh: X }\n---\n\n正文\n";
    expect(normalizeNoticeBody(source)).toBe("正文");
    // 没有 frontmatter 时原样（只做规整）
    expect(normalizeNoticeBody("没有元数据\n")).toBe("没有元数据");
  });

  it("每条正文里都没有残留的 `\\r`（`.md` 被存成 CRLF 也守得住）", () => {
    // 没有这条守卫的话，CRLF 会让 `\r` 混进正文，还会把"行尾两个空格 = 硬换行"弄坏
    // （行尾变成 `\r` 而不是空格）—— 而它在界面上是**看不见**的，很难查。
    const offenders = notices
      .map((notice, index) => (notice.body.includes("\r") ? at(index, "body") : null))
      .filter((path): path is string => path !== null);
    expect(offenders).toEqual([]);
  });

  it("每条正文里都没有残留的 frontmatter 定界符（`---` 独占一行）", () => {
    // 症状同"漏出 `-->`"：在 `.md` 里看着正常，只有渲染出来才发现顶上多了一横。
    const offenders = notices
      .filter((notice) => notice.body.split("\n").some((line) => /^---[ \t]*$/.test(line)))
      .map((notice) => notice.id);
    expect(offenders).toEqual([]);
  });

  it("正文不是 `.ts` 里内联的长字符串（`.md` 才是唯一真源）", () => {
    // 防"改回内联"：内联的正文和 .md 容易各改一半。这里只要求正文里不含 TS 转义痕迹。
    expect(notices.some((notice) => notice.body.includes("\\n"))).toBe(false);
  });

  it("拼装：`NOTICE_FILES` 列了但入参给不出 ⇒ **直接抛**，不许静默跳过", () => {
    // 清单与磁盘文件名对不上时，这是唯一的响亮失败点。
    // 静默跳过的话，症状是"公告弹出来是空的"或"根本不弹"，很难查到这里。
    // 报错按 `NOTICE_FILES` 的**书写顺序**（与展示排序无关）指出第一个缺的 ⇒ 断言就用第一个文件名，
    // 这样以后往中间插公告也不会假红。
    const firstFile = NOTICE_FILES[0]!;
    expect(() => buildNoticeContent({})).toThrow(new RegExp(firstFile.replace(/\./g, "\\.")));
  });

  it("拼装：入参里**多出来**的文件被忽略（`NOTICE_FILES` 是唯一入口清单）", () => {
    // 复制一份 `.md` 起草新公告、还没挂进清单时，它不该影响任何东西 ——
    // 特别注意：它**不该**因为自己的 frontmatter 有问题而把整站弄挂。
    const listed = Object.fromEntries(
      NOTICE_FILES.map((file, index) => [
        file,
        `---\nid: probe-${index}\ntitle: { en: E, zh: 中 }\n---\n\n正文\n`,
      ]),
    );
    const built = buildNoticeContent({
      ...listed,
      "还没挂上的新公告.md": "---\nid: 缺标题\n---\n字段还写错了",
    });
    expect(built.notices.map((notice) => notice.id)).toEqual(NOTICE_FILES.map((_, index) => `probe-${index}`));
  });
});

describe("frontmatter 的解析与校验", () => {
  /** 一份合法的 frontmatter 正文（各条用例按需改字段）。 */
  const file = "probe.md";
  const wrap = (yaml: string, body = "正文"): string => `---\n${yaml}\n---\n${body}`;

  it("`stripFrontmatter`：没有 frontmatter / 空 frontmatter / 只有正文，都不炸", () => {
    expect(stripFrontmatter("正文")).toBe("正文");
    expect(stripFrontmatter("---\nid: x\n---\n正文")).toBe("正文");
    expect(stripFrontmatter("---\n---\n正文")).toBe("正文");
    // 开头 `---` 但**不是第一行**时不算 frontmatter（只认文件第一行）
    expect(stripFrontmatter("\n---\nid: x\n---\n正文")).toBe("\n---\nid: x\n---\n正文");
  });

  it("正常解析：id / title 必填项、其余按需，正文不含 frontmatter", () => {
    const parsed = parseNoticeFile(
      file,
      wrap('id: probe\ntitle: { en: Probe, zh: 探针 }\ndate: "2026-10-01"\npinned: true', "\n\n正文段落\n"),
    );
    // 非草稿 ⇒ 一定拿得到内容（`null` 只可能是 `draft: true`，见下一组用例）
    expect(parsed).not.toBeNull();
    expect(parsed).toEqual({
      id: "probe",
      title: { en: "Probe", zh: "探针" },
      date: "2026-10-01",
      pinned: true,
      body: "正文段落",
    });
    // 没写的字段**不该出现**（不是 `undefined`）
    expect("from" in parsed!).toBe(false);
    expect("until" in parsed!).toBe(false);
    expect("close" in parsed!).toBe(false);
    // `draft` 也不该出现在结果里 —— 能走到这儿的 `draft` 只可能是 `false` / 没写
    expect("draft" in parsed!).toBe(false);
  });

  it("缺 frontmatter ⇒ 报错并说清「文件第一行必须是 `---`」", () => {
    expect(() => parseNoticeFile(file, "只是一段正文")).toThrow(/frontmatter/);
  });

  it("`---` 开了没收尾 ⇒ 报错（当正文处理只会得到一堆莫名其妙的错）", () => {
    expect(() => parseNoticeFile(file, "---\nid: probe\n正文没了")).toThrow(/没有结束/);
  });

  it("YAML 语法错 ⇒ 报错带上 frontmatter 在**文件里**的真实行号", () => {
    // 第 1 行是 `---`，YAML 从文件的第 2 行开始；`{ en: A, zh: B` 少个 `}`，YAML 报在第 2 行（`{` 所在行）
    // ⇒ 换算到文件第 3 行。**注意 YAML 报的是"出问题的构造从哪开始"，不是"到哪结束"** ——
    // 对没闭合的 `{` / `[` 就是开括号那一行，这对定位反而更有用。
    const bad = "---\nid: probe\ntitle: { en: A, zh: B\n---\n正文";
    expect(() => parseNoticeFile(file, bad)).toThrow(/第 3 行/);
    // 同一份错误往下挪一行（YAML 第 3 行 ⇒ 文件第 4 行）：行号要跟着变，证明真的是"文件行号"
    const later = "---\nid: probe\ntitle: { en: A, zh: B }\nfrom: [1, 2\n---\n正文";
    expect(() => parseNoticeFile(file, later)).toThrow(/第 4 行/);
  });

  it("缺 `id` / `title` ⇒ 指名道姓地报错", () => {
    expect(() => parseNoticeFile(file, wrap("title: { en: A, zh: B }"))).toThrow(/`id` 必填/);
    expect(() => parseNoticeFile(file, wrap("id: probe"))).toThrow(/`title` 必填/);
  });

  it("`title` 只写一半（缺 zh 或空串）⇒ 报错", () => {
    expect(() => parseNoticeFile(file, wrap("id: probe\ntitle: { en: A }"))).toThrow(/`title` 必填/);
    expect(() => parseNoticeFile(file, wrap("id: probe\ntitle: { en: A, zh: \"  \" }"))).toThrow(/`title` 必填/);
  });

  it("字段名拼错/多写字段 ⇒ 报错列出不认识的字段（静默忽略最难查）", () => {
    expect(() => parseNoticeFile(file, wrap("id: probe\ntitle: { en: A, zh: B }\ntilte: x"))).toThrow(
      /不认识的字段 `tilte`/,
    );
    expect(() => parseNoticeFile(file, wrap("id: probe\ntitle: { en: A, zh: B }\npin: true"))).toThrow(
      /不认识的字段 `pin`/,
    );
    // 报错要列全支持哪些字段，不然用户还是不知道该写什么
    expect(() => parseNoticeFile(file, wrap("id: probe\ntitle: { en: A, zh: B }\nxxx: 1"))).toThrow(
      /`id` \/ `title` \/ `close` \/ `from` \/ `until` \/ `date` \/ `pinned`/,
    );
  });

  it("`pinned` 不是布尔 ⇒ 报错", () => {
    expect(() => parseNoticeFile(file, wrap("id: probe\ntitle: { en: A, zh: B }\npinned: yes"))).toThrow(
      /`pinned` 只能是/,
    );
  });

  it("日期字段：不写成字符串 ⇒ 报错并提示带引号", () => {
    // `yaml` v2 走的是 **YAML 1.2 核心 schema**：`2026-10-01` 这种裸日期**不会**被当时间戳，
    // 一律是字符串 ⇒ 我们的日期字段天然安全（不会冒出 `Date` 对象，也就没有时区问题）。
    // 但 YAML 还会把 `12345` 认成 number、`true` 认成 boolean、`{a: 1}` 认成 map ——
    // 这些**非字符串**的写法必须当场报错，否则后面拿它排序/比时间窗会得到莫名其妙的结果。
    for (const bad of ["12345", "true", "{ a: 1 }", "[1, 2]"]) {
      expect(() => parseNoticeFile(file, wrap(`id: probe\ntitle: { en: A, zh: B }\ndate: ${bad}`)), bad).toThrow(
        /`date` 必须是字符串/,
      );
    }
    // 带引号的正常写法照收（引号是"我就是字符串"的显式声明）
    expect(parseNoticeFile(file, wrap('id: probe\ntitle: { en: A, zh: B }\ndate: "2026-10-01"'))!.date).toBe("2026-10-01");
    // `2026-10-01 12:00:00` 这种"看着像时间戳"的也仍是字符串 —— 不引号也收得下
    expect(parseNoticeFile(file, wrap("id: probe\ntitle: { en: A, zh: B }\ndate: 2026-10-01 12:00:00"))!.date).toBe(
      "2026-10-01 12:00:00",
    );
  });

  it("`close` 写了就必须是双语", () => {
    const ok = parseNoticeFile(file, wrap('id: probe\ntitle: { en: A, zh: B }\nclose: { en: Dismiss, zh: 知道了 }'));
    expect(ok!.close).toEqual({ en: "Dismiss", zh: "知道了" });
    expect(() => parseNoticeFile(file, wrap("id: probe\ntitle: { en: A, zh: B }\nclose: 关闭"))).toThrow(/`close` 若写了/);
  });

  it("frontmatter 不是映射（是列表 / 标量）⇒ 报错", () => {
    expect(() => parseNoticeFile(file, "---\n- a\n- b\n---\n正文")).toThrow(/必须是"字段: 值"的映射/);
    expect(() => parseNoticeFile(file, "---\n就一行字\n---\n正文")).toThrow(/映射/);
  });

  it("frontmatter 是空的（两条 `---` 挨着）⇒ 报错说至少要 id 与 title", () => {
    expect(() => parseNoticeFile(file, "---\n---\n正文")).toThrow(/至少要写 id 与 title/);
  });
});

describe("`draft: true` —— 构建期摘掉，且只校验结构不校验字段", () => {
  const file = "probe.md";
  const wrap = (yaml: string, body = "正文"): string => `---\n${yaml}\n---\n${body}`;

  it("`draft: true` ⇒ 返回 `null`（调用方据此把它丢掉）", () => {
    const parsed = parseNoticeFile(file, wrap("id: probe\ntitle: { en: A, zh: B }\ndraft: true"));
    expect(parsed).toBeNull();
  });

  it("**跳过字段校验**：草稿里缺 `title` / 字段名拼错 / `pinned: yes` 都**不报错**", () => {
    // 这是用户明确选的代价：草稿可以"写一半先存着"。
    // ⚠️ 但它们会在 `draft` 被去掉的那一刻一起爆 —— 那正是"想发公告"的时候（见 DRAFT_NOTE）。
    expect(parseNoticeFile(file, wrap("draft: true"))).toBeNull();                        // 连 id/title 都没有
    expect(parseNoticeFile(file, wrap("tilte: x\ndraft: true"))).toBeNull();             // 字段名拼错
    expect(parseNoticeFile(file, wrap("id: probe\ndraft: true\npinned: yes"))).toBeNull(); // 类型不对
    expect(parseNoticeFile(file, wrap('id: probe\ndate: "2026-02-31"\ndraft: true'))).toBeNull(); // 值不合法
  });

  it("**但结构性错误照样报**：`---` 未闭合 / YAML 语法错 / 不是映射 —— 草稿也不例外", () => {
    // 这类错的后果是"连正文都取不出来"，没有任何"先凑合写"的余地，所以不放过（两档校验的边界就在这）。
    expect(() => parseNoticeFile(file, "---\ndraft: true\n正文没了")).toThrow(/没有结束/);
    expect(() => parseNoticeFile(file, "---\ntitle: { en: A\ndraft: true\n---\n正文")).toThrow(/不是合法 YAML/);
    expect(() => parseNoticeFile(file, "---\n- a\n- b\n---\n正文")).toThrow(/映射/);       // 列表里写不了 draft
    expect(() => parseNoticeFile(file, "没有 frontmatter 的一段字")).toThrow(/缺少 frontmatter/);
  });

  it("`draft` 只认**布尔 `true`**：`yes` / `1` / `\"true\"` / 空 都不算草稿，且会报错", () => {
    // 这是**故意**的：若宽容地把 `yes` 认成草稿，一个写错的 `draft` 就会**静默把公告藏起来**
    // —— 那比"报错"危险得多。所以宁可让 `draft: yes` 走正常校验、然后被类型检查拦下。
    //
    // ⚠️ 边界由 **YAML 1.2 core schema** 决定（`yaml` v2 就是它），不是我们挑的：
    //    `yes` / `no` / `on` / `off` 在 YAML **1.2 里是字符串**（1.1 才当布尔，"挪威问题"改名就是为这个），
    //    所以它们**不是** `true` ⇒ 落到下面的类型校验。
    for (const bad of ["yes", "no", "on", "1", '"true"', "", "null"]) {
      expect(() => parseNoticeFile(file, wrap(`id: probe\ntitle: { en: A, zh: B }\ndraft: ${bad}`)), `draft: ${bad}`).toThrow(
        /`draft` 只能是/,
      );
    }
  });

  it("`True` / `TRUE` **算草稿** —— 它们就是布尔 `true`（别以为是拼错了）", () => {
    // YAML 1.2 规定布尔只认 `true` / `True` / `TRUE` / `false` / `False` / `FALSE` 这六种写法，
    // **大小写不敏感**。所以 `draft: True` 会被解析成布尔 `true`、**真的把公告藏起来**。
    // 这与上面那批（`yes` / `1` / `"true"`）是**两回事**：那些在 YAML 1.2 里根本不是布尔。
    // （这个用例正是被真实失败揪出来的：原以为 `True` 该报错，探针一跑才知道它合法。）
    for (const ok of ["true", "True", "TRUE"]) {
      expect(parseNoticeFile(file, wrap(`id: probe\ntitle: { en: A, zh: B }\ndraft: ${ok}`)), `draft: ${ok}`).toBeNull();
    }
    // 带引号的 `"TRUE"` 是字符串 ⇒ 不算草稿 ⇒ 报错（引号会把它从布尔降级成字符串）。
    expect(() => parseNoticeFile(file, wrap('id: probe\ntitle: { en: A, zh: B }\ndraft: "TRUE"'))).toThrow(
      /`draft` 只能是/,
    );
  });

  it("`draft: false` 与**不写** `draft` 等价：正常解析，且结果里不带 `draft`", () => {
    for (const yaml of ["id: probe\ntitle: { en: A, zh: B }\ndraft: false", "id: probe\ntitle: { en: A, zh: B }"]) {
      const parsed = parseNoticeFile(file, wrap(yaml));
      expect(parsed).not.toBeNull();
      expect(parsed!.id).toBe("probe");
      expect("draft" in parsed!).toBe(false);
    }
  });

  it("拼装：`draft: true` 的条目**不出现在** `buildNoticeContent` 的结果里（下游拿不到）", () => {
    const listed = Object.fromEntries(
      NOTICE_FILES.map((name, index) => [
        name,
        index === 0
          ? "---\nid: shadow\ntitle: { en: S, zh: 影 }\ndraft: true\n---\n\n草稿正文\n" // 甚至排序上本该最靠前
          : `---\nid: probe-${index}\ntitle: { en: E, zh: 中 }\n---\n\n正文\n`,
      ]),
    );
    const built = buildNoticeContent(listed);
    expect(built.notices.map((notice) => notice.id)).not.toContain("shadow");
    expect(built.notices).toHaveLength(NOTICE_FILES.length - 1);
  });
});

describe("渲染守卫：注释别把后半段漏出来", () => {
  /** 把解析出来的块拼成纯文本（只为"有没有漏出某段字"这类断言）。 */
  function plainText(blocks: MarkdownBlock[]): string {
    return blocks
      .map((block) => {
        if (block.kind === "heading") return block.text;
        if (block.kind === "paragraph") return block.lines.join("\n");
        if (block.kind === "list") return block.items.join("\n");
        if (block.kind === "code") return block.text;
        if (block.kind === "blockquote") return plainText(block.blocks);
        if (block.kind === "table")
          return [...block.header, ...block.rows.flat()]
            .map((cell) => cell.text)
            .join("\n");
        return ""; // hr：没有文字
      })
      .join("\n");
  }

  it("渲染出来的文字里不该有孤零零的 `-->`（注释被提前截断的症状）", () => {
    // `<!--` 到结束标记是**非贪婪**匹配：注释正文里再出现一次结束标记，注释会在那里**提前收尾**，
    // 后半段当场漏到界面上 —— 而在 `.md` 里看着完全正常，只有渲染出来才看得出来。
    // （这个坑真踩过：`draft.md` 的注释里写了那三个字面字符，于是"空壳"并不空；
    //   默认它不生效所以一直没被看见，而"每条正文非空"那条反倒因为漏出来的尾巴才通过。）
    const leaked = notices
      .filter((notice) => plainText(parseMarkdown(notice.body)).includes("-->"))
      .map((notice) => notice.id);
    expect(leaked).toEqual([]);
  });
});
