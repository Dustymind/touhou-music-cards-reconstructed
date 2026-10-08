/** 对局外观设置：卡片大小百分比 + 牌库行列。
 *
 * 走 `persist.ts` 的版本化信封（键 `tmc.v1.game-setting`），与其它所有 store 同一套
 * 校验 / 迁移 / 损坏回落口径 —— 上游那套"裸键 + 全默认不写"的存档兼容已废弃。
 */
import { defineStore, pickNumber } from "../persist";

/** 卡片宽度 = 容器宽度 × 百分比。 */
export const CARD_WIDTH_PERCENTAGE = {
  default: 0.08,
  min: 0.04,
  max: 0.40,
  step: 0.01,
} as const;

/** 牌库行列上限。 */
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

export function clampCardWidthPercentage(value: number): number {
  if (!Number.isFinite(value)) return CARD_WIDTH_PERCENTAGE.default;
  const stepped = Math.round(value * 100) / 100;   // 按 0.01 步进
  return Math.min(CARD_WIDTH_PERCENTAGE.max, Math.max(CARD_WIDTH_PERCENTAGE.min, stepped));
}

function clampCount(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** 越界的数值算非法（各自回落默认值），不就地夹取 —— 夹取会掩盖"存档被谁写坏了"。 */
const settingsSpec = {
  name: "game-setting",
  version: 1,
  fallback: DEFAULT_GAME_SETTING,
  validate(raw: unknown): GameSetting | null {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const value = raw as Record<string, unknown>;
    const percentage = pickNumber(value.cardWidthPercentage, CARD_WIDTH_PERCENTAGE.min, CARD_WIDTH_PERCENTAGE.max);
    const rows = pickNumber(value.deckRows, DECK_LIMITS.minRows, DECK_LIMITS.maxRows);
    const columns = pickNumber(value.deckColumns, DECK_LIMITS.minColumns, DECK_LIMITS.maxColumns);
    return {
      cardWidthPercentage: percentage === null
        ? DEFAULT_GAME_SETTING.cardWidthPercentage : clampCardWidthPercentage(percentage),
      deckRows: rows === null ? DEFAULT_GAME_SETTING.deckRows : clampCount(rows, DECK_LIMITS.minRows, DECK_LIMITS.maxRows),
      deckColumns: columns === null
        ? DEFAULT_GAME_SETTING.deckColumns : clampCount(columns, DECK_LIMITS.minColumns, DECK_LIMITS.maxColumns),
    };
  },
};

const handle = defineStore<GameSetting>(settingsSpec);

export function loadGameSetting(): GameSetting {
  return handle.load();
}

export function saveGameSetting(setting: GameSetting): void {
  handle.save({
    cardWidthPercentage: clampCardWidthPercentage(setting.cardWidthPercentage),
    deckRows: clampCount(setting.deckRows, DECK_LIMITS.minRows, DECK_LIMITS.maxRows),
    deckColumns: clampCount(setting.deckColumns, DECK_LIMITS.minColumns, DECK_LIMITS.maxColumns),
  });
}
