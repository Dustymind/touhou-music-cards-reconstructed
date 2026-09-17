/** 列表页：按 `order` 列出全部角色（MD2 `List` 规格：头像 + 主/次文本 + 尾部信息）。 */
import {
  Avatar, Card, CardContent, Chip, List, ListItem, ListItemAvatar, ListItemButton, ListItemText, Stack,
  TextField, Typography,
} from "@mui/material";
import { useMemo, useState } from "react";

import type { DataBundle } from "../../data/types";
import { displayTitle } from "../../data/types";
import { Localization, t } from "../../i18n/localization";
import { useQueue } from "../../store/queue";
import { NoFontFamily } from "../../theme/theme";

export function ListPanel({ bundle }: { bundle: DataBundle }) {
  const [query, setQuery] = useState("");
  const currentKey = useQueue((slice) => slice.currentKey);
  const temporaryDisabled = useQueue((slice) => slice.temporaryDisabled);
  const setCurrent = useQueue((slice) => slice.setCurrent);
  const toggleTemporary = useQueue((slice) => slice.toggleTemporary);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return bundle.characters
      .slice()
      .sort((a, b) => a.order - b.order)
      .filter((character) => {
        if (!needle) return true;
        return [character.name, character.key, ...character.searchNames]
          .some((name) => name.toLowerCase().includes(needle));
      });
  }, [bundle.characters, query]);

  return (
    <Stack spacing={2} sx={{ width: "100%", fontFamily: NoFontFamily }}>
      {/* MD2 文本输入框（filled 变体由主题统一）+ 计数 */}
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <TextField
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t(Localization.ConfigTabSearchCharacter)}
          size="small"
          sx={{ flex: 1, maxWidth: 480 }}
          slotProps={{ htmlInput: { "aria-label": "list-search" } }}
        />
        <Typography variant="caption" color="text.secondary">
          {rows.length} / {bundle.characters.length}
        </Typography>
      </Stack>

      <Card>
        <CardContent>
          <List disablePadding>
            {rows.map((character) => {
              const [album, title] = character.music[0]!;
              const disabled = temporaryDisabled[character.key] === true;
              const current = character.key === currentKey;
              return (
                <ListItem
                  key={character.key}
                  disablePadding
                  divider
                  secondaryAction={<Chip size="small" variant="outlined" label={character.music.length} />}
                >
                  <ListItemButton
                    selected={current}
                    onClick={() => {
                      if (disabled) toggleTemporary(character.key);
                      setCurrent(character.key);
                    }}
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
            })}
          </List>
        </CardContent>
      </Card>
    </Stack>
  );
}
