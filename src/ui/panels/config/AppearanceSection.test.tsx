/** 设置页「外观」：亮/暗切换与主题色（真实 store + 真实主题，与 `App.tsx` 同构）。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useAppearance, useThemeMode } from "../../../store/appearance";
import { MD2 } from "../../../theme/theme";
import { buildTheme } from "../../../theme/theme";
import { AppearanceSection } from "./AppearanceSection";

let root: Root | null = null;

/** 与 `App.tsx` 同构：主题由外观偏好算出 —— 这条链正是要验证的东西。 */
function Harness() {
  // 与 `App.tsx` 同构：偏好（可能含 auto）经 `useThemeMode` 解析成生效模式
  const mode = useThemeMode();
  const primary = useAppearance((state) => state.primary);
  return (
    <ThemeProvider theme={buildTheme({ mode, primary: primary || undefined })}>
      <CssBaseline />
      <AppearanceSection />
    </ThemeProvider>
  );
}

async function render(): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(<Harness />); });
  // 分区默认折叠且**惰性挂载**（`unmountOnExit`）⇒ 不展开就找不到任何控件
  await click(container, "section-appearance-summary");
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 320)); });
  return container;
}

async function click(container: HTMLElement, testId: string): Promise<void> {
  const element = container.querySelector(`[data-testid="${testId}"]`);
  if (!element) throw new Error(`缺少元素 ${testId}`);
  await act(async () => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}

describe("外观分区", () => {
  beforeEach(() => {
    localStorage.clear();
    useAppearance.setState({ mode: "dark", primary: "" });
  });
  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    root = null;
    document.body.innerHTML = "";
  });

  it("默认深色；点「亮色」⇒ store 与页面底色一起变（CSS 变量生效）", async () => {
    const container = await render();
    expect(useAppearance.getState().mode).toBe("dark");
    expect(getComputedStyle(document.body).backgroundColor).toBe("rgb(18, 18, 18)");   // #121212
    await click(container, "theme-mode-light");
    expect(useAppearance.getState().mode).toBe("light");
    expect(getComputedStyle(document.body).backgroundColor).toBe("rgb(255, 255, 255)");
    // 正文色也换成了浅色口径（MD2 onSurface 87% 黑）
    expect(getComputedStyle(document.body).color).toBe("rgba(0, 0, 0, 0.87)");
  });

  it("选色板 ⇒ 主题色进 store 并落盘；「恢复」清空", async () => {
    const container = await render();
    await click(container, "theme-color-blue");
    expect(useAppearance.getState().primary).toBe("#2196f3");
    expect(localStorage.getItem("tmc.v1.appearance")).toContain("#2196f3");
    await click(container, "theme-color-reset");
    expect(useAppearance.getState().primary).toBe("");
  });

  it("三档模式：自动 / 亮色 / 暗色都在，且控件左对齐（不被 Stack 拉满）", async () => {
    const container = await render();
    for (const id of ["auto", "light", "dark"]) {
      expect(container.querySelector(`[data-testid="theme-mode-${id}"]`), id).not.toBeNull();
    }
    const group = container.querySelector('[data-testid="theme-mode-auto"]')!.parentElement as HTMLElement;
    const content = container.querySelector('[data-testid="section-appearance-content"]') as HTMLElement;
    // 控件宽度明显小于内容区 ⇒ 左对齐而不是被拉满整行
    expect(group.getBoundingClientRect().width).toBeLessThan(content.getBoundingClientRect().width * 0.9);
    expect(getComputedStyle(group).alignSelf).toBe("flex-start");
  });

  it("「自动」写进偏好（生效模式交给 useThemeMode 解析）", async () => {
    const container = await render();
    await click(container, "theme-mode-auto");
    expect(useAppearance.getState().mode).toBe("auto");
  });

  it("MD2 规格：色块 32dp、内容区留白与行距都取常量（不在组件里写死数字）", async () => {
    const container = await render();
    const box = (container.querySelector('[data-testid="theme-color-blue"]') as HTMLElement).getBoundingClientRect();
    expect(Math.round(box.width)).toBe(32);
    expect(Math.round(box.height)).toBe(32);

    // 内容区留白 = MD2.card.padding（AccordionDetails 的 padding，由主题统一给）
    const content = container.querySelector('[data-testid="section-appearance-content"]') as HTMLElement;
    const details = content.parentElement as HTMLElement;
    expect(getComputedStyle(details).padding).toBe(`${MD2.card.padding}px`);

    // 行距**正好**是 MD2 的 8dp 栅格：MUI 的 `Stack spacing` 单位就是 8px，
    // 所以 `spacing={1}` = 8px ✓ 而 `spacing={MD2.grid}`（=8）会被算成 64px ✗ —— 这条就是拦它的。
    const rows = content.firstElementChild as HTMLElement;             // <Stack spacing={1}>
    const children = Array.from(rows.children) as HTMLElement[];
    expect(children.length).toBeGreaterThan(1);
    for (const child of children.slice(1)) {
      expect(getComputedStyle(child).marginTop, child.tagName).toBe(`${MD2.grid}px`);
    }
  });

  it("自定义取色器与色板等价（都走同一个 setPrimary）", async () => {
    const container = await render();
    const input = container.querySelector('[data-testid="theme-color-custom"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    await act(async () => {
      // 直接改 `.value` 不会触发 React 的 onChange ⇒ 走原生 setter 再派发 input 事件
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "#ff9800");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(useAppearance.getState().primary).toBe("#ff9800");
  });
});
