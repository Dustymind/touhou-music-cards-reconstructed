/** 站内公告的**元数据与纯逻辑**：类型、正文规整、内容指纹，以及"哪条公告读哪个 `.md`"。
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
 * `.md` 的开头是 `<!--` 或汉字，于是 `SyntaxError: Unexpected token (1:0)`，
 * **一个 spec 都收不上来**（报 `Error: No tests found`）。vitest 走 Vite，所以单测毫无症状 ——
 * 典型的"本地单测全绿、e2e 全红"。
 *
 * 元数据（纯 TS）放这里、正文两边各自取，是唯一能让两边都活着、又不用把正文抄两遍的拆法。
 * 拼装逻辑也**共用一份**（`buildNoticeContent`），所以"某条公告缺正文"在两个环境里表现一致。
 *
 * ---- 要改东西的人看这里 ----
 *
 * 改**正文** ⇒ 改 `notices/*.md`（那是唯一真源，本文件不存正文）。
 * 加**一条新公告** ⇒ ① 写 `notices/<id>.md` ② 往下面的 `noticeMeta` 里加一条。
 */
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
  /** 「不再显示」勾选框的文案（双语）。不写 = 默认文案 */
  dismiss?: Localized;
  /** 生效起（`YYYY-MM-DD`，本地时间，含当天）。不写 = 立即生效 */
  from?: string;
  /** 生效止（`YYYY-MM-DD`，本地时间，含当天）。不写 = 不过期 */
  until?: string;
}

export interface NoticesContent {
  /** 公告列表。**数组顺序 = "该弹哪条"的优先级**（首版只自动弹第一条符合条件的）。 */
  notices: NoticeContent[];
}

/** 一条公告的**元数据**：`NoticeContent` 去掉正文，换成"正文在哪个文件"。 */
export interface NoticeMeta extends Omit<NoticeContent, "body"> {
  /** 正文文件名，**相对 `src/content/notices/`**（只写文件名，两个环境各自拼目录）。 */
  bodyFile: string;
}

/**
 * 把 `.md` 文件原文规整成可直接喂给渲染器的正文。
 *
 * 两件事，都是为了"`.md` 是给人编辑的文件"这件事：
 *
 * 1. **行尾统一成 LF**。渲染器是按 `\n` 切行的 —— 文件里若留下 `\r\n`（Windows 编辑器、
 *    `core.autocrlf`、从别处粘进来的片段都可能带），`\r` 会变成正文里看不见的杂字符，
 *    还会把"行尾两个空格 = 硬换行"的判断一并弄坏（行尾变成 `\r` 而不是空格）。
 * 2. 去掉首尾空行。文件末尾那个换行不是内容。
 *
 * 注意：**只做这两件事**，不碰正文中间的任何空白 —— 空行分段、缩进都由 Markdown 自己管。
 */
export function normalizeNoticeBody(raw: string): string {
  return raw.replace(/\r\n?/g, "\n").trim();
}

/** 「关闭」与「不再显示」的兜底文案（某条不写就用这两份）。 */
export const NOTICE_DEFAULT_CLOSE: Localized = { en: "Close", zh: "关闭" };
export const NOTICE_DEFAULT_DISMISS: Localized = { en: "Do not show again", zh: "不再显示" };

/**
 * 公告清单。**数组顺序 = "该弹哪条"的优先级**（首版只自动弹第一条符合条件的）。
 *
 * 加一条新公告：① 写 `notices/<id>.md` ② 在这里加一条（`bodyFile` 写**文件名**）。
 * 正文**不在这里** —— 它在 `.md` 里，两个环境各自去取（见文件开头的说明）。
 */
export const noticeMeta: readonly NoticeMeta[] = [
  {
    // id 带上年月，方便日后一眼看出是哪一版；**发布后不要再改这个值**
    id: "welcome-2026-10",
    title: { en: "Welcome", zh: "欢迎" },
    // 正文在 `notices/welcome-2026-10.md`
    bodyFile: "welcome-2026-10.md",
    // close / dismiss 不写 = 用 NOTICE_DEFAULT_CLOSE / NOTICE_DEFAULT_DISMISS
  },
  {
    // 空壳草稿：正文在 `notices/draft.md`（整份只有注释 ⇒ 渲染出来是空的）。
    // 带一个**未来**的 from ⇒ 默认不生效、不影响线上。本地要看效果就把这行删掉或改成今天。
    id: "draft",
    title: { en: "Draft", zh: "草稿" },
    bodyFile: "draft.md",
    from: "2099-01-01",
  },
];

/**
 * 把"元数据 + 正文"拼成界面 / 存储用的 `NoticesContent`。
 *
 * **两个环境共用这一份拼装**（Vite 侧与 e2e 侧），所以口径只有一处。
 * `bodyFile` 找不到正文就**直接抛**：那说明元数据里的文件名与磁盘上的对不上，
 * 静默给个空正文更难查（尤其在 e2e 里会变成"公告不弹了"这种莫名其妙的现象）。
 *
 * 反过来，`notices/` 下**多出来的** `.md` 不会被引用 —— 这是有意的：
 * 复制 `draft.md` 起草新公告时，文件先放进去、不接进 `noticeMeta` 就等同于不存在，不会把站点弄坏。
 */
export function buildNoticeContent(bodies: Readonly<Record<string, string>>): NoticesContent {
  return {
    notices: noticeMeta.map(({ bodyFile, ...meta }) => {
      const raw = bodies[bodyFile];
      if (raw === undefined) {
        throw new Error(
          `公告正文缺失：notices/${bodyFile} —— 检查 src/content/notices/ 下的文件名与 noticeMeta 的 bodyFile 是否一致`,
        );
      }
      return { ...meta, body: normalizeNoticeBody(raw) };
    }),
  };
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
