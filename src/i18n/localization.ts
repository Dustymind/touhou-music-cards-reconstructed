/** 界面文案：对齐上游 `app/types/Localization.ts`（en / zh）。 */
import { isCheat, glitchString } from "../cheat";

export type Locale = "en" | "zh";
export type Localized = { en: string; zh: string };

const u = (en: string, zh: string): Localized => ({ en, zh });

export const Localization = {
  TabNamePlayer: u("Player", "播放"),
  TabNameList: u("List", "列表"),
  TabNameConfigs: u("Config", "设置"),
  TabNameAbout: u("Match", "游戏"),
  TabNameAlice: u("Alice!", "Alice!"),

  PlayerTabUpcoming: u("Upcoming (click to skip)", "接下来（点击以跳过）"),
  PlayerTabShuffle: u("Shuffle", "重新抽选"),
  PlayerTabSort: u("Sort", "重置顺序"),
  PlayerTabRandomStart: u("Random Start", "播放位置随机"),
  PlayerTabCountdown: u("Countdown", "倒计时"),
  PlayerTabPlaybackDurationLabel: u("Playback Duration (s; 0 = inf)", "播放时长（秒；0 = 无限）"),

  ConfigTabCardCollection: u("Card Collection", "卡面图集"),
  ConfigTabMusicSource: u("Music Source", "音乐源"),
  ConfigTabMusicSelectionPresets: u("Music Selection Presets", "音乐选择预设"),
  ConfigTabMusicSelectionSingle: u("Single Track Mode", "仅单曲模式"),
  ConfigTabSelected: u("Selected", "正在使用"),
  ConfigTabSelect: u("Select", "使用"),
  ConfigTabApply: u("Apply", "应用"),
  ConfigTabApplied: u("Applied", "已应用"),
  ConfigTabSearchCharacter: u("Search Character", "搜索角色"),
  ConfigTabSourceEnabled: u("Enabled", "已启用"),
  ConfigTabSourceDisabled: u("Disabled", "未启用"),
  ConfigTabSourceOrder: u("Fallback order", "回退顺序"),
  ConfigTabSourceMoveUp: u("Move up", "上移"),
  ConfigTabSourceMoveDown: u("Move down", "下移"),
  ConfigTabSourceLoading: u("Loading…", "载入中…"),
  ConfigTabSourceLoaded: u("Loaded {count} tracks", "已载入 {count} 首"),
  ConfigTabSourceFailed: u("Load failed", "载入失败"),
  ConfigTabLocalBaseUrl: u("Local helper address", "本地助手地址"),

  ShellLoading: u("Loading data…", "正在载入数据…"),
  ShellLoadFailed: u("Failed to load data", "数据载入失败"),
  ShellDataSummary: u("Data", "数据"),
  ShellCharacters: u("characters", "角色"),
  ShellAlbums: u("albums", "专辑"),
  ShellTracks: u("tracks", "曲目"),
  ShellDataHash: u("Data hash", "数据指纹"),
  ShellLanguage: u("Language", "语言"),
  ShellNotYet: u("This screen arrives in a later milestone.", "该界面将在后续里程碑实现。"),

  ConfigTabPresetHifuu: u("Hifuu tracks", "秘封曲"),
  ConfigTabPresetCD: u("CD", "CD"),
  ConfigTabPresetGame: u("Official games", "官作"),
  ConfigTabPresetSelectAll: u("Select all", "全选"),
  ConfigTabPresetSelectNone: u("Select none", "全不选"),
  ConfigTabPresetReset: u("Reset", "重置"),
  ConfigTabTriUnset: u("Unset", "不配置"),
  ConfigTabTriOn: u("On", "已启用"),
  ConfigTabTriOff: u("Off", "已禁用"),
  ConfigTabPresetStats: u(
    "Available {enabled} / {total} tracks · {characters} characters have tracks",
    "可用 {enabled} / 全库 {total} 首 · {characters} 个角色有曲目"),
  ConfigTabSingleHint: u(
    "When on, each character plays exactly one track; the first preset-enabled track is used until you pick another.",
    "开启后每个角色只播一首；未手选的取预设允许的第一首。"),
  ConfigTabSingleDisable: u("Disable character", "禁用该角色"),
  ConfigTabSingleNoTracks: u("No tracks under this preset", "该预设下无可用曲目"),
  ConfigTabSingleMode: u("Single track mode", "仅单曲模式"),

  GameFilterByDeck: u("Filter Music by Deck", "按卡组筛选音乐"),
  ChatMessageHint: u("Type a message to chat...", "输入消息以聊天..."),
  GameUpcoming: u("Turn", "回合"),

  // ---- 游戏页（面板、棋盘、计时、结算）----
  GameModeSolo: u("Solo", "单人"),
  GameModeCPU: u("CPU", "电脑"),
  GameModeTraditional: u("Classic", "经典"),
  GameModeLeisure: u("Leisure", "休闲"),
  GameDeckSize: u("deck {rows}×{columns}", "卡组 {rows}×{columns}"),
  GameRowDecrease: u("-row", "减行"),
  GameRowIncrease: u("+row", "加行"),
  GameColumnDecrease: u("-col", "减列"),
  GameColumnIncrease: u("+col", "加列"),
  GameRandomFill: u("Random Fill", "随机补满"),
  GameShuffleCPUDeck: u("Shuffle CPU Deck", "打乱电脑卡组"),
  GameClearCPUDeck: u("Clear CPU Deck", "清空电脑卡组"),
  GameUnusedCards: u("Unused Cards ({count})", "未使用卡牌（{count}）"),
  GameDeckBuildHint: u(
    "Click an unused card to put it in your deck; click a card in your deck to take it out.",
    "点未使用的卡放进卡组；点卡组里的卡拿出来。"),
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
  GameCardSmaller: u("Card -", "卡牌缩小"),
  GameCardLarger: u("Card +", "卡牌放大"),
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

  ListTabOrder: u("Order", "顺序"),
  ListTabTracks: u("Tracks", "曲目"),
  ListTabAlbum: u("Album", "专辑"),
} as const;

let locale: Locale = "en";

export function setLocale(next: Locale): void {
  locale = next;
}

export function getLocale(): Locale {
  return locale;
}

/** 取文案并替换 `{name}` 占位符；彩蛋开启时按上游规则抖动文字。 */
export function t(key: Localized, args?: Record<string, string>): string {
  let text = locale === "zh" ? key.zh : key.en;
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
