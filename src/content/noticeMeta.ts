/** 站内公告的**元数据与纯逻辑**：类型、`---` frontmatter 的解析与校验、正文规整、内容指纹。
 *
 * ---- ⚠️ 本文件只能用最朴素的 TS ----
 *
 * 没有 `?raw`、没有 `import.meta.glob`、不碰 `fs` —— 这不是洁癖，是**两个运行环境都要 import 它**：
 *
 * - **应用**（Vite / 浏览器）：`./notices.ts` 用 `?raw` 把 `.md` 读成字符串，再调 `buildNoticeContent`；
 * - **e2e**（Playwright / Node）：`e2e/noticeContent.ts` 用 `node:fs` 读**同一批** `.md`，
 *   调**同一个** `buildNoticeContent`。
 *
 * **为什么"取正文"必须各写一份**：Playwright **有自己的 TS 加载器**（不经过 Vite）。spec 只要
 * （直接或间接）import 到一个 `…?raw`，Playwright 就会把 `.md` 当 **JS 模块**去解析 ——
 * `.md` 的开头是 `---` 或汉字，于是 `SyntaxError: Unexpected token (1:0)`，
 * **一个 spec 都收不上来**（报 `Error: No tests found`）。vitest 走 Vite，所以单测毫无症状 ——
 * 典型的"本地单测全绿、e2e 全红"。
 *
 * 所以：**解析与拼装全放这里**（两边共用一份口径），只有"把 `.md` 读成字符串"这一步两边各写。
 *
 * ---- 要改东西的人看这里 ----
 *
 * **元数据与正文都在 `.md` 里**（D187 起）：`notices/*.md` 开头的 `---` 块是**唯一真源**，
 * 本文件**不再保存任何公告的具体字段**。加一条公告 = ① 写 `notices/<id>.md` ②
 * 把文件名加进下面 `NOTICE_FILES`。删一条公告 = 从 `NOTICE_FILES` 里去掉（文件留着不影响）。
 *
 * **起草中的公告**（还不想让任何人看到）⇒ frontmatter 写 `draft: true` —— 它在**构建期**就被摘掉，
 * 下游拿不到（详见 `DRAFT_NOTE`）。这与 `from: 未来`（排期上线）是两件事，别混。
 *
 * ---- 展示顺序（**只在这里定义一次**）----
 *
 * 1. **置顶的**在最前面（`pinned: true`）；
 * 2. 然后按 **`date` 由新到旧**（"最新的在最前面"）；`date` 不写的视为最旧；
 * 3. 同档之间保持**书写顺序**（`sortNotices` 是稳定排序）。
 *
 * 「进站自动弹哪些」= 这个顺序里**全部**该弹的（不是只挑第一条 —— D185 修正），
 * 「入口打开的那份列表」也按它列 —— 两处都从 `noticeContent.notices` 取（已在
 * `buildNoticeContent` 里排好），不会各说各话。
 */
import { parseDocument } from "yaml";

import type { Localized } from "../i18n/localization";
import { stableHash } from "../rng";

/** 一条公告（正文已就位，界面与存储直接用这份）。 */
export interface NoticeContent {
  /** 稳定 id（`^[a-z0-9-]+$`）。**它就是本地存储键的一部分，发布后不要再改**。 */
  id: string;
  /** 弹窗标题（双语，两份都要写） */
  title: Localized;
  /** 正文：受限 Markdown 字符串（支持清单见 `src/ui/markdown.tsx` 开头） */
  body: string;
  /** 「关闭」按钮的文案（双语）。不写 = `Close` / `关闭` */
  close?: Localized;
  /** 生效起（`YYYY-MM-DD`，本地时间，含当天）。不写 = 立即生效 */
  from?: string;
  /** 生效止（`YYYY-MM-DD`，本地时间，含当天）。不写 = 不过期 */
  until?: string;
  /**
   * **展示排序用的发布日期**（`YYYY-MM-DD`）。只决定"谁排前面"，**不决定能不能看** ——
   * 那是 `from` / `until` 的事。两者刻意分开：调排序不该动生效窗口，反之亦然。
   * 不写 = 视为**最旧**（排在所有写了日期的之后）。
   */
  date?: string;
  /** **置顶**：排在所有非置顶的前面（置顶之间仍按 `date` 由新到旧）。不写 = 不置顶。 */
  pinned?: boolean;
  /**
   * **草稿**：`true` ⇒ 这条**在构建期就被摘掉**，界面与 e2e 都拿不到它（见 `buildNoticeContent`）。
   * 不写 / `false` = 正式公告。**用它与用 `from: 未来` 的分工见下面 `DRAFT_NOTE` 的注释。**
   */
  draft?: boolean;
}

export interface NoticesContent {
  /**
   * 公告列表，**已经按展示顺序排好**（见 `sortNotices`：置顶优先 → `date` 由新到旧）。
   * 所以下游（自动弹哪些、入口那份列表）直接按数组顺序读就行，不必各自再排一次。
   */
  notices: NoticeContent[];
}

/**
 * 要加载的公告文件清单（**相对 `src/content/notices/`**，只写文件名）。
 *
 * 数组顺序 = **没有 `date` / `pinned` 可依据时的书写顺序**；有排序字段时由 `sortNotices` 说了算。
 * 加一条公告就在末尾加一行。**这里只列文件，字段一律去 `.md` 的 frontmatter 里写。**
 *
 * ⚠️ 列了但文件不存在 ⇒ `buildNoticeContent` **直接抛**（见下）；
 * 反过来 `notices/` 下多出来的 `.md` 不会被读 —— 这是有意的：复制一份起草新公告时，
 * 文件先放进去、不挂进这张清单就等同于不存在，不会把站点弄坏。
 *
 * ⚠️ **列了、但文件里写了 `draft: true`** ⇒ 条目在构建期被**摘掉**（不报错，但也不会出现在
 * 任何下游）。所以清单里留着草稿是安全的 —— 这是它与"先别挂进清单"的**唯一**区别：
 * 挂在清单里能拿到 frontmatter 的语法校验（结构错照报），摘掉字段校验（见 `parseNoticeFile`）。
 */
export const NOTICE_FILES: readonly string[] = [
  "2026-10-09.md",
  "welcome-2026-10.md",
  "draft.md",
  "example.md",
];

/** frontmatter 里**允许出现**的字段。多写别的 ⇒ 报错（多半是拼错了字段名，静默忽略最难查）。 */
const KNOWN_FIELDS = ["id", "title", "close", "from", "until", "date", "pinned", "draft"] as const;

/** 把 `.md` 文件原文规整成可直接喂给渲染器的正文。
 *
 * 三件事，都是为了"`.md` 是给人编辑的文件"这件事：
 *
 * 1. **行尾统一成 LF**。渲染器是按 `\n` 切行的 —— 文件里若留下 `\r\n`（Windows 编辑器、
 *    `core.autocrlf`、从别处粘进来的片段都可能带），`\r` 会变成正文里看不见的杂字符，
 *    还会把"行尾两个空格 = 硬换行"的判断一并弄坏（行尾变成 `\r` 而不是空格）。
 * 2. 去掉首尾空行。文件末尾那个换行不是内容。
 * 3. **剥掉 frontmatter**（`stripFrontmatter`）—— 它是元数据，不是正文，
 *    漏进去会变成界面顶上一段 `id: xxx` 的乱码。
 *
 * 注意：**只做这三件事**，不碰正文中间的任何空白 —— 空行分段、缩进都由 Markdown 自己管。
 */
export function normalizeNoticeBody(raw: string): string {
  return stripFrontmatter(raw).replace(/\r\n?/g, "\n").trim();
}

/** 「关闭」的兜底文案（某条不写就用这份）。
 *
 * ⚠️ 原来这里还有一份 `NOTICE_DEFAULT_DISMISS`（「不再显示」勾选框的兜底文案）。
 * **D186 弃用了勾选框**（改成"关闭 = 不再自动弹" + 一行告知），所以它连同 `NoticeContent.dismiss`
 * 一起删掉了。别再加回来 —— 要改那句告知去 `src/i18n/localization.ts` 的 `ShellNoticeHint`。
 */
export const NOTICE_DEFAULT_CLOSE: Localized = { en: "Close", zh: "关闭" };

/**
 * **`draft: true` 与 `from: 未来` 的分工**（两个都能让一条公告"用户看不到"，别搞混）：
 *
 * | 手段 | 语义 | 在哪一层生效 | 下游能不能拿到 |
 * |---|---|---|---|
 * | `draft: true` | **这篇还没写好** | **构建期**（`buildNoticeContent`） | **拿不到** —— 条目被摘掉 |
 * | `from: 未来` | **写好了、排期上线** | 运行时（`noticesInWindow`） | 拿得到，只是在窗口外 |
 *
 * 所以：**起草中的公告用 `draft: true`**（连 e2e 夹具也不会被它影响）；
 * **已经定稿、只是不想立刻发**的用 `from`。
 *
 * ⚠️ `draft: true` 的条目**会跳过字段校验**（但**结构性错误照报**，见 `parseNoticeFile`）——
 * 这是用户明确选的代价：草稿可以缺 `title`、字段名拼错，都不会拦你；
 * **但它们会在你把 `draft` 去掉的那一刻一起爆出来**，而那时通常是你最想发公告的时候。
 * 本常量只是把这个取舍记在代码里，没有运行时作用。
 */
export const DRAFT_NOTE = "draft: true = 还没写好（构建期摘掉、跳过字段校验）；from: 未来 = 排期上线";

/**
 * frontmatter 的**起始行必须就是文件第一行**：`---`。
 *
 * 刻意**只认 `---`**（YAML 的 `...` 结束符、`---` 前留空行都不收）：
 * 公告文件是给人手写的，规则窄一点才容易一眼看出"这段到底算不算元数据"。
 */
const FRONTMATTER_OPEN = /^---[ \t]*$/;
/** 结束行同样是独占一行的 `---`。 */
const FRONTMATTER_CLOSE = /^---[ \t]*$/;

/** 把 `.md` 拆成「frontmatter 源文（不含两行 `---`）」与「正文」。没有 frontmatter 时前者为 `null`。 */
function splitFrontmatter(raw: string): { yamlText: string | null; body: string; /** YAML 首行在文件里的行号（1 起） */ yamlStartLine: number } {
  const text = raw.replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  if (lines.length === 0 || !FRONTMATTER_OPEN.test(lines[0]!)) {
    return { yamlText: null, body: text, yamlStartLine: 1 };
  }
  for (let i = 1; i < lines.length; i += 1) {
    if (FRONTMATTER_CLOSE.test(lines[i]!)) {
      return {
        yamlText: lines.slice(1, i).join("\n"),
        body: lines.slice(i + 1).join("\n"),
        yamlStartLine: 2, // 第一行是 `---`，YAML 从文件的第 2 行开始
      };
    }
  }
  // 开了 `---` 却没收尾：当正文处理会得到一坨莫名其妙的报错，不如这里就说明白。
  throw new Error("公告 frontmatter 没有结束：文件开头的 `---` 之后找不到另一行 `---`。");
}

/** 剥掉 frontmatter，只留正文（没有 frontmatter 时原样返回）。 */
export function stripFrontmatter(raw: string): string {
  return splitFrontmatter(raw).body;
}

/**
 * 解析 `notices/<file>.md` 的原文，返回「元数据 + 正文」；**草稿返回 `null`**（见下）。
 *
 * **报错一律带上文件名与行号** —— 公告是给人手写的手改的，只说"字段不合法"帮不上忙；
 * 而**行号是 YAML 自己的行号 + frontmatter 在文件里的偏移**（`yamlStartLine - 1`），
 * 这样报出来的行号能直接在编辑器里定位。
 *
 * ---- `draft: true` 走的是**另一条路**（两档校验，差别刻意收窄）----
 *
 * 读到 `draft: true` ⇒ **跳过字段校验**，直接返回 `null`（调用方把它丢掉）。
 * 但**"结构性错误"仍然照报**，只跳过"字段内容"那一档：
 *
 * | 校验档 | 例子 | 草稿里 |
 * |---|---|---|
 * | **结构**：`---` 缺失/未闭合、YAML 语法错、frontmatter 不是映射 | `title: { en: A` 少个 `}` | **照报** |
 * | **字段**：必填项缺失、字段名拼错、类型不对、值不合法 | `tilte: x`、缺 `title`、`pinned: yes` | **跳过** |
 *
 * 为什么结构档不放过：这类错的后果是"**连正文都取不出来**"（`---` 没闭合 ⇒ 整份文件都被当 frontmatter），
 * 没有任何"先凑合着写"的余地；而且它们与字段写没写好不好无关。
 * 为什么字段档放过：这是用户明确要的 —— 草稿要能"写一半先存着"。
 *
 * ⚠️ 代价（已知并接受）：草稿里的字段错**不会在草稿期暴露**，会在你把 `draft` 去掉的那一刻一起爆。
 * 详见 `DRAFT_NOTE` 的注释。
 */
export function parseNoticeFile(file: string, raw: string): NoticeContent | null {
  const { yamlText, body, yamlStartLine } = splitFrontmatter(raw);
  if (yamlText === null) {
    throw new Error(`${file}：缺少 frontmatter —— 文件第一行必须是 \`---\`，元数据（id / title …）写在里面。`);
  }

  const doc = parseDocument(yamlText);
  if (doc.errors.length > 0) {
    const first = doc.errors[0]!;
    // `linePos` 是相对 YAML 片段的行列（1 起）；加上 frontmatter 在文件里的偏移才是真实行号。
    const line = first.linePos === undefined ? null : first.linePos[0].line + yamlStartLine - 1;
    const where = line === null ? "" : `（第 ${line} 行）`;
    throw new Error(`${file}：frontmatter 不是合法 YAML${where} —— ${first.message.split("\n")[0]}`);
  }

  const data = doc.toJS() as unknown;
  if (data === null || data === undefined) {
    throw new Error(`${file}：frontmatter 是空的 —— 至少要写 id 与 title。`);
  }
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${file}：frontmatter 必须是"字段: 值"的映射（形如 \`id: xxx\`），不能是列表或标量。`);
  }

  const record = data as Record<string, unknown>;

  // ---- 先看 draft：是草稿就直接交差，且**跳过下面所有的字段校验** ----
  // 注意 `draft` 本身取的是"严格的 `=== true`"：写 `draft: yes`（YAML 1.2 里是字符串 "yes"）
  // 或 `draft: 1` 都**不算**草稿 ⇒ 会走正常校验，然后被"`draft` 只能是 true / false"拦下。
  // 反过来若在这里宽容地认 `yes`/`1`，一个拼错的 draft 就会**静默把公告藏起来**，那更糟。
  if (record.draft === true) {
    return null;
  }

  const unknownFields = Object.keys(record).filter((key) => !(KNOWN_FIELDS as readonly string[]).includes(key));
  if (unknownFields.length > 0) {
    // 拼错字段名（`tilte` / `pined`）如果只是被忽略，症状是"设置了但没生效"，非常难查。
    throw new Error(
      `${file}：frontmatter 里有不认识的字段 ${unknownFields.map((key) => `\`${key}\``).join("、")} —— ` +
        `只支持 ${KNOWN_FIELDS.map((key) => `\`${key}\``).join(" / ")}。`,
    );
  }

  return { ...parseFrontmatterFields(file, record), body: normalizeNoticeBody(body) };
}

/** 校验 + 收窄 frontmatter 的各个字段（报错带文件名；字段本身的错误由 YAML 段落负责行号）。
 *
 * 返回值里 `id` / `title` 是**必有的**，其余按需 —— 但为了让调用处拼 `body` 时类型收得上，
 * 返回类型用 `NoticeContent` 并在这里补一个空 `body`（调用处马上会覆盖掉它）。 */
function parseFrontmatterFields(file: string, record: Record<string, unknown>): NoticeContent {
  /** 取一个可选的日期字符串字段。 */
  const dateField = (key: "from" | "until" | "date"): string | undefined => {
    const value = record[key];
    if (value === undefined) return undefined;
    // `date: 2026-10-01` 不引号时 YAML 会解析成「字符串」—— 但 `2026-1-1` 之类会变成别的类型，
    // 所以这里一律要求**字符串**（并在测试里校验是不是真实存在的日历日）。
    if (typeof value !== "string") {
      throw new Error(`${file}：\`${key}\` 必须是字符串形式的日期（写 \`${key}: "2026-10-01"\`，带引号最稳）。`);
    }
    return value;
  };

  const id = record.id;
  if (typeof id !== "string" || id.trim() === "") {
    throw new Error(`${file}：\`id\` 必填，且必须是非空字符串。`);
  }

  const title = record.title;
  if (!isLocalized(title)) {
    throw new Error(`${file}：\`title\` 必填，且必须是 \`{ en: …, zh: … }\` 这样的双语映射。`);
  }

  const close = record.close;
  if (close !== undefined && !isLocalized(close)) {
    throw new Error(`${file}：\`close\` 若写了，必须是 \`{ en: …, zh: … }\` 这样的双语映射。`);
  }

  const pinned = record.pinned;
  if (pinned !== undefined && typeof pinned !== "boolean") {
    throw new Error(`${file}：\`pinned\` 只能是 \`true\` / \`false\`。`);
  }

  const draft = record.draft;
  if (draft !== undefined && typeof draft !== "boolean") {
    // 走到这儿说明 `draft` 不是 `true`（是 `true` 的话上面已经返回 `null` 了）⇒ 只可能是
    // `false` 之外的写法（`yes` / `1` / `"true"`）。报出来，别让"想藏起来却没藏"蒙混过去。
    throw new Error(`${file}：\`draft\` 只能是 \`true\` / \`false\`（不带引号）。`);
  }

  const from = dateField("from");
  const until = dateField("until");
  const date = dateField("date");

  // 逐个"写了才带"地拼 —— 不写 `from: undefined`，免得下游 `"from" in notice` 之类的判断被带偏。
  // ⚠️ **不带 `draft`**：能走到这里的 `draft` 只可能是 `false` / 没写（`true` 已在上面返回 `null`），
  // 而"非草稿"就是默认状态 ⇒ 往 `NoticeContent` 里塞一个恒为 `false` 的字段只会让下游多一条无意义的判断。
  return {
    body: "", // 调用处立刻覆盖；这里只是让返回类型收成 `NoticeContent`
    id,
    title: { en: title.en.trim(), zh: title.zh.trim() },
    ...(close === undefined ? {} : { close: { en: close.en.trim(), zh: close.zh.trim() } }),
    ...(from === undefined ? {} : { from }),
    ...(until === undefined ? {} : { until }),
    ...(date === undefined ? {} : { date }),
    ...(pinned === undefined ? {} : { pinned }),
  };
}

/** 是不是 `{ en, zh }` 双语映射（两份都非空）。 */
function isLocalized(value: unknown): value is Localized {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.en === "string" && record.en.trim() !== "" && typeof record.zh === "string" && record.zh.trim() !== "";
}

/**
 * 按**展示顺序**排：① 置顶的在前 ② 然后 `date` 由新到旧 ③ 同档保持书写顺序。
 *
 * 用 `Array.prototype.sort`（ES2019 起**保证稳定**）⇒ 两条都没写 `date` 时，谁前谁后就是
 * `NOTICE_FILES` 里的书写顺序，可预期、不用额外塞序号。
 *
 * `date` 不写当作 `""`：字典序里它比任何 `YYYY-MM-DD` 都小，正好落在最后 = "最旧"。
 */
export function sortNotices<T extends { date?: string; pinned?: boolean }>(notices: readonly T[]): T[] {
  return [...notices].sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned === true ? -1 : 1;
    const a = left.date ?? "";
    const b = right.date ?? "";
    if (a === b) return 0;              // 稳定排序 ⇒ 保持书写顺序
    return a < b ? 1 : -1;              // date 由新到旧（"最新的在最前面"）
  });
}

/**
 * 把"每个 `.md` 的原文"拼成界面 / 存储用的 `NoticesContent`。
 *
 * 入参是 **`文件名 → 文件原文`**（两个环境各自去取：Vite 用 `?raw`、Node 用 `fs`），
 * 解析与排序都在这一个地方做，所以口径只有一处。
 *
 * `NOTICE_FILES` 里列了但入参里没有 ⇒ **直接抛**：那说明清单与磁盘上的文件名对不上，
 * 静默跳过更难查（尤其在 e2e 里会变成"公告不弹了"这种莫名其妙的现象）。
 * 反过来，入参里多出来的文件会被忽略（`NOTICE_FILES` 是唯一入口清单）。
 *
 * ---- `draft: true` 的条目在**这里**被摘掉 ----
 *
 * `parseNoticeFile` 对草稿返回 `null`，本函数把这些 `null` 滤掉 ⇒ **下游（`noticesInWindow`、
 * `pickAutoNotices`、`openManually`、e2e 夹具）全都拿不到草稿**，不必各自再判一次 `draft`。
 * 两个环境共用本函数 ⇒ 应用与 e2e 对"有哪些公告"的看法**必然一致**（不然 e2e 会莫名其妙地
 * 多出或少掉一条，而这种差异最难查）。
 */
export function buildNoticeContent(files: Readonly<Record<string, string>>): NoticesContent {
  const parsed = NOTICE_FILES.map((file) => {
    const raw = files[file];
    if (raw === undefined) {
      throw new Error(
        `公告正文缺失：notices/${file} —— 检查 src/content/notices/ 下的文件名与 NOTICE_FILES 是否一致`,
      );
    }
    return parseNoticeFile(file, raw);
  });
  // 排序放在**解析之后**：某条缺文件 / 写错字段时，报错仍按 `NOTICE_FILES` 的**书写顺序**
  // 指出第一个出问题的，不会因为"谁排前面"而换一个文件名（错误信息要可预期）。
  // 过滤也放在排序**之前**：`sortNotices` 只该看见真实存在的那几条。
  const notices = sortNotices(parsed.filter((notice): notice is NoticeContent => notice !== null));
  return { notices };
}

/**
 * 一条公告的**内容指纹**：改了标题或正文就算"新内容"，该重新提示一次。
 *
 * 用仓库既有的 `stableHash`（`src/rng`，非种子场景的纯装饰用途）—— 不新写一套哈希。
 * 只算 `id` + 标题 + 正文：**改时间窗不算改内容**（调 `until` 不该重新打扰用户）。
 *
 * 入参类型**只留这三个字段**（窗口字段天然进不来）⇒ "改窗口不算改内容"是**类型层面**的保证，
 * 不靠注释提醒。
 */
export function noticeFingerprint(notice: Pick<NoticeContent, "id" | "title" | "body">): string {
  return String(stableHash([notice.id, notice.title.en, notice.title.zh, notice.body].join("\u0000")));
}
