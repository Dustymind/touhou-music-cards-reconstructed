/** 音乐源解析：按 fallback 顺序在已启用的源表里找 URL，并记住会话内的失败。
 *
 *  **清单地址的语义**（相对 manifest 解析 / 媒体版本号）搬去了 `manifestUrl.ts`：模式 3 的
 *  自定义清单也要用同一套，留在这里会与 `data/customManifest.ts` 互相 import。
 *  这里原样再导出 ⇒ 调用方仍然只认 `music/sources.ts` 这一个入口。
 */
import type { SourceRecord } from "../data/types";
import { trackId } from "../data/types";
import { parsePackSnapshot, type PackSnapshot } from "../data/packSnapshot";
import { parseCustomManifest, type CustomManifest } from "../data/customManifest";
import { canonicalPathEncoding, normalizeManifestUrl, sourceRelativeUrl, tableRevision,
  versionedUrl } from "./manifestUrl";

// 再导出：调用方（含测试）仍然只认 `music/sources.ts` 这一个入口
export { canonicalPathEncoding, normalizeManifestUrl, sourceRelativeUrl, tableRevision, versionedUrl };

type SourceStatus = "idle" | "loading" | "ready" | "error";

export interface SourceTable {
  id: string;
  status: SourceStatus;
  /** `trackId → URL` */
  entries: Map<string, string>;
  /**
   * 源在**自己的 manifest 里**声明的响度表地址（已相对 manifest 解析，D139）；没声明就是 undefined。
   * 播放层优先用它（表跟着源部署），没有才回落到注册表里那份（相对数据集目录，D130）。
   */
  loudnessUrl?: string;
  /**
   * 源在**自己的 manifest 里**给的"包数据"（曲目表快照，D145）；老清单没有就是 undefined。
   * 与 `loudnessUrl` 同一个套路：**同一个 payload 里解析，不额外发请求**。
   * 形状不对时也是 undefined（`parsePackSnapshot` 严格校验 ⇒ 走自带那份兜底，绝不半信半疑地用）。
   */
  snapshot?: PackSnapshot;
  /**
   * 模式 3 的**自定义清单**（契约 `docs/custom-mode-v1.md` C2）：与 `snapshot` 同一个套路 ——
   * **同一个 payload 里解析，不额外发请求**。形状不对时是 `undefined`（严格校验 ⇒ 整份不生效、
   * 走空兜底，绝不半信半疑地用）。这个模式**没有 `entries`**（音频地址在每张卡自己身上，F1），
   * 所以界面上"源状态"显示的是**卡数**，而不是 `entries.size`。
   */
  custom?: CustomManifest;
  error?: string;
}

export type TableMap = Record<string, SourceTable>;

interface ResolvedTrack {
  sourceId: string;
  url: string;
}

/** 运行时覆盖：`local` 只改 `kind === "local"` 的源、`custom` 只改 `kind === "custom"` 的源（D140/D157）。
 *
 *  两者走同一套归一化（空 ⇒ 那一类不动；带 `.json` ⇒ 整条；否则补 `manifest.json`）——
 *  对使用者来说它们是同一件事：**在设置页里填一行地址**。
 *
 *  `custom` 为空是**常态**（模式 3 默认就没配源）⇒ 源记录原样返回，前端也就不会去请求它（契约 C7）。
 */
export function applyManifestOverrides(
  sources: readonly SourceRecord[],
  overrides: { local?: string | null; custom?: string | null },
): SourceRecord[] {
  const local = normalizeManifestUrl(overrides.local);
  const custom = normalizeManifestUrl(overrides.custom);
  if (!local && !custom) return [...sources];
  return sources.map((source) => {
    if (local && source.kind === "local") return { ...source, tableUrl: local };
    if (custom && source.kind === "custom") return { ...source, tableUrl: custom };
    return source;
  });
}

/** 归一化曲名：去掉开头的 `作者 - ` 前缀，再压空白、统一小写。
 *  本地曲库的 manifest 按**磁盘文件名**生成（文件名带作者前缀 ✓），而曲包数据里作者是独立字段、
 *  曲名已经不带前缀 ✓ —— 两边比较前必须同一口径，否则音MAD 匹配不上、播不出声。 */
function normalizeTitle(title: string): string {
  return title.replace(/^[^-]{1,60}?\s+-\s+/, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * 把 `[[专辑, 曲目, URL, 版本?], …]` 收成查表用的 Map。
 *
 *  `manifestUrl` 非空时，相对地址按 **manifest 所在的那一层**解析（D141，见 `sourceRelativeUrl`）；
 *  不传（纯函数用法 / 没加载过 manifest）时原样存 URL —— 与改前逐字一致。
 *  `revision` 是**整表兜底**版本（D144，见 `tableRevision`）：行里自带第 4 位时以行为准。 */
export function buildEntries(rows: unknown, manifestUrl = "", revision = ""): Map<string, string> {
  const entries = new Map<string, string>();
  // S2：主仓库的源表是 `{entries: {曲id: {url, revision?}}}`（id 键控）；远端/本地清单仍是元组行
  if (rows && typeof rows === "object" && !Array.isArray(rows)) {
    const table = (rows as { entries?: unknown }).entries;
    if (table && typeof table === "object") {
      for (const [id, rec] of Object.entries(table as Record<string, { url?: unknown; revision?: unknown }>)) {
        if (!rec || typeof rec.url !== "string" || rec.url.length === 0) continue;
        const resolved = manifestUrl ? sourceRelativeUrl(manifestUrl, rec.url) : rec.url;
        entries.set(
          id,
          versionedUrl(canonicalPathEncoding(resolved),
                       typeof rec.revision === "string" ? rec.revision : revision),
        );
      }
      return entries;
    }
  }
  if (!Array.isArray(rows)) return entries;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const [album, title, url, own] = row as [string, string, string, unknown];
    if (typeof url !== "string" || url.length === 0) continue;
    // 只存**本来的键**（一行一条 ✓）。归一化匹配交给 `resolveTrack` 的兜底扫描 ——
    // 早先在这里插过"归一化别名"，结果 `entries.size` 从 24 变 48 ✗，界面上的条目数就错了（D96）
    // 路径编码收敛到 RFC 3986 的规范形式（D169）：非规范编码（`%28` 这种）会让 Cloudflare 的静态
    // 资源站先回 307，而**带 `Range`** 的跟随请求会 500 ⇒ `<audio>` 整首放不出来。
    // 收敛后请求头一次命中；源写成哪种形式都能救回来（本机助手实测两种写法都 206）
    const resolved = manifestUrl ? sourceRelativeUrl(manifestUrl, url) : url;
    entries.set(
      trackId(album, title),
      versionedUrl(canonicalPathEncoding(resolved), typeof own === "string" ? own : revision),
    );
  }
  return entries;
}

/** 按顺序找第一个"有这条曲目且没失败过"的源（S2：先按曲id 直查，再走旧清单行的桥接键）。 */
export function resolveTrack(
  tables: TableMap,
  order: readonly string[],
  entry: { id: string; album: string; title: string },
  failed: ReadonlySet<string> = new Set(),
): ResolvedTrack | null {
  const bridge = trackId(entry.album, entry.title);
  // 桥接键 + 归一化名（去 `作者 - ` 前缀、压空白、小写）：本地 manifest 的曲名来自**磁盘文件名**
  // （带作者前缀、大小写原样），曲包数据里作者是独立字段、曲名不带前缀 —— 只有归一化后两边才同一口径。
  const wanted = normalizeTitle(entry.title);
  for (const sourceId of order) {
    const table = tables[sourceId];
    if (!table || table.status === "error" || table.status === "idle") continue;
    if (!failed.has(`${sourceId}\u0000${entry.id}`)) {
      const url = table.entries.get(entry.id);
      if (url) return { sourceId, url };
    }
    if (!failed.has(`${sourceId}\u0000${bridge}`)) {
      const url = table.entries.get(bridge);
      if (url) return { sourceId, url };
    }
    // 回退：按**归一化曲名**扫一遍（去 `作者 - ` 前缀、压空白、小写）。
    // 本地 manifest 的曲名来自磁盘文件名（带作者前缀、大小写原样），曲包数据的曲名不带前缀，
    // 只有归一化后两边才同一口径。只在直接命中失败时走这条路，代价可接受。
    // 注意**不能**把别名写进 entries ✗ —— 那样 `entries.size` 会翻倍，界面上的条目数就错了（D96）。
    for (const [key, url] of table.entries) {
      const separator = key.indexOf("\u0001");
      if (separator < 0 || key.slice(0, separator) !== entry.album) continue;
      // 兜底判定用"后缀"而不是"去前缀"：作者名里本身可能带连字符（如 `Rendering-Liu` ✗），
      // 用 `^[^-]+ - ` 去前缀会失手；改成"磁盘名以 `作者 - 曲名` 结尾"就与作者长什么样无关 ✓
      const stored = normalizeTitle(key.slice(separator + 1));
      if (stored !== wanted && !stored.endsWith(` - ${wanted}`)) continue;
      if (!failed.has(`${sourceId}\u0000${key}`)) return { sourceId, url };
    }
  }
  return null;
}


/** 该组合下有多少首能被解析（配置页诊断用）。 */
export function countResolvable(tables: TableMap, order: readonly string[]): number {
  const first = order[0];
  if (!first) return 0;
  const seen = new Set<string>();
  for (const sourceId of order) {
    const table = tables[sourceId];
    if (!table || table.status !== "ready") continue;
    for (const key of table.entries.keys()) seen.add(key);
  }
  return seen.size;
}

interface SourceLoadResult {
  tables: TableMap;
  order: string[];
}

/** 只在需要时加载选中的源（默认开启 + 用户覆盖），并记录每个源的状态。
 *
 *  **地址为空 = 跳过**（不发请求、不算失败）：模式 3 的源默认就是空的。 */

export async function loadSourceTables(
  sources: readonly SourceRecord[],
  overrides: Record<string, { enabled: boolean; order: number }>,
  fetcher: typeof fetch = fetch,
): Promise<SourceLoadResult> {
  const enabled = sources.filter((source) => overrides[source.id]?.enabled ?? source.enabled);
  const order = enabled
    .slice()
    .sort((a, b) => {
      const ao = overrides[a.id]?.order ?? a.order;
      const bo = overrides[b.id]?.order ?? b.order;
      return ao - bo;
    })
    .map((source) => source.id);

  const tables: TableMap = {};
  for (const source of sources) {
    tables[source.id] = { id: source.id, status: "idle", entries: new Map() };
  }

  // **地址为空的源一个请求都不发**（模式 3 默认就是这样：还没填源不是错误，契约 C7）。
  // 其余模式的注册表由守卫挡着，不会出现空地址，所以这一步对它们没有影响。
  const fetchable = enabled.filter((source) => source.tableUrl.trim() !== "");

  await Promise.all(fetchable.map(async (source) => {
    const table = tables[source.id]!;
    table.status = "loading";
    try {
      const response = await fetcher(source.tableUrl, { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload: unknown = await response.json();
      // 远端源表是裸数组；本地助手的 manifest 是 {tracks:[...]}
      const rows = Array.isArray(payload)
        ? payload
        : (payload as { tracks?: unknown } | null)?.tracks;
      table.entries = buildEntries(rows, source.tableUrl, tableRevision(payload));
      // 源可以自己声明响度表（**相对 manifest 自身**，D139）：表跟着源部署，跨宿主也不用改应用。
      // 没声明就留空 —— 调用方（AppShell）回落到注册表里那份（相对数据集目录）。
      const declared = Array.isArray(payload)
        ? undefined
        : (payload as { loudness?: unknown } | null)?.loudness;
      if (typeof declared === "string" && declared.trim()) {
        table.loudnessUrl = sourceRelativeUrl(source.tableUrl, declared);
      }
      // 同一个 payload 里还可能有"包数据"（曲目表跟着源走，D145）：它决定这个包有哪些曲目，
      // 由调用方（AppShell）交给 `withPackSnapshot` 重建数据集。**不发第二个请求**。
      const snapshot = parsePackSnapshot(payload);
      if (snapshot !== undefined) table.snapshot = snapshot;
      // 模式 3 的自定义清单也在**同一个 payload** 里（`{schema, mode, cards, …}`，契约 C2）：
      // 同样不发第二个请求。它不是曲目表快照（没有 albums/characters 那两个键），两者互不干扰。
      const custom = parseCustomManifest(payload, source.tableUrl);
      if (custom !== undefined) table.custom = custom;
      table.status = "ready";
    } catch (error) {
      table.status = "error";
      table.error = error instanceof Error ? error.message : String(error);
    }
  }));

  return { tables, order };
}
