/** 会话状态：语言、页签、卡面图集，以及音源开关/顺序的本地覆盖。
 *
 * 上游把 `cardCollection` 放在内存里（刷新即丢），音源是单选且写盘时机有 bug；
 * 这里统一走 `persist.ts` 的版本化存储，逐键独立校验。
 */
import { create } from "zustand";

import { defineStore, isRecord, pickString } from "../persist";
import { DEFAULT_MUSIC_MODE, MUSIC_MODES, type MusicMode } from "../music/mode";
import type { MusicEntry } from "../data/types";
import { CARD_RATIOS, type CardRatio } from "../theme/cardRatio";
import { getLocale, setLocale, type Locale } from "../i18n/localization";

export const TAB_ORDER = ["player", "list", "config", "game"] as const;
export type TabId = (typeof TAB_ORDER)[number];

/** 会话级的自定义源覆盖（**不落盘**）：地址 + 它是谁给的。 */
export interface CustomSourceOverride {
  url: string;
  /** `query` = `?customsource=`（启动时读一次）；`host` = 联机时采用了主机下发的源（F3） */
  from: "query" | "host";
}

interface SessionState {
  locale: Locale;
  tab: TabId;
  cardCollection: string;
  musicMode: MusicMode;
  localMusicUrl: string;
  /**
   * 自定义源链接（模式 3）：**默认空、重置 = 清空**（与 D140 的"回默认值"不同 —— 这里的默认值本来就是空）。
   * 落盘；`?customsource=` 与主机下发的值走 `customSourceOverride`，**不写回存档**。
   */
  customSourceUrl: string;
  /** 卡面画幅偏好（常规 / 16:9 / 4:3，D165）：**全局偏好**（与 `cardCollection` 同类）。
   *  `""` = 还没选过 ⇒ 跟着**这套图集自己的默认档**走（使用者/源给的素材默认常规、
   *  模式 3 的合成图集默认 16:9）；内置六套不能换档 ⇒ 这一项对它们无效（永远原比例 703:1000）。 */
  cardRatio: CardRatio | "";
  /** 本次会话生效的覆盖（见 `CustomSourceOverride`）：优先级**高于**存档值 */
  customSourceOverride: CustomSourceOverride | null;
  /**
   * 列表页点了某一首曲目 → 播放器改播这一首（**不落盘**）。
   * 它是一条**一直生效**的覆盖（播放器每次都拿它算 entry），直到两个时机之一把它清掉：
   * 切音乐模式（请求指向的是**另一个数据集**的曲目）或用户在设置页重新配置了**这个角色**
   * （手选 / 禁用，见 `single.ts`）。少了这两处，它就会跨模式泄漏、并长期盖住后来的手选。
   */
  entryRequest: { key: string; entry: MusicEntry } | null;
  setLocale: (locale: Locale) => void;
  setTab: (tab: TabId) => void;
  setCardCollection: (collection: string) => void;
  /** 音乐模式（原曲 / 音MAD）：只影响"接下来能选哪些曲目"，不打断正在播放的曲目。 */
  setMusicMode: (mode: MusicMode) => void;
  /** 本地曲库地址覆盖（设置页可填；`?localmusic=` 优先） */
  setLocalMusicUrl: (url: string) => void;
  /** 自定义源链接（模式 3）：写存档，并**清掉会话级覆盖**（用户刚亲手指定了地址，以他为准） */
  setCustomSourceUrl: (url: string) => void;
  /** 卡面画幅偏好（设置页「卡面设置」里切；落盘） */
  setCardRatio: (ratio: CardRatio) => void;
  /** 采用主机下发的源链接（联机握手期；F3：只在本次会话生效，不写回存档） */
  adoptCustomSourceUrl: (url: string) => void;
  /** 离开房间：清掉**主机给的**那份覆盖，`?customsource=` 那份留着（它跟页面走，不跟房间走） */
  clearHostCustomSource: () => void;
  /** 列表页点播：指定角色 + 曲目（角色变了就换角色） */
  setEntryRequest: (request: { key: string; entry: MusicEntry } | null) => void;
  /** 清掉列表页点播（`key` 省略 = 无条件清）。切模式与设置页改动都走它。 */
  clearEntryRequest: (key?: string) => void;
}

const LOCALES = ["en", "zh"] as const;

const sessionStore = defineStore<SessionPrefs>({
  name: "session",
  version: 1,
  fallback: {
    locale: "en", tab: "player", cardCollection: "dairi-sd",
    musicMode: DEFAULT_MUSIC_MODE, localMusicUrl: "", customSourceUrl: "",
    cardRatio: "",
  },
  validate(raw) {
    if (!isRecord(raw)) return null;
    const locale = pickString(raw.locale, LOCALES) as Locale | null;
    const tab = pickString(raw.tab, TAB_ORDER) as TabId | null;
    const cardCollection = pickString(raw.cardCollection);
    // 缺 musicMode 字段 → 用默认值（原曲），不因为少一个键就丢弃整份偏好
    const musicMode = (pickString(raw.musicMode, MUSIC_MODES) as MusicMode | null) ?? DEFAULT_MUSIC_MODE;
    if (!locale || !tab || !cardCollection) return null;
    const localMusicUrl = pickString(raw.localMusicUrl) ?? "";
    // 缺 customSourceUrl → 空串（= 还没填），不因为少一个键就丢弃整份偏好
    const customSourceUrl = pickString(raw.customSourceUrl) ?? "";
    // 画幅同理：缺字段 / 值认不得 → 空串（= 跟着每套图集自己的默认档），
    // 不因为这一项就丢弃整份偏好
    const cardRatio = (pickString(raw.cardRatio, CARD_RATIOS) as CardRatio | null) ?? "";
    return { locale, tab, cardCollection, musicMode, localMusicUrl, customSourceUrl, cardRatio };
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
  /** 自定义源链接（模式 3；空 = 还没填，这个模式没有数据） */
  customSourceUrl: string;
  /** 卡面画幅偏好（`""` = 跟着图集的默认档 / `"original"` / `"16x9"` / `"4x3"`） */
  cardRatio: CardRatio | "";
}

const initial = sessionStore.load();
setLocale(initial.locale);

export const useSession = create<SessionState>((set, get) => ({
  locale: initial.locale,
  tab: initial.tab,
  cardCollection: initial.cardCollection,
  musicMode: initial.musicMode,
  // URL 参数优先于存档：方便同一份构建在"同源部署"和"本机 8011"之间切换
  localMusicUrl: queryUrl("localmusic") ?? initial.localMusicUrl,
  customSourceUrl: initial.customSourceUrl,
  cardRatio: initial.cardRatio,
  // `?customsource=` **不进存档**（契约 Q8）：它是"这一次打开用的源"，关掉页面就该回到自己的存档值
  customSourceOverride: queryUrl("customsource") === null
    ? null
    : { url: queryUrl("customsource")!, from: "query" },
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
    // 切模式 = 换数据集：留着上一条点播，播放器会拿**原曲**的条目去音MAD 的音源里找，
    // 结果是"所有已启用的音源都取不到"，该角色在这个模式下等于哑的（B2 的跨模式泄漏）
    const entryRequest = musicMode === get().musicMode ? get().entryRequest : null;
    set({ musicMode, entryRequest });
    sessionStore.save({ ...pickSession(get()), musicMode });
  },
  setEntryRequest(entryRequest) {
    set({ entryRequest });
  },
  clearEntryRequest(key) {
    const current = get().entryRequest;
    if (current && (key === undefined || current.key === key)) set({ entryRequest: null });
  },
  setLocalMusicUrl(localMusicUrl) {
    set({ localMusicUrl });
    sessionStore.save({ ...pickSession(get()), localMusicUrl });
  },
  setCustomSourceUrl(customSourceUrl) {
    set({ customSourceUrl, customSourceOverride: null });
    sessionStore.save({ ...pickSession(get()), customSourceUrl });
  },
  setCardRatio(cardRatio) {
    set({ cardRatio });
    sessionStore.save({ ...pickSession(get()), cardRatio });
  },
  adoptCustomSourceUrl(url) {
    set({ customSourceOverride: { url, from: "host" } });
  },
  clearHostCustomSource() {
    const override = get().customSourceOverride;
    if (override?.from === "host") set({ customSourceOverride: null });
  },
}));

/** 要落盘的字段**逐字列在这里**（新字段必须加进来，否则"能填、刷新就丢"）。
 *  `customSourceOverride` **不在**其中：它只活这一次会话（F3）。 */
function pickSession(
  state: Pick<SessionState,
    "locale" | "tab" | "cardCollection" | "musicMode" | "localMusicUrl" | "customSourceUrl"
    | "cardRatio">,
) {
  return {
    locale: state.locale,
    tab: state.tab,
    cardCollection: state.cardCollection,
    musicMode: state.musicMode,
    localMusicUrl: state.localMusicUrl,
    customSourceUrl: state.customSourceUrl,
    cardRatio: state.cardRatio,
  };
}

/** 生效的自定义源链接：**会话级覆盖**（主机下发 / `?customsource=`）> 存档值。 */
export function effectiveCustomSourceUrl(
  state: Pick<SessionState, "customSourceUrl" | "customSourceOverride">,
): string {
  return state.customSourceOverride?.url ?? state.customSourceUrl;
}

/** `?localmusic=127.0.0.1:8011` 覆盖本地曲库地址；`?customsource=…` 覆盖自定义源链接。 */
function queryUrl(name: string): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get(name);
  return value && value.trim() !== "" ? value.trim() : null;
}

export { getLocale };
