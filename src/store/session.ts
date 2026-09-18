/** 会话状态：语言、页签、卡面图集，以及音源开关/顺序的本地覆盖。
 *
 * 上游把 `cardCollection` 放在内存里（刷新即丢），音源是单选且写盘时机有 bug；
 * 这里统一走 `persist.ts` 的版本化存储，逐键独立校验。
 */
import { create } from "zustand";

import { defineStore, isRecord, pickBoolean, pickNumber, pickString } from "../persist";
import { DEFAULT_MUSIC_MODE, MUSIC_MODES, type MusicMode } from "../music/mode";
import type { MusicEntry } from "../data/types";
import { getLocale, setLocale, type Locale } from "../i18n/localization";

export const TAB_ORDER = ["player", "list", "config", "game"] as const;
export type TabId = (typeof TAB_ORDER)[number];

interface SourceOverride {
  enabled: boolean;
  order: number;
}

interface SessionState {
  locale: Locale;
  tab: TabId;
  cardCollection: string;
  musicMode: MusicMode;
  localMusicUrl: string;
  sourceOverrides: Record<string, SourceOverride>;
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
  /** 开关某个源：只改 enabled，**不动**它在回退顺序里的位置。 */
  toggleSource: (id: string, enabled: boolean, allIds: string[]) => void;
  /** 上移/下移：交换相邻两个源的位置，其它源（含"默认关闭"的）保持原状。 */
  moveSource: (id: string, direction: -1 | 1, allIds: string[], defaultEnabled: Record<string, boolean>) => void;
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

const sourceStore = defineStore<Record<string, SourceOverride>>({
  name: "sources",
  version: 1,
  fallback: {},
  validate(raw) {
    if (!isRecord(raw)) return null;
    const out: Record<string, SourceOverride> = {};
    for (const [id, value] of Object.entries(raw)) {
      if (!isRecord(value)) continue;
      const enabled = pickBoolean(value.enabled);
      const order = pickNumber(value.order, 0, 99);
      if (enabled === null || order === null) continue;
      out[id] = { enabled, order };
    }
    return out;
  },
  migrate(raw) {
    // v0 曾经只存一个"启用的音源 id"（单选）；迁移成开关表
    const legacy = pickString(raw);
    return legacy ? { [legacy]: { enabled: true, order: 1 } } : null;
  },
});

const initial = sessionStore.load();
setLocale(initial.locale);

export const useSession = create<SessionState>((set, get) => ({
  locale: initial.locale,
  tab: initial.tab,
  cardCollection: initial.cardCollection,
  musicMode: initial.musicMode,
  // URL 参数优先于存档：方便同一份构建在"同源部署"和"本机 8011"之间切换
  localMusicUrl: localMusicUrlFromQuery() ?? initial.localMusicUrl,
  sourceOverrides: sourceStore.load(),
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
  toggleSource(id, enabled, allIds) {
    const overrides = get().sourceOverrides;
    // 位置按"当前实际顺序"取，不要用注册表里的 order —— 否则开关一下就把用户排好的顺序冲掉
    const position = effectiveOrder(overrides, allIds).indexOf(id);
    const next = {
      ...overrides,
      [id]: { enabled, order: position >= 0 ? position + 1 : (overrides[id]?.order ?? 1) },
    };
    set({ sourceOverrides: next });
    sourceStore.save(next);
  },
  moveSource(id, direction, allIds, defaultEnabled) {
    const overrides = get().sourceOverrides;
    const current = effectiveOrder(overrides, allIds);
    const index = current.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return;
    const swapped = [...current];
    [swapped[index], swapped[target]] = [swapped[target]!, swapped[index]!];
    const next: Record<string, SourceOverride> = {};
    for (const [position, sourceId] of swapped.entries()) {
      next[sourceId] = {
        // 没有覆盖过的源必须沿用**注册表里的默认开关**（"本地曲库"默认是关的，
        // 之前这里写死 true，一上移就被悄悄打开了）
        enabled: overrides[sourceId]?.enabled ?? defaultEnabled[sourceId] ?? true,
        order: position + 1,
      };
    }
    set({ sourceOverrides: next });
    sourceStore.save(next);
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

/** 按覆盖表算出实际的 fallback 顺序（未覆盖的按注册表顺序排在后面）。 */
export function effectiveOrder(
  overrides: Record<string, SourceOverride>,
  allIds: string[],
): string[] {
  const overridden = allIds
    .filter((id) => overrides[id])
    .sort((a, b) => (overrides[a]!.order) - (overrides[b]!.order));
  const rest = allIds.filter((id) => !overrides[id]);
  return [...overridden, ...rest];
}

export { getLocale };
