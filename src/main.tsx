import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { enableCheat, isCheatString } from "./cheat";
import { resolveInitialLocale, setLocale } from "./i18n/localization";
import { useSession } from "./store/session";
import "./theme/fonts.css";

/** 启动期的 URL 参数：locale / cheatcode / g（对齐上游）。 */
async function bootstrap(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const locale = resolveInitialLocale(window.location.search, navigator.language ?? "en");
  setLocale(locale);
  useSession.setState({ locale });

  const cheatParam = params.get("cheatcode");
  if (cheatParam && (await isCheatString(cheatParam))) {
    enableCheat();
    console.info("Cheat mode enabled!");
  }
}

void bootstrap().finally(() => {
  const container = document.getElementById("root");
  if (!container) throw new Error("#root not found");
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
