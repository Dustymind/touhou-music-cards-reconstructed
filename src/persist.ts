/** 版本化本地持久化。
 *
 * 上游的问题：四个键"全有或全无"——任一键损坏就丢弃整份存档；且没有 schema 版本。
 * 这里每个键独立成一条带版本的信封 `{v, data}`：
 *
 * - 单键损坏只影响该键（回落到默认值），其余键照常恢复；
 * - 版本不符按声明的迁移函数处理，迁不动就回落默认值并记录原因；
 * - 校验函数自己决定"什么算合法"，不允许把脏数据带进内存。
 */

export interface StoreSpec<T> {
  /** 键名（会自动加 `tmc.v1.` 前缀）。 */
  name: string;
  version: number;
  fallback: T;
  /** 把任意来源的输入收窄成 T；不合法返回 null。 */
  validate: (raw: unknown) => T | null;
  /** 旧版本 → 新版本；返回 null 表示无法迁移。 */
  migrate?: (raw: unknown, fromVersion: number) => T | null;
  /**
   * 老键名（一次性迁移）：**新键不存在而它存在**时，把老键的值原样搬到新键。
   *
   * 给"同一个 store 按模式分成多把键"用（B）：内容形状没变，所以**不动版本号**；
   * 老键**不删**（回退到旧版本时还读得到），默认模式继承老存档，另一把拿默认值。
   */
  legacyName?: string;
}

interface StoreHandle<T> {
  spec: StoreSpec<T>;
  load: () => T;
  save: (value: T) => void;
  clear: () => void;
  /** 最近一次 load 的失败原因（诊断用）。 */
  lastError: () => string | null;
}

const PREFIX = "tmc.v1.";

/** 存储键前缀（`src/store/seeds.ts` 需要按老键名做一次性迁移，所以导出）。 */
export const STORAGE_PREFIX = PREFIX;
const errors = new Map<string, string | null>();

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function defineStore<T>(spec: StoreSpec<T>): StoreHandle<T> {
  const key = PREFIX + spec.name;

  /** 解析一条带版本的信封；不合法记原因并返回 null。 */
  const parse = (raw: string): T | null => {
    let envelope: unknown;
    try {
      envelope = JSON.parse(raw);
    } catch {
      errors.set(key, "JSON 解析失败");
      return null;
    }
    const version = (envelope as { v?: unknown })?.v;
    const data = (envelope as { data?: unknown })?.data;
    if (typeof version !== "number") {
      errors.set(key, "缺少版本号");
      return null;
    }
    const value = version === spec.version
      ? spec.validate(data)
      : (spec.migrate?.(data, version) ?? null);
    if (value === null) {
      errors.set(key, version === spec.version ? "内容校验失败" : `无法从 v${version} 迁移`);
      return null;
    }
    return value;
  };

  return {
    spec,
    load() {
      errors.set(key, null);
      const store = storage();
      if (!store) return spec.fallback;
      const raw = store.getItem(key);
      if (raw !== null) return parse(raw) ?? spec.fallback;
      // 老键名（同名 store 分键之前的那把）：只有新键**不存在**时才搬，老键留着不动
      const legacyKey = spec.legacyName ? PREFIX + spec.legacyName : null;
      if (legacyKey === null || legacyKey === key) return spec.fallback;
      const legacyRaw = store.getItem(legacyKey);
      if (legacyRaw === null) return spec.fallback;
      const value = parse(legacyRaw);
      if (value === null) return spec.fallback;
      try {
        store.setItem(key, JSON.stringify({ v: spec.version, data: value }));
      } catch {
        /* 配额满：本次照常返回，下次再搬 */
      }
      return value;
    },
    save(value: T) {
      const store = storage();
      if (!store) return;
      try {
        store.setItem(key, JSON.stringify({ v: spec.version, data: value }));
      } catch {
        /* 配额满等极端情况：静默失败，不影响运行 */
      }
    },
    clear() {
      storage()?.removeItem(key);
    },
    lastError() {
      return errors.get(key) ?? null;
    },
  };
}

/** 判定辅助：把 unknown 收窄成"对象且键为字符串"。 */
export function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

/** `unknown` → `Record<string, boolean>`：只留下能解析成布尔的键（预设与临时禁选两处共用）。
 *
 * 注意**不要**顺手并 `single.ts` 里那份：它只保留 `true`（`false` 要丢掉），语义不同。
 */
export function pickBooleanMap(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!isRecord(raw)) return out;
  for (const [key, flag] of Object.entries(raw)) {
    const parsed = pickBoolean(flag);
    if (parsed !== null) out[key] = parsed;
  }
  return out;
}

export function pickString(raw: unknown, allowed?: readonly string[]): string | null {
  if (typeof raw !== "string") return null;
  if (allowed && !allowed.includes(raw)) return null;
  return raw;
}

export function pickBoolean(raw: unknown): boolean | null {
  return typeof raw === "boolean" ? raw : null;
}

export function pickNumber(raw: unknown, min = -Infinity, max = Infinity): number | null {
  if (typeof raw !== "number" || Number.isNaN(raw)) return null;
  return raw >= min && raw <= max ? raw : null;
}
