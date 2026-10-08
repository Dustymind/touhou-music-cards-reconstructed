/** `src/vendor/marked/marked.esm.js` 的类型声明（**手写的最小子集**）。
 *
 * 为什么不带上游的 `lib/marked.d.ts`（28KB 全量类型）：
 *
 * 1. 我们**只用 `Lexer` 一个导出**，全量类型里 90% 是 `Parser` / `Renderer` / `Hooks` / 选项 ——
 *    带进来既是噪音，也会让人误以为"那些 API 也能用"（**不能**，用了就绕过了我们的安全边界）。
 * 2. 上游类型里有不少可选/泛型参数，直接透出来会让调用处需要一堆无谓的收窄。
 *
 * ⚠️ 所以这里**故意只声明 `Lexer` 与 `Token`**。要加别的导出之前先读
 * `src/vendor/marked/PROVENANCE.md` 与 `src/ui/markdown.tsx` 开头的说明 ——
 * 特别是**别把 `Parser` / `Renderer` / `parse` 加进来**（它们产出 HTML 字符串，正是我们避开的）。
 *
 * 类型与上游 v18.1.0 的 `lib/marked.d.ts` 对齐（只取本仓库用到的字段）。
 */

/** token 的公共字段。`raw` 是它在源码里的原文切片。 */
interface TokenBase {
  type: string;
  raw: string;
}

/** 具体 token（字段与上游 `Tokens.*` 一致，只保留本仓库读得到的）。 */
export type Token =
  | (TokenBase & { type: "space" })
  | (TokenBase & { type: "heading"; depth: number; text: string; tokens: TagToken[] })
  | (TokenBase & { type: "paragraph"; text: string; tokens: TagToken[] })
  | (TokenBase & { type: "text"; text: string; tokens?: Token[] })
  | (TokenBase & { type: "strong"; text: string; tokens: TagToken[] })
  | (TokenBase & { type: "em"; text: string; tokens: TagToken[] })
  | (TokenBase & { type: "del"; text: string; tokens: TagToken[] })
  | (TokenBase & { type: "codespan"; text: string })
  | (TokenBase & { type: "escape"; text: string })
  | (TokenBase & { type: "br" })
  | (TokenBase & { type: "link"; href: string; title?: string | null; text: string; tokens: TagToken[] })
  | (TokenBase & { type: "image"; href: string; title: string | null; text: string; tokens: TagToken[] })
  | (TokenBase & { type: "list"; ordered: boolean; start: number | ""; loose: boolean; items: ListItemToken[] })
  | (TokenBase & { type: "code"; text: string; lang?: string })
  | (TokenBase & { type: "blockquote"; text: string; tokens: TagToken[] })
  | (TokenBase & { type: "html"; text: string; block: boolean; pre: boolean })
  | (TokenBase & { type: "hr" })
  | (TokenBase & {
      type: "table";
      header: TableCellToken[];
      align: Array<"center" | "left" | "right" | null>;
      rows: TableCellToken[][];
    })
  | (TokenBase & { type: "def"; tag: string; href: string; title: string });
// ⚠️ 这里**故意不加**「兜底成员」（形如 `TokenBase & { type: string; [key: string]: unknown }`）：
// 那种成员能匹配**任何**对象 ⇒ TS 会把整个联合的判别（`switch (token.type)` 的收窄）打散，
// 于是 `token.depth` 之类的字段全变成 `unknown`（实测：加了它，markdown.tsx 报 12 个类型错）。
// 上游若新增 token 类型，`switch` 的 `default` 分支本来就会兜住它（运行时走"没分支 ⇒ 纯文本"），
// **不需要类型层再开一个口子**。

/**
 * 行内 token（`Lexer.lexInline` 的产出，也会出现在各 token 的 `tokens` 字段里）。
 *
 * ⚠️ 与上面的 `Token` 是**两个联合**：`checkbox` / `list_item` 这类只出现在行内/列表内部，
 * 不会出现在**顶层**块列表里，所以不能塞进 `Token`（塞了 `switch (token.type)` 会报
 * `Type '"checkbox"' is not comparable to …`）。`Tags` 也照上游原样给一份。
 */
export type TagToken =
  | (TokenBase & { type: "text"; text: string; tokens?: Token[] })
  | (TokenBase & { type: "strong"; text: string; tokens: TagToken[] })
  | (TokenBase & { type: "em"; text: string; tokens: TagToken[] })
  | (TokenBase & { type: "del"; text: string; tokens: TagToken[] })
  | (TokenBase & { type: "codespan"; text: string })
  | (TokenBase & { type: "escape"; text: string })
  | (TokenBase & { type: "br" })
  | (TokenBase & { type: "link"; href: string; title?: string | null; text: string; tokens: TagToken[] })
  | (TokenBase & { type: "image"; href: string; title: string | null; text: string; tokens: TagToken[] })
  | (TokenBase & { type: "html"; text: string; block: boolean; pre: boolean })
  | (TokenBase & { type: "checkbox"; checked: boolean });

/** GFM 表格单元格。`align` 在单元格上也会出现（上游的 `Tokens.TableCell`）。 */
export interface TableCellToken {
  text: string;
  header: boolean;
  align: "center" | "left" | "right" | null;
  tokens?: Token[];
}

export interface ListItemToken extends TokenBase {
  type: "list_item";
  task: boolean;
  checked?: boolean;
  loose: boolean;
  text: string;
  tokens: TagToken[];
}

/** token 列表（上游还挂了 `links` 之类的元数据；我们用不到）。 */
export type TokensList = Token[];

/** 词法分析器。**只暴露 `lex` / `lexInline`** —— 刻意不暴露 `Parser`。 */
export declare class Lexer {
  /** 块级：Markdown 源码 → 块 token 列表。 */
  static lex(src: string, options?: Record<string, unknown>): TokensList;
  /** 行内：一行文字 → 行内 token 列表。 */
  static lexInline(src: string, options?: Record<string, unknown>): TagToken[];
}
