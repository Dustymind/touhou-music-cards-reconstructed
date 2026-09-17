/** 音乐源：开关 + fallback 顺序（拖不动就用按钮）+ 状态。 */
import {
  Avatar, Box, Card, CardContent, CardHeader, Chip, FormControlLabel, IconButton, Stack, Switch,
  Typography,
} from "@mui/material";
import { ArrowDownward, ArrowUpward } from "@mui/icons-material";

import type { DataBundle } from "../../../data/types";
import { Localization, t } from "../../../i18n/localization";
import { effectiveOrder, useSession } from "../../../store/session";
import type { TableMap } from "../../../music/sources";

export function SourceSection({ bundle, tables }: { bundle: DataBundle; tables: TableMap }) {
  const { locale, sourceOverrides, toggleSource, moveSource } = useSession();
  const ids = bundle.sources.map((source) => source.id);
  const order = effectiveOrder(sourceOverrides, ids);
  /** 注册表里的默认开关（"本地曲库"默认关闭）——重排时必须沿用，不能被当成"开着"。 */
  const defaultEnabled = Object.fromEntries(bundle.sources.map((source) => [source.id, source.enabled]));
  const labelOf = (id: string): string => {
    const source = bundle.sources.find((entry) => entry.id === id);
    if (!source) return id;
    return locale === "zh" ? source.label.zh : source.label.en;
  };
  const isEnabled = (id: string): boolean => {
    const source = bundle.sources.find((entry) => entry.id === id);
    return sourceOverrides[id]?.enabled ?? source?.enabled ?? true;
  };

  return (
    <Card><CardHeader title={t(Localization.ConfigTabMusicSource)} titleTypographyProps={{ variant: "h6" }} /><CardContent>
      {/* 回退顺序显示：编号 + 实际名称（原来直接把内部 id 拼成字符串，既不可读也不随语言变） */}
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1, mt: 1 }}
        data-testid="source-fallback-order"
      >
        <Typography variant="caption" color="text.secondary">
          {t(Localization.ConfigTabSourceOrder)}
        </Typography>
        {order.map((id, index) => (
          <Stack key={id} direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <Avatar
              sx={{
                width: 20,
                height: 20,
                fontSize: "0.6875rem",
                bgcolor: isEnabled(id) ? "primary.main" : "action.disabledBackground",
                color: isEnabled(id) ? "primary.contrastText" : "text.disabled",
              }}
            >
              {index + 1}
            </Avatar>
            <Typography
              variant="caption"
              sx={{ color: isEnabled(id) ? "text.primary" : "text.disabled" }}
            >
              {labelOf(id)}
            </Typography>
            {index < order.length - 1 && (
              <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>→</Typography>
            )}
          </Stack>
        ))}
      </Stack>
      <Stack spacing={1} sx={{ mt: 1 }}>
        {bundle.sources.map((source) => {
          const override = sourceOverrides[source.id];
          const enabled = override?.enabled ?? source.enabled;
          const table = tables[source.id];
          const status = !enabled ? "off"
            : table?.status === "ready" ? `${table.entries.size}`
            : table?.status === "error" ? `✗ ${table.error ?? ""}`
            : "…";
          return (
            <Box key={source.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1 }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                {/* 顺序编号：MD2 圆形头像（停用的源用灰色） */}
                <Avatar
                  data-testid={`source-order-${source.id}`}
                  sx={{
                    width: 24,
                    height: 24,
                    fontSize: "0.75rem",
                    fontWeight: 500,
                    bgcolor: enabled ? "primary.main" : "action.disabledBackground",
                    color: enabled ? "primary.contrastText" : "text.disabled",
                  }}
                >
                  {order.indexOf(source.id) + 1}
                </Avatar>
                <Typography variant="body2" sx={{ flex: 1 }}>
                  {locale === "zh" ? source.label.zh : source.label.en}
                </Typography>
                <Chip
                  size="small"
                  variant="outlined"
                  color={table?.status === "error" ? "error" : "default"}
                  label={status}
                  data-testid={`source-status-${source.id}`}
                />
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={enabled}
                      onChange={(event) => toggleSource(source.id, event.target.checked, ids)}
                      // MUI v7 用 slotProps.input（旧的 inputProps 已经不再落到 input 上）
                      slotProps={{ input: { "aria-label": `${source.id}-enabled` } }}
                    />
                  }
                  label={t(enabled ? Localization.ConfigTabSourceEnabled : Localization.ConfigTabSourceDisabled)}
                />
                <IconButton
                  size="small"
                  onClick={() => moveSource(source.id, -1, ids, defaultEnabled)}
                  disabled={order.indexOf(source.id) === 0}
                  aria-label={`${source.id}-up`}
                >
                  <ArrowUpward fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => moveSource(source.id, 1, ids, defaultEnabled)}
                  disabled={order.indexOf(source.id) === order.length - 1}
                  aria-label={`${source.id}-down`}
                >
                  <ArrowDownward fontSize="small" />
                </IconButton>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {locale === "zh" ? source.description.zh : source.description.en}
              </Typography>
            </Box>
          );
        })}
      </Stack>
    </CardContent></Card>
  );
}
