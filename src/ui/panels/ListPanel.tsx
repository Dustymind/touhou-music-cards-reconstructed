/** 列表页：按 `order` 列出全部角色（MD2 `List` 规格：头像 + 主/次文本 + 尾部信息）。 */
import {
  Avatar, Card, CardContent, Chip, InputAdornment, List, ListItem, ListItemAvatar, ListItemButton,
  ListItemText, Stack, TextField, Typography,
} from "@mui/material";
import SearchRounded from "@mui/icons-material/SearchRounded";
import { memo, useCallback, useDeferredValue, useMemo, useState } from "react";

import type { DataBundle } from "../../data/types";
import { displayTitle } from "../../data/types";
import { Localization, t } from "../../i18n/localization";
import { useQueue } from "../../store/queue";
import { NoFontFamily } from "../../theme/theme";

function ListPanelInner({ bundle }: { bundle: DataBundle }) {
  const [query, setQuery] = useState("");
  const currentKey = useQueue((slice) => slice.currentKey);
  const temporaryDisabled = useQueue((slice) => slice.temporaryDisabled);

  // 搜索用 deferred 值：输入时先出字，重列表渲染让给下一帧（避免每个按键都卡一下）
  const deferredQuery = useDeferredValue(query);
  // 稳定回调：不然每行拿到的都是新函数，memo 失效 → 切一行要重渲染 121 行（实测 188ms）
  const handleSelect = useCallback((key: string) => {
    if (useQueue.getState().temporaryDisabled[key]) {
      useQueue.getState().toggleTemporary(key);
    }
    useQueue.getState().setCurrent(key);
  }, []);

  const rows = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return bundle.characters
      .slice()
      .sort((a, b) => a.order - b.order)
      .filter((character) => {
        if (!needle) return true;
        return [character.name, character.key, ...character.searchNames]
          .some((name) => name.toLowerCase().includes(needle));
      });
  }, [bundle.characters, deferredQuery]);

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
          {rows.length} / {bundle.characters.length}
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
                onSelect={handleSelect}
              />
            ))}
          </List>
        </CardContent>
      </Card>
    </Stack>
  );
}

/** 单行记忆化：`currentKey`/停用状态没变的行不重渲染（121 行逐个 MUI ListItem 很贵）。 */
const ListRow = memo(function ListRow({
  character, current, disabled, onSelect,
}: {
  character: DataBundle["characters"][number];
  current: boolean;
  disabled: boolean;
  onSelect: (key: string) => void;
}) {
  const [album, title] = character.music[0]!;
  return (
    <ListItem
      disablePadding
      divider
      secondaryAction={<Chip size="small" variant="outlined" label={character.music.length} />}
    >
      <ListItemButton
        selected={current}
        onClick={() => onSelect(character.key)}
        data-testid={`list-row-${character.key}`}
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
      </ListItemButton>
    </ListItem>
  );
});

/** 面板级 memo：外壳状态（语言 / 音乐模式 / 分区展开）变化时不必重算整页。 */
export const ListPanel = memo(ListPanelInner);
