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
    // 有序与无序相邻 = 两个列表（类型不同，不合并）
    expect(parseMarkdown("1. 甲\n- 乙")).toHaveLength(2);
  });

  it("夹空行的列表在 CommonMark 里是**同一个**列表（`loose`）—— D189 起跟随规范", () => {
    // ⚠️ 这条**在 D189 换了断言**，不是回归：
    //   - D182 手写版把 `- 甲\n\n- 乙` 切成**两个**列表；
    //   - 换成 `marked`（CommonMark 实现）后是**一个** `loose` 列表、两项 —— 这是**规范行为**。
    // D189 明确选了"解析交给权威实现、行为跟随它"，所以这里改断言而不是给解析器打补丁
    // （打补丁 = 在权威实现外面叠一层自己的怪规则，正是这次要摆脱的东西）。
    // 外观上没差别：都渲染成同一个 `<ul>` 里的两个 `<li>`。
    expect(parseMarkdown("- 甲\n\n- 乙")).toEqual([{ kind: "list", ordered: false, items: ["甲", "乙"] }]);
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

  // ---- D189 新增的块级语法 ----

  it("围栏代码块 → `code` 块（保留语言与空白）", () => {
    expect(parseMarkdown("```js\nconst a = 1;\n  indented();\n```")).toEqual([
      { kind: "code", language: "js", text: "const a = 1;\n  indented();" },
    ]);
    // 不带语言也要能解析
    expect(parseMarkdown("```\n裸代码\n```")).toEqual([
      { kind: "code", language: "", text: "裸代码" },
    ]);
  });

  it("引用块 → `blockquote`，内部**递归**成块（列表不会被拍平）", () => {
    expect(parseMarkdown("> 引用一句")).toEqual([
      { kind: "blockquote", blocks: [{ kind: "paragraph", lines: ["引用一句"] }] },
    ]);
    expect(parseMarkdown("> - 甲\n> - 乙")).toEqual([
      { kind: "blockquote", blocks: [{ kind: "list", ordered: false, items: ["甲", "乙"] }] },
    ]);
  });

  it("GFM 表格 → `table`，单元格带上 `:--:` 给的对齐", () => {
    expect(parseMarkdown("| 左 | 中 | 右 |\n| :-- | :-: | --: |\n| a | b | c |")).toEqual([
      {
        kind: "table",
        header: [
          { text: "左", header: true, align: "left" },
          { text: "中", header: true, align: "center" },
          { text: "右", header: true, align: "right" },
        ],
        rows: [
          [
            { text: "a", header: false, align: "left" },
            { text: "b", header: false, align: "center" },
            { text: "c", header: false, align: "right" },
          ],
        ],
      },
    ]);
  });

  it("水平线 → `hr`（--- / *** / ___ 都认）", () => {
    expect(parseMarkdown("甲\n\n---\n\n乙")).toEqual([
      { kind: "paragraph", lines: ["甲"] },
      { kind: "hr" },
      { kind: "paragraph", lines: ["乙"] },
    ]);
    expect(parseMarkdown("***")).toEqual([{ kind: "hr" }]);
    expect(parseMarkdown("___")).toEqual([{ kind: "hr" }]);
  });

  it("任务列表 → `list` + `tasks` 数组；普通项**绝不带复选框**", () => {
    expect(parseMarkdown("- [ ] 待办\n- [x] 已办")).toEqual([
      { kind: "list", ordered: false, items: ["待办", "已办"], tasks: [false, true] },
    ]);
    // 普通列表**没有** `tasks` 字段（渲染层据此决定要不要画框）
    expect(parseMarkdown("- 甲\n- 乙")).toEqual([
      { kind: "list", ordered: false, items: ["甲", "乙"] },
    ]);
  });

  it("普通列表与任务列表**相邻时会被 marked 合成一个 token**，这里按项切回两块", () => {
    // ⚠️ 这是实测出来的一个坑：`- 甲\n- 乙\n\n- [ ] 待办\n- [x] 已办` 在 CommonMark 里是
    // **一个** 4 项的 `list`（前两项 `task: false`）。照单全收的话，"任务列表"分支会把
    // 4 项**全都**画上复选框 —— 连 `- 甲` 也长出空框，外观明显不对。
    // ⇒ 解析层按 `task` 切成连续段，普通段不带 `tasks`、任务段才带。
    expect(parseMarkdown("- 甲\n- 乙\n\n- [ ] 待办\n- [x] 已办")).toEqual([
      { kind: "list", ordered: false, items: ["甲", "乙"] },
      { kind: "list", ordered: false, items: ["待办", "已办"], tasks: [false, true] },
    ]);
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

  it("~~删除线~~ 渲染成 `<del>`（D189 新支持）", () => {
    expect(html("~~删~~")).toContain("<del");
  });

  it("图片：`https:` 才渲染 `<img>`，且带 `alt` 与 `loading=\"lazy\"`（D189 新支持）", () => {
    const out = html("![替代文字](https://example.com/i.png)");
    expect(out).toContain("<img");
    expect(out).toContain('alt="替代文字"');
    expect(out).toContain('loading="lazy"');
  });

  it("**图片的 `src` 与链接走同一套白名单** —— `javascript:` / `data:` / 相对地址都不是 `<img>`", () => {
    // ⚠️ 这条是**安全边界**：`marked` 自己不过滤（探针实测它照给 `javascript:` 的 href）。
    // 图片比链接更隐蔽的地方在于"看起来不像能执行的东西"，但它是远程请求 ⇒ 也是隐私信标。
    for (const bad of ["javascript:alert(1)", "data:image/png;base64,AAAA", "/local.png"]) {
      const out = html(`![x](${bad})`);
      expect(out, bad).not.toContain("<img");
      // 被拒后**原样显示**成文字，免得用户看不出被拦了
      expect(out, bad).toContain("![x]");
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

  // ---- D189 新增语法的渲染 ----

  it("代码块渲染成 `<pre><code>`，且**空白原样保留**", async () => {
    const container = await render("```js\nconst a = 1;\n  indented();\n```");
    const pre = body(container).querySelector("pre")!;
    expect(pre).not.toBeNull();
    expect(pre.querySelector("code")).not.toBeNull();
    // 缩进与换行都得在（`<pre>` 的意义就在这里）
    expect(pre.textContent).toBe("const a = 1;\n  indented();");
  });

  it("引用块渲染成带左边框的容器，内部块**照常渲染**（列表仍是 `<ul>`）", async () => {
    const container = await render("> 引用一句\n>\n> - 甲\n> - 乙");
    // 引用块本身不是一个语义化 `<blockquote>`（我们用 Box 画的样式），断言内容与列表结构
    expect(body(container).textContent).toContain("引用一句");
    const list = body(container).querySelector("ul")!;
    expect(list).not.toBeNull();
    expect(list.querySelectorAll("li")).toHaveLength(2);
  });

  it("表格渲染成真 `<table>`：表头进 `<th>`、数据进 `<td>`，对齐跟 `:--:`", async () => {
    const container = await render("| 左 | 中 |\n| :-- | :-: |\n| a | b |");
    const table = body(container).querySelector("table")!;
    expect(table).not.toBeNull();
    const ths = Array.from(table.querySelectorAll("th"));
    expect(ths.map((th) => th.textContent)).toEqual(["左", "中"]);
    const tds = Array.from(table.querySelectorAll("td"));
    expect(tds.map((td) => td.textContent)).toEqual(["a", "b"]);
    // 对齐：MUI/Emotion 打在 **CSS 类**上（不是行内 style），所以查计算样式
    expect(getComputedStyle(ths[0]!).textAlign).toBe("left");
    expect(getComputedStyle(ths[1]!).textAlign).toBe("center");
  });

  it("水平线渲染成 `<hr>`", async () => {
    const container = await render("甲\n\n---\n\n乙");
    expect(body(container).querySelector("hr")).not.toBeNull();
  });

  it("任务列表：只读复选框 + 勾上的加删除线；**普通列表一个框都不画**", async () => {
    const container = await render("- [ ] 待办\n- [x] 已办");
    const boxes = body(container).querySelectorAll('input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    // 只读：`disabled`（公告里的任务项没有交互语义）
    expect((boxes[0] as HTMLInputElement).disabled).toBe(true);
    expect((boxes[0] as HTMLInputElement).checked).toBe(false);
    expect((boxes[1] as HTMLInputElement).checked).toBe(true);

    const plain = await render("- 甲\n- 乙");
    expect(plain.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  });

  it("普通列表与任务列表相邻 ⇒ 渲染成**两个**列表，普通那个不带框", async () => {
    const container = await render("- 甲\n- 乙\n\n- [ ] 待办\n- [x] 已办");
    const lists = Array.from(body(container).querySelectorAll("ul"));
    expect(lists).toHaveLength(2);
    expect(lists[0]!.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(lists[1]!.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
  });
});
