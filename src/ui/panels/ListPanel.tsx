/** 列表页：按 `order` 列出全部角色（MD2 `List` 规格：头像 + 主/次文本 + 尾部信息）。
 *
 * 每个角色行都可以**展开曲目列表**（MD2 Expansion：默认折叠、250ms `cubic-bezier(0.4,0,0.2,1)`、
 * 展开时旋转的箭头），曲目行沿用列表的显示格式（曲名 + 专辑），点一下就开始播放那一首。
 */
import {
  Avatar, Box, Card, CardContent, Chip, Collapse, InputAdornment, List, ListItem,
  ListItemAvatar, ListItemButton, ListItemText, Stack, TextField, Typography,
} from "@mui/material";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import GraphicEqRounded from "@mui/icons-material/GraphicEqRounded";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import { memo, useCallback, useDeferredValue, useMemo, useState } from "react";

import type { CharacterRecord, DataBundle, MusicEntry } from "../../data/types";
import { displayTitle } from "../../data/types";
import { Localization, t } from "../../i18n/localization";
import { useCurrentDataset } from "../../data/useDataset";
import { currentQueue, useQueue } from "../../store/queue";
import { MD2, NoFontFamily } from "../../theme/theme";

interface ListPanelProps {
  bundle: DataBundle;
  /** 点某一首曲目 → 立刻播这一首（播放能力由外壳提供） */
  onPlayTrack?: (key: string, entry: MusicEntry) => void;
  /** 正在播放的角色 / 曲目：用于把"正在播的这首"高亮出来 */
  playingKey?: string | null;
  playingEntry?: MusicEntry | null;
}

function ListPanelInner({ bundle, onPlayTrack, playingKey, playingEntry }: ListPanelProps) {
  // C：数据集已经只含**当前模式**的角色与曲目，不再需要按 album.pack 过滤（B 的那层过滤删掉）
  const dataset = useCurrentDataset(bundle);
  const [query, setQuery] = useState("");
  /** 展开的角色（默认全部折叠） */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const currentKey = useQueue((slice) => slice.currentKey);
  const temporaryDisabled = useQueue((slice) => slice.temporaryDisabled);

  // 搜索用 deferred 值：输入时先出字，重列表渲染让给下一帧（避免每个按键都卡一下）
  const deferredQuery = useDeferredValue(query);
  // 稳定回调：不然每行拿到的都是新函数，memo 失效 → 切一行要重渲染 121 行（实测 188ms）
  const handleSelect = useCallback((key: string) => {
    const queue = currentQueue().getState();
    if (queue.temporaryDisabled[key]) queue.toggleTemporary(key);
    queue.setCurrent(key);
  }, []);
  const handleToggle = useCallback((key: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /** 计数行的分母：数据集里有曲目的角色数（音MAD 是 35，不是 121） */
  const playableCount = dataset.characters.length;

  const rows = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return dataset.characters
      .slice()
      .sort((a, b) => a.order - b.order)
      .filter((character) => {
        if (!needle) return true;
        return [character.name, character.key, ...character.searchNames]
          .some((name) => name.toLowerCase().includes(needle));
      });
  }, [dataset.characters, deferredQuery]);

  /** 正在播放的那一首（角色 + 专辑 + 曲名），用于高亮；只算一次传给各行 */
  const playing = useMemo(
    () => (playingKey && playingEntry
      ? `${playingKey}|${playingEntry[0]}|${playingEntry[1]}`
      : null),
    [playingKey, playingEntry],
  );

  return (
    <Stack spacing={2} sx={{ width: "100%", fontFamily: NoFontFamily }}>
      {/* MD2 文本输入框（filled 变体由主题统一）+ 计数 */}
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <TextField
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t(Localization.ConfigTabSearchCharacter)}
          size="small"
          // outlined：没有浮动标签占位，占位文字才会垂直居中（filled 会为标签留出上方空间）
          variant="outlined"
          sx={{ flex: 1, maxWidth: 480 }}
          slotProps={{
            htmlInput: { "aria-label": "list-search" },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRounded fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <Typography variant="caption" color="text.secondary">
          {rows.length} / {playableCount}
        </Typography>
      </Stack>

      <Card>
        <CardContent>
          <List disablePadding>
            {rows.map((character) => (
              <ListRow
                key={character.key}
                character={character}
                current={character.key === currentKey}
                disabled={temporaryDisabled[character.key] === true}
                expanded={expanded.has(character.key)}
                playing={playing}
                onSelect={handleSelect}
                onToggle={handleToggle}
                onPlayTrack={onPlayTrack}
              />
            ))}
          </List>
        </CardContent>
      </Card>
    </Stack>
  );
}

/** 单行记忆化：状态没变的行不重渲染（121 行逐个 MUI ListItem 很贵）。 */
const ListRow = memo(function ListRow({
  character, current, disabled, expanded, playing, onSelect, onToggle, onPlayTrack,
}: {
  character: CharacterRecord;
  current: boolean;
  disabled: boolean;
  expanded: boolean;
  playing: string | null;
  onSelect: (key: string) => void;
  onToggle: (key: string) => void;
  onPlayTrack?: (key: string, entry: MusicEntry) => void;
}) {
  const [album, title] = character.music[0]!;
  return (
    <ListItem disablePadding divider sx={{ display: "block" }}>
      {/* 行本身点一下展开/收起曲目（默认折叠）；同时仍然选中这个角色 */}
      <ListItemButton
        selected={current}
        onClick={() => {
          onSelect(character.key);
          onToggle(character.key);
        }}
        data-testid={`list-row-${character.key}`}
        aria-expanded={expanded}
        sx={disabled ? { opacity: 0.5 } : undefined}
      >
        <ListItemAvatar>
          <Avatar sx={{ width: 32, height: 32, fontSize: "0.875rem" }}>
            {character.order}
          </Avatar>
        </ListItemAvatar>
        <ListItemText
          primary={character.name}
          secondary={`${displayTitle(title)} · ${album}`}
          slotProps={{
            primary: { variant: "body1", noWrap: true },
            secondary: { variant: "body2", noWrap: true, color: "text.secondary" },
          }}
        />
        <Chip size="small" variant="outlined" label={character.music.length} sx={{ mr: 1, flexShrink: 0 }} />
        {/* MD2 展开箭头：展开时旋转 180°（250ms 标准缓动） */}
        <Box
          data-testid={`list-expand-${character.key}`}
          aria-hidden
          sx={{
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
            color: "text.secondary",
            transform: expanded ? "rotate(180deg)" : "none",
            transition: `transform ${MD2.accordion.timeout.enter}ms ${MD2.accordion.easing}`,
          }}
        >
          <ExpandMoreRounded fontSize="small" />
        </Box>
      </ListItemButton>

      {/* 曲目：只有展开时才挂载（默认折叠 → 121 行不会一次性铺开） */}
      <Collapse in={expanded} timeout={MD2.accordion.timeout} unmountOnExit>
        <List disablePadding data-testid={`list-tracks-${character.key}`}>
          {character.music.map((entry) => {
            const id = `${character.key}|${entry[0]}|${entry[1]}`;
            const active = playing === id;
            return (
              <ListItem key={id} disablePadding divider>
                <ListItemButton
                  // MD2 列表缩进：让到头像列之后（桌面 72dp，窄屏收一点）
                  sx={{
                    pl: { xs: 7, sm: 9 },
                    minHeight: MD2.listItem,
                    ...(active ? { bgcolor: "action.selected" } : {}),
                  }}
                  onClick={() => onPlayTrack?.(character.key, entry)}
                  data-testid={`list-track-${character.key}-${entry[0]}-${entry[1]}`}
                >
                  <Box sx={{ mr: 2, display: "flex", alignItems: "center" }}>
                    {active
                      ? <GraphicEqRounded fontSize="small" color="primary" />
                      : <PlayArrowRounded fontSize="small" sx={{ color: "text.secondary" }} />}
                  </Box>
                  {/* 与列表行同一套格式：主文本 = 曲名，次文本 = 专辑 */}
                  <ListItemText
                    primary={displayTitle(entry[1])}
                    secondary={entry[0]}
                    slotProps={{
                      primary: {
                        variant: "body2",
                        noWrap: true,
                        ...(active ? { color: "primary.main", fontWeight: 500 } : {}),
                      },
                      secondary: { variant: "caption", noWrap: true, color: "text.secondary" },
                    }}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Collapse>
    </ListItem>
  );
});

/** 面板级 memo：外壳状态（语言 / 音乐模式 / 分区展开）变化时不必重算整页。 */
export const ListPanel = memo(ListPanelInner);
