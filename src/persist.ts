/** 版本化本地持久化。
 *
 * 上游的问题：四个键"全有或全无"——任一键损坏就丢弃整份存档；且没有 schema 版本。
 * 这里每个键独立成一条带版本的信封 `{v, data}`：
 *
 * - 单键损坏只影响该键（回落到默认值），其余键照常恢复；
 * - 信封版本不符（或内容不合法）就回落默认值并记录原因 —— **没有**跨版本迁移那条路：
 *   全仓每个键都只有当前这一代，不认更早的形状；
 * - 校验函数自己决定"什么算合法"，不允许把脏数据带进内存。
 */

export interface StoreSpec<T> {
  /** 键名（会自动加 `tmc.v1.` 前缀）。 */
  name: string;
  version: number;
  fallback: T;
  /** 把任意来源的输入收窄成 T；不合法返回 null。 */
  validate: (raw: unknown) => T | null;
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

/** 存储键前缀（测试里拼键名用；生产代码走 `defineStore` 自动加前缀）。 */
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
    if (version !== spec.version) {
      errors.set(key, `版本不符（存档 v${version} ≠ 当前 v${spec.version}）`);
      return null;
    }
    const value = spec.validate(data);
    if (value === null) {
      errors.set(key, "内容校验失败");
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
      if (raw === null) return spec.fallback;
      return parse(raw) ?? spec.fallback;
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

/* ------------------------------------------------------------------ *
 * 旧版存储键清理
 * ------------------------------------------------------------------ */

/** 三个音乐模式（分键家族的后缀）。 */
const MODES = ["originals", "otomads", "custom"] as const;

/** 按模式分键的四把 store 的**基名**（键 = `tmc.v1.<基名>.<模式>`）。 */
const PER_MODE_BASES = ["preset", "queue", "sources", "single-track"] as const;

/** 不按模式分键的固定键（键 = `tmc.v1.<名>`）。 */
const FIXED_NAMES = [
  "session", "seed", "appearance", "game-setting",
  "custom-preset", "custom-single-track",
] as const;

/** 逐条公告一个键（键 = `tmc.v1.notice.<id>`，`id` 由内容层决定，所以只认前缀）。
 *
 * 认前缀而非逐个 id：`persist.ts` 是存储层，不该 import 内容层的公告清单。代价是
 * **某条公告被删掉后，它留下的记录键不会被当作"旧版残留"清掉** —— 那属于"内容删了"，
 * 不是"版本换了"，本模块的职责边界到此为止（那条键也不会被任何代码读回来，无害）。
 */
const NOTICE_PREFIX = "notice.";

/**
 * 这个（去掉 `tmc.v1.` 前缀后的）键名**是不是当前在役的**。
 *
 * 白名单是**故意写死在 `persist.ts` 的**：它是 `tmc.v1.` 这个命名空间的唯一所有者，
 * 集中一处才能保证"加了一把新 store、忘了登记"这种错**当场看得见**（`persist.test.ts` 里
 * 有一条用例遍历每个生产 spec 的键、断言它们都在这里）。删掉的历史键（老单键 `sources`、
 * 不带模式后缀的 `preset` 等）不在这里 ⇒ 会被 {@link purgeLegacyKeys} 清掉。
 */
export function isKnownKey(specName: string): boolean {
  if ((FIXED_NAMES as readonly string[]).includes(specName)) return true;
  if (specName.startsWith(NOTICE_PREFIX) && specName.length > NOTICE_PREFIX.length) return true;
  const dot = specName.lastIndexOf(".");
  if (dot <= 0) return false;
  const base = specName.slice(0, dot);
  const mode = specName.slice(dot + 1);
  return (PER_MODE_BASES as readonly string[]).includes(base)
    && (MODES as readonly string[]).includes(mode);
}

/**
 * 清掉 `localStorage` 里**已废弃**的 `tmc.v1.*` 键：凡是前缀是 `tmc.v1.` 但不在
 * {@link isKnownKey} 白名单里的，一律删。
 *
 * 用例：老版本留下的键（分键之前的老单键、已删掉的 store、改用别的键名的旧结构）
 * 既不会造成功能问题，也永远不会被读回来 —— 但它们**会一直占着 localStorage 配额**。
 * 与其每条各写一段删键代码（最终一定会漏），不如在这一处按白名单一次性扫干净。
 *
 * **只删命中前缀的键**：`tmc.v1.` 之外的键一个都不碰（同一域名下可能还挂着别的应用的存储）。
 * 在应用启动时调一次即可；返回被删掉的键名（供测试与诊断用）。
 */
export function purgeLegacyKeys(): string[] {
  const store = storage();
  if (!store) return [];
  const doomed: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key === null || !key.startsWith(PREFIX)) continue;
    if (!isKnownKey(key.slice(PREFIX.length))) doomed.push(key);
  }
  for (const key of doomed) store.removeItem(key);
  return doomed;
}
