/** 主题锁定：上游色板 + 指定的字体 fallback 顺序（用户裁定，别被顺手改回去）。 */
import { describe, expect, it } from "vitest";

import { buildTheme, MD2, MD2_PALETTE, MD2_TYPE_SCALE, NoFontFamily, Palette } from "./theme";

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
