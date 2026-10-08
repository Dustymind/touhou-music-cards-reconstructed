/** 受限 Markdown 渲染器 —— 解析用**固化的 `marked`**，渲染仍是**我们自己写**（只产 React 节点）。
 *
 * ---- 为什么是"固化的 marked 解析 + 自写渲染"这个组合 ----
 *
 * 历史的两个约束（D182）都没变，但**做法变了**（D189）：
 *
 * 1. **许可**：本仓库是 REUSE 聚合仓、`REUSE.toml` 逐路径声明，且 `pnpm gate --check` 会比对
 *    **生产闭包**。引一个 npm 运行时依赖 ⇒ 闭包变 ⇒ `gen-notices.mjs` 产出变 ⇒ gate 红。
 *    ⇒ 所以**不引 npm 依赖**，改成把上游代码**固化进仓库**（`src/vendor/marked/`，见其 `PROVENANCE.md`）。
 *    固化之后它是"仓库自己的源码"，闭包不再变化。
 * 2. **安全**：`marked` 的 `parse()` 产出 **HTML 字符串**，用它就得配 sanitizer，配错就出 XSS
 *    （上游 README 自己写着 "Marked does not sanitize the output HTML. Please use … DOMPurify"）。
 *    ⇒ 所以**只取它的 `Lexer`**（产 token AST），渲染**仍由我们做**、
 *    **只产 React 节点**、**从不碰 `dangerouslySetInnerHTML`** ⇒ XSS 面仍是零。
 *
 * 换句话说：**"解析"这件事交给权威实现，"产出什么"这件事仍攥在自己手里。**
 *
 * ---- 支持的语法（D189 起：`marked` 识别得出的，我们基本都渲染）----
 *
 * | 语法 | 写法 | 渲染成 |
 * |---|---|---|
 * | 标题 | `#` ~ `######` | 一级降级成二级（免得和弹窗标题打架），其余按层级 |
 * | 段落 | 空行分隔 | `<p>` |
 * | 无序列表 | 行首 `- ` `* ` `+ ` | `<ul>` |
 * | 有序列表 | 行首 `1. ` `2)` … | `<ol>`（**从 1 重新编**，忽略原序号） |
 * | 任务列表 | `- [ ] 待办` / `- [x] 已完成` | `<li>` + 只读复选框 |
 * | 粗体 / 斜体 / 删除线 | `**粗**` / `*斜*` / `~~删~~` | `<strong>` / `<em>` / `<del>` |
 * | 行内代码 | `` `code` `` | `<code>` |
 * | 链接 | `[文字](https://…)` —— **只认 `http` / `https`** | `<a target="_blank" rel="noreferrer noopener">` |
 * | 图片 | `![替代文字](https://…)` | `<img>`（**同样只认 `http` / `https`**，见下） |
 * | 引用块 | `> 引用` | `<blockquote>`（**可嵌套**：里面的列表/代码块都会递归渲染） |
 * | 代码块 | 围栏 ```` ``` ````（可带语言）或 4 空格缩进 | `<pre><code>` |
 * | 水平线 | `---` / `***` / `___` | `<hr>` |
 * | 表格 | GFM 表格（`\|` 分隔 + `:--:` 对齐） | `<table>`（对齐跟 `:--:` 走；窄屏可横向滚） |
 * | 硬换行 | 行尾两个空格 | `<br>` |
 * | HTML 注释 | `<!-- … -->` | **整段丢弃**（见下） |
 *
 * **仍不渲染成元素**（写了**原样显示**，不报错、也**不会**变成 DOM）：
 * **原始 HTML**（`<script>` / `<div>` …）、脚注、定义列表、自动链接。
 *
 * ---- ⚠️ 两条不能破的安全铁律 ----
 *
 * 1. **绝不 `dangerouslySetInnerHTML`**，绝不产出 HTML 字符串。本文件**只产 React 节点**，
 *    所以正文里写 `<script>alert(1)</script>` 只会**显示成一串字**。
 *    ⇒ **别给 `html` token 加"当元素渲染"的分支** —— 一加，XSS 面就从零变成非零，
 *    而这正是本文件存在的全部意义。
 * 2. **链接与图片的 `href` / `src` 都过 `safeProtocol` 白名单**（只 `http` / `https`）。
 *    `marked` 自己**不做**这个过滤（探针实测它会给 `javascript:` 的 href）
 *    ⇒ 过滤在**我们**这边。**`image` 也别漏**：图片的 `src` 同样能执行 `javascript:`
 *    或当信标用，所以走**同一个** `safeProtocol`。
 *
 * ⚠️ **HTML 注释照样整段丢弃**：D185 修过"注释漏进界面"，那是靠**非贪婪**匹配剥的。
 * 现在注释由 `marked` 切成 `html` token，我们**主动跳过**它们（见 `isHtmlComment`）。
 * 非注释的 HTML **不丢** —— 让它原样显示成字，"看得见"比"被偷偷吞掉"好排查。
 */
import { useMemo, type ReactElement, type ReactNode } from "react";

import { Box, Checkbox, Link, Stack, Typography } from "@mui/material";

import { Lexer, type TagToken, type Token } from "../vendor/marked/marked.esm";

/** 表格的一个单元格（文本 + 是否表头 + 对齐）。 */
export interface MarkdownTableCell {
  text: string;
  header: boolean;
  align: "center" | "left" | "right" | null;
}

/**
 * 列表块。`tasks` **只在真的是任务列表时才出现**（`- [ ] x` / `- [x] x`），
 * 与 `items` 一一对应：`tasks[i] === true` = 第 i 项勾上了。
 *
 * 为什么把勾选状态**单独放一个数组**、不塞进 `items[i]` 的文字里：
 * 渲染层要给勾上的项叠复选框与删除线，而 `items` 是**纯文字**（老调用方 `plainText()` 靠它拍平断言）。
 * 混在一起会出现"文字里的 `[x]` + 一个真复选框"的重复显示。
 */
export interface MarkdownListBlock {
  kind: "list";
  ordered: boolean;
  items: string[];
  tasks?: boolean[];
}

/**
 * 一个解析出来的块级元素。`parseMarkdown` 的输出（暴露出来是为了能逐块单测）。
 *
 * ⚠️ `blockquote` 用**嵌套的 `MarkdownBlock[]`**（不是字符串）——
 * 因为引用块里可以放段落 / 列表 / 代码块，拍平会丢掉结构。
 */
export type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: "paragraph"; lines: string[] }
  | MarkdownListBlock
  | { kind: "code"; language: string; text: string }
  | { kind: "blockquote"; blocks: MarkdownBlock[] }
  | { kind: "table"; header: MarkdownTableCell[]; rows: MarkdownTableCell[][] }
  | { kind: "hr" };

/**
 * 调 `marked` 的 **Lexer**（不是 `parse()`）拿 token AST。
 *
 * 选项**全部走默认**（GFM 开、`breaks` 关）—— 与 D182 手写版的行为对齐：
 * - `breaks` 关：软换行折成空格，只有行尾两个空格才 `<br>`（手写版就是这个语义）；
 * - GFM 开：表格/删除线会被**识别**，但我们不渲染它们 ⇒ 无外观影响。
 */
function lex(source: string): Token[] {
  return Lexer.lex(source);
}

/** 把一行 token 序列拍成纯文本（用于"这行到底写了什么字"的兜底渲染）。
 *
 * ⚠️ 收 `Token | TagToken` 两种（块级 token 与行内 token 是两个联合，见 `marked.esm.d.ts`）——
 * 这个函数是个"什么都吃得下"的兜底拍平器，不需要判别收窄。
 */
function tokensToText(tokens: readonly (Token | TagToken)[] | undefined): string {
  if (!tokens) return "";
  let out = "";
  for (const token of tokens) {
    switch (token.type) {
      case "text":
        out += "text" in token && typeof token.text === "string" ? token.text : "";
        break;
      case "codespan":
        // 行内代码：**保留反引号**，这样它落到纯文本路径时看起来仍是代码
        out += `\`${"text" in token ? String(token.text) : ""}\``;
        break;
      case "escape":
        out += "text" in token ? String(token.text) : "";
        break;
      case "br":
        out += "\n";
        break;
      default: {
        // strong / em / link / del / 以及**任何没渲染分支的**（html / image / …）：
        // 有 `tokens` 就递归拍平，没有就退回 `raw`（原样文字）。
        const anyToken = token as { tokens?: (Token | TagToken)[]; raw?: string; text?: string };
        if (anyToken.tokens) out += tokensToText(anyToken.tokens);
        else if (typeof anyToken.text === "string") out += anyToken.text;
        else out += String(anyToken.raw ?? "");
      }
    }
  }
  return out;
}

/**
 * 把 Markdown 源码切成块。
 *
 * **`marked` 的 `space` token 是块分隔符**，这里直接跳过（手写版靠空行，语义一样）。
 *
 * 三处与"直接把 token 转文本"不同的地方，都是**为了保住既有语义**：
 *
 * 1. **段落按 `\n` 切行**：`marked` 把整段（含换行）塞进**一个** `text` token，
 *    而本仓库的渲染层是按"行"组织的（要判"行尾两个空格 = 硬换行"）⇒ 这里用
 *    `token.raw`（**原文**，见下）按 `\n` 切开当 `lines`。
 * 2. **`raw` 而不是 `text`**：`raw` 保留**原始 Markdown**（`**粗体**` / `[字](url)`），
 *    交给渲染层的 `renderInline` 再走一次行内词法 —— 若用 `text`（已拍平）就会**丢掉链接与粗体**。
 * 3. **注释块整段丢弃**：`marked` 把 `<!-- … -->` 识别成 `{type:"html"}`。D185 修的就是
 *    "注释漏进界面"这个 bug，**必须继续丢掉**（见下 `isHtmlComment`）。其余 html（如 `<script>`）
 *    **不丢**，让它走纯文本兜底 —— "原样显示"比"静默吞掉"更符合本项目的取舍。
 *
 * 对**没渲染分支的块**（`def` 之类）：把原文塞进一个 `paragraph` ⇒ 界面上"原样显示"。
 */
export function parseMarkdown(source: string): MarkdownBlock[] {
  return tokensToBlocks(lex(source));
}

/** 把一层 block token 转成块列表。**引用块会递归调用它自己**（`> - 甲` 里的列表就是这么来的）。 */
function tokensToBlocks(tokens: readonly Token[]): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case "space":
        break;

      case "heading":
        // 一级 `#` 降级成 2 级（弹窗自己的标题已是 DialogTitle，正文不需要更大）。
        // 其余按 `depth` 如实映射；`######` 也不会超过 6。
        blocks.push({
          kind: "heading",
          level: clampHeadingLevel(token.depth),
          text: stripComments(token.raw.replace(/^#{1,6}\s+/, "")).trim(),
        });
        break;

      case "paragraph":
        blocks.push({ kind: "paragraph", lines: splitSourceLines(token.raw) });
        break;

      case "list":
        // ⚠️ **`marked` 会把相邻的两个列表合成一个**（CommonMark 也如此）：
        //     `- 甲\n- 乙\n\n- [ ] 待办\n- [x] 已办`
        // 整体是**一个** `list` token（4 项，前两项 `task:false`）。
        // 若照单全收，"任务列表"分支会把这个混合列表的**每一项**都画上复选框
        // —— 连普通的 `- 甲` 也带上一个空框，外观明显不对。
        // ⇒ 这里按 `item.task` **切成连续段**，每段单独成块（普通段不带 `tasks`，任务段才带）。
        // `push` 多块而不是一块，位置仍连续，顺序不变。
        for (const run of splitListRuns(token.items)) {
          const isTaskRun = run[0]?.task === true;
          blocks.push({
            kind: "list",
            ordered: token.ordered,
            // ⚠️ **忽略 `start`**（"数字只用来判定是有序列表，渲染时按顺序从 1 自己编"）——
            // 这是 D182 以来的既有约定，换成 marked 后**刻意保留**（读 `start` 会让
            // `3. 甲` 之后从 3 起编，而公告里手写序号常与实际项数不符，从 1 编更可预期）。
            // ⚠️ `items` 只放**文字**；任务框的勾选状态另放 `tasks`（见 `MarkdownListBlock`），
            // 免得文字里混进 `[x]` 记号、渲染时与复选框重复。
            items: run.map((item) => listItemText(item)),
            ...(isTaskRun ? { tasks: run.map((item) => item.checked === true) } : {}),
          });
        }
        break;

      case "code":
        // 围栏 / 缩进代码块都要**原样保留空白**（所以渲染层用 `<pre>`，不用 `Typography` 折行）。
        blocks.push({ kind: "code", language: (token.lang ?? "").trim(), text: token.text });
        break;

      case "blockquote":
        // 递归：引用块里的列表 / 代码块 / 嵌套引用都会照常渲染。
        // `token.tokens` 这里声明成行内联合（上游 `Tokens.BlockQuote` 的 `tokens` 就复用了
        // `Tokens.Generic`），但运行时放的是**块级** token ⇒ 断言回块级联合再往下递归。
        blocks.push({
          kind: "blockquote",
          blocks: tokensToBlocks((token.tokens ?? []) as unknown as Token[]),
        });
        break;

      case "table":
        blocks.push({
          kind: "table",
          header: token.header.map(cellToPlain),
          rows: token.rows.map((row) => row.map(cellToPlain)),
        });
        break;

      case "hr":
        blocks.push({ kind: "hr" });
        break;

      case "html":
        // 注释：整段丢弃（D185 的行为必须保住）。
        // 非注释的 HTML（`<script>` / `<div>` …）：**原样显示**成文字，绝不当元素。
        if (!isHtmlComment(token.raw)) {
          const text = token.raw.replace(/\n+$/, "");
          if (text.trim() !== "") blocks.push({ kind: "paragraph", lines: [text] });
        }
        break;

      default: {
        // 没渲染分支的块（`def` / `space` 之外的新类型 …）：**原样显示**，别让它凭空消失。
        const raw = "raw" in token && typeof token.raw === "string" ? token.raw : "";
        const text = raw.replace(/\n+$/, "");
        if (text.trim() !== "") blocks.push({ kind: "paragraph", lines: splitSourceLines(text) });
        break;
      }
    }
  }

  return blocks;
}

/**
 * 标题级别：**一级降级成 2**（弹窗标题已是 `DialogTitle`，正文里再来个 h1 会打架），
 * 其余如实映射并夹在 `1..6`。
 */
function clampHeadingLevel(depth: number): 1 | 2 | 3 | 4 | 5 | 6 {
  const level = depth <= 1 ? 2 : depth;
  return Math.min(Math.max(level, 1), 6) as 1 | 2 | 3 | 4 | 5 | 6;
}

/** 表格单元格 → 我们自己的形状（**顺手剥注释**，免得注释漏进表格里）。 */
function cellToPlain(cell: { text: string; header: boolean; align: "center" | "left" | "right" | null }): MarkdownTableCell {
  return { text: stripComments(cell.text).trim(), header: cell.header, align: cell.align };
}

/**
 * 一个 HTML 注释块吗（`<!-- … -->`）。
 *
 * ⚠️ 判据是**注释**，**不是**"所有 html" —— 别把整个 `html` token 丢掉：
 * 那样 `<script>alert(1)</script>` 会**凭空消失**，用户写的东西看不见了，
 * 而"看得见的文字"比"被偷偷吞掉"更好排查（也与我们"不支持就原样显示"的口径一致）。
 */
function isHtmlComment(raw: string): boolean {
  return raw.trimStart().startsWith("<!--");
}

/** 按 `\n` 把一段**原文**切成"行"（每行仍是 Markdown 源码，交给 `renderInline` 再解析）。
 *
 * ⚠️ 顺便**剥掉行内注释**（见 `stripComments`）：`甲<!-- 一段 -->乙` 这一行里，
 * `marked` 会把注释单独切出一个 `html` token，但我们这里是按**原文行**传递的
 * ⇒ 注释会跟着 `raw` 一路流到渲染层。在这一步剥掉，**后面任何路径都不可能再看到它**。
 */
function splitSourceLines(raw: string): string[] {
  const lines = stripComments(raw).replace(/\n+$/, "").split("\n");
  return lines.length > 0 ? lines : [raw];
}

/**
 * 剥掉 `<!-- … -->`（含跨行）。**非贪婪**：遇到第一个 `-->` 就收尾。
 *
 * ⚠️ **非贪婪正是 D182/D185 那个坑的来源**：注释正文里再写一次结束标记，注释会在那里
 * **提前收尾**，后半段当场漏到界面上（在 `.md` 里看着完全正常）。
 * 所以 `notices/draft.md` 与文档里都特意**不**连着写出那三个字符，`notices.test.ts` 有守卫。
 *
 * 这里保留"非贪婪"语义是**有意为之**：改成贪婪反而会把注释后面真正的正文一起吃掉，
 * 那是更糟的失败模式（内容凭空消失）。两害相权取轻。
 */
function stripComments(raw: string): string {
  return raw.replace(/<!--[\s\S]*?-->/g, "");
}

/**
 * 取一个列表项的**原文**给渲染层。
 *
 * 为什么用 `item.raw` 再剥掉开头的标记，而不是 `item.tokens`：
 * `tokens` 已是拍平/半解析的形态，会丢掉行内标记；而 `raw` 是原文，能保住
 * `**粗体**` / `[链接](url)`。剥掉的是行首的 `- ` / `1. ` **与任务框** `[ ] `。
 *
 * ⚠️ **`loose` 列表**：`- 甲\n\n- 乙` 在 CommonMark / `marked` 里是**一个**列表（`loose: true`），
 * 而 D182 手写版会切成**两个**。D189 明确选了"跟随权威实现" ⇒ **接受**这个差异
 * （它是规范行为，不是 bug），并把用例改成断言"一个 loose 列表、两项"。
 */
function listItemText(item: { raw: string }): string {
  return stripComments(item.raw)
    .replace(/^[-*+]\s+/, "") // 无序：`- ` / `* ` / `+ `
    .replace(/^\d+[.)]\s+/, "") // 有序：`1. ` / `12) `
    .replace(/^\[[ xX]\]\s+/, "") // 任务框：`[ ] ` / `[x] `
    .replace(/\n+$/, "")
    .trim();
}

/**
 * 把一个列表 token 的项按**是否任务项**切成连续段。
 *
 * 为什么需要它：`marked`（以及 CommonMark）会把**相邻的**普通列表与任务列表合成**一个**
 * `list` token，例如
 *
 * ```text
 * - 甲
 * - 乙
 *
 * - [ ] 待办
 * - [x] 已办
 * ```
 *
 * 是一个 4 项的 `list`（前两项 `task: false`）。若整块当任务列表渲染，`- 甲` 也会长出一个
 * 复选框 —— 明显不对。切成段之后就得到"一个普通列表 + 一个任务列表"，与原意一致。
 *
 * 边界情形：**混合**列表（`- 甲` 紧跟 `- [ ] 乙`，中间无空行）在这套规则下同样会切成两块。
 * 这是有意的取舍 —— "普通项绝不带复选框"比"保住同一个 `<ul>`"更重要（后者只是观感差异）。
 */
function splitListRuns<T extends { task?: boolean }>(items: readonly T[]): T[][] {
  const runs: T[][] = [];
  for (const item of items) {
    const isTask = item.task === true;
    const last = runs.at(-1);
    if (last && (last[0]?.task === true) === isTask) last.push(item);
    else runs.push([item]);
  }
  return runs;
}

/**
 * 把**一行 Markdown 源码**切成 React 节点序列：行内代码 / 粗体 / 斜体 / 链接 / 纯文本。
 *
 * 实现方式是**行内词法**（`marked` 的 `Lexer.lexInline`）→ React 节点，
 * **仍然不产 HTML**。传字符串进来的 API 保持不变（`notices.test.ts` 的渲染守卫直调它）。
 *
 * **链接只认 `http` / `https`**（用 `new URL` 判协议）—— 其他一律**按纯文本渲染**，
 * 所以 `[点我](javascript:alert(1))` 只会显示成一行普通文字，不会有可点的 `<a>`。
 * ⚠️ 这条是**安全边界**：`marked` 自己**不做**这个过滤（探针实测它会给 `javascript:` 的 href），
 * 过滤在**我们**这边 —— 改这个文件时**别把 `safeProtocol` 那道判断删掉**。
 */
export function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes = renderInlineTokens(lexInline(text), keyPrefix);
  return nodes.length > 0 ? nodes : [text];
}

/** 对一个字符串跑**行内**词法（比 `Lexer.lex` 轻，不会把 `- x` 当列表）。 */
function lexInline(source: string): TagToken[] {
  return Lexer.lexInline(source);
}

/** 行内 token → React 节点（真正的渲染层；`renderInline` 是它的字符串入口）。 */
function renderInlineTokens(tokens: readonly TagToken[], keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let index = 0;
  const nextKey = (): string => `${keyPrefix}-${index++}`;

  for (const token of tokens) {
    switch (token.type) {
      case "text":
        nodes.push("text" in token ? String(token.text) : "");
        break;

      case "escape":
        nodes.push(<span key={nextKey()}>{"text" in token ? String(token.text) : ""}</span>);
        break;

      case "codespan":
        nodes.push(
          <Box
            key={nextKey()}
            component="code"
            sx={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "0.92em",
              px: 0.5,
              borderRadius: 0.5,
              backgroundColor: "action.hover",
            }}
          >
            {"text" in token ? String(token.text) : ""}
          </Box>,
        );
        break;

      case "strong":
        nodes.push(
          <Box key={nextKey()} component="strong" sx={{ fontWeight: 600 }}>
            {renderInlineTokens(token.tokens ?? [], `${keyPrefix}-strong-${index}`)}
          </Box>,
        );
        break;

      case "em":
        nodes.push(
          <Box key={nextKey()} component="em">
            {renderInlineTokens(token.tokens ?? [], `${keyPrefix}-em-${index}`)}
          </Box>,
        );
        break;

      case "del":
        // GFM 删除线 `~~文字~~` —— 用 `<del>` 保留语义（浏览器自带的删除线）。
        nodes.push(
          <Box key={nextKey()} component="del">
            {renderInlineTokens(token.tokens ?? [], `${keyPrefix}-del-${index}`)}
          </Box>,
        );
        break;

      case "image": {
        // ⚠️ 图片的 `src` **和链接走同一套白名单**（只 http / https）。
        // 别以为"图片不能执行脚本"就放行：`src="javascript:…"` 在部分环境里能跑，
        // 且任意远程 `src` 都是**隐私信标**（会把"谁看过这条公告"发出去）。
        const src = token.href;
        const alt = token.text;
        if (/^https?:$/i.test(safeProtocol(src))) {
          nodes.push(
            <Box
              key={nextKey()}
              component="img"
              src={src}
              alt={alt}
              loading="lazy"
              sx={{ maxWidth: "100%", height: "auto", borderRadius: 0.5, display: "block" }}
            />,
          );
        } else {
          // 不安全的协议 ⇒ **只显示替代文字**（连地址一起显示更吵，且图片本来就有 alt 可看）
          nodes.push(String(token.raw ?? alt));
        }
        break;
      }

      case "link": {
        const href = token.href;
        // 只认 http(s)：其余（javascript: / data: / 相对地址）按纯文本渲染，不给 `<a>`
        if (/^https?:$/i.test(safeProtocol(href))) {
          nodes.push(
            <Link key={nextKey()} href={href} target="_blank" rel="noreferrer noopener" color="primary">
              {renderInlineTokens(token.tokens ?? [], `${keyPrefix}-link-${index}`)}
            </Link>,
          );
        } else {
          // 不安全 / 不支持的协议 ⇒ **原样显示**（连 `[文字](地址)` 的写法一起，免得用户看不出被拒了）
          nodes.push(String(token.raw ?? href));
        }
        break;
      }

      case "checkbox":
        // 任务列表的复选框：**这里不渲染**（`listItemText` 已把它从文字里剥掉，
        // 复选框由 `renderBlock` 的列表分支统一画，免得出现两个框）。
        break;

      case "html":
        // ---- 行内注释：丢弃（**与块级注释同一套判据**，见 `isHtmlComment`）----
        // 不丢的话 `甲<!-- 一段 -->乙` 会把注释原样显示到界面上 —— 这正是 D185 修的那个 bug。
        if (isHtmlComment(token.raw)) break;
        // 非注释的行内 HTML（`<br>` / `<span>` …）：**原样显示**成文字，绝不当元素。
        nodes.push(token.raw);
        break;

      default:
        // 任何没分支的：**纯文本**，绝不当元素。
        nodes.push(tokensToText([token]));
        break;
    }
  }

  return nodes;
}

/** 取地址的协议；解析不出来（或非绝对地址）返回空串。 */
function safeProtocol(href: string): string {
  try {
    return new URL(href).protocol;
  } catch {
    return "";
  }
}

/**
 * 一"逻辑行"内的硬换行：**行尾两个空格** ⇒ 渲染成 `<br/>`。
 *
 * 传进来的是**单行**文本（段落的每一行、或一个列表项），所以判据是"行尾 ≥2 个空格"。
 * 行内代码里的空格不会被误判 —— 行内代码在 `renderInline` 里已被 `` ` `` 包成独立节点。
 */
function oneLine(text: string, keyPrefix: string): ReactNode[] {
  if (/\s{2,}$/.test(text)) {
    return [...renderInline(text.trimEnd(), keyPrefix), <br key={`${keyPrefix}-br`} />];
  }
  return renderInline(text, keyPrefix);
}

/**
 * 一个段落的多行：**行之间是软换行**（Markdown 语义 = 折成空格，由浏览器自己按宽度折行），
 * 只有行尾写了**两个空格**的那一行才补一个 `<br/>` 强制换行。
 */
function paragraphLines(lines: string[], keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  lines.forEach((line, index) => {
    if (index > 0) nodes.push(" ");
    nodes.push(...oneLine(line, `${keyPrefix}-line-${index}`));
  });
  return nodes;
}

/** 一个块 → React 元素。 */
function renderBlock(block: MarkdownBlock, index: number): ReactElement {
  const key = `block-${index}`;
  if (block.kind === "heading") {
    return (
      <Typography
        key={key}
        variant={block.level === 2 ? "subtitle1" : "subtitle2"}
        sx={{ fontWeight: 600, mt: index === 0 ? 0 : 1 }}
      >
        {renderInline(block.text, key)}
      </Typography>
    );
  }
  if (block.kind === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    // 任务列表：`- [x] 已办` ⇒ 把项目符号换成复选框（**只读**，公告里没有交互语义）。
    // 整条列表都是任务项时（`tasks` 存在）才动 `list-style`，否则普通列表保持浏览器默认符号。
    const isTaskList = block.tasks !== undefined;
    return (
      <Box
        key={key}
        component={ListTag}
        sx={{
          m: 0,
          pl: isTaskList ? 0 : 3,
          listStyle: isTaskList ? "none" : undefined,
          "& li": { mb: 0.5, "&:last-of-type": { mb: 0 } },
        }}
      >
        {block.items.map((item, itemIndex) => {
          const checked = block.tasks?.[itemIndex] === true;
          return (
            <Box
              key={`${key}-item-${itemIndex}`}
              component="li"
              sx={isTaskList ? { display: "flex", alignItems: "flex-start", gap: 1 } : undefined}
            >
              {isTaskList ? (
                <Checkbox
                  checked={checked}
                  disabled
                  size="small"
                  disableRipple
                  sx={{ p: 0, mt: "2px", "&.Mui-disabled": { color: "text.secondary" } }}
                />
              ) : null}
              {/* `list-style` 交给浏览器，这里只保证行内标记能渲染 */}
              <Typography
                variant="body1"
                component="span"
                sx={{
                  display: "inline",
                  // 已勾选 ⇒ 加删除线（GFM 任务列表的通行观感）
                  textDecoration: checked ? "line-through" : undefined,
                  color: checked ? "text.secondary" : undefined,
                }}
              >
                {oneLine(item, `${key}-item-${itemIndex}`)}
              </Typography>
            </Box>
          );
        })}
      </Box>
    );
  }
  if (block.kind === "code") {
    return (
      <Box
        key={key}
        component="pre"
        sx={{
          m: 0,
          p: 1.5,
          borderRadius: 1,
          bgcolor: "action.hover",
          overflowX: "auto",
          // 代码块里的换行与空格**必须原样保留**（覆盖全局的 pre-wrap 处理）
          whiteSpace: "pre",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: "0.8125rem",
          lineHeight: 1.6,
        }}
      >
        <code>{block.text}</code>
      </Box>
    );
  }
  if (block.kind === "blockquote") {
    return (
      <Box
        key={key}
        sx={{
          borderLeft: "4px solid",
          borderColor: "divider",
          pl: 1.5,
          py: 0.5,
          color: "text.secondary",
        }}
      >
        {/* 引用块内部是**完整的块级语法**（可以有段落、列表、甚至嵌套引用）⇒ 递归渲染 */}
        <Stack spacing={1}>
          {block.blocks.map((inner, innerIndex) => renderBlock(inner, innerIndex))}
        </Stack>
      </Box>
    );
  }
  if (block.kind === "table") {
    const cellSx = (align: MarkdownTableCell["align"]) => ({
      border: "1px solid",
      borderColor: "divider",
      px: 1,
      py: 0.5,
      textAlign: align ?? "left",
      wordBreak: "break-word",
    });
    return (
      // 窄屏（移动端）表格**横向滚动**，不撑破弹窗宽度
      <Box key={key} sx={{ overflowX: "auto", maxWidth: "100%" }}>
        <Box
          component="table"
          sx={{ borderCollapse: "collapse", width: "100%", fontSize: "0.875rem" }}
        >
          <Box component="thead">
            <Box component="tr">
              {block.header.map((cell, cellIndex) => (
                <Box
                  key={`${key}-th-${cellIndex}`}
                  component="th"
                  sx={{ ...cellSx(cell.align), bgcolor: "action.hover", fontWeight: 600 }}
                >
                  {oneLine(cell.text, `${key}-th-${cellIndex}`)}
                </Box>
              ))}
            </Box>
          </Box>
          <Box component="tbody">
            {block.rows.map((row, rowIndex) => (
              <Box key={`${key}-tr-${rowIndex}`} component="tr">
                {row.map((cell, cellIndex) => (
                  <Box
                    key={`${key}-td-${rowIndex}-${cellIndex}`}
                    component="td"
                    sx={cellSx(cell.align)}
                  >
                    {oneLine(cell.text, `${key}-td-${rowIndex}-${cellIndex}`)}
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    );
  }
  if (block.kind === "hr") {
    return (
      <Box key={key} component="hr" sx={{ border: 0, borderTop: "1px solid", borderColor: "divider" }} />
    );
  }
  // paragraph
  return (
    <Typography key={key} variant="body1" component="p" sx={{ m: 0, wordBreak: "break-word" }}>
      {paragraphLines(block.lines, key)}
    </Typography>
  );
}

/**
 * 渲染受限 Markdown。**只产 React 节点**，不产生 HTML 字符串 —— 所以正文里写 `<script>`
 * 只会显示成一串字，不会被解析成元素。
 *
 * 块之间统一 8dp 间距（MD2 栅格；第一块不留上边距）。
 */
export function Markdown({ source }: { source: string }): ReactElement {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <Stack spacing={1} data-testid="notice-body">
      {blocks.map((block, index) => renderBlock(block, index))}
    </Stack>
  );
}
