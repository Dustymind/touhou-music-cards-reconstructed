/** 主题与色板：对齐上游 `app/components/Theme.ts` 与 `CharacterCard` 的状态色。 */
import { createTheme, type Theme } from "@mui/material/styles";

/** 正文/UI 字体。
 *
 * 先用本机的 Whitney（上游正文；不随仓库分发，装了才生效），再按指定的 fallback 顺序：
 * **苹果默认 → 鸿蒙默认 → 微软雅黑 → Noto CJK**，最后才是浏览器默认 sans-serif。
 * 计时器/数字另走 `MonoFontFamily`（Inconsolata 随仓库分发）。
 */
export const NoFontFamily =
  '"TMC Whitney", -apple-system, BlinkMacSystemFont, "HarmonyOS Sans SC", "HarmonyOS Sans", ' +
  '"Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", sans-serif';

/** 计时器/数字用等宽（Inconsolata 随仓库分发）。 */
export const MonoFontFamily = '"TMC Inconsolata", ui-monospace, SFMono-Regular, Menlo, monospace';

/** 上游色板原值（`Theme.ts` 的 `themeColors`）。 */
export const Palette = {
  primary: "#5090ffff",
  secondary: "#9c83ffff",
  surface: "#262626ff",
  background: "#141414ff",
  text: "#ffffffff",
  muted: "#babcc1ff",
  divider: "#7b7979ff",
  success: "#ffff83ff",
  info: "#00cb36ff",
} as const;

/** 上游 `theme.custom`（非 MUI 标准槽位：主容器与列表行底色）。 */
export const CustomThemeColors = {
  mainTabBackground: "#242222ff",
  listBackground1: "#161616ff",
  listBackground2: "#302E2E",
  alice: "#ffff83ff",
} as const;

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

/** 列表行被临时停用 / 当前播放时的底色（上游 `ListTab.tsx`）。 */
export const ListRowColors = {
  disabled: "#737373ff",
  current: "#c14848ff",
} as const;

/** 玩家名/聊天的颜色（上游 `CustomColors`）。 */
export const CustomColors = {
  opponentColor: "#ff9f9fff",
  selfColor: "#9f9fffff",
  systemColor: "#9f9f9f99",
} as const;

/** 提示条/横幅出现时的淡入（上游对显隐元素用 `transition: opacity 0.3s ease`）。 */
export const fadeInSx = {
  animation: "tmc-fade-in 0.3s ease",
  "@keyframes tmc-fade-in": {
    from: { opacity: 0, transform: "translateY(-4px)" },
    to: { opacity: 1, transform: "translateY(0)" },
  },
} as const;

/** 卡面宽高比（上游 `Configs.ts` 的 `CardAspectRatio`）。 */
export const CardAspectRatio = 703 / 1000;

declare module "@mui/material/styles" {
  interface Theme {
    custom: {
      mainTabBackground: string;
      listBackground1: string;
      listBackground2: string;
      alice: string;
    };
  }
  interface ThemeOptions {
    custom?: {
      mainTabBackground?: string;
      listBackground1?: string;
      listBackground2?: string;
      alice?: string;
    };
  }
}

export function buildTheme(): Theme {
  return createTheme({
    custom: { ...CustomThemeColors },
    // 上游是**深色**主题：页面底 #141414、纸面 #262626、正文白、次要文字 #babcc1
    palette: {
      mode: "dark",
      primary: { main: Palette.primary },
      secondary: { main: Palette.secondary },
      background: { default: Palette.background, paper: Palette.surface },
      text: { primary: Palette.text, secondary: Palette.muted },
      divider: Palette.divider,
      success: { main: Palette.success },
      info: { main: Palette.info },
    },
    typography: {
      fontFamily: NoFontFamily,
      button: { textTransform: "none" },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          // 显式钉住页面底色（与 `palette.background.default` 同值，避免任何情况下回到白底）
          body: { backgroundColor: Palette.background, color: Palette.text },
        },
      },
    },
  });
}
