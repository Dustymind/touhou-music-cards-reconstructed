/** 主题与色板：对齐上游 `app/components/Theme.ts` 与 `CharacterCard` 的状态色。 */
import { createTheme, type Theme } from "@mui/material/styles";

/** 上游 `NoFontFamily`：正文用 Whitney，缺字体时退回系统栈（含 CJK）。 */
export const NoFontFamily =
  '"TMC Whitney", -apple-system, "Segoe UI", "Yu Gothic", "Hiragino Sans", ' +
  '"Noto Sans CJK SC", "Microsoft YaHei", sans-serif';

/** 计时器/数字用等宽（Inconsolata 随仓库分发）。 */
export const MonoFontFamily = '"TMC Inconsolata", ui-monospace, SFMono-Regular, Menlo, monospace';

/** 卡片状态底色（上游 `CharacterCard.tsx` 的原值）。 */
export const CardColors = {
  Normal: "#ffffff",
  Hover: "#b3f9ffff",
  Disabled: "#d3d3d3ff",
  DisabledHover: "#97ccd6ff",
  Selected: "#71d7ffff",
  Correct: "#bef3beff",
  Incorrect: "#ffcccbff",
} as const;

/** 玩家名/聊天的颜色（上游 `CustomColors`）。 */
export const CustomColors = {
  opponentColor: "#ff9f9fff",
  selfColor: "#9f9fffff",
  systemColor: "#9f9f9f99",
} as const;

/** 卡面宽高比（上游 `Configs.ts` 的 `CardAspectRatio`）。 */
export const CardAspectRatio = 703 / 1000;

export function buildTheme(): Theme {
  return createTheme({
    palette: {
      mode: "light",
      primary: { main: "#1976d2" },
      success: { main: "#ffff83" },
    },
    typography: { fontFamily: NoFontFamily },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: "#ffffff", color: "#171717" },
        },
      },
    },
  });
}
