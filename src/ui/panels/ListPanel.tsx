/** 列表页：按 `order` 列出全部角色（上游 ListTab 的文本行风格）。 */
import { Box, Chip, Paper, Stack, Typography } from "@mui/material";
import { useMemo, useState } from "react";

import type { DataBundle } from "../../data/types";
import { displayTitle } from "../../data/types";
import { Localization, t } from "../../i18n/localization";
import { NoFontFamily } from "../../theme/theme";

export function ListPanel({ bundle }: { bundle: DataBundle }) {
  const [query, setQuery] = useState("");
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
    <Stack spacing={1} sx={{ width: "100%", maxWidth: 900, fontFamily: NoFontFamily }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Box
          component="input"
          value={query}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
          placeholder={t(Localization.ConfigTabSearchCharacter)}
          sx={{
            flex: 1, px: 1, py: 0.5, fontFamily: NoFontFamily,
            border: "1px solid", borderColor: "divider", borderRadius: 1,
          }}
        />
        <Typography variant="caption" color="text.secondary">
          {rows.length} / {bundle.characters.length}
        </Typography>
      </Stack>

      <Paper variant="outlined" sx={{ p: 1 }}>
        <Stack spacing={0.25}>
          {rows.map((character) => {
            const [album, title] = character.music[0]!;
            return (
              <Stack
                key={character.key}
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ px: 1, py: 0.5, "&:hover": { backgroundColor: "#f5f5f5" } }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ width: "2.5em" }}>
                  {character.order}
                </Typography>
                <Typography variant="body2" sx={{ width: "12em" }} noWrap>
                  {character.name}
                </Typography>
                <Typography variant="body2" sx={{ flex: 1 }} noWrap>
                  {displayTitle(title)}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ maxWidth: "18em" }} noWrap>
                  {album}
                </Typography>
                <Chip size="small" variant="outlined" label={character.music.length} />
              </Stack>
            );
          })}
        </Stack>
      </Paper>
    </Stack>
  );
}
