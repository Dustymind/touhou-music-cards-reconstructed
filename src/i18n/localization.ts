/** 界面文案：对齐上游 `app/types/Localization.ts`（en / zh）。 */
import { isCheat, glitchString } from "../cheat";

export type Locale = "en" | "zh";
/** 一份双语文案（`en` / `zh` 各一条）—— 界面文案表、`src/content/about.ts`、数据里的 `label`/`description` 都是这个形状。 */
export type Localized = { en: string; zh: string };

const u = (en: string, zh: string): Localized => ({ en, zh });

export const Localization = {
  TabNamePlayer: u("Player", "播放"),
  TabNameList: u("List", "列表"),
  TabNameConfigs: u("Config", "设置"),
  // 上游把这**一个**键叫 `TabNameAbout`、文案却是 "Match/游戏"（.ref/notes/B-ui-config-spec.md §8.3 记过）。
  // 本仓库现在真有一个「关于」弹窗（文字在 `src/content/about.ts`），两者同名会一直让人看错，所以把游戏页的键改成
  // 它该有的名字（**文案一字未动**）。
  TabNameMatch: u("Match", "游戏"),

  PlayerTabUpcoming: u("Upcoming (click to skip)", "接下来（点击以跳过）"),
  PlayerTabShuffle: u("Shuffle", "重新抽选"),
  PlayerTabSort: u("Sort", "重置顺序"),
  PlayerTabRandomStart: u("Random Start", "播放位置随机"),
  PlayerTabCountdown: u("Countdown", "倒计时"),
  PlayerTabPlaybackDurationLabel: u("Playback Duration (s; 0 = inf)", "播放时长（秒；0 = 无限）"),

  // D164：「卡面图集」→「卡面设置」——这个分区现在不只管图集，还管**卡面比例**（模式 3 的 16:9 / 4:3）
  ConfigTabCardSettings: u("Card Settings", "卡面设置"),
  ConfigTabCardSetFixed: u(
    "This mode draws the cover each card's own source gives it; the art sets cannot be chosen here.",
    "这个模式的卡面由源提供，每卡一张，不能在这里更换图集。"),
  ConfigTabCardRatio: u("Card aspect ratio", "卡面比例"),
  // 档名两个语言基本一样（数字），但仍走 i18n 键：文案不许散在组件里
  ConfigTabCardRatioOriginal: u("Standard", "常规"),
  ConfigTabCardRatio16x9: u("16:9", "16:9"),
  ConfigTabCardRatio4x3: u("4:3", "4:3"),
  ConfigTabMusicSource: u("Music Source", "音乐源"),
  ConfigTabMusicSelectionPresets: u("Music Selection Presets", "音乐选择预设"),
  ConfigTabMusicSelectionSingle: u("Single Track Mode", "仅单曲模式"),
  ConfigTabSearchCharacter: u("Search Character", "搜索角色"),
  ConfigTabSourceEnabled: u("Enabled", "已启用"),
  ConfigTabSourceDisabled: u("Disabled", "未启用"),
  LocalMusicUrl: u("Local library manifest", "本地曲库地址"),
  LocalMusicApply: u("Apply", "应用"),
  LocalMusicReset: u("Reset", "重置"),
  CustomSourceUrl: u("Custom source link", "自定义源链接"),
  CustomSourcePlaceholder: u("https://example.com/manifest.json", "https://example.com/manifest.json"),
  CustomSourceRequired: u(
    "Fill in a custom source link: this mode ships no data of its own.",
    "必须填写自定义源链接：这个模式不自带任何数据。"),
  CustomSourceHint: u(
    "One card = one name + one cover + one track. Your manifest decides every card; the app only renders it.",
    "一张卡 = 一个卡名 + 一张卡面 + 一首曲目。卡表完全由你的清单决定，应用只负责渲染。"),
  CustomSourceLoaded: u("Loaded {count} cards", "已载入 {count} 张卡"),
  CustomSourceInvalid: u(
    "The manifest was rejected: its shape is not valid, so nothing from it is in use.",
    "清单不合法（形状不对），整份都没有生效。"),
  CustomSourceHostUsing: u("The host is using: {url}", "主机在用：{url}"),
  CustomSourceHostDiffers: u(
    "The host uses a different custom source: {url} (data differs in: {detail}). Use it for this session? Your own link is not changed either way.",
    "主机使用了不同的自定义源：{url}（数据不同的地方：{detail}）。本次会话采用它吗？无论选哪个，你自己填的链接都不会被改写。"),
  CustomSourceHostAdopt: u("Use the host's source", "采用主机的源"),
  CustomSourceHostStay: u("Stay out", "留在房外"),
  CustomSourceFromHost: u(
    "The link in use was sent by the host (this session only).",
    "当前生效的链接来自主机（只在本会话生效）。"),
  MusicMode: u("Music Mode", "音乐模式"),
  MusicModeOriginals: u("Originals", "原曲"),
  MusicModeOtomads: u("Otomads", "音MAD"),
  MusicModeCustom: u("Custom", "自定义"),
  MusicModeHint: u(
    "Originals uses the mirrors below; Otomads uses the local album source only; Custom uses the card list you host yourself.",
    "「原曲」只用下面选中的镜像；「音MAD」只用本地专辑源；「自定义」只用你自己托管的卡表。"),
  MusicModeHostControlled: u(
    "Set by the host while you are in a room.",
    "联机时由主机决定（当前房间使用主机的音乐模式）。"),
  MusicModeLocalHint: u(
    "Otomads tracks live on this machine only, served by the local library helper; the local source below is used automatically in this mode.",
    "音MAD 曲目只存在于本机（由本地曲库助手提供）；这个模式下会自动使用下面的「本地曲库」。"),
  ConfigTabSourceNoneEnabled: u(
    "No source is enabled in this mode, so no track can be resolved.",
    "这个模式下一个音源都没启用，曲目解析不出地址。"),
  ConfigTabSourceOrder: u("Fallback order", "回退顺序"),
  ConfigTabSourceLoading: u("Loading…", "载入中…"),
  ConfigTabSourceLoaded: u("Loaded {count} tracks", "已载入 {count} 首"),

  ShellLoading: u("Loading data…", "正在载入数据…"),
  ShellLoadFailed: u("Failed to load data", "数据载入失败"),
  ShellAppTitle: u("Forgotten Harmonic Frequencies", "东方谐频拾遗"),
  ShellDataSummary: u("Data", "数据"),
  ShellCharacters: u("characters", "角色"),
  ShellAlbums: u("albums", "专辑"),
  ShellTracks: u("tracks", "曲目"),
  ShellDataHash: u("Data hash", "数据指纹"),
  ShellLanguage: u("Language", "语言"),
  ConfigAppearanceTitle: u("Appearance", "外观"),
  ConfigAppearanceMode: u("Theme mode", "亮/暗模式"),
  ConfigAppearanceModeAuto: u("Auto", "自动"),
  ConfigAppearanceModeLight: u("Light", "亮色"),
  ConfigAppearanceModeDark: u("Dark", "暗色"),
  ConfigAppearanceColor: u("Theme color", "主题色"),
  ConfigAppearanceCustom: u("Custom", "自定义"),

  // 「关于」弹窗的文字**不在这里** —— 全部在 `src/content/about.ts`（用户可以整篇改，含标题与关闭按钮）

  ConfigTabPresetHifuu: u("Hifuu tracks", "秘封曲"),
  ConfigTabPresetCD: u("CD", "CD"),
  ConfigTabPresetGame: u("Official games", "官作"),
  ConfigTabPresetSelectAll: u("Select all", "全选"),
  ConfigTabPresetSelectNone: u("Select none", "全不选"),
  ConfigTabTriUnset: u("Unset", "不配置"),
  ConfigTabTriOn: u("On", "已启用"),
  ConfigTabTriOff: u("Off", "已禁用"),
  ConfigTabPresetStats: u(
    "Available {enabled} / {total} tracks · {characters} characters have tracks",
    "可用 {enabled} / 全库 {total} 首 · {characters} 个角色有曲目"),
  ConfigTabCustomPresetStats: u(
    "Available {enabled} / {total} cards · {albums} albums · {authors} authors",
    "可用 {enabled} / 全库 {total} 张卡 · {albums} 个专辑 · {authors} 位作者"),
  ConfigTabCustomAlbums: u("Albums", "专辑"),
  ConfigTabCustomAuthors: u("Authors", "作者"),
  ConfigTabCustomDisable: u("Disable", "禁用"),
  ConfigTabCustomSingleHint: u(
    "This mode plays exactly one track per card: disable a card to drop it from the rotation and from the card pool.",
    "这个模式一张卡只有一首曲目：禁用的卡不进轮播、也不进卡池。"),
  ConfigTabSingleHint: u(
    "When on, each character plays exactly one track; the first preset-enabled track is used until you pick another.",
    "开启后每个角色只播一首；未手选的取预设允许的第一首。"),
  ConfigTabSingleDisable: u("Disable character", "禁用该角色"),
  ConfigTabSingleNoTracks: u("No tracks under this preset", "该预设下无可用曲目"),
  ConfigTabSingleMode: u("Single track mode", "仅单曲模式"),

  // MD2 开关标签用句首大写（不是按钮的全大写）
  GameFilterByDeck: u("Filter music by deck", "按卡组筛选音乐"),
  ChatMessageHint: u("Type a message to chat...", "输入消息以聊天..."),

  // ---- 游戏页（面板、棋盘、计时、结算）----
  GameModeSolo: u("Solo", "单人"),
  GameModeCPU: u("CPU", "电脑"),
  GameModeMulti: u("Multiplayer", "多人"),
  GameModeTraditional: u("Classic", "经典"),
  GameModeLeisure: u("Leisure", "休闲"),
  GameDeckSize: u("deck {rows}×{columns}", "卡组 {rows}×{columns}"),
  GameRandomFill: u("Random Fill", "随机补满"),
  GameShuffleCPUDeck: u("Shuffle CPU Deck", "打乱电脑卡组"),
  GameClearCPUDeck: u("Clear CPU Deck", "清空电脑卡组"),
  GameUnusedCards: u("Unused Cards ({count})", "未使用卡牌（{count}）"),
  GameCardSelectionSlider: u("Card Selection Slider", "卡槽滚动条"),
  GameGroupMode: u("Mode", "模式"),
  GameGroupRule: u("Rules", "规则"),
  GameGroupDeck: u("Deck", "卡组"),
  GameRowsLabel: u("Rows", "行"),
  GameColumnsLabel: u("Columns", "列"),
  GameCardSizeLabel: u("Card size", "卡牌大小"),
  GameSideYou: u("You", "你"),
  GameSideOpponent: u("Opponent", "对手"),
  GameGroupTurn: u("Turn", "回合"),
  GameUnusedExpand: u("Show", "展开"),
  GameUnusedCollapse: u("Hide", "收起"),
  GameDeckBuildHint: u(
    "Click an unused card to put it in your deck; click a card in your deck to take it out.",
    "点未使用的卡放进卡组；点卡组里的卡拿出来。"),
  GameUnusedCardsBlocked: u(
    "{count} dimmed: a track can only be used once per game",
    "{count} 张已压暗：同一首曲子一局只能选一次"),
  GameFillCPU: u("Fill CPU", "补满电脑"),
  GameClearDeck: u("Clear Deck", "清空卡组"),
  GameShuffleDeck: u("Shuffle Deck", "打乱卡组"),
  GameStart: u("Start", "开始游戏"),
  GameStop: u("Stop", "中止游戏"),
  GameOpponentSettingMean: u("CPU mean(s)", "电脑反应（秒）"),
  GameOpponentSettingStdDev: u("σ(s)", "标准差（秒）"),
  GameOpponentSettingMistake: u("mistake(%)", "失误率（%）"),
  GameNowPlaying: u("Now playing: {name}", "正在播放：{name}"),
  GameAnswerLabel: u("Answer:", "答案："),
  GameTurnStatus: u("turn #{turn} · {state} · gives {gives}", "第 {turn} 回合 · {state} · 罚牌 {gives}"),
  GameStateSelecting: u("selecting", "选牌中"),
  GameStateCountdown: u("countdown", "倒计时"),
  GameStateTurnStart: u("turnStart", "抢拍中"),
  GameStateTurnWinner: u("turnWinner", "结算中"),
  GameStateFinished: u("finished", "已结束"),
  GameCardSmaller: u("Smaller", "缩小"),
  GameCardLarger: u("Larger", "放大"),
  GameFinishedWinner: u("Finished! Winner: {winner}", "结束！胜者：{winner}"),
  GameWinnerYou: u("You", "你"),
  GameWinnerOpponent: u("Opponent", "对手"),
  GameWinnerDraw: u("draw", "平局"),
  GameInstructionGiveCards: u(
    "You must give {count} card(s): click your card, then an empty slot on the opponent side — or press Next to give randomly.",
    "你需要交出 {count} 张卡牌：先点自己的牌，再点对手侧的空位；或者按「下一回合」随机交出。"),
  GameInstructionReceiveCards: u(
    "You will receive {count} card(s) — press Next.",
    "你将接收 {count} 张卡牌 —— 按「下一回合」。"),
  GameOpponentCollected: u("Opponent · collected {count}", "对手 · 已得 {count}"),
  GameSelfCollected: u("You · collected {count}", "你 · 已得 {count}"),
  GameNextTurn: u("Next Turn", "下一回合"),
  GameGiveRandomly: u("Give randomly", "随机交出"),
  GamePoolCount: u("pool {count}", "牌堆 {count}"),
  GameRotationCount: u("rotation {count}", "轮播 {count}"),

  // ---- 联机大厅 ----
  GameLobbyOnline: u("Online", "联机"),
  GameConnectionMyName: u("Name", "名称"),
  GameConnectionPeerMode: u("cross-machine (PeerJS)", "跨机器（PeerJS）"),
  GameConnectionHost: u("Host", "建立房间"),
  GameConnectionRoom: u("Room", "房间号"),
  GameConnectionJoin: u("Join", "加入"),
  GameConnectionLeave: u("Leave", "离开"),
  GameConnectionShareCode: u("code: {code}", "分享码：{code}"),
  GameStatusOffline: u("offline", "离线"),
  GameStatusHosting: u("hosting", "已开房"),
  GameStatusConnected: u("connected", "已连接"),
  GameStatusError: u("error", "错误"),
  GameParticipantObserver: u("{name} (obs)", "{name}（观察者）"),
  ChatMessageTitle: u("Chat", "聊天"),
  ChatMessageSend: u("Send", "发送"),
  GameDigest: u("digest {digest}", "状态摘要 {digest}"),

  PlayerTabRotation: u(
    "{tracks} in rotation · {sources} sources",
    "轮播 {tracks} 首 · 已载入音源 {sources} 个"),

} as const;

let locale: Locale = "en";

export function setLocale(next: Locale): void {
  locale = next;
}

export function getLocale(): Locale {
  return locale;
}

/** 取多语言字段里当前语言的值（数据里的 label / description 也用这个，避免到处写三元）。 */
export function localized(value: Localized, target: Locale = locale): string {
  return target === "zh" ? value.zh : value.en;
}

/** 取文案并替换 `{name}` 占位符；彩蛋开启时按上游规则抖动文字。 */
export function t(key: Localized, args?: Record<string, string>): string {
  let text = localized(key);
  if (args) {
    for (const [name, value] of Object.entries(args)) {
      text = text.replace(`{${name}}`, value);
    }
  }
  return isCheat() ? glitchString(text) : text;
}

/** 上游 `?locale=` 优先于浏览器语言，且两者都只认 en/zh。 */
export function resolveInitialLocale(search: string, navigatorLanguage: string): Locale {
  const fromQuery = new URLSearchParams(search).get("locale");
  if (fromQuery === "en" || fromQuery === "zh") return fromQuery;
  return navigatorLanguage.toLowerCase().startsWith("zh") ? "zh" : "en";
}
