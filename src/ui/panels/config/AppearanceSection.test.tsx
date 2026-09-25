/** 设置页「外观」：亮/暗切换与主题色（真实 store + 真实主题，与 `App.tsx` 同构）。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useAppearance } from "../../../store/appearance";
import { buildTheme } from "../../../theme/theme";
import { AppearanceSection } from "./AppearanceSection";

let root: Root | null = null;

/** 与 `App.tsx` 同构：主题由外观偏好算出 —— 这条链正是要验证的东西。 */
function Harness() {
  const { mode, primary } = useAppearance();
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
