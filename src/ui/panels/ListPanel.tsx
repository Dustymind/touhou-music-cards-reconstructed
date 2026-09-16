/** 列表页：按 `order` 列出全部角色（上游 `ListTab` 的整行底色风格）。 */
import { Box, Chip, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useMemo, useState } from "react";

import type { DataBundle } from "../../data/types";
import { displayTitle } from "../../data/types";
import { Localization, t } from "../../i18n/localization";
import { useQueue } from "../../store/queue";
import { ListRowColors, NoFontFamily } from "../../theme/theme";

export function ListPanel({ bundle }: { bundle: DataBundle }) {
  const theme = useTheme();
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

  /** 上游 `ListTab`：隔行交替底色 → 临时停用灰 → 当前播放红（后者优先）。 */
  const rowColor = (index: number, key: string): string => {
    let color = index % 2 === 0 ? theme.custom.listBackground1 : theme.custom.listBackground2;
    if (temporaryDisabled[key]) color = ListRowColors.disabled;
    if (key === currentKey) color = ListRowColors.current;
    return color;
  };

  return (
    <Stack spacing={1} sx={{ width: "100%", maxWidth: 900, fontFamily: NoFontFamily }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Box
          component="input"
          value={query}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
          placeholder={t(Localization.ConfigTabSearchCharacter)}
          sx={{
            flex: 1, px: 1, py: 0.5, fontFamily: NoFontFamily, color: "text.primary",
            backgroundColor: "background.paper",
            border: "1px solid", borderColor: "divider", borderRadius: 1,
          }}
        />
        <Typography variant="caption" color="text.secondary">
          {rows.length} / {bundle.characters.length}
        </Typography>
      </Stack>

      <Stack spacing={0}>
        {rows.map((character, index) => {
          const [album, title] = character.music[0]!;
          const disabled = temporaryDisabled[character.key] === true;
          const current = character.key === currentKey;
          const emphasized = disabled || current;
          return (
            <Stack
              key={character.key}
              direction="row"
              spacing={1}
              alignItems="center"
              onClick={() => {
                if (disabled) toggleTemporary(character.key);
                setCurrent(character.key);
              }}
              sx={{
                px: 1, minHeight: "1.9rem", cursor: "pointer",
                backgroundColor: rowColor(index, character.key),
                color: emphasized ? "white" : "text.primary",
              }}
              data-testid={`list-row-${character.key}`}
            >
              <Typography variant="caption" sx={{ width: "2.5em", opacity: 0.7 }}>
                {character.order}
              </Typography>
              <Typography variant="body2" sx={{ width: "12em" }} noWrap>
                {character.name}
              </Typography>
              <Typography variant="body2" sx={{ flex: 1 }} noWrap>
                {displayTitle(title)}
              </Typography>
              <Typography variant="caption" sx={{ maxWidth: "18em", opacity: 0.7 }} noWrap>
                {album}
              </Typography>
              <Chip size="small" variant="outlined" label={character.music.length} />
            </Stack>
          );
        })}
      </Stack>
    </Stack>
  );
}
