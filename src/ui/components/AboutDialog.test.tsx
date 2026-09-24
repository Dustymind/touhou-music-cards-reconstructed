/** 「关于」弹窗：MD2 对话框规格 + 内容真源的每一行 + 三种关闭方式 + 白字规则。
 *
 * **文字全部来自 `src/content/about.ts`**（连标题与关闭按钮都在那里），所以这里的断言
 * 一律**跟着内容真源走**（改人名、改标签都不会让用例假红），只钉"结构"与"规格"。
 * 只有"没有链接的行"这种需要**别的行组合**的用例，才通过 `content` 口子塞一份临时内容。
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ThemeProvider } from "@mui/material/styles";

import { aboutContent, type AboutContent, type AboutEntryRow } from "../../content/about";
import { localized, type Locale } from "../../i18n/localization";
import { useSession } from "../../store/session";
import { buildTheme, MD2, Palette } from "../../theme/theme";
import { AboutDialog } from "./AboutDialog";

let root: Root | null = null;

/** 挂一个受控弹窗，并把 `onClose` 记下来（用来验"各种关闭方式"都接到同一个回调上）。 */
async function render(
  open = true,
  content: AboutContent = aboutContent,
  packAuthors: string[] = [],
): Promise<{ container: HTMLElement; closes: () => number }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  let closes = 0;
  await act(async () => {
    // 套上**应用的主题**（`App.tsx` 就是这么包的）：不套的话 `color="inherit"` 会落到 MUI 的
    // 浅色默认主题上，"白字"这类断言就测不出真实结果（实测踩到：量出 rgba(0,0,0,0.87)）
    root!.render(
      <ThemeProvider theme={buildTheme()}>
        <AboutDialog
          open={open}
          onClose={() => { closes += 1; }}
          content={content}
          packAuthors={packAuthors}
        />
      </ThemeProvider>,
    );
  });
  return { container, closes: () => closes };
}

/** 弹窗挂在 portal 里（不在 container 内），所以从 body 上找。 */
const dialog = (): HTMLElement | null => document.querySelector('[data-testid="about-dialog"]');
const backdrop = (): HTMLElement | null => document.querySelector(".MuiBackdrop-root");
const paper = (): HTMLElement => document.querySelector(".MuiDialog-paper")!;
const closeButton = (): HTMLElement => document.querySelector('[data-testid="about-close"]')!;
const row = (index: number): HTMLElement => document.querySelector(`[data-testid="about-row-${index}"]`)!;
/** 一行里的内容（`caption` 是标签，`body1` 是内容 —— 内容可能是链接，也可能是白色纯文字）。 */
const rowValue = (index: number): HTMLElement => row(index).querySelector(".MuiTypography-body1")!;

/** 十六进制 → 浏览器算出来的 `rgb(...)`（用来比对 `getComputedStyle` 的颜色）。 */
function rgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

/** 内容真源里的**普通行**（自动行的内容不在内容真源里）。 */
function entryRows(content: AboutContent = aboutContent): AboutEntryRow[] {
  return content.rows.filter((row): row is AboutEntryRow => !("auto" in row));
}

/** 当前语言下弹窗应有的全部文字（直接按内容真源算，不写死）。 */
function expectedTexts(locale: Locale, content: AboutContent = aboutContent): string[] {
  return [
    localized(content.title, locale),
    localized(content.close, locale),
    ...entryRows(content).flatMap((entry) => [
      ...(entry.label === undefined ? [] : [localized(entry.label, locale)]),
      entry.name,
    ]),
  ];
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(async () => {
  await act(async () => { useSession.getState().setLocale("en"); });
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  document.body.innerHTML = "";
  await act(async () => { useSession.getState().setLocale("en"); });
});

describe("AboutDialog", () => {
  it("打开时把内容真源里的每一个字都渲染出来（标题、每行标签与内容、关闭按钮）", async () => {
    await render(true);
    const text = dialog()?.textContent ?? "";
    for (const expected of expectedTexts("en")) expect(text).toContain(expected);
  });

  it("行数与顺序 = `rows` 数组（加一行就会多一行）", async () => {
    await render(true);
    // 自动行在默认内容里没有名字（要靠 packAuthors 传进来），所以这里只数普通行
    const rows = [...dialog()!.querySelectorAll('[data-testid^="about-row-"]')];
    expect(rows).toHaveLength(entryRows().length);
    entryRows().forEach((entry) => {
      const at = `about-row-${aboutContent.rows.indexOf(entry)}`;
      const element = dialog()!.querySelector(`[data-testid="${at}"]`)!;
      expect(element.textContent).toContain(entry.name);
      if (entry.label !== undefined) expect(element.textContent).toContain(localized(entry.label, "en"));
    });
    // 关闭按钮也在（MD2 操作区在底部）
    expect(dialog()!.querySelector('[data-testid="about-close"]')).not.toBeNull();
  });

  it("内容里只写一行时页面上也只有一行（组件完全跟着数组走）", async () => {
    await render(true, {
      title: { en: "T", zh: "标" },
      close: { en: "C", zh: "关" },
      rows: [{ label: { en: "L", zh: "签" }, name: "N" }],
    });
    expect(dialog()!.querySelectorAll('[data-testid^="about-row-"]')).toHaveLength(1);
    expect(dialog()!.textContent).toContain("N");
  });

  it("有地址的行是链接：新标签页打开、带 rel=noreferrer", async () => {
    await render(true);
    const anchors = [...dialog()!.querySelectorAll("a[href]")];
    const urls = new Set(anchors.map((anchor) => anchor.getAttribute("href")));

    for (const entry of entryRows(aboutContent)) {
      if ((entry.url ?? "") === "") continue;
      expect(urls.has(entry.url!), entry.url).toBe(true);
    }
    for (const anchor of anchors) {
      expect(anchor.getAttribute("target")).toBe("_blank");
      expect(anchor.getAttribute("rel") ?? "").toContain("noreferrer");
    }
  });

  it("没有链接的行：白色纯文字，页面上**不出现空链接**（不写 url / 空串 / 空白 都算）", async () => {
    await render(true, {
      title: { en: "T", zh: "标" },
      close: { en: "C", zh: "关" },
      rows: [
        { label: { en: "No url", zh: "不写" }, name: "没有地址一行" },                    // ① 不写 url
        { label: { en: "Empty", zh: "空串" }, name: "空串一行", url: "" },                 // ② 空串
        { label: { en: "Blank", zh: "空白" }, name: "空白一行", url: "   " },              // ③ 只有空白
        { label: { en: "Linked", zh: "有地址" }, name: "有地址一行", url: "https://example.com/" },
      ],
    });

    // ① 没有链接的三行：没有 `<a>`，文字是白色正文色（onSurface 100%）
    for (const index of [0, 1, 2]) {
      expect(rowValue(index).querySelector("a"), `第 ${index} 行不该有链接元素`).toBeNull();
      expect(getComputedStyle(rowValue(index)).color, `第 ${index} 行不是白字`).toBe("rgb(255, 255, 255)");
    }
    // ② 有地址的那一行仍然是主色链接
    const link = rowValue(3).querySelector("a")!;
    expect(link.getAttribute("href")).toBe("https://example.com/");
    expect(getComputedStyle(link).color).toBe(rgb(Palette.primary));

    // ③ 整张弹窗里只有一个链接元素 —— 绝不渲染 `href` 为空的 `<a>`
    const anchors = [...dialog()!.querySelectorAll("a")];
    expect(anchors).toHaveLength(1);
    expect(anchors[0]!.getAttribute("href")).toBe("https://example.com/");
  });

  it("不写 label 的行是**单行行**：连标签元素都不挂，且比两行行矮", async () => {
    await render(true, {
      title: { en: "T", zh: "标" },
      close: { en: "C", zh: "关" },
      rows: [
        { name: "单行内容" },                                                        // ① 不写 label
        { label: { en: "Label", zh: "标签" }, name: "两行内容" },                      // ② 有标签
        { label: { en: "  ", zh: "" }, name: "空白标签内容" },                         // ③ 两份都留空 = 也算没标签
      ],
    });

    // ① 单行行：没有 `caption` 标签元素，只有内容那一行
    expect(row(0).querySelector(".MuiTypography-caption")).toBeNull();
    expect(row(0).getAttribute("data-single-line")).toBe("true");
    expect(row(0).textContent).toBe("单行内容");

    // ② 有标签：`caption` 在，内容是第二行
    const caption = row(1).querySelector(".MuiTypography-caption")!;
    expect(caption.textContent).toBe("Label");
    expect(row(1).getAttribute("data-single-line")).toBeNull();

    // ③ 标签两份都留空 → 同样按"没有标签"处理（不留一个空占位）
    expect(row(2).querySelector(".MuiTypography-caption")).toBeNull();
    expect(row(2).getAttribute("data-single-line")).toBe("true");

    // "单独一行"最直接的度量：单行行比两行行矮
    const single = row(0).getBoundingClientRect().height;
    const double = row(1).getBoundingClientRect().height;
    expect(single).toBeGreaterThan(0);
    expect(single).toBeLessThan(double);
  });

  it("没有标签的行贴紧上一行：续行间距 8dp，项间距 16dp（不让它变成一条空行）", async () => {
    await render(true, {
      title: { en: "T", zh: "标" },
      close: { en: "C", zh: "关" },
      rows: [
        { label: { en: "Author", zh: "作者" }, name: "第一项" },      // ① 有标签（第一项，上边距 0）
        { name: "续行" },                                            // ② 没标签 → 上边距 8dp
        { label: { en: "Repo", zh: "仓库" }, name: "第二项" },        // ③ 有标签 → 上边距 16dp
        { name: "又一行续行" },                                       // ④ 没标签 → 上边距 8dp
      ],
    });
    // ① 计算样式（不受入场动画影响）：第一项 0、续行 8dp、新项 16dp
    expect(getComputedStyle(row(0)).marginTop).toBe("0px");
    expect(getComputedStyle(row(1)).marginTop).toBe("8px");
    expect(getComputedStyle(row(2)).marginTop).toBe("16px");
    expect(getComputedStyle(row(3)).marginTop).toBe("8px");

    // ② 量出来的空白也确实是"续行更小"。**只比大小、不比绝对值**：
    //    入场是 MD2 的 Grow（scale 0.75 → 1），动画没落位时所有 rect 都被缩放
    //    （实测 8dp 量成 5px —— 和 e2e 里那条"关闭键 27px"是同一个坑）。
    const gap = (index: number): number =>
      row(index).getBoundingClientRect().top - row(index - 1).getBoundingClientRect().bottom;
    expect(gap(1)).toBeGreaterThan(0);
    expect(gap(3)).toBeGreaterThan(0);
    expect(gap(2)).toBeGreaterThan(gap(1));    // 项间距 > 续行间距
    expect(gap(2)).toBeGreaterThan(gap(3));
  });

  it("自动行（外置曲库署名）：有名单就渲染在**锚点那一行的位置**，标签取自内容真源", async () => {
    await render(true, {
      title: { en: "T", zh: "标" },
      close: { en: "C", zh: "关" },
      rows: [
        { label: { en: "Repo", zh: "仓库" }, name: "第一项" },
        { auto: "pack-authors", label: { en: "Extra pack music author", zh: "外置曲库曲目作者" } },
        { label: { en: "Original", zh: "原作" }, name: "第三项" },
      ],
    }, ["鞍山侯国玉电乐团", "Chyan_184", "きゅーみぅ"]);

    const auto = dialog()!.querySelector('[data-testid="about-row-1"]')!;
    expect(auto.getAttribute("data-auto")).toBe("pack-authors");
    expect(auto.textContent).toContain("Extra pack music author");
    // 名字用「、」连成一段，且都在
    expect(auto.textContent).toContain("鞍山侯国玉电乐团、Chyan_184、きゅーみぅ");
    // 位置：夹在第一项与第三项之间（顺序与内容真源一致）
    const ids = [...dialog()!.querySelectorAll('[data-testid^="about-row-"]')];
    expect(ids[0]!.textContent).toContain("第一项");
    expect(ids[1]!.getAttribute("data-auto")).toBe("pack-authors");
    expect(ids[2]!.textContent).toContain("第三项");
    // 名字是白色正文色、不是链接（数据里没有作者主页）
    expect(getComputedStyle(auto.querySelector(".MuiTypography-body1")!).color).toBe("rgb(255, 255, 255)");
    expect(auto.querySelectorAll("a")).toHaveLength(0);
  });

  it("自动行：名单为空（没引入外置曲库）→ **整行不渲染**，连标签都不出现", async () => {
    await render(true, {
      title: { en: "T", zh: "标" },
      close: { en: "C", zh: "关" },
      rows: [
        { label: { en: "Repo", zh: "仓库" }, name: "第一项" },
        { auto: "pack-authors", label: { en: "Extra pack music author", zh: "外置曲库曲目作者" } },
      ],
    });
    expect(dialog()!.querySelector('[data-auto="pack-authors"]')).toBeNull();
    expect(dialog()!.textContent).not.toContain("Extra pack music author");
    expect(dialog()!.querySelectorAll('[data-testid^="about-row-"]')).toHaveLength(1);
  });

  it("自动行：layout 写成 lines 时一行一个作者（名字之间用续行的小间距）", async () => {
    await render(true, {
      title: { en: "T", zh: "标" },
      close: { en: "C", zh: "关" },
      rows: [{ auto: "pack-authors", label: { en: "Authors", zh: "作者" }, layout: "lines" }],
    }, ["甲", "乙"]);
    const lines = [...dialog()!.querySelectorAll('[data-testid="about-row-0"] .MuiTypography-body1')];
    expect(lines.map((line) => line.textContent)).toEqual(["甲", "乙"]);
    // 名字之间是"续行"式的 2px（Stack spacing 0.25 × 8）
    expect(getComputedStyle(lines[1]!).marginTop).toBe("2px");
  });

  it("「关闭」按钮在操作区右下、是白字（用户要求，不走 MD2 的主色动作按钮）", async () => {
    const { closes } = await render(true);
    const close = closeButton();
    expect(close.tagName).toBe("BUTTON");
    expect(close.textContent).toBe(localized(aboutContent.close, "en"));
    // MD2 的对话框操作区在底部右对齐
    const actions = close.parentElement!;
    expect(actions.className).toContain("MuiDialogActions-root");
    expect(getComputedStyle(actions).justifyContent).toBe("flex-end");
    // 白色 = 主题的正文色（onSurface 100%）
    expect(Palette.text.toLowerCase()).toBe("#ffffffff");
    expect(getComputedStyle(close).color).toBe("rgb(255, 255, 255)");

    await click(close);
    expect(closes()).toBe(1);
  });

  it("点遮罩就关（MD2：点对话框外面 = 关闭）", async () => {
    const { closes } = await render(true);
    await click(backdrop()!);
    expect(closes()).toBe(1);
  });

  it("Esc 也关（MUI 的 Esc 判定挂在对话框根节点上，所以事件从框内派发）", async () => {
    const { closes } = await render(true);
    await act(async () => {
      paper().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(closes()).toBe(1);
  });

  it("关闭后弹窗不再渲染", async () => {
    const { container } = await render(false);
    expect(dialog()).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("MD2 对话框规格：最小宽 280 / 最大宽 560、4dp 圆角、elevation 24、遮罩 32% 黑", async () => {
    await render(true);
    // 尺寸/圆角/阴影都在 Paper 上（根节点是铺满全屏的定位容器）
    const style = getComputedStyle(paper());
    expect(style.minWidth).toBe("280px");
    expect(style.maxWidth).toBe("560px");
    expect(style.borderRadius).toBe(`${MD2.shape}px`);
    expect(style.boxShadow).not.toBe("none");        // elevation 24（MUI 的 Dialog 默认值，正是 MD2 规格）
    // MD2：模态对话框遮罩 = 32% 黑（MUI 默认 50%）
    expect(getComputedStyle(backdrop()!).backgroundColor).toBe("rgba(0, 0, 0, 0.32)");
  });

  it("切语言：标题、每行标签与关闭按钮一起变中文（内容真源的 zh 那一份）", async () => {
    await render(true);
    await act(async () => { useSession.getState().setLocale("zh"); });
    const text = dialog()?.textContent ?? "";
    for (const expected of expectedTexts("zh")) expect(text).toContain(expected);
  });
});
