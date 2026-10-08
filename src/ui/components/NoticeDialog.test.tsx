/** 公告弹窗：MD2 规格 + **方案 B 的三段式版式**（内容 → 告知 → 关闭）+ 三种关闭方式 + 白字规则
 *  + D185 的**列表版式**（多条时每条自带小标题）
 *  + D186 的**告知行**（弃用了「不再显示」勾选框）。
 *
 * **版式按"几条"分，不按打开方式分**：1 条走方案 B，多条（自动弹或入口打开都一样）走列表版式。
 *
 * 文案一律**跟着内容真源 / i18n 走**（改文案不会让用例假红），只钉结构与规格。
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ThemeProvider } from "@mui/material/styles";

import { NOTICE_DEFAULT_CLOSE, noticeContent, type NoticeContent } from "../../content/notices";
import { Localization, localized, t } from "../../i18n/localization";
import { useSession } from "../../store/session";
import { buildTheme, MD2, Palette } from "../../theme/theme";
import { NoticeDialog } from "./NoticeDialog";

/** 真源里的第一条（默认就用它，跟用户真正会看到的一致）。 */
const REAL = noticeContent.notices[0]!;

/** 造一条测试用公告。 */
function notice(overrides: Partial<NoticeContent> = {}): NoticeContent {
  return { id: "test-a", title: { en: "A", zh: "甲" }, body: "正文", ...overrides };
}

let root: Root | null = null;

interface Handles { container: HTMLElement; closes: () => number }

/** 挂一个受控弹窗，记下 `onClose` 调用次数。 */
async function render(options: {
  notices?: readonly NoticeContent[];
  mode?: "auto" | "manual";
  open?: boolean;
} = {}): Promise<Handles> {
  const { notices = [REAL], mode = "auto", open = true } = options;
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  let closes = 0;
  await act(async () => {
    // 套上**应用的主题**（`App.tsx` 就是这么包的）：不套的话 `color="inherit"` 会落到 MUI 的
    // 浅色默认主题上，"白字"这类断言就测不出真实结果
    root!.render(
      <ThemeProvider theme={buildTheme()}>
        <NoticeDialog
          notices={notices}
          mode={mode}
          open={open}
          onClose={() => { closes += 1; }}
        />
      </ThemeProvider>,
    );
  });
  return { container, closes: () => closes };
}

/** 弹窗挂在 portal 里（不在 container 内），所以从 body 上找。 */
const dialog = (): HTMLElement | null => document.querySelector('[data-testid="notice-dialog"]');
const backdrop = (): HTMLElement | null => document.querySelector(".MuiBackdrop-root");
const paper = (): HTMLElement => document.querySelector(".MuiDialog-paper")!;
const content = (): HTMLElement => document.querySelector(".MuiDialogContent-root")!;
const closeButton = (): HTMLElement => document.querySelector('[data-testid="notice-close"]')!;
const item = (id: string): HTMLElement | null => document.querySelector(`[data-testid="notice-item-${id}"]`);
/** 底部那行告知（D186）。整份弹窗里**只该有一处**。 */
const hints = (): HTMLElement[] => [...document.querySelectorAll('[data-testid="notice-hint"]')] as HTMLElement[];

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

describe("NoticeDialog（自动弹的那条）", () => {
  it("打开时渲染标题、正文（Markdown 渲染出来）、告知行与关闭按钮", async () => {
    await render();
    const text = dialog()?.textContent ?? "";
    expect(text).toContain(localized(REAL.title, "en"));
    expect(text).toContain(localized(NOTICE_DEFAULT_CLOSE, "en"));
    expect(text).toContain(t(Localization.ShellNoticeHint));
    // 正文经由 Markdown 渲染器（有 data-testid="notice-body"）
    expect(dialog()!.querySelector('[data-testid="notice-body"]')).not.toBeNull();
    // 自动弹单条时不重复写一遍小标题（DialogTitle 已经是这条的标题了）
    expect(item(REAL.id)).not.toBeNull();
    expect(item(REAL.id)!.querySelector("h3")).toBeNull();
  });

  it("**方案 B 的三段式版式**：正文与告知行都在动作区**之上**（内容 → 告知 → 关闭）", async () => {
    await render();
    const body = dialog()!.querySelector('[data-testid="notice-body"]')!;
    const hint = hints()[0]!;
    const actions = closeButton().parentElement!;
    expect(actions.className).toContain("MuiDialogActions-root");

    // ① 关闭键在告知行**下方**
    expect(hint.getBoundingClientRect().bottom).toBeLessThanOrEqual(closeButton().getBoundingClientRect().top + 1);

    // ② 正文在告知行**上方**
    expect(body.getBoundingClientRect().bottom).toBeLessThanOrEqual(hint.getBoundingClientRect().top + 1);

    // ③ 告知行在内容区里（不在动作区里）
    expect(content().contains(hint)).toBe(true);
    expect(actions.contains(hint)).toBe(false);
  });

  it("动作区**只有一个**按钮（就是「关闭」）", async () => {
    await render();
    const actions = closeButton().parentElement!;
    expect(actions.querySelectorAll("button")).toHaveLength(1);
    expect(closeButton().tagName).toBe("BUTTON");
  });

  it("「关闭」是**白字**（沿用 D133：不走 MD2 的主色动作按钮）", async () => {
    await render();
    expect(Palette.text.toLowerCase()).toBe("#ffffffff");
    expect(getComputedStyle(closeButton()).color).toBe("rgb(255, 255, 255)");
    // MD2 操作区右对齐
    expect(getComputedStyle(closeButton().parentElement!).justifyContent).toBe("flex-end");
  });

  it("点「关闭」→ 触发 onClose", async () => {
    const { closes } = await render();
    await click(closeButton());
    expect(closes()).toBe(1);
  });

  it("点遮罩也关（MD2：点对话框外面 = 关闭）", async () => {
    const { closes } = await render();
    await click(backdrop()!);
    expect(closes()).toBe(1);
  });

  it("Esc 也关", async () => {
    const { closes } = await render();
    await act(async () => {
      paper().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(closes()).toBe(1);
  });

  it("关闭按钮获得初始焦点（`autoFocus`，与「关于」一致的行为）", async () => {
    await render();
    expect(document.activeElement).toBe(closeButton());
  });

  it("公告列表为空 ⇒ 不渲染弹窗", async () => {
    const { container } = await render({ notices: [] });
    expect(dialog()).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("`open` 为 false ⇒ 不渲染弹窗", async () => {
    await render({ open: false });
    expect(dialog()).toBeNull();
  });

  it("MD2 对话框规格：最小宽 280 / 最大宽 560、4dp 圆角、elevation 24、遮罩 32% 黑", async () => {
    await render();
    const style = getComputedStyle(paper());
    expect(style.minWidth).toBe("280px");
    expect(style.maxWidth).toBe("560px");
    expect(style.borderRadius).toBe(`${MD2.shape}px`);
    expect(style.boxShadow).not.toBe("none");        // elevation 24（MUI Dialog 默认值 = MD2 规格）
    expect(getComputedStyle(backdrop()!).backgroundColor).toBe("rgba(0, 0, 0, 0.32)");
  });

  it("切语言：标题、告知行、关闭按钮一起变中文", async () => {
    await render();
    await act(async () => { useSession.getState().setLocale("zh"); });
    const text = dialog()?.textContent ?? "";
    expect(text).toContain(localized(REAL.title, "zh"));
    expect(text).toContain(t(Localization.ShellNoticeHint));
    expect(text).toContain(localized(NOTICE_DEFAULT_CLOSE, "zh"));
  });

  it("公告自带 close 文案时用它（而不是默认文案）", async () => {
    await render({
      notices: [notice({ id: "test-custom-labels", close: { en: "Got it", zh: "知道了" } })],
    });
    const text = dialog()!.textContent ?? "";
    expect(text).toContain("Got it");
    expect(text).not.toContain(localized(NOTICE_DEFAULT_CLOSE, "en"));
  });

  it("正文里的原始 HTML 不会变成元素（XSS：与 Markdown 渲染器同一条底线）", async () => {
    await render({ notices: [notice({ id: "test-xss", body: "<script>alert(1)</script>" })] });
    expect(dialog()!.querySelector("script")).toBeNull();
    expect(dialog()!.textContent).toContain("<script>alert(1)</script>");
  });
});

describe("NoticeDialog（告知行，D186）", () => {
  it("告知行说的是**两件事**：关掉之后怎么再看回来 + 去哪儿看", async () => {
    await render();
    const text = hints()[0]!.textContent ?? "";
    // 文案真源在 `ShellNoticeHint`；这里只钉"它确实渲染出来了、而且不是空的"
    expect(text).toBe(t(Localization.ShellNoticeHint));
    expect(text.trim().length).toBeGreaterThan(0);
  });

  it("中文界面下那句话指向**右上角的「公告」**（按钮名与这里必须对得上）", async () => {
    await act(async () => { useSession.getState().setLocale("zh"); });
    await render();
    const text = hints()[0]!.textContent ?? "";
    const buttonName = t(Localization.ShellNoticeOpen);
    // 告知里引的那个词 = 入口按钮的无障碍名（D186 把中文从「提示」统一成了「公告」）
    expect(text).toContain(buttonName);
    expect(text).toContain("右上角");
  });

  it("**弹窗里不再有勾选框**（D186 回归守卫：弃用了「不再显示」就不能让它悄悄回来）", async () => {
    // 单条与多条两种版式都要查：勾选框当初是"每条一份"，所以两种都得干净
    await render({ notices: [REAL] });
    expect(dialog()!.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-testid^="notice-dismiss-"]')).toHaveLength(0);

    await act(async () => { root?.unmount(); });
    root = null;
    document.body.innerHTML = "";

    await render({ notices: [REAL, notice({ id: "test-b" })], mode: "manual" });
    expect(dialog()!.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-testid^="notice-dismiss-"]')).toHaveLength(0);
  });
});

describe("NoticeDialog（自动弹的多条，用户 2026-10-07 反馈后）", () => {
  const many: NoticeContent[] = [
    notice({ id: "test-a", title: { en: "First", zh: "第一条" }, body: "甲正文", date: "2026-03-01" }),
    notice({ id: "test-b", title: { en: "Second", zh: "第二条" }, body: "乙正文", date: "2026-01-01" }),
  ];

  it("**多条一起渲染**：每条自带小标题，弹窗标题不再只写第一条的名字", async () => {
    await render({ notices: many, mode: "auto" });
    const text = dialog()!.textContent ?? "";
    expect(text).toContain(t(Localization.ShellNoticeOpen));
    expect(text).toContain("First");
    expect(text).toContain("Second");
    // 列表版式 ⇒ 每条都有 `h3` 小标题（单条时的方案 B 是没有的，见上面那条）
    expect(item("test-a")!.querySelector("h3")).not.toBeNull();
    expect(item("test-b")!.querySelector("h3")).not.toBeNull();
  });

  it("动作区仍只有**一个**「关闭」，且告知行只出现**一次**（不是每条一份）", async () => {
    await render({ notices: many, mode: "auto" });
    expect(closeButton().parentElement!.querySelectorAll("button")).toHaveLength(1);
    expect(document.querySelectorAll('[data-testid="notice-body"]')).toHaveLength(2);
    expect(hints()).toHaveLength(1);
  });

  it("`data-notice-mode` 仍是 `auto`（版式按**条数**分，打开方式由这个属性标出来）", async () => {
    await render({ notices: many, mode: "auto" });
    expect(dialog()!.getAttribute("data-notice-mode")).toBe("auto");
  });
});

describe("NoticeDialog（入口打开的列表，D185）", () => {
  const list: NoticeContent[] = [
    notice({ id: "test-a", title: { en: "First", zh: "第一条" }, body: "甲正文", date: "2026-03-01", pinned: true }),
    notice({ id: "test-b", title: { en: "Second", zh: "第二条" }, body: "乙正文", date: "2026-01-01" }),
  ];

  it("标题换成通用的「公告 / Notices」，且**每条**都渲染出小标题", async () => {
    await render({ notices: list, mode: "manual" });
    const text = dialog()!.textContent ?? "";
    expect(text).toContain(t(Localization.ShellNoticeOpen));
    expect(text).toContain("First");
    expect(text).toContain("Second");
  });

  it("按**传入顺序**渲染（传入的就是展示顺序：置顶优先 → 日期由新到旧）", async () => {
    await render({ notices: list, mode: "manual" });
    const tops = [...document.querySelectorAll('[data-testid^="notice-item-"]')]
      .map((node) => Math.round(node.getBoundingClientRect().top));
    expect(tops).toHaveLength(2);
    expect(tops[0]!).toBeLessThan(tops[1]!);
    // DOM 顺序与传入顺序一致
    expect([...document.querySelectorAll('[data-testid^="notice-item-"]')].map((n) => n.getAttribute("data-testid")))
      .toEqual(["notice-item-test-a", "notice-item-test-b"]);
  });

  it("**置顶的**带一个徽章、每条都带发布日期（排序键要看得见）", async () => {
    await render({ notices: list, mode: "manual" });
    expect(item("test-a")!.querySelector('[data-testid="notice-pinned"]')).not.toBeNull();
    expect(item("test-b")!.querySelector('[data-testid="notice-pinned"]')).toBeNull();
    expect(item("test-a")!.textContent).toContain("2026-03-01");
    expect(item("test-b")!.textContent).toContain("2026-01-01");
  });

  it("列表里**只有一个**「关闭」按钮（不给每条一个，避免一屏十几个按钮）", async () => {
    await render({ notices: list, mode: "manual" });
    const actions = closeButton().parentElement!;
    expect(actions.querySelectorAll("button")).toHaveLength(1);
  });

  it("列表里每条都渲染自己的正文（Markdown 渲染器各一次），告知行只一份", async () => {
    await render({ notices: list, mode: "manual" });
    const bodies = [...document.querySelectorAll('[data-testid="notice-body"]')];
    expect(bodies).toHaveLength(2);
    expect(item("test-a")!.querySelector('[data-testid="notice-body"]')).not.toBeNull();
    expect(item("test-b")!.querySelector('[data-testid="notice-body"]')).not.toBeNull();
    expect(hints()).toHaveLength(1);
  });

  it("`data-notice-mode` 标出这次是哪种打开方式（e2e 用它区分版式）", async () => {
    await render({ notices: list, mode: "manual" });
    expect(dialog()!.getAttribute("data-notice-mode")).toBe("manual");
  });
});
