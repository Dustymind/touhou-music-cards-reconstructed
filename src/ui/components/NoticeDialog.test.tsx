/** 公告弹窗：MD2 规格 + **方案 B 的三段式版式**（内容 → 勾选框 → 关闭）+ 三种关闭方式 + 白字规则。
 *
 * 文案一律**跟着内容真源走**（改文案不会让用例假红），只钉结构与规格。
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ThemeProvider } from "@mui/material/styles";

import { NOTICE_DEFAULT_CLOSE, NOTICE_DEFAULT_DISMISS, noticeContent, type NoticeContent } from "../../content/notices";
import { localized } from "../../i18n/localization";
import { useSession } from "../../store/session";
import { buildTheme, MD2, Palette } from "../../theme/theme";
import { NoticeDialog } from "./NoticeDialog";

/** 真源里的第一条（默认就用它，跟用户真正会看到的一致）。 */
const REAL = noticeContent.notices[0]!;

let root: Root | null = null;

interface Handles { container: HTMLElement; closes: () => number; dismissChanges: () => boolean[] }

/** 挂一个受控弹窗，记下 `onClose` 调用次数与每次的勾选框变化。 */
async function render(options: {
  notice?: NoticeContent | null;
  open?: boolean;
  dismissChecked?: boolean;
} = {}): Promise<Handles> {
  const { notice = REAL, open = true, dismissChecked = false } = options;
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  let closes = 0;
  const dismissChanges: boolean[] = [];
  await act(async () => {
    // 套上**应用的主题**（`App.tsx` 就是这么包的）：不套的话 `color="inherit"` 会落到 MUI 的
    // 浅色默认主题上，"白字"这类断言就测不出真实结果
    root!.render(
      <ThemeProvider theme={buildTheme()}>
        <NoticeDialog
          notice={notice}
          open={open}
          dismissChecked={dismissChecked}
          onDismissCheckedChange={(value) => { dismissChanges.push(value); }}
          onClose={() => { closes += 1; }}
        />
      </ThemeProvider>,
    );
  });
  return { container, closes: () => closes, dismissChanges: () => dismissChanges };
}

/** 弹窗挂在 portal 里（不在 container 内），所以从 body 上找。 */
const dialog = (): HTMLElement | null => document.querySelector('[data-testid="notice-dialog"]');
const backdrop = (): HTMLElement | null => document.querySelector(".MuiBackdrop-root");
const paper = (): HTMLElement => document.querySelector(".MuiDialog-paper")!;
const content = (): HTMLElement => document.querySelector(".MuiDialogContent-root")!;
const closeButton = (): HTMLElement => document.querySelector('[data-testid="notice-close"]')!;
const dismissBox = (): HTMLElement => document.querySelector('[data-testid="notice-dismiss"]')!;

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

describe("NoticeDialog", () => {
  it("打开时渲染标题、正文（Markdown 渲染出来）、勾选框与关闭按钮", async () => {
    await render();
    const text = dialog()?.textContent ?? "";
    expect(text).toContain(localized(REAL.title, "en"));
    expect(text).toContain(localized(NOTICE_DEFAULT_CLOSE, "en"));
    expect(text).toContain(localized(NOTICE_DEFAULT_DISMISS, "en"));
    // 正文经由 Markdown 渲染器（有 data-testid="notice-body"）
    expect(dialog()!.querySelector('[data-testid="notice-body"]')).not.toBeNull();
  });

  it("**方案 B 的三段式版式**：正文与勾选框都在动作区**之上**（内容 → 勾选框 → 关闭）", async () => {
    await render();
    const body = dialog()!.querySelector('[data-testid="notice-body"]')!;
    const actions = closeButton().parentElement!;
    expect(actions.className).toContain("MuiDialogActions-root");

    // ① 关闭键在勾选框**下方**（勾选框 rect 的 bottom ≤ 关闭键 rect 的 top）
    const dismissRect = dismissBox().getBoundingClientRect();
    const closeRect = closeButton().getBoundingClientRect();
    expect(dismissRect.bottom).toBeLessThanOrEqual(closeRect.top + 1);

    // ② 正文在勾选框**上方**
    expect(body.getBoundingClientRect().bottom).toBeLessThanOrEqual(dismissRect.top + 1);

    // ③ 勾选框在内容区里（不在动作区里）
    expect(content().contains(dismissBox())).toBe(true);
    expect(actions.contains(dismissBox())).toBe(false);
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

  it("勾选框受控：点它回调 `onDismissCheckedChange`，传的是新勾选状态", async () => {
    const { dismissChanges } = await render({ dismissChecked: false });
    const checkbox = dismissBox().querySelector('input[type="checkbox"]')!;
    await click(checkbox);
    expect(dismissChanges()).toEqual([true]);
  });

  it("勾选状态跟着 prop 走（父组件传 true 就是勾上的）", async () => {
    await render({ dismissChecked: true });
    const checkbox = dismissBox().querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    // 换一份新的挂载（先彻底清干净上一个，别让两个弹窗同时在 DOM 里）
    await act(async () => { root?.unmount(); });
    root = null;
    document.body.innerHTML = "";
    await render({ dismissChecked: false });
    const again = dismissBox().querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(again.checked).toBe(false);
  });

  it("关闭按钮获得初始焦点（`autoFocus`，与「关于」一致的行为）", async () => {
    await render();
    expect(document.activeElement).toBe(closeButton());
  });

  it("`notice` 为 `null` ⇒ 不渲染弹窗", async () => {
    const { container } = await render({ notice: null });
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

  it("勾选框整行 ≥40dp 高（MD2 最小触摸目标）", async () => {
    await render();
    const boxes = [...document.querySelectorAll('[data-testid="notice-dismiss"]')];
    expect(boxes, "DOM 里有多个弹窗，测试没清干净").toHaveLength(1);
    // 量**计算样式**而不是 `getBoundingClientRect()`：入场是 MD2 的 Grow（scale 0.75 → 1），
    // 动画没落位时 rect 会被缩小（实测这一行量出 22.5px = 40 × 两级缩放），
    // 与 `AboutDialog.test.tsx` 里"续行间距"那条用例同一个坑、同一个口径。
    expect(getComputedStyle(dismissBox()).minHeight).toBe("40px");
    expect(parseFloat(getComputedStyle(dismissBox()).height)).toBeGreaterThanOrEqual(40);
  });

  it("切语言：标题、勾选框、关闭按钮一起变中文", async () => {
    await render();
    await act(async () => { useSession.getState().setLocale("zh"); });
    const text = dialog()?.textContent ?? "";
    expect(text).toContain(localized(REAL.title, "zh"));
    expect(text).toContain(localized(NOTICE_DEFAULT_DISMISS, "zh"));
    expect(text).toContain(localized(NOTICE_DEFAULT_CLOSE, "zh"));
  });

  it("公告自带 close / dismiss 文案时用它（而不是默认文案）", async () => {
    await render({
      notice: {
        id: "test-custom-labels",
        title: { en: "T", zh: "标" },
        body: "正文",
        close: { en: "Got it", zh: "知道了" },
        dismiss: { en: "Never again", zh: "永不再现" },
      },
    });
    const text = dialog()!.textContent ?? "";
    expect(text).toContain("Got it");
    expect(text).toContain("Never again");
    expect(text).not.toContain(localized(NOTICE_DEFAULT_CLOSE, "en"));
  });

  it("正文里的原始 HTML 不会变成元素（XSS：与 Markdown 渲染器同一条底线）", async () => {
    await render({
      notice: {
        id: "test-xss",
        title: { en: "T", zh: "标" },
        body: "<script>alert(1)</script>",
      },
    });
    expect(dialog()!.querySelector("script")).toBeNull();
    expect(dialog()!.textContent).toContain("<script>alert(1)</script>");
  });
});
