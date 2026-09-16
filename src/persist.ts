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
}

export interface StoreHandle<T> {
  spec: StoreSpec<T>;
  load: () => T;
  save: (value: T) => void;
  clear: () => void;
  /** 最近一次 load 的失败原因（诊断用）。 */
  lastError: () => string | null;
}

const PREFIX = "tmc.v1.";
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
  return {
    spec,
    load() {
      errors.set(key, null);
      const store = storage();
      if (!store) return spec.fallback;
      const raw = store.getItem(key);
      if (raw === null) return spec.fallback;
      let envelope: unknown;
      try {
        envelope = JSON.parse(raw);
      } catch {
        errors.set(key, "JSON 解析失败");
        return spec.fallback;
      }
      const version = (envelope as { v?: unknown })?.v;
      const data = (envelope as { data?: unknown })?.data;
      if (typeof version !== "number") {
        errors.set(key, "缺少版本号");
        return spec.fallback;
      }
      const value = version === spec.version
        ? spec.validate(data)
        : (spec.migrate?.(data, version) ?? null);
      if (value === null) {
        errors.set(key, version === spec.version ? "内容校验失败" : `无法从 v${version} 迁移`);
        return spec.fallback;
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
