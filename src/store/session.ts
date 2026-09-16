/** 会话状态：语言、页签、卡面图集，以及音源开关/顺序的本地覆盖。
 *
 * 上游把 `cardCollection` 放在内存里（刷新即丢），音源是单选且写盘时机有 bug；
 * 这里统一走 `persist.ts` 的版本化存储，逐键独立校验。
 */
import { create } from "zustand";

import { defineStore, isRecord, pickBoolean, pickNumber, pickString } from "../persist";
import { getLocale, setLocale, type Locale } from "../i18n/localization";

export const TAB_ORDER = ["player", "list", "config", "game"] as const;
export type TabId = (typeof TAB_ORDER)[number];

export interface SourceOverride {
  enabled: boolean;
  order: number;
}

interface SessionState {
  locale: Locale;
  tab: TabId;
  cardCollection: string;
  sourceOverrides: Record<string, SourceOverride>;
  setLocale: (locale: Locale) => void;
  setTab: (tab: TabId) => void;
  setCardCollection: (collection: string) => void;
  toggleSource: (id: string, enabled: boolean, fallbackOrder: number) => void;
  moveSource: (id: string, direction: -1 | 1, allIds: string[]) => void;
}

const LOCALES = ["en", "zh"] as const;

const sessionStore = defineStore<{ locale: Locale; tab: TabId; cardCollection: string }>({
  name: "session",
  version: 1,
  fallback: { locale: "en", tab: "player", cardCollection: "dairi-sd" },
  validate(raw) {
    if (!isRecord(raw)) return null;
    const locale = pickString(raw.locale, LOCALES) as Locale | null;
    const tab = pickString(raw.tab, TAB_ORDER) as TabId | null;
    const cardCollection = pickString(raw.cardCollection);
    if (!locale || !tab || !cardCollection) return null;
    return { locale, tab, cardCollection };
  },
});

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
  sourceOverrides: sourceStore.load(),

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
  toggleSource(id, enabled, fallbackOrder) {
    const next = { ...get().sourceOverrides, [id]: { enabled, order: fallbackOrder } };
    set({ sourceOverrides: next });
    sourceStore.save(next);
  },
  moveSource(id, direction, allIds) {
    const current = effectiveOrder(get().sourceOverrides, allIds);
    const index = current.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return;
    const swapped = [...current];
    const a = swapped[index]!;
    const b = swapped[target]!;
    swapped[index] = b;
    swapped[target] = a;
    const next: Record<string, SourceOverride> = {};
    for (const [position, sourceId] of swapped.entries()) {
      next[sourceId] = {
        enabled: get().sourceOverrides[sourceId]?.enabled ?? true,
        order: position + 1,
      };
    }
    set({ sourceOverrides: next });
    sourceStore.save(next);
  },
}));

function pickSession(state: Pick<SessionState, "locale" | "tab" | "cardCollection">) {
  return { locale: state.locale, tab: state.tab, cardCollection: state.cardCollection };
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
