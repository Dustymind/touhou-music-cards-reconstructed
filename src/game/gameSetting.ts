/** 对局外观设置（对齐上游 `localStorage` 里的 `gameSetting`）：卡片大小百分比 + 牌库行列。
 *
 * 上游把三者放在同一个键里，并且**等于默认值时不写**（保持 localStorage 干净）；
 * 这里沿用同样的行为，只是加了一层逐字段校验（读进来脏数据就当默认值）。
 */
import { isRecord, pickNumber } from "../persist";

/** 卡片宽度 = 容器宽度 × 百分比（上游 `cardWidthPercentage`）。 */
export const CARD_WIDTH_PERCENTAGE = {
  default: 0.08,
  min: 0.04,
  max: 0.40,
  step: 0.01,
} as const;

/** 牌库行列上限（上游 `maxDeckRows` / `maxDeckColumns`）。 */
export const DECK_LIMITS = {
  minRows: 1, maxRows: 5,
  minColumns: 1, maxColumns: 15,
} as const;

interface GameSetting {
  cardWidthPercentage: number;
  deckRows: number;
  deckColumns: number;
}

export const DEFAULT_GAME_SETTING: GameSetting = {
  cardWidthPercentage: CARD_WIDTH_PERCENTAGE.default,
  deckRows: 3,
  deckColumns: 8,
};

const STORAGE_KEY = "gameSetting";

export function clampCardWidthPercentage(value: number): number {
  if (!Number.isFinite(value)) return CARD_WIDTH_PERCENTAGE.default;
  const stepped = Math.round(value * 100) / 100;   // 上游按 0.01 步进
  return Math.min(CARD_WIDTH_PERCENTAGE.max, Math.max(CARD_WIDTH_PERCENTAGE.min, stepped));
}

function clampCount(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function loadGameSetting(storage: Storage | undefined = safeStorage()): GameSetting {
  if (!storage) return { ...DEFAULT_GAME_SETTING };
  let raw: unknown;
  try {
    const text = storage.getItem(STORAGE_KEY);
    if (!text) return { ...DEFAULT_GAME_SETTING };
    raw = JSON.parse(text);
  } catch {
    return { ...DEFAULT_GAME_SETTING };
  }
  if (!isRecord(raw)) return { ...DEFAULT_GAME_SETTING };
  const percentage = pickNumber(raw.cardWidthPercentage, CARD_WIDTH_PERCENTAGE.min, CARD_WIDTH_PERCENTAGE.max);
  const rows = pickNumber(raw.deckRows, DECK_LIMITS.minRows, DECK_LIMITS.maxRows);
  const columns = pickNumber(raw.deckColumns, DECK_LIMITS.minColumns, DECK_LIMITS.maxColumns);
  return {
    cardWidthPercentage: percentage === null
      ? DEFAULT_GAME_SETTING.cardWidthPercentage : clampCardWidthPercentage(percentage),
    deckRows: rows === null ? DEFAULT_GAME_SETTING.deckRows : clampCount(rows, DECK_LIMITS.minRows, DECK_LIMITS.maxRows),
    deckColumns: columns === null
      ? DEFAULT_GAME_SETTING.deckColumns : clampCount(columns, DECK_LIMITS.minColumns, DECK_LIMITS.maxColumns),
  };
}

export function saveGameSetting(setting: GameSetting, storage: Storage | undefined = safeStorage()): void {
  if (!storage) return;
  try {
    // 全默认就不写（与上游一致）
    if (setting.cardWidthPercentage === DEFAULT_GAME_SETTING.cardWidthPercentage
      && setting.deckRows === DEFAULT_GAME_SETTING.deckRows
      && setting.deckColumns === DEFAULT_GAME_SETTING.deckColumns) {
      storage.removeItem(STORAGE_KEY);
      return;
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(setting));
  } catch {
    // 隐私模式等写不进去：忽略，设置只影响本机
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
