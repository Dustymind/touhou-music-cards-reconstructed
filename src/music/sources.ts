/** 音乐源解析：按 fallback 顺序在已启用的源表里找 URL，并记住会话内的失败。 */
import type { SourceRecord } from "../data/types";
import { trackId } from "../data/types";

type SourceStatus = "idle" | "loading" | "ready" | "error";

interface SourceTable {
  id: string;
  status: SourceStatus;
  /** `trackId → URL` */
  entries: Map<string, string>;
  error?: string;
}

export type TableMap = Record<string, SourceTable>;

interface ResolvedTrack {
  sourceId: string;
  url: string;
}

/** 本地曲库 manifest 的固定文件名（助手与 v2 的约定）。 */
const LOCAL_MANIFEST_FILE = "manifest.json";

/**
 * 归一化本地曲库地址：
 * - 空 → `null`（用数据里的默认值，单端口部署时就是同源的 `/manifest.json`）；
 * - 带 `.json` → 视为完整 manifest 地址；
 * - 否则视为基地址，补上 `manifest.json`（`127.0.0.1:8011` 这种也认，自动补 `http://`）。
 */
export function normalizeLocalManifestUrl(raw: string | null | undefined): string | null {
  let value = (raw ?? "").trim();
  if (value === "") return null;
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`;
  if (value.endsWith(".json")) return value;
  return value.endsWith("/") ? `${value}${LOCAL_MANIFEST_FILE}` : `${value}/${LOCAL_MANIFEST_FILE}`;
}

/** 应用覆盖值：只改 `kind === "local"` 的源，其余源原样。 */
export function applyLocalManifestUrl(
  sources: readonly SourceRecord[],
  raw: string | null | undefined,
): SourceRecord[] {
  const url = normalizeLocalManifestUrl(raw);
  if (!url) return [...sources];
  return sources.map((source) => (source.kind === "local" ? { ...source, tableUrl: url } : source));
}

/** 把 `[[专辑, 曲目, URL], …]` 收成查表用的 Map。 */
export function buildEntries(rows: unknown): Map<string, string> {
  const entries = new Map<string, string>();
  if (!Array.isArray(rows)) return entries;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const [album, title, url] = row as [string, string, string];
    if (typeof url === "string" && url.length > 0) entries.set(trackId(album, title), url);
  }
  return entries;
}

/** 按顺序找第一个"有这条曲目且没失败过"的源。 */
export function resolveTrack(
  tables: TableMap,
  order: readonly string[],
  album: string,
  title: string,
  failed: ReadonlySet<string> = new Set(),
): ResolvedTrack | null {
  const id = trackId(album, title);
  for (const sourceId of order) {
    const table = tables[sourceId];
    if (!table || table.status === "error" || table.status === "idle") continue;
    if (failed.has(`${sourceId}\u0000${id}`)) continue;
    const url = table.entries.get(id);
    if (url) return { sourceId, url };
  }
  return null;
}

/** 换源重试：跳过当前失败的那个源，找下一个候选。 */
export function nextCandidate(
  tables: TableMap,
  order: readonly string[],
  album: string,
  title: string,
  failed: ReadonlySet<string>,
): ResolvedTrack | null {
  return resolveTrack(tables, order, album, title, failed);
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

/** 只在需要时加载选中的源（默认开启 + 用户覆盖），并记录每个源的状态。 */
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

  await Promise.all(enabled.map(async (source) => {
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
      table.entries = buildEntries(rows);
      table.status = "ready";
    } catch (error) {
      table.status = "error";
      table.error = error instanceof Error ? error.message : String(error);
    }
  }));

  return { tables, order };
}
