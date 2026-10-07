/** 站内公告的**正文装载**（Vite 侧）：把 `notices/*.md` 读成字符串，与元数据拼成 `noticeContent`。
 *
 * 元数据（id、标题、时间窗、正文文件名）与纯逻辑在 `./noticeMeta.ts`；这里只负责"把正文取进来"。
 *
 * ---- 想改什么，改哪儿 ----
 *
 * | 想改什么 | 改这里 |
 * |---|---|
 * | 正文 | `notices/<文件>.md` —— **一个普通 Markdown 文件**，追加内容就在后面接着写 |
 * | 弹窗标题 | `./noticeMeta.ts` 里那条的 `title`（**双语，两份都要写**） |
 * | 「关闭」按钮 | `./noticeMeta.ts` 里那条的 `close`（不写 = 默认 `Close` / `关闭`） |
 * | 「不再显示」勾选框 | `./noticeMeta.ts` 里那条的 `dismiss`（不写 = 默认文案） |
 * | 加一条新公告 | ① 复制 `notices/draft.md` 成 `notices/<新id>.md` ② 在下面 `bodies` 里挂上 ③ 往 `./noticeMeta.ts` 的 `noticeMeta` 里加一条 |
 * | 临时不让某条弹出来 | 那条的 `from` 写成未来的日期（或整条删掉） |
 * | 让某条自动过期 | 那条的 `until` 写成过去的日期 |
 *
 * ---- 三条填写规则（`notices.test.ts` 会替你把关）----
 *
 * 1. **`id` 是稳定标识**：它就是本地存储键的一部分（`tmc.v1.notice.<id>`）。
 *    **一旦发布就不要再改** —— 改了等于换了一条新公告，所有老用户会重新被提示一次。
 *    格式：小写字母 / 数字 / 短横线（`^[a-z0-9-]+$`），例如 `welcome-2026-10`。
 *    **建议带上年月**，方便日后一眼看出是哪一版。
 * 2. **要写两份的**：`title` 是 `{ en, zh }`；`close` / `dismiss` 写了也一样。
 *    界面的语言开关（右上角 en/zh）切的就是它们，**两份都不能留空**。
 *    ⚠️ 注意正文 `.md` **只有一份**、不按语言分 —— 正文里中英混排就两种界面都一样显示。
 * 3. **正文是受限 Markdown**（见 `src/ui/markdown.tsx` 开头）：标题（`##` / `###`）、段落、
 *    无序/有序列表、`**粗体**`、`*斜体*`、`` `行内代码` ``、`[文字](https://…)` 链接（**只认 http/https**）、
 *    行尾两个空格 = 硬换行。**不支持**图片、表格、引用块、原始 HTML —— 写了会**原样显示**。
 *    想临时屏蔽一段内容：用 `<!-- … -->` 包起来，整段会被丢掉。
 *
 * ---- 「本地测试用的空壳草稿」----
 *
 * `notices/draft.md` 是一份**空壳**（整份只有注释 ⇒ 渲染出来是空的）。它在 `noticeMeta.ts` 里带着
 * `from: "2099-01-01"` ⇒ **默认不生效、不会出现在线上**。想在本机看到效果：把那个 `from`
 * 删掉、或改成今天即可（就这一处）。测完记得改回去。
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

// 正文是**真 Markdown 文件**，用 Vite 的 `?raw` 原样读成字符串（`vite/client` 里已有类型声明）。
import draftBody from "./notices/draft.md?raw";
import welcomeBody from "./notices/welcome-2026-10.md?raw";

export * from "./noticeMeta";

/** 正文文件名 → 原文。**加了 `notices/*.md` 就要在这里挂上**（挂上之前它等同于不存在）。 */
const bodies: Readonly<Record<string, string>> = {
  "draft.md": draftBody,
  "welcome-2026-10.md": welcomeBody,
};

export const noticeContent = buildNoticeContent(bodies);
