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

  return (
    <Card><CardHeader title={t(Localization.ConfigTabMusicSource)} titleTypographyProps={{ variant: "h6" }} /><CardContent>
      <Typography variant="caption" color="text.secondary">
        {t(Localization.ConfigTabSourceOrder)} · {order.join(" → ")}
      </Typography>
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
                      onChange={(event) => toggleSource(source.id, event.target.checked, source.order)}
                      inputProps={{ "aria-label": `${source.id}-enabled` }}
                    />
                  }
                  label={t(enabled ? Localization.ConfigTabSourceEnabled : Localization.ConfigTabSourceDisabled)}
                />
                <IconButton size="small" onClick={() => moveSource(source.id, -1, ids)} aria-label={`${source.id}-up`}>
                  <ArrowUpward fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={() => moveSource(source.id, 1, ids)} aria-label={`${source.id}-down`}>
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
