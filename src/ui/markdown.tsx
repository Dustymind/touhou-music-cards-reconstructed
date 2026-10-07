/** 受限 Markdown 渲染器（**零依赖**）。
 *
 * 为什么自己写而不用 `marked` / `react-markdown`：
 *
 * 1. **许可**：本仓库是 REUSE 聚合仓，`REUSE.toml` 逐路径声明许可、**没有**单一 SPDX 表达式。
 *    引一个 npm 运行时依赖 = 新许可进生产闭包 ⇒ `scripts/gen-notices.mjs` 的产出变 ⇒
 *    `pnpm gate` 的 `--check` 红。为一个"公告弹窗"动许可表不划算（见 `DECISIONS.md` D182）。
 * 2. **安全**：`marked` 一类要配 sanitizer，配错就出 XSS；本渲染器**只产 React 节点**、
 *    **从不碰 `dangerouslySetInnerHTML`**，正文里的 `<script>` 只是一串纯文本 ⇒ XSS 面为零。
 * 3. **够用**：公告是**仓库内静态内容**（不是用户输入），下面的子集完全够写。
 *
 * ---- 支持的语法（刻意只到这个程度）----
 *
 * | 语法 | 写法 |
 * |---|---|
 * | 二级 / 三级标题 | `## 标题` / `### 标题`（`#` 一级降级成二级，免得和弹窗标题打架） |
 * | 段落 | 空行分隔 |
 * | 无序列表 | 行首 `- ` 或 `* ` |
 * | 有序列表 | 行首 `1. ` `2. ` …（数字只用来判定"这是有序列表"，渲染时按顺序自己编） |
 * | 粗体 | `**文字**` |
 * | 斜体 | `*文字*` |
 * | 行内代码 | `` `code` `` |
 * | 链接 | `[文字](https://…)` —— **只认 `http` / `https`**，其余按纯文本 |
 * | 硬换行 | 行尾两个空格 |
 *
 * **不支持**（写了会原样显示，不会出错）：图片、表格、引用块、脚注、自动链接、原始 HTML。
 * `<!-- … -->` 注释**整段丢弃**（给"临时屏蔽一段"用）。
 */
import { useMemo, type ReactElement, type ReactNode } from "react";

import { Box, Link, Stack, Typography } from "@mui/material";

/** 一个解析出来的块级元素。`parseMarkdown` 的输出（暴露出来是为了能逐块单测）。 */
export type MarkdownBlock =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "paragraph"; lines: string[] }
  | { kind: "list"; ordered: boolean; items: string[] };

/** 标题匹配：`## ` 二级、`### ` 三级；一级 `# ` 也认，但**降级渲染成二级**。 */
const HEADING_RE = /^(#{1,3})\s+(.*)$/;
/** 无序列表项：`- ` / `* ` / `+ `（`+` 顺手支持，成本为零）。 */
const BULLET_RE = /^[-*+]\s+(.*)$/;
/** 有序列表项：`1. ` `12) ` 之类；数字本身不参与渲染。 */
const ORDERED_RE = /^\d+[.)]\s+(.*)$/;

/**
 * 把 Markdown 源码切成块。**先把 `<!-- … -->` 整段删掉**（含跨行的），再逐块识别。
 *
 * 识别顺序就是"优先级"：标题 → 无序列表 → 有序列表 → 段落。
 * 连续同类列表项合成**一个**列表块；段落之间的空行是分隔符。
 */
export function parseMarkdown(source: string): MarkdownBlock[] {
  // HTML 注释整段丢弃（跨行用 [\s\S]，`<!--` 里出现 `-->` 就结束）
  const withoutComments = source.replace(/<!--[\s\S]*?-->/g, "");
  const lines = withoutComments.split(/\r?\n/);

  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  /** 上一行是不是"空行"：空行会把列表截断（`- 甲` 空行 `- 乙` 是**两个**列表）。 */
  let afterBlank = true;

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", lines: paragraph });
      paragraph = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "") {
      flushParagraph();
      afterBlank = true;
      continue;
    }

    const heading = HEADING_RE.exec(trimmed);
    if (heading) {
      flushParagraph();
      // `#` 与 `##` 都渲染成 2 级（弹窗自己的标题已经是 DialogTitle 了，正文不需要更大的）
      blocks.push({ kind: "heading", level: heading[1]!.length >= 3 ? 3 : 2, text: heading[2]!.trim() });
      afterBlank = true;
      continue;
    }

    // 空行之后的列表项**另起一个列表**（`afterBlank` 为真时不许并进上一块）
    const last = afterBlank ? null : blocks[blocks.length - 1];

    const bullet = BULLET_RE.exec(trimmed);
    if (bullet) {
      flushParagraph();
      if (last?.kind === "list" && !last.ordered) last.items.push(bullet[1]!.trim());
      else blocks.push({ kind: "list", ordered: false, items: [bullet[1]!.trim()] });
      afterBlank = false;
      continue;
    }

    const ordered = ORDERED_RE.exec(trimmed);
    if (ordered) {
      flushParagraph();
      if (last?.kind === "list" && last.ordered) last.items.push(ordered[1]!.trim());
      else blocks.push({ kind: "list", ordered: true, items: [ordered[1]!.trim()] });
      afterBlank = false;
      continue;
    }

    paragraph.push(line);
    afterBlank = false;
  }

  flushParagraph();
  return blocks;
}

/** 行内标记的匹配优先级：**行内代码最先**（它的内容不再解析别的标记）。 */
const INLINE_RE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)\s]+\))/g;
/** `[文字](地址)`。 */
const LINK_RE = /^\[([^\]]+)\]\(([^)\s]+)\)$/;

/**
 * 把一行文字切成 React 节点序列：行内代码 / 粗体 / 斜体 / 链接 / 纯文本。
 *
 * **链接只认 `http` / `https`**（用 `new URL` 判协议）—— 其他一律**按纯文本渲染**，
 * 所以 `[点我](javascript:alert(1))` 只会显示成一行普通文字，不会有可点的 `<a>`。
 */
export function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let index = 0;

  for (const match of text.matchAll(INLINE_RE)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(text.slice(cursor, start));

    const token = match[0];
    const key = `${keyPrefix}-${index}`;
    index += 1;

    if (token.startsWith("`")) {
      nodes.push(
        <Box
          key={key}
          component="code"
          sx={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "0.92em",
            px: 0.5,
            borderRadius: 0.5,
            backgroundColor: "action.hover",
          }}
        >
          {token.slice(1, -1)}
        </Box>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(<Box key={key} component="strong" sx={{ fontWeight: 600 }}>{token.slice(2, -2)}</Box>);
    } else if (token.startsWith("*")) {
      nodes.push(<Box key={key} component="em">{token.slice(1, -1)}</Box>);
    } else {
      const link = LINK_RE.exec(token);
      const href = link?.[2] ?? "";
      // 只认 http(s)：其余（javascript: / data: / 相对地址）按纯文本渲染，不给 `<a>`
      if (link && /^https?:$/i.test(safeProtocol(href))) {
        nodes.push(
          <Link key={key} href={href} target="_blank" rel="noreferrer noopener" color="primary">
            {link[1]}
          </Link>,
        );
      } else {
        nodes.push(token);
      }
    }

    cursor = start + token.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes.length > 0 ? nodes : [text];
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
 * 行内代码里的空格不会被误判 —— 那种情况整段已被 `` ` `` 包住，走的是代码分支。
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
      <Typography key={key} variant={block.level === 2 ? "subtitle1" : "subtitle2"} sx={{ fontWeight: 600, mt: index === 0 ? 0 : 1 }}>
        {renderInline(block.text, key)}
      </Typography>
    );
  }
  if (block.kind === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <Box
        key={key}
        component={ListTag}
        sx={{ m: 0, pl: 3, "& li": { mb: 0.5, "&:last-of-type": { mb: 0 } } }}
      >
        {block.items.map((item, itemIndex) => (
          <li key={`${key}-item-${itemIndex}`}>
            {/* `list-style` 交给浏览器，这里只保证行内标记能渲染 */}
            <Typography variant="body1" component="span" sx={{ display: "inline" }}>
              {oneLine(item, `${key}-item-${itemIndex}`)}
            </Typography>
          </li>
        ))}
      </Box>
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
