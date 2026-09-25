/** 音乐源解析：按 fallback 顺序在已启用的源表里找 URL，并记住会话内的失败。 */
import type { SourceRecord } from "../data/types";
import { trackId } from "../data/types";
import { parsePackSnapshot, type PackSnapshot } from "../data/packSnapshot";

type SourceStatus = "idle" | "loading" | "ready" | "error";

interface SourceTable {
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
  error?: string;
}

export type TableMap = Record<string, SourceTable>;

interface ResolvedTrack {
  sourceId: string;
  url: string;
}

/** 本地曲库 manifest 的固定文件名（助手与 v2 的约定）。 */
const LOCAL_MANIFEST_FILE = "manifest.json";

/** 媒体地址上的**数据版本**参数名（D144）。 */
export const REVISION_PARAM = "v";

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

/**
 * 把源声明的相对路径解析到 **manifest 所在的目录**（纯字符串，不做 URL 规范化）。
 *
 * **相对 manifest 本身就是有意的**：`manifest.json` 在域名根与子目录（GitHub Pages 项目页）下都成立，
 * 于是"响度表跟着源走"（D139）在两种部署形态下都不用改数据。三种输入：
 * 绝对地址（`http(s)://…` / `//…`）与根绝对路径（`/…`）原样返回，
 * 其余按 manifest 的目录拼接（`./` 前缀会去掉）。
 *
 * 曲目地址也走它（D141）：**源可以挂在别的域名上**，而相对地址在 `<audio>.src` 里是按**页面**解析的，
 * 那样会去应用自己那台主机上找音频（404）⇒ manifest 是绝对地址时这里就得到绝对地址 ✓；
 * manifest 本身是相对路径（同源 / 子目录形态）时结果仍是相对形式 ⇒ 与改前逐字一致 ✓。
 */
export function sourceRelativeUrl(manifestUrl: string, relative: string): string {
  const value = relative.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//") || value.startsWith("/")) {
    return value;
  }
  const path = manifestUrl.replace(/[?#].*$/, "");
  const slash = path.lastIndexOf("/");
  const directory = slash >= 0 ? path.slice(0, slash + 1) : "";
  return directory + value.replace(/^\.\//, "");
}

/** 归一化曲名：去掉开头的 `作者 - ` 前缀，再压空白、统一小写。
 *  本地曲库的 manifest 按**磁盘文件名**生成（文件名带作者前缀 ✓），而曲包数据里作者是独立字段、
 *  曲名已经不带前缀 ✓ —— 两边比较前必须同一口径，否则音MAD 匹配不上、播不出声。 */
export function normalizeTitle(title: string): string {
  return title.replace(/^[^-]{1,60}?\s+-\s+/, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * 源表里的**数据版本**：行里的第 4 位（逐曲，优先）> 顶层的 `revision`（整表兜底）> 空串。
 *
 * 为什么要有它（D144）：媒体地址在"数据变了但**链接没变**"时是不变的，而 CDN 给 `.mp3` 发的是
 * `max-age=14400` ⇒ 浏览器与边缘节点会拿旧的顶最多 4 小时（实测：重裁过的曲子仍播旧音频）。
 * 把版本拼进 URL 之后**版本一变 = URL 一变**，缓存键跟着音频走，而不是跟着链接走。
 *
 * 版本号由**源自己的清单**算（数据仓库 `packformat.media_revision`：文件名+大小+mtime）；
 * 逐曲那一位尤其重要 —— 只让变过的那几首换 URL，不会让整包 321 MB 全部重下 ✓。
 *
 * 空串 = **这个源没有声明版本**（三个远程镜像的裸数组就是这种）⇒ 一个字节都不拼，与改前逐字一致。
 * 它们不需要这个机制：表本身是**同源数据集文件**、每次都 `no-cache` 重新校验，而媒体在别人的
 * 主机上、内容不变（真换了 URL 也就换了地址，缓存自然不命中）。
 */
export function tableRevision(payload: unknown): string {
  const declared = (payload as { revision?: unknown } | null)?.revision;
  return typeof declared === "string" ? declared.trim() : "";
}

/** 把数据版本拼进媒体地址（已有查询串就用 `&`）。`revision` 为空 ⇒ **原样返回**（与改前逐字一致）。 */
export function versionedUrl(url: string, revision: string | undefined): string {
  if (!revision) return url;
  const value = encodeURIComponent(revision);
  return url.includes("?") ? `${url}&${REVISION_PARAM}=${value}` : `${url}?${REVISION_PARAM}=${value}`;
}

/**
 * 把 `[[专辑, 曲目, URL, 版本?], …]` 收成查表用的 Map。
 *
 *  `manifestUrl` 非空时，相对地址按 **manifest 所在的那一层**解析（D141，见 `sourceRelativeUrl`）；
 *  不传（纯函数用法 / 没加载过 manifest）时原样存 URL —— 与改前逐字一致。
 *  `revision` 是**整表兜底**版本（D144，见 `tableRevision`）：行里自带第 4 位时以行为准。 */
export function buildEntries(rows: unknown, manifestUrl = "", revision = ""): Map<string, string> {
  const entries = new Map<string, string>();
  if (!Array.isArray(rows)) return entries;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const [album, title, url, own] = row as [string, string, string, unknown];
    if (typeof url !== "string" || url.length === 0) continue;
    // 只存**本来的键**（一行一条 ✓）。归一化匹配交给 `resolveTrack` 的兜底扫描 ——
    // 早先在这里插过"归一化别名"，结果 `entries.size` 从 24 变 48 ✗，界面上的条目数就错了（D96）
    const resolved = manifestUrl ? sourceRelativeUrl(manifestUrl, url) : url;
    entries.set(trackId(album, title), versionedUrl(resolved, typeof own === "string" ? own : revision));
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
  // 两个键：原名 + 归一化名（去 `作者 - ` 前缀、压空白、小写）。
  // 本地 manifest 的曲名来自**磁盘文件名**（带作者前缀、大小写原样），曲包数据里作者是独立字段、
  // 曲名不带前缀 —— 只有归一化后两边才在同一口径上（否则 `Masuo…` 这种含拉丁字母的会因大小写对不上 ✗）。
  const wanted = normalizeTitle(title);
  for (const sourceId of order) {
    const table = tables[sourceId];
    if (!table || table.status === "error" || table.status === "idle") continue;
    const id = trackId(album, title);
    if (!failed.has(`${sourceId}\u0000${id}`)) {
      const url = table.entries.get(id);
      if (url) return { sourceId, url };
    }
    // 回退：按**归一化曲名**扫一遍（去 `作者 - ` 前缀、压空白、小写）。
    // 本地 manifest 的曲名来自磁盘文件名（带作者前缀、大小写原样），曲包数据的曲名不带前缀，
    // 只有归一化后两边才同一口径。只在直接命中失败时走这条路，代价可接受。
    // 注意**不能**把别名写进 entries ✗ —— 那样 `entries.size` 会翻倍，界面上的条目数就错了（D96）。
    for (const [key, url] of table.entries) {
      const separator = key.indexOf("\u0001");
      if (separator < 0 || key.slice(0, separator) !== album) continue;
      // 兜底判定用"后缀"而不是"去前缀"：作者名里本身可能带连字符（如 `Rendering-Liu` ✗），
      // 用 `^[^-]+ - ` 去前缀会失手；改成"磁盘名以 `作者 - 曲名` 结尾"就与作者长什么样无关 ✓
      const stored = normalizeTitle(key.slice(separator + 1));
      if (stored !== wanted && !stored.endsWith(` - ${wanted}`)) continue;
      if (!failed.has(`${sourceId}\u0000${key}`)) return { sourceId, url };
    }
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
      table.status = "ready";
    } catch (error) {
      table.status = "error";
      table.error = error instanceof Error ? error.message : String(error);
    }
  }));

  return { tables, order };
}
