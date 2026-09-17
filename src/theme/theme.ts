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

/** Material Design 2 的关键规格（参考 https://m2.material.io/）。 */
export const MD2 = {
  /** 标准圆角（形状规格：4dp）。 */
  shape: 4,
  /** 8dp 栅格：组件间距都用它的倍数。 */
  grid: 8,
  button: { small: 32, medium: 36, large: 44, minWidth: 64, iconSize: 18, iconGap: 8 },
  card: { padding: 16 },
  chip: { height: 32, radius: 16 },
  tab: { height: 48, padding: 16 },
  listItem: { minHeight: 56 },
  field: { height: 56 },
  /** 响应式页边距（移动 16 / 桌面 24）。 */
  margin: { mobile: 16, desktop: 24 },
} as const;

/** MD2 类型比例表（字号 / 字重 / 行高 / 字距，单位 px）。
 *  MD2 的字距是按 Roboto 调的；本项目的字体是用户指定的系统栈，所以要**显式**写出来
 *  （MUI 只在字体等于 Roboto 时才自动加字距）。 */
export const MD2_TYPE_SCALE = {
  h1: { fontSize: 96, fontWeight: 300, lineHeight: 1.167, letterSpacing: "-1.5px" },
  h2: { fontSize: 60, fontWeight: 300, lineHeight: 1.2, letterSpacing: "-0.5px" },
  h3: { fontSize: 48, fontWeight: 400, lineHeight: 1.167, letterSpacing: "0px" },
  h4: { fontSize: 34, fontWeight: 400, lineHeight: 1.235, letterSpacing: "0.25px" },
  h5: { fontSize: 24, fontWeight: 400, lineHeight: 1.334, letterSpacing: "0px" },
  h6: { fontSize: 20, fontWeight: 500, lineHeight: 1.6, letterSpacing: "0.15px" },
  subtitle1: { fontSize: 16, fontWeight: 400, lineHeight: 1.75, letterSpacing: "0.15px" },
  subtitle2: { fontSize: 14, fontWeight: 500, lineHeight: 1.57, letterSpacing: "0.1px" },
  body1: { fontSize: 16, fontWeight: 400, lineHeight: 1.5, letterSpacing: "0.5px" },
  body2: { fontSize: 14, fontWeight: 400, lineHeight: 1.43, letterSpacing: "0.25px" },
  button: { fontSize: 14, fontWeight: 500, lineHeight: 1.75, letterSpacing: "1.25px", textTransform: "uppercase" as const },
  caption: { fontSize: 12, fontWeight: 400, lineHeight: 1.66, letterSpacing: "0.4px" },
  overline: { fontSize: 10, fontWeight: 400, lineHeight: 2.66, letterSpacing: "1.5px", textTransform: "uppercase" as const },
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
    // MD2 形状与类型比例（字号/字重/行高/字距；按钮与 overline 大写）
    shape: { borderRadius: MD2.shape },
    typography: { fontFamily: NoFontFamily, ...MD2_TYPE_SCALE },
    components: {
      // ---- MD2 组件规格 ----
      MuiButton: {
        styleOverrides: {
          root: { minWidth: MD2.button.minWidth, borderRadius: MD2.shape },
          // MD2 按钮高度：small 32 / medium 36 / large 44
          sizeSmall: { height: MD2.button.small, padding: "0 12px" },
          sizeMedium: { height: MD2.button.medium, padding: "0 16px" },
          sizeLarge: { height: MD2.button.large, padding: "0 22px" },
          // MD2：contained 默认 elevation 2（MUI 已按 2/4/8/0 处理，这里显式关掉"禁用阴影"以外的行为）
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          sizeSmall: { height: MD2.button.small, padding: "0 12px" },
          sizeMedium: { height: MD2.button.medium, padding: "0 16px" },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: { borderRadius: MD2.shape },
        },
      },
      MuiCardContent: {
        styleOverrides: {
          root: { padding: MD2.card.padding, "&:last-child": { paddingBottom: MD2.card.padding } },
        },
      },
      MuiPaper: { styleOverrides: { rounded: { borderRadius: MD2.shape } } },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: MD2.chip.radius, height: MD2.chip.height },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: MD2.tab.height,
            padding: `12px ${MD2.tab.padding}px`,
            textTransform: "uppercase",
            fontSize: MD2_TYPE_SCALE.button.fontSize,
            fontWeight: MD2_TYPE_SCALE.button.fontWeight,
            letterSpacing: MD2_TYPE_SCALE.button.letterSpacing,
          },
        },
      },
      MuiTabs: { styleOverrides: { root: { minHeight: MD2.tab.height } } },
      MuiListItem: {
        styleOverrides: {
          root: { minHeight: MD2.listItem.minHeight },
        },
      },
      MuiTextField: { defaultProps: { variant: "filled" } },
      MuiSelect: { defaultProps: { variant: "filled" } },
      MuiAppBar: {
        defaultProps: { color: "default", elevation: 4 },
        styleOverrides: { root: { borderRadius: 0 } },
      },
      MuiAlert: { styleOverrides: { root: { borderRadius: MD2.shape } } },
      MuiTooltip: { styleOverrides: { tooltip: { borderRadius: MD2.shape } } },
      MuiCssBaseline: {
        styleOverrides: {
          // `color-scheme: dark` 让浏览器把滚动条等原生控件画成深色（上游靠 MUI 深色主题拿到同一效果）
          html: { colorScheme: "dark" },
          // 显式钉住页面底色（与 `palette.background.default` 同值，避免任何情况下回到白底）
          body: {
            backgroundColor: Palette.background,
            color: Palette.text,
            colorScheme: "dark",
          },
        },
      },
    },
  });
}
