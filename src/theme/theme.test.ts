/** 主题锁定：上游色板 + 指定的字体 fallback 顺序（用户裁定，别被顺手改回去）。 */
import { describe, expect, it } from "vitest";

import {
  buildTheme, isHexColor, MD2, MD2_BORDER, MD2_PALETTE, MD2_SLOT, MD2_TYPE_SCALE, NoFontFamily,
  normalizeHex, onColorFor, Palette, themeColorFor, ThemeTokens,
} from "./theme";

const theme = (): ReturnType<typeof buildTheme> => buildTheme();

describe("主题", () => {
  it("背景与纸面用 MD2 深色基准（#121212）", () => {
    const theme = buildTheme();
    expect(theme.palette.mode).toBe("dark");
    expect(theme.palette.background.default).toBe(Palette.background);
    expect(theme.palette.background.paper).toBe(Palette.surface);
    expect(Palette.background.toLowerCase()).toBe("#121212");
    expect(Palette.surface.toLowerCase()).toBe("#121212");
  });

  it("主色/次色用 MD2 基准（深色主题下是 200 号紫 + 青绿）", () => {
    expect(MD2_PALETTE.light.primary).toBe("#6200EE");
    expect(MD2_PALETTE.light.primaryVariant).toBe("#3700B3");
    expect(theme().palette.primary.main).toBe(MD2_PALETTE.dark.primary);
    expect(theme().palette.secondary.main).toBe(MD2_PALETTE.dark.secondary);
    expect(theme().palette.error.main).toBe(MD2_PALETTE.dark.error);
  });

  it("MD2 规格常量：形状 4dp、8dp 栅格、按钮 32/36/44、页签 48", () => {
    expect(MD2.shape).toBe(4);
    expect(MD2.grid).toBe(8);
    expect(MD2.button).toMatchObject({ small: 32, medium: 36, large: 44 });
    expect(MD2.tab.height).toBe(48);
    expect(MD2_TYPE_SCALE.button).toMatchObject({ fontSize: 14, fontWeight: 500, letterSpacing: "1.25px" });
    expect(MD2_TYPE_SCALE.button.textTransform).toBe("uppercase");
  });

  it("文字/分隔线都按 MD2 的 onSurface 规格", () => {
    const theme = buildTheme();
    expect(theme.palette.text.primary).toBe(Palette.text);
    expect(theme.palette.text.secondary).toBe(Palette.muted);
    expect(theme.palette.divider).toBe(Palette.divider);
    expect(theme.palette.primary.main).toBe(Palette.primary);
  });

  it("字体 fallback 顺序：苹果默认 → 鸿蒙 → 微软雅黑 → Noto CJK", () => {
    const stack = NoFontFamily.toLowerCase();
    const order = ["-apple-system", "harmonyos sans", "microsoft yahei", "noto sans cjk sc"];
    const positions = order.map((name) => stack.indexOf(name));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual(positions.slice().sort((a, b) => a - b));
    expect(stack.endsWith("sans-serif")).toBe(true);
  });
});

// ---------------------------------------------------------------- 亮/暗与主题色（D152）

describe("亮/暗模式与自定义主题色", () => {
  it("不带参数 = 深色（与改前逐字相同）；带 mode 就换那一套基准", () => {
    expect(buildTheme().palette.mode).toBe("dark");
    const light = buildTheme({ mode: "light" });
    expect(light.palette.mode).toBe("light");
    expect(light.palette.background.default).toBe(MD2_PALETTE.light.background);
    // MD2 浅色的 onSurface 口径：正文 87% 黑、次要 60% 黑、分隔线 12% 黑
    expect(light.palette.text.primary).toBe("rgba(0, 0, 0, 0.87)");
    expect(light.palette.text.secondary).toBe("rgba(0, 0, 0, 0.6)");
    expect(light.palette.divider).toBe("rgba(0, 0, 0, 0.12)");
  });

  it("自定义主题色：深色下按 MD2 200 号口径提亮，并给出 onPrimary", () => {
    const themed = buildTheme({ mode: "dark", primary: "#2196f3" });
    expect(themed.palette.primary.main).not.toBe("#2196f3");        // 提亮了
    expect(themed.palette.primary.main).toBe(themeColorFor("#2196f3", "dark"));
    expect(themed.palette.primary.contrastText).toBe(onColorFor(themed.palette.primary.main));
    // 浅色下深色原样保留（500 号在浅色背景上够用）
    expect(buildTheme({ mode: "light", primary: "#2196f3" }).palette.primary.main).toBe("#2196f3");
  });

  it("主题色 token 落成 CSS 变量：组件不必知道当前模式", () => {
    const dark = buildTheme();
    const light = buildTheme({ mode: "light" });
    const vars = (theme: ReturnType<typeof buildTheme>): Record<string, string> =>
      (theme.components?.MuiCssBaseline?.styleOverrides as { ":root": Record<string, string> })[":root"];
    expect(vars(dark)["--tmc-text"]).toBe("#FFFFFFFF");
    expect(vars(light)["--tmc-text"]).toBe("rgba(0, 0, 0, 0.87)");
    expect(vars(light)["--tmc-primary"]).toBe(MD2_PALETTE.light.primary);
    // 空卡槽的虚线框颜色也跟着模式走（用户反馈 1px/28% 太虚太细 ⇒ 现在 2dp/45%）
    expect(vars(dark)["--tmc-slot"]).toBe("rgba(255, 255, 255, 0.45)");
    expect(vars(light)["--tmc-slot"]).toBe("rgba(0, 0, 0, 0.45)");
    expect(MD2_SLOT).toEqual({ color: ThemeTokens.slot, width: 2 });
    // 组件里的 token 就是这些变量（`MD2_BORDER` / 扩展面板图标也走它）
    expect(MD2_BORDER).toBe(ThemeTokens.border);
    expect(MD2.accordion.icon).toBe(ThemeTokens.icon);
  });

  it("颜色校验与归一化（设置页与 store 共用这一处口径）", () => {
    expect(isHexColor("#2196F3")).toBe(true);
    expect(normalizeHex("  #2196F3 ")).toBe("#2196f3");
    for (const bad of ["2196f3", "#2196f", "#2196f3ff", "rgb(1,2,3)", "", null, 42]) {
      expect(isHexColor(bad as unknown)).toBe(false);
    }
    expect(themeColorFor("#ffffff", "light")).toBe("#cccccc");      // 太亮 ⇒ 压暗 20%
  });
});
