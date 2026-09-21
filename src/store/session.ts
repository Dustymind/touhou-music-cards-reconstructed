/** 会话状态：语言、页签、卡面图集，以及音源开关/顺序的本地覆盖。
 *
 * 上游把 `cardCollection` 放在内存里（刷新即丢），音源是单选且写盘时机有 bug；
 * 这里统一走 `persist.ts` 的版本化存储，逐键独立校验。
 */
import { create } from "zustand";

import { defineStore, isRecord, pickString } from "../persist";
import { DEFAULT_MUSIC_MODE, MUSIC_MODES, type MusicMode } from "../music/mode";
import type { MusicEntry } from "../data/types";
import { getLocale, setLocale, type Locale } from "../i18n/localization";

export const TAB_ORDER = ["player", "list", "config", "game"] as const;
export type TabId = (typeof TAB_ORDER)[number];

interface SessionState {
  locale: Locale;
  tab: TabId;
  cardCollection: string;
  musicMode: MusicMode;
  localMusicUrl: string;
  /** 列表页点了某一首曲目 → 播放器改播这一首（**不落盘**：一次性的点播意图） */
  entryRequest: { key: string; entry: MusicEntry } | null;
  setLocale: (locale: Locale) => void;
  setTab: (tab: TabId) => void;
  setCardCollection: (collection: string) => void;
  /** 音乐模式（原曲 / 音MAD）：只影响"接下来能选哪些曲目"，不打断正在播放的曲目。 */
  setMusicMode: (mode: MusicMode) => void;
  /** 本地曲库地址覆盖（设置页可填；`?localmusic=` 优先） */
  setLocalMusicUrl: (url: string) => void;
  /** 列表页点播：指定角色 + 曲目（角色变了就换角色） */
  setEntryRequest: (request: { key: string; entry: MusicEntry } | null) => void;
}

const LOCALES = ["en", "zh"] as const;

const sessionStore = defineStore<SessionPrefs>({
  name: "session",
  version: 1,
  fallback: {
    locale: "en", tab: "player", cardCollection: "dairi-sd",
    musicMode: DEFAULT_MUSIC_MODE, localMusicUrl: "",
  },
  validate(raw) {
    if (!isRecord(raw)) return null;
    const locale = pickString(raw.locale, LOCALES) as Locale | null;
    const tab = pickString(raw.tab, TAB_ORDER) as TabId | null;
    const cardCollection = pickString(raw.cardCollection);
    // 老存档没有 musicMode → 用默认值（原曲），不因为缺字段就丢弃整份偏好
    const musicMode = (pickString(raw.musicMode, MUSIC_MODES) as MusicMode | null) ?? DEFAULT_MUSIC_MODE;
    if (!locale || !tab || !cardCollection) return null;
    const localMusicUrl = pickString(raw.localMusicUrl) ?? "";
    return { locale, tab, cardCollection, musicMode, localMusicUrl };
  },
});

/** 会话偏好（持久化到 localStorage）。 */
interface SessionPrefs {
  locale: Locale;
  tab: TabId;
  cardCollection: string;
  musicMode: MusicMode;
  /** 本地曲库地址覆盖（空 = 用数据里的默认值：单端口部署下就是同源的 `/manifest.json`） */
  localMusicUrl: string;
}

const initial = sessionStore.load();
setLocale(initial.locale);

export const useSession = create<SessionState>((set, get) => ({
  locale: initial.locale,
  tab: initial.tab,
  cardCollection: initial.cardCollection,
  musicMode: initial.musicMode,
  // URL 参数优先于存档：方便同一份构建在"同源部署"和"本机 8011"之间切换
  localMusicUrl: localMusicUrlFromQuery() ?? initial.localMusicUrl,
  entryRequest: null,

  setLocale(locale) {
    setLocale(locale);
    set({ locale });
    sessionStore.save({ ...pickSession(get()), locale });
  },
  setTab(tab) {
    set({ tab });
    sessionStore.save({ ...pickSession(get()), tab });
  },
  setCardCollection(cardCollection) {
    set({ cardCollection });
    sessionStore.save({ ...pickSession(get()), cardCollection });
  },
  setMusicMode(musicMode) {
    set({ musicMode });
    sessionStore.save({ ...pickSession(get()), musicMode });
  },
  setEntryRequest(entryRequest) {
    set({ entryRequest });
  },
  setLocalMusicUrl(localMusicUrl) {
    set({ localMusicUrl });
    sessionStore.save({ ...pickSession(get()), localMusicUrl });
  },
}));

function pickSession(
  state: Pick<SessionState, "locale" | "tab" | "cardCollection" | "musicMode" | "localMusicUrl">,
) {
  return {
    locale: state.locale,
    tab: state.tab,
    cardCollection: state.cardCollection,
    musicMode: state.musicMode,
    localMusicUrl: state.localMusicUrl,
  };
}

/** `?localmusic=127.0.0.1:8011` 覆盖本地曲库地址（单端口部署不需要它）。 */
function localMusicUrlFromQuery(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("localmusic");
  return value && value.trim() !== "" ? value.trim() : null;
}

export { getLocale };
