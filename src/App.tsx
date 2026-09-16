import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { Alert, Box, CircularProgress, Stack, Typography } from "@mui/material";

import { useDataBundle } from "./data/useData";
import { Localization, t } from "./i18n/localization";
import { buildTheme, NoFontFamily } from "./theme/theme";
import { AppShell } from "./ui/shell/AppShell";
import { useSession } from "./store/session";

export default function App() {
  const { status, bundle, error, reload } = useDataBundle();
  const setTab = useSession((state) => state.setTab);

  return (
    <ThemeProvider theme={buildTheme()}>
      <CssBaseline />
      {status !== "ready" && (
        <Stack spacing={2} sx={{ alignItems: "center", p: 6, fontFamily: NoFontFamily }}>
          {status === "loading" ? (
            <>
              <CircularProgress size={28} />
              <Typography variant="body2">{t(Localization.ShellLoading)}</Typography>
            </>
          ) : (
            <>
              <Alert severity="error" sx={{ maxWidth: 640 }}>
                <Typography variant="subtitle2">{t(Localization.ShellLoadFailed)}</Typography>
                <Typography variant="body2" sx={{ wordBreak: "break-all" }}>{error}</Typography>
              </Alert>
              <Box
                component="button"
                onClick={reload}
                sx={{ fontFamily: NoFontFamily, px: 2, py: 1, cursor: "pointer" }}
              >
                retry
              </Box>
            </>
          )}
        </Stack>
      )}
      {status === "ready" && bundle && <AppShell bundle={bundle} onAlice={() => setTab("player")} />}
    </ThemeProvider>
  );
}
