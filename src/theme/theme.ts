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

/** 亮/暗两种模式（默认仍是上游的**深色**）。 */
export const THEME_MODES = ["dark", "light"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export const DEFAULT_THEME_MODE: ThemeMode = "dark";

/** 可选的**主题色**（MD2 500 号基准色）。深色主题下会自动提亮一档（MD2 的 200 号口径），
 *  否则 500 号落在 #121212 上对比度不足。 */
export const THEME_COLORS = [
  { id: "purple", color: "#6200ee" },
  { id: "indigo", color: "#3f51b5" },
  { id: "blue", color: "#2196f3" },
  { id: "teal", color: "#009688" },
  { id: "green", color: "#4caf50" },
  { id: "orange", color: "#ff9800" },
  { id: "pink", color: "#e91e63" },
  { id: "red", color: "#f44336" },
] as const;

/** 亮/暗各自的 onSurface 口径（MD2：正文 87%、次要 60%、分隔线 12%；深色下用白的不同透明度）。
 *  这几个值会写进 `:root` 的 CSS 变量，组件只引 `ThemeTokens.*` ⇒ 切模式不必改任何组件。 */
const MODE_TOKENS = {
  dark: {
    text: "#FFFFFFFF", muted: "rgba(255, 255, 255, 0.7)", divider: "rgba(255, 255, 255, 0.12)",
    icon: "rgba(255, 255, 255, 0.6)", border: "rgba(255, 255, 255, 0.28)",
    slot: "rgba(255, 255, 255, 0.45)",
  },
  light: {
    text: "rgba(0, 0, 0, 0.87)", muted: "rgba(0, 0, 0, 0.6)", divider: "rgba(0, 0, 0, 0.12)",
    icon: "rgba(0, 0, 0, 0.6)", border: "rgba(0, 0, 0, 0.28)",
    slot: "rgba(0, 0, 0, 0.45)",
  },
} as const;

/** 主题相关的颜色在组件里一律走这几个 token（真值由 `buildTheme()` 按模式写进 `:root`）：
 *  "亮/暗 + 自定义主题色"只改一处，组件里不出现写死的颜色。 */
export const ThemeTokens = {
  text: "var(--tmc-text)",
  muted: "var(--tmc-muted)",
  divider: "var(--tmc-divider)",
  icon: "var(--tmc-icon)",
  border: "var(--tmc-border)",
  /** 空卡槽的虚线框（比 `border` 更实 —— 用户反馈游戏页的卡槽"太虚太细"）。 */
  slot: "var(--tmc-slot)",
} as const;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** `#rrggbb` 校验（设置页与 store 共用一处口径）。 */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value.trim());
}

/** 统一成小写 `#rrggbb`（比较与落盘都用它）。 */
export function normalizeHex(value: string): string {
  return value.trim().toLowerCase();
}

/** 往白（`target=255`）或黑（`target=0`）方向混 `amount`（0–1）。 */
function mix(hex: string, target: number, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number): number => {
    const value = (n >> shift) & 0xff;
    return Math.round(value + (target - value) * amount);
  };
  const [r, g, b] = [channel(16), channel(8), channel(0)];
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** 相对亮度（WCAG 口径），决定 onPrimary 用黑还是白。 */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (value: number): number => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 0xff) + 0.7152 * lin((n >> 8) & 0xff) + 0.0722 * lin(n & 0xff);
}

/** 主题色 → 该模式下好用的那一档：深色提亮 35%（≈ MD2 200 号），浅色太亮时压暗 20%。 */
export function themeColorFor(color: string, mode: ThemeMode): string {
  const hex = normalizeHex(color);
  if (mode === "dark") return luminance(hex) > 0.5 ? hex : mix(hex, 255, 0.35);
  return luminance(hex) > 0.6 ? mix(hex, 0, 0.2) : hex;
}

/** 主题色上的文字色（MD2 onPrimary）。 */
export function onColorFor(color: string): string {
  return luminance(normalizeHex(color)) > 0.5 ? "rgba(0, 0, 0, 0.87)" : "#FFFFFF";
}

const ACTIVE = MD2_PALETTE.dark;

/** 空卡槽的虚线框：颜色取自主题（亮/暗各一档），**线宽 2dp** —— 原来是 1px + 28% 白，
 *  用户反馈"太虚太细"；两处（牌库空槽、卡面占位）共用这一份口径。 */
export const MD2_SLOT = { color: ThemeTokens.slot, width: 2 } as const;

/** 深色表面上"看得见的边框"：MD2 的分隔线是 12% 白，在 #121212 上偏淡，
 *  选卡区外框与卡槽虚线框用 28%（仍属低对比，但不至于看不见）。 */
export const MD2_BORDER = ThemeTokens.border;

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
    icon: ThemeTokens.icon,
    divider: ThemeTokens.divider,
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

/** 建主题。**不带参数时与以前逐字相同**（深色 + MD2 基准色）——
 *  设置页把它接上 `store/appearance` 的模式与主题色；两套值都由 `MD2_PALETTE` / `MODE_TOKENS` 提供。 */
export function buildTheme(options: { mode?: ThemeMode; primary?: string } = {}): Theme {
  const mode = options.mode ?? DEFAULT_THEME_MODE;
  const base = MD2_PALETTE[mode];
  const tokens = MODE_TOKENS[mode];
  // 没给自定义色 ⇒ 直接用 MD2 该模式的基准色（**不做提亮**，与改前逐字相同）
  const primary = isHexColor(options.primary) ? themeColorFor(options.primary, mode) : base.primary;
  const onPrimary = onColorFor(primary);
  return createTheme({
    palette: {
      mode,
      primary: { main: primary, contrastText: onPrimary },
      secondary: { main: base.secondary },
      background: { default: base.background, paper: base.surface },
      text: { primary: tokens.text, secondary: tokens.muted },
      divider: tokens.divider,
      error: { main: base.error },
      success: { main: "#03DAC6" },   // MD2 用 secondary 青绿表示"成功/次要动作"
      info: { main: primary },
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
          // 主题相关的颜色只在这里落成 CSS 变量：组件引用 `ThemeTokens.*`（或 `MD2_BORDER` /
          // `MD2.accordion.*`）⇒ 切亮暗、换主题色都不必改组件。`color-scheme` 让浏览器把滚动条等
          // 原生控件按当前模式绘制。
          ":root": {
            "--tmc-text": tokens.text,
            "--tmc-muted": tokens.muted,
            "--tmc-divider": tokens.divider,
            "--tmc-icon": tokens.icon,
            "--tmc-border": tokens.border,
            "--tmc-slot": tokens.slot,
            "--tmc-primary": primary,
            "--tmc-on-primary": onPrimary,
          },
          html: { colorScheme: mode },
          // 显式钉住页面底色（与 `palette.background.default` 同值，避免任何情况下回到白底）
          body: {
            backgroundColor: base.background,
            color: tokens.text,
            colorScheme: mode,
          },
        },
      },
    },
  });
}
