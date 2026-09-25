/** 设置页「外观」：亮/暗模式 + 主题色（MD2 色板或自定义）。
 *
 *  规矩（与其它分区一致）：**颜色只在 `theme.ts` 里定义**，组件不写死颜色；
 *  间距取 `MD2.grid` 的倍数；分区用 `SectionPanel`（默认折叠 + 惰性挂载）；
 *  能点的东西都带 `data-testid`（e2e 依赖它）。
 */
import DarkModeRounded from "@mui/icons-material/DarkModeRounded";
import LightModeRounded from "@mui/icons-material/LightModeRounded";
import {
  Box, Button, Divider, Stack, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";

import { SectionPanel } from "./SectionCard";
import { Localization, t } from "../../../i18n/localization";
import { useAppearance } from "../../../store/appearance";
import { MD2, MD2_PALETTE, THEME_COLORS, type ThemeMode } from "../../../theme/theme";

/** 色块直径（MD2：触控目标 48dp，图标/色块本体 32dp —— 与 `MD2.iconButton` 同一口径）。 */
const SWATCH = 32;

export function AppearanceSection() {
  const { mode, primary, setMode, setPrimary, resetPrimary } = useAppearance();

  return (
    <SectionPanel id="appearance" title={t(Localization.ConfigAppearanceTitle)}>
      <Stack spacing={MD2.grid}>
        {/* 模式：MD2 的 segmented control（ToggleButtonGroup） */}
        <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", gap: 2 }}>
          <Typography variant="body2" sx={{ minWidth: 88 }}>
            {t(Localization.ConfigAppearanceMode)}
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={mode}
            onChange={(_event, next: ThemeMode | null) => { if (next) setMode(next); }}
            aria-label={t(Localization.ConfigAppearanceMode)}
          >
            <ToggleButton value="light" data-testid="theme-mode-light">
              <LightModeRounded fontSize="small" sx={{ mr: 0.5 }} />
              {t(Localization.ConfigAppearanceModeLight)}
            </ToggleButton>
            <ToggleButton value="dark" data-testid="theme-mode-dark">
              <DarkModeRounded fontSize="small" sx={{ mr: 0.5 }} />
              {t(Localization.ConfigAppearanceModeDark)}
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        <Divider />

        {/* 主题色：色板 + 自定义 + 恢复默认 */}
        <Stack spacing={1}>
          <Typography variant="body2">{t(Localization.ConfigAppearanceColor)}</Typography>
          {/* 换行后行首要对齐 ⇒ 用 gap 而不是 Stack 的 spacing（spacing 是给子项加 margin，会留左缩进） */}
          <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}>
            {THEME_COLORS.map(({ id, color }) => {
              const active = primary === color;
              return (
                <Box
                  key={id}
                  component="button"
                  type="button"
                  data-testid={`theme-color-${id}`}
                  aria-label={`${t(Localization.ConfigAppearanceColor)} ${id}`}
                  aria-pressed={active}
                  onClick={() => setPrimary(color)}
                  sx={{
                    width: SWATCH, height: SWATCH, p: 0, borderRadius: "50%",
                    bgcolor: color, border: "none", cursor: "pointer",
                    // 选中态用"色块 + 外圈留白"表示（MD2 的选中环），不改色块本身
                    outline: active ? `2px solid ${color}` : "none",
                    outlineOffset: 2,
                    boxShadow: 1,
                  }}
                />
              );
            })}
            <Stack direction="row" sx={{ alignItems: "center", gap: 1, ml: 1 }}>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {t(Localization.ConfigAppearanceCustom)}
              </Typography>
              <Box
                component="input"
                type="color"
                data-testid="theme-color-custom"
                aria-label={t(Localization.ConfigAppearanceCustom)}
                // 没自定义时显示当前模式的 MD2 基准色（点开取色器看到的起点就是"现在用的"）
                value={primary || MD2_PALETTE.dark.primary}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setPrimary(event.target.value)}
                sx={{
                  width: SWATCH, height: SWATCH, p: 0, border: "none", cursor: "pointer",
                  bgcolor: "transparent",
                }}
              />
            </Stack>
            <Button
              size="small"
              data-testid="theme-color-reset"
              disabled={primary === ""}
              onClick={resetPrimary}
            >
              {t(Localization.LocalMusicReset)}
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </SectionPanel>
  );
}
