/** 音乐源：开关 + fallback 顺序（拖不动就用按钮）+ 状态。 */
import {
  Avatar, Box, Button, Chip, FormControlLabel, IconButton, Radio, RadioGroup, Stack, Switch, TextField,
  Typography,
} from "@mui/material";
import { ArrowDownward, ArrowUpward } from "@mui/icons-material";

import { memo, useMemo, useState } from "react";

import { SectionPanel } from "./SectionCard";
import type { DataBundle } from "../../../data/types";
import { Localization, localized, t } from "../../../i18n/localization";
import { useNet } from "../../../net/useNet";
import { useSession } from "../../../store/session";
import { effectiveOrder, useSourceOverrides } from "../../../store/sources";
import { useCurrentDataset } from "../../../data/useDataset";
import { MUSIC_MODES } from "../../../music/mode";
import type { TableMap } from "../../../music/sources";

function SourceSectionInner({ bundle, tables }: { bundle: DataBundle; tables: TableMap }) {
  const {
    locale, musicMode, setMusicMode, localMusicUrl, setLocalMusicUrl,
  } = useSession();
  /** 房内客户端不能自己切模式（D119）：主机每份快照都会重下发 config，手切过一会儿就会被改回去。
   *  用选择器而不是 `useNet()` 整个 store —— 这个组件 memo 过，聊天 / 参与者一变不该重渲染。 */
  const ownedByHost = useNet((slice) => slice.role === "client");
  const { overrides: sourceOverrides, toggle: toggleSource, move: moveSource } = useSourceOverrides();
  /** 音源也按模式分（契约 sources-separation-v1.md）：配置页列的永远是**当前数据集**的源 */
  const dataset = useCurrentDataset(bundle);
  /** 本地曲库地址的草稿**只在编辑中存在**（`null` = 没在编辑）：不再复制一份真值。
   *  没编辑时输入框直接显示 store 的值 ⇒ 别处写 `localMusicUrl` 天然跟上 ✓，
   *  正在输入的内容也不会被外部变更冲掉 ✓（"渲染期同步草稿"那种写法会吞掉输入 ✗）。 */
  const [draftUrl, setDraftUrl] = useState<string | null>(null);
  /** 输入框显示的永远是"编辑中的内容，否则 store 的真值"。 */
  const urlValue = draftUrl ?? localMusicUrl;
  const ids = dataset.sources.map((source) => source.id);
  const order = effectiveOrder(sourceOverrides, ids);
  /** 按 id 查源（原来在 labelOf/isEnabled/渲染里各做一次线性查找）。 */
  const byId = useMemo(
    () => new Map(dataset.sources.map((source) => [source.id, source])),
    [dataset.sources],
  );
  /** 注册表里的默认开关（按模式，见各自的 toml）——重排时必须沿用，不能被当成"开着"。 */
  const defaultEnabled = Object.fromEntries(dataset.sources.map((source) => [source.id, source.enabled]));
  const localSource = dataset.sources.find((source) => source.kind === "local");
  const labelOf = (id: string): string => {
    const source = byId.get(id);
    return source ? localized(source.label, locale) : id;
  };
  const isEnabled = (id: string): boolean => sourceOverrides[id]?.enabled ?? byId.get(id)?.enabled ?? true;
  /** 本模式一个启用的源都没有 → 曲目解析不出地址（校验只守注册表默认值，用户仍可以自己关掉） */
  const noneEnabled = !ids.some((id) => isEnabled(id));
  /** 行按回退顺序排列（上移/下移移动的是"源"本身，编号只是位置）。 */
  const rows = order
    .map((id) => byId.get(id))
    .filter((source): source is NonNullable<typeof source> => source !== undefined);

  return (
    <SectionPanel id="source" title={t(Localization.ConfigTabMusicSource)}>
      {/* 音乐模式（原曲 / 音MAD）：互斥单选。只过滤"接下来能选哪些曲目"，不打断正在播放的曲目 */}
      <Stack spacing={1} sx={{ mb: 2 }} data-testid="music-mode">
        <Typography variant="subtitle2">{t(Localization.MusicMode)}</Typography>
        <RadioGroup
          row
          value={musicMode}
          onChange={(_event, value) => {
            if (ownedByHost) return;                       // 双保险：disabled 之外再拦一道
            setMusicMode(value as typeof musicMode);
          }}
          aria-label={t(Localization.MusicMode)}
        >
          {MUSIC_MODES.map((mode) => (
            <FormControlLabel
              key={mode}
              value={mode}
              control={<Radio size="small" disabled={ownedByHost} data-testid={`music-mode-${mode}`} />}
              label={t(mode === "originals" ? Localization.MusicModeOriginals : Localization.MusicModeOtomads)}
            />
          ))}
        </RadioGroup>
        <Typography
          variant="caption"
          color="text.secondary"
          data-testid={ownedByHost ? "music-mode-host-controlled" : "music-mode-hint"}
        >
          {t(ownedByHost ? Localization.MusicModeHostControlled : Localization.MusicModeHint)}
        </Typography>
        {musicMode === "otomads" && (
          <Typography variant="caption" color="text.secondary" data-testid="music-mode-local-hint">
            {t(Localization.MusicModeLocalHint)}
          </Typography>
        )}
      </Stack>

      {/* 本地曲库地址：只有**本数据集的注册表里有本地源**时才出现（原曲那边没有本地源，留空即默认） */}
      {localSource && (
      <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: "center" }} data-testid="local-music-url">
        <TextField
          size="small"
          fullWidth
          label={t(Localization.LocalMusicUrl)}
          placeholder={localSource?.tableUrl ?? "/manifest.json"}
          value={urlValue}
          onChange={(event) => setDraftUrl(event.target.value)}
          slotProps={{ htmlInput: { "aria-label": "local-music-url" } }}
        />
        <Button
          size="small"
          variant="outlined"
          sx={{ flexShrink: 0 }}
          data-testid="local-music-apply"
          // 应用后清掉草稿 → 输入框回到"跟着 store 走"（写的也必须是 store 将要持有的那个值）
          onClick={() => { setLocalMusicUrl(urlValue.trim()); setDraftUrl(null); }}
        >
          {t(Localization.LocalMusicApply)}
        </Button>
      </Stack>
      )}

      {/* 一个启用的源都没有：曲目解析不出地址（用户自己关掉时的提示，不拦着） */}
      {noneEnabled && (
        <Typography variant="caption" color="error.main" data-testid="source-none-enabled" sx={{ display: "block", mt: 1 }}>
          {t(Localization.ConfigTabSourceNoneEnabled)}
        </Typography>
      )}

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
        {rows.map((source) => {
          const override = sourceOverrides[source.id];
          // 音源层已按模式拆（契约 sources-separation-v1.md）：音MAD 注册表里只有本地源、它默认就是开的，
          // 所以这里没有"强制打开"这回事了，用户想关也能关（关了就给下面那条提示）。
          const enabled = override?.enabled ?? source.enabled;
          const table = tables[source.id];
          const status = !enabled ? "off"
            : table?.status === "ready" ? `${table.entries.size}`
            : table?.status === "error" ? `✗ ${table.error ?? ""}`
            : "…";
          return (
            <Box key={source.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1 }}>
              <Stack
                direction="row"
                spacing={1}
                // MD2 行高 40dp、垂直居中：控件盒子不再比行高还高（与预设分区同一套规格）
                sx={{ minHeight: 40, alignItems: "center" }}
              >
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
                <Typography variant="body2" sx={{ flex: 1 }}>{labelOf(source.id)}</Typography>
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
                  data-testid={`source-state-${source.id}`}
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
                {localized(source.description, locale)}
              </Typography>
            </Box>
          );
        })}
      </Stack>
    </SectionPanel>
  );
}

/** 分区之间互不牵连：展开一个分区不该把其它分区的长列表一起重渲染（memo 掉）。 */
export const SourceSection = memo(SourceSectionInner);
