/** 站内公告的**正文装载**（Vite 侧）：把 `notices/*.md` 读成字符串，交给 `buildNoticeContent` 解析拼装。
 *
 * **元数据与正文都在 `.md` 里**（D187 起）：每个文件开头的 `---` 块是唯一真源，
 * 本文件与 `./noticeMeta.ts` **都不再保存任何公告的具体字段**。
 *
 * ---- 想改什么，改哪儿 ----
 *
 * | 想改什么 | 改这里 |
 * |---|---|
 * | 正文 | `notices/<文件>.md` 里 `---` **以下**的内容 —— 追加就在后面接着写 |
 * | 弹窗标题 / 「关闭」按钮 | 同一个 `.md` 里 `---` **之间**的 `title` / `close`（**双语，两份都要写**） |
 * | 排序（谁在前面） | 同一个 `.md` 里的 `date` / `pinned` |
 * | 什么时间段才生效 | 同一个 `.md` 里的 `from` / `until` |
 * | 起草中、先别让人看到 | 同一个 `.md` 里的 `draft: true`（**构建期摘掉**，比 `from` 更彻底） |
 * | 底部那行告知（"去右上角「公告」重新查看"） | **不在某条公告上** —— 全站一句话，在 `src/i18n/localization.ts` 的 `ShellNoticeHint` |
 * | 加一条新公告 | ① 复制 `notices/draft.md` 成 `notices/<新id>.md` ② 把它挂进下面 `bodies` ③ 去 `./noticeMeta.ts` 的 `NOTICE_FILES` 加一行 |
 * | 临时不让某条弹出来 | 那条的 `from` 写成未来的日期（或把它从 `NOTICE_FILES` 里去掉） |
 * | 让某条自动过期 | 那条的 `until` 写成过去的日期 |
 *
 * ---- 三条填写规则（`notices.test.ts` 会替你把关）----
 *
 * 1. **`id` 是稳定标识**：它就是本地存储键的一部分（`tmc.v1.notice.<id>`）。
 *    **一旦发布就不要再改** —— 改了等于换了一条新公告，所有老用户会重新被提示一次。
 *    格式：小写字母 / 数字 / 短横线（`^[a-z0-9-]+$`），例如 `welcome-2026-10`。
 *    **建议带上年月**，方便日后一眼看出是哪一版。
 *    ⚠️ `id` 与**文件名**是两回事（文件名只是清单里的一把钥匙）—— 写一致最好，不一致也不会错。
 * 2. **要写两份的**：`title` 是 `{ en, zh }`；`close` 写了也一样。
 *    界面的语言开关（右上角 en/zh）切的就是它们，**两份都不能留空**。
 *    ⚠️ 注意正文 `.md` **只有一份**、不按语言分 —— 正文里中英混排就两种界面都一样显示。
 * 3. **正文是受限 Markdown**（见 `src/ui/markdown.tsx` 开头）：标题（`##` / `###`）、段落、
 *    无序/有序列表、`**粗体**`、`*斜体*`、`` `行内代码` ``、`[文字](https://…)` 链接（**只认 http/https**）、
 *    行尾两个空格 = 硬换行。**不支持**图片、表格、引用块、原始 HTML —— 写了会**原样显示**。
 *    想临时屏蔽一段内容：用 `<!-- … -->` 包起来，整段会被丢掉。
 *
 * ---- frontmatter 长什么样 ----
 *
 * ```md
 * ---
 * id: welcome-2026-10            # 必填，稳定不变
 * title: { en: Welcome, zh: 欢迎 } # 必填，双语
 * date: "2026-10-01"             # 可省，只影响"谁排前面"
 * # pinned: true                # 可省，置顶
 * # from: "2026-10-01"          # 可省，不写 = 立即生效
 * # until: "2026-12-31"         # 可省，不写 = 不过期
 * # close: { en: Close, zh: 关闭 } # 可省，不写 = Close / 关闭
 * # draft: true                 # 可省，起草中用 —— **构建期直接摘掉**（比 from 更彻底）
 * ---
 *
 * 正文从这里开始。
 * ```
 *
 * 日期**带引号最稳**：`date: 2026-10-01` 也是字符串，但 `date: 2026-1-1` 会被 YAML 当别的东西。
 * 字段名写错 / 多写不认识的字段 ⇒ 构建时**直接报错并指到行号**，不会静默忽略
 * （例外：`draft: true` 的草稿只校验结构，见下）。
 *
 * ---- 「本地测试用的空壳草稿」----
 *
 * `notices/draft.md` 是一份**空壳**（正文整份只有注释 ⇒ 渲染出来是空的）。它的 frontmatter 里带着
 * `draft: true` ⇒ **构建期就被摘掉、不会出现在任何地方**（界面、e2e 都拿不到）。
 * 想在本机看到效果：把 `draft: true` 那一行删掉即可（就这一处）。测完记得改回去。
 *
 * ⚠️ 草稿**只在结构上校验**（`---` / YAML 语法），**字段本身不校验** ⇒ `draft.md` 里缺 `title`、
 * 拼错字段名都不会报错；但它们**会在你删掉 `draft: true` 的那一刻一起爆出来**。取舍见
 * `./noticeMeta.ts` 的 `DRAFT_NOTE`。
 *
 * 检查用 `pnpm typecheck && pnpm test:related src/content/notices.ts`。
 *
 * ---- ⚠️ 为什么 `noticeContent` 不放在 `./noticeMeta.ts` 里 ----
 *
 * 本文件用了 **Vite 专有语法**（`?raw`）⇒ **只有 Vite 能加载它**。
 * Playwright **有自己的 TS 加载器**（不经过 Vite），spec 一旦（直接或间接）import 到这里，
 * 它会把 `.md` 当 JS 模块解析 ⇒ `SyntaxError: Unexpected token (1:0)` ⇒
 * **一个 e2e 用例都收不上来**（`Error: No tests found`）。
 *
 * 所以：**e2e 里不要 import 本文件** —— 要公告内容就 `import { noticeContent } from "../../e2e/noticeContent"`，
 * 要纯逻辑/类型就 `from "../content/noticeMeta"`。往 e2e 加 import 之前，先看一眼这条。
 */
import { buildNoticeContent } from "./noticeMeta";

// 正文（含 frontmatter）是**真 Markdown 文件**，用 Vite 的 `?raw` 原样读成字符串
// （`vite/client` 里已有类型声明）。**文件名 → 原文**，解析交给 `buildNoticeContent`。
import draftSource from "./notices/draft.md?raw";
import exampleSource from "./notices/example.md?raw";
import notice20261009Source from "./notices/2026-10-09.md?raw";
import welcomeSource from "./notices/welcome-2026-10.md?raw";

export * from "./noticeMeta";

/** 文件名 → **整个文件的原文**（含 frontmatter）。**加了 `notices/*.md` 就要在这里挂上**
 *  （挂上之前它等同于不存在）。`NOTICE_FILES` 是唯一入口清单，两边必须对得上。 */
const bodies: Readonly<Record<string, string>> = {
  "2026-10-09.md": notice20261009Source,
  "draft.md": draftSource,
  "example.md": exampleSource,
  "welcome-2026-10.md": welcomeSource,
};

export const noticeContent = buildNoticeContent(bodies);
