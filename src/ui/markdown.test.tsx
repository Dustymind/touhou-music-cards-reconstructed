/** 受限 Markdown 渲染器：支持的语法逐条钉住，**不支持的一律按纯文本**（尤其 HTML 不能变成元素）。
 *
 * 这里测的是"渲染出来什么"，所以走真实 DOM（vitest 浏览器模式）。
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeProvider } from "@mui/material/styles";

import { buildTheme } from "../theme/theme";
import { Markdown, parseMarkdown, renderInline } from "./markdown";

let root: Root | null = null;

/** 挂一个 `Markdown`，返回宿主元素。 */
async function render(source: string): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <ThemeProvider theme={buildTheme()}>
        <Markdown source={source} />
      </ThemeProvider>,
    );
  });
  return container;
}

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  document.body.innerHTML = "";
});

/** 正文块（`data-testid="notice-body"`）里所有文字（去掉首尾空白）。 */
const body = (container: HTMLElement): HTMLElement => container.querySelector('[data-testid="notice-body"]')!;

describe("parseMarkdown：切块", () => {
  it("空行分隔的段落各成一块", () => {
    const blocks = parseMarkdown("第一段\n\n第二段");
    expect(blocks).toEqual([
      { kind: "paragraph", lines: ["第一段"] },
      { kind: "paragraph", lines: ["第二段"] },
    ]);
  });

  it("单个换行不断段（同一段落里的两行）", () => {
    const blocks = parseMarkdown("第一行\n第二行");
    expect(blocks).toEqual([{ kind: "paragraph", lines: ["第一行", "第二行"] }]);
  });

  it("## / ### 是标题；# 一级降级成二级（`level: 2`）", () => {
    expect(parseMarkdown("## 二级")).toEqual([{ kind: "heading", level: 2, text: "二级" }]);
    expect(parseMarkdown("### 三级")).toEqual([{ kind: "heading", level: 3, text: "三级" }]);
    expect(parseMarkdown("# 一级")).toEqual([{ kind: "heading", level: 2, text: "一级" }]);
  });

  it("连续的 - / * 行合成一个无序列表；连续 1. 2. 行合成一个有序列表", () => {
    expect(parseMarkdown("- 甲\n- 乙")).toEqual([
      { kind: "list", ordered: false, items: ["甲", "乙"] },
    ]);
    expect(parseMarkdown("1. 甲\n2. 乙")).toEqual([
      { kind: "list", ordered: true, items: ["甲", "乙"] },
    ]);
    // 中间夹空行 = 两个列表（不合并）
    expect(parseMarkdown("- 甲\n\n- 乙")).toHaveLength(2);
    // 有序与无序相邻也不合并
    expect(parseMarkdown("1. 甲\n- 乙")).toHaveLength(2);
  });

  it("HTML 注释整段丢弃（含跨行）；注释独占一行时它两侧自然断成两块", () => {
    // 注释整行删掉后剩 `前\n\n后` ⇒ 两个段落（这与 Markdown 里"HTML 块独占一行"的行为一致）
    expect(parseMarkdown("前\n<!-- 藏起来\n还藏 -->\n后")).toEqual([
      { kind: "paragraph", lines: ["前"] },
      { kind: "paragraph", lines: ["后"] },
    ]);
    // 夹在文字里（不独占一行）⇒ 只把注释本身删掉，两边的字接上
    expect(parseMarkdown("甲<!-- 一段 -->乙")).toEqual([{ kind: "paragraph", lines: ["甲乙"] }]);
  });
});

describe("renderInline：行内标记", () => {
  const html = (text: string): string => {
    const container = document.createElement("div");
    const root2 = createRoot(container);
    // 同步渲染：`renderInline` 是纯函数，用 `act` 包一下即可
    act(() => { root2.render(<ThemeProvider theme={buildTheme()}>{renderInline(text, "t")}</ThemeProvider>); });
    const out = container.innerHTML;
    act(() => { root2.unmount(); });
    return out;
  };

  it("**粗体** / *斜体* / `行内代码` 各自成元素", () => {
    expect(html("**粗**")).toContain("<strong");
    expect(html("*斜*")).toContain("<em");
    expect(html("`码`")).toContain("<code");
  });

  it("链接：http/https 才是可点的 `<a>`，且新标签页 + rel", () => {
    const out = html("[点我](https://example.com/x)");
    expect(out).toContain('href="https://example.com/x"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain("noreferrer");
  });

  it("**非 http(s) 的地址按纯文本** —— 不给可点的空链接（`javascript:` 尤其）", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "/relative/path", "ftp://example.com"]) {
      const out = html(`[点我](${bad})`);
      expect(out, bad).not.toContain("<a");
    }
  });

  it("未闭合的 `**` 不崩，按字面渲染", () => {
    expect(html("**没闭合")).toContain("**没闭合");
  });
});

describe("Markdown：渲染", () => {
  it("标题 / 段落 / 列表都渲染出来，且文字都在", async () => {
    const container = await render(["## 标题", "", "一段话", "", "- 甲", "- 乙"].join("\n"));
    const text = body(container).textContent ?? "";
    expect(text).toContain("标题");
    expect(text).toContain("一段话");
    expect(text).toContain("甲");
    expect(text).toContain("乙");
    // 段落是 <p>、列表是 <ul>/<li>
    expect(body(container).querySelector("p")).not.toBeNull();
    expect(body(container).querySelectorAll("li")).toHaveLength(2);
  });

  it("有序列表渲染成 <ol>（数字由浏览器编，不写死在文字里）", async () => {
    const container = await render("1. 甲\n2. 乙");
    expect(body(container).querySelector("ol")).not.toBeNull();
    expect(body(container).querySelectorAll("li")).toHaveLength(2);
  });

  it("链接渲染成新标签页的 `<a>`", async () => {
    const container = await render("[源码](https://github.com/Dustymind/x)");
    const anchor = body(container).querySelector("a")!;
    expect(anchor.getAttribute("href")).toBe("https://github.com/Dustymind/x");
    expect(anchor.getAttribute("target")).toBe("_blank");
  });

  it("**原始 HTML 不会变成元素**（XSS 断言）：`<script>` 只以纯文本出现", async () => {
    const container = await render("<script>alert(1)</script>");
    expect(body(container).querySelector("script")).toBeNull();
    expect(body(container).textContent).toContain("<script>alert(1)</script>");
  });

  it("**全程不用 `dangerouslySetInnerHTML`**：正文里的 `<b>` 也不是元素", async () => {
    const container = await render("看这个 <b>粗</b> 标签");
    expect(body(container).querySelector("b")).toBeNull();
    expect(body(container).textContent).toContain("<b>粗</b>");
  });

  it("行尾两个空格 = 硬换行（`<br/>`）", async () => {
    const container = await render("上  \n下");
    const paragraph = body(container).querySelector("p")!;
    expect(paragraph.querySelector("br")).not.toBeNull();
    expect(paragraph.textContent).toContain("上");
    expect(paragraph.textContent).toContain("下");
  });

  it("普通换行不产生 `<br/>`（Markdown 的软换行）", async () => {
    const container = await render("上\n下");
    expect(body(container).querySelector("p")!.querySelector("br")).toBeNull();
  });

  it("注释不显示出来", async () => {
    const container = await render("看得见\n<!-- 看不见 -->");
    expect(body(container).textContent).toContain("看得见");
    expect(body(container).textContent).not.toContain("看不见");
  });
});
