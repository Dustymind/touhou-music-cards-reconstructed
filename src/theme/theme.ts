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

/** Material Design 2 基准配色（参考 https://m2.material.io/design/color/the-color-system.html）。
 *  深色主题用 MD2 深色基准：primary `#BB86FC`、secondary `#03DAC6`、surface/背景 `#121212`、error `#CF6679`
 *  （浅色基准的 `#6200EE` / `#3700B3` 在深色下对比度不足，MD2 深色主题本身就用 200 号紫）。 */
export const MD2_PALETTE = {
  light: {
    primary: "#6200EE",
    primaryVariant: "#3700B3",
    secondary: "#03DAC6",
    secondaryVariant: "#018786",
    background: "#FFFFFF",
    surface: "#FFFFFF",
    error: "#B00020",
  },
  dark: {
    primary: "#BB86FC",
    primaryVariant: "#3700B3",
    secondary: "#03DAC6",
    background: "#121212",
    surface: "#121212",
    error: "#CF6679",
  },
} as const;

const ACTIVE = MD2_PALETTE.dark;

/** 深色表面上"看得见的边框"：MD2 的分隔线是 12% 白，在 #121212 上偏淡，
 *  选卡区外框与卡槽虚线框用 28%（仍属低对比，但不至于看不见）。 */
export const MD2_BORDER = "rgba(255, 255, 255, 0.28)";

/** 深色主题下的表面/文字/分隔线（MD2 规定 onSurface 100%、次要文字 70%、分隔线 12%）。 */
export const Palette = {
  primary: ACTIVE.primary,
  secondary: ACTIVE.secondary,
  background: ACTIVE.background,
  surface: ACTIVE.surface,
  error: ACTIVE.error,
  text: "#FFFFFFFF",
  muted: "rgba(255, 255, 255, 0.7)",
  divider: "rgba(255, 255, 255, 0.12)",
} as const;

/** 卡片状态底色（上游 `CharacterCard.tsx` 的原值）。 */
export const CardColors = {
  Normal: "#ffffff",
  Hover: "#b3f9ffff",
  Disabled: "#d3d3d3ff",
  DisabledHover: "#97ccd6ff",
  Selected: "#71d7ffff",
  Correct: "#b7f5c9ff",     // 抢对：偏 MD2 成功绿
  Incorrect: "#ffcdd2ff",   // 抢错：MD2 error 的浅色调
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
  // MD2 按钮：small(dense) 32 / 常规 36 / large 44；最小宽度常规 64、dense 48
  button: { small: 32, medium: 36, large: 44, minWidth: 64, smallMinWidth: 48, iconSize: 18, iconGap: 8 },
  card: { padding: 16 },
  chip: { height: 32, radius: 16 },
  tab: { height: 48, padding: 16 },
  /** MD2 图标按钮：48dp 触控区 + 24dp 图标。 */
  iconButton: { size: 48, icon: 24 },
  /** MD2 扩展面板：头部 56dp、展开动画用标准缓动。 */
  accordion: {
    header: 56,
    timeout: { enter: 250, exit: 200 },
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    /** MD2：展开图标 onSurface 60%、头部与内容之间 1px 分隔线（onSurface 12%） */
    icon: "rgba(255, 255, 255, 0.6)",
    divider: "rgba(255, 255, 255, 0.12)",
  },
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

export function buildTheme(): Theme {
  return createTheme({
    // 上游是**深色**主题：页面底 #141414、纸面 #262626、正文白、次要文字 #babcc1
    palette: {
      mode: "dark",
      primary: { main: Palette.primary },
      secondary: { main: Palette.secondary },
      background: { default: Palette.background, paper: Palette.surface },
      text: { primary: Palette.text, secondary: Palette.muted },
      divider: Palette.divider,
      error: { main: Palette.error },
      success: { main: "#03DAC6" },   // MD2 深色下用 secondary 青绿表示"成功/次要动作"
      info: { main: "#BB86FC" },
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
          sizeSmall: { height: MD2.button.small, minWidth: MD2.button.smallMinWidth, padding: "0 12px" },
          sizeMedium: { height: MD2.button.medium, padding: "0 16px" },
          sizeLarge: { height: MD2.button.large, padding: "0 22px" },
          // MD2：contained 默认 elevation 2（MUI 已按 2/4/8/0 处理，这里显式关掉"禁用阴影"以外的行为）
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          sizeSmall: { height: MD2.button.small, minWidth: MD2.button.smallMinWidth, padding: "0 12px" },
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
      // MD2 扩展面板（Expansion panel）：4dp 圆角、elevation 1、头上没有分隔线、头部 56dp
      MuiAccordion: {
        defaultProps: { elevation: 1, square: false, disableGutters: true },
        styleOverrides: {
          root: {
            borderRadius: MD2.shape,
            "&:before": { display: "none" },
            // 面板自身不留 margin：间距统一由外层容器的 gap 提供。
            // （别再写 `&.Mui-expanded { margin: 0 }`：MUI 的 Stack spacing 是用子元素 margin 实现的，
            //   覆盖展开态的 margin 会让展开时头部往上滑 16px —— 用户反馈过的问题。）
            margin: 0,
          },
        },
      },
      MuiAccordionSummary: {
        styleOverrides: {
          root: {
            minHeight: MD2.accordion.header,
            paddingLeft: MD2.card.padding,
            paddingRight: MD2.card.padding,
            "&.Mui-expanded": { minHeight: MD2.accordion.header },
          },
          content: { margin: "12px 0", "&.Mui-expanded": { margin: "12px 0" } },
          // MD2：展开图标 24dp、onSurface 60%
          expandIconWrapper: { color: MD2.accordion.icon },
        },
      },
      MuiAccordionDetails: {
        styleOverrides: {
          root: {
            padding: MD2.card.padding,
            // MD2 扩展面板：头部与内容之间有一条 1px 分隔线
            borderTop: `1px solid ${MD2.accordion.divider}`,
          },
        },
      },
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
