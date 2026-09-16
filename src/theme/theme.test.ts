/** 主题锁定：上游色板 + 指定的字体 fallback 顺序（用户裁定，别被顺手改回去）。 */
import { describe, expect, it } from "vitest";

import { buildTheme, CustomThemeColors, NoFontFamily, Palette } from "./theme";

describe("主题", () => {
  it("背景与纸面用上游的深色值", () => {
    const theme = buildTheme();
    expect(theme.palette.mode).toBe("dark");
    expect(theme.palette.background.default).toBe(Palette.background);
    expect(theme.palette.background.paper).toBe(Palette.surface);
    expect(Palette.background.toLowerCase()).toBe("#141414ff");
    expect(Palette.surface.toLowerCase()).toBe("#262626ff");
    expect(theme.custom.mainTabBackground).toBe(CustomThemeColors.mainTabBackground);
  });

  it("文字/分隔线/主色都来自上游色板", () => {
    const theme = buildTheme();
    expect(theme.palette.text.primary).toBe(Palette.text);
    expect(theme.palette.text.secondary).toBe(Palette.muted);
    expect(theme.palette.divider).toBe(Palette.divider);
    expect(theme.palette.primary.main).toBe(Palette.primary);
    expect(theme.palette.secondary.main).toBe(Palette.secondary);
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
