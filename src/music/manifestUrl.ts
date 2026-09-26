/** 源清单地址的语义（D139 / D141 / D144）：**相对清单自身**解析、媒体地址拼数据版本。
 *
 * 单独成一个叶子模块是有意的：这份语义**两个方向都要用** —— `music/sources.ts` 解析曲目表
 * （本地曲库的 `manifest.json`）时用它，`data/customManifest.ts` 校验模式 3 的自定义清单
 * （卡面 / 音频地址）时也用它，而后者又会被 `sources.ts` 调用来解析**同一份 payload**。
 * 放在任何一边都会变成两个模块互相 import，所以落在这里（纯字符串函数，不认识数据集）。
 */

/** 媒体地址上的**数据版本**参数名（D144）。 */
const REVISION_PARAM = "v";

/** 本地曲库 manifest 的固定文件名（助手与 v2 的约定）。 */
export const MANIFEST_FILE = "manifest.json";

/**
 * 归一化源清单地址：
 * - 空 → `null`（= 没有覆盖，用数据里的默认值）；
 * - 带 `.json` → 视为完整 manifest 地址；
 * - 否则视为基地址，补上 `manifest.json`（`127.0.0.1:8011` 这种也认，自动补 `http://`）。
 *
 * 两个 kind 走同一套（本地曲库 D140、自定义源 D157）：它们都是"用户在设置页里填一行地址"，
 * 归一化的规则没有理由分叉。
 */
export function normalizeManifestUrl(raw: string | null | undefined): string | null {
  let value = (raw ?? "").trim();
  if (value === "") return null;
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`;
  if (value.endsWith(".json")) return value;
  return value.endsWith("/") ? `${value}${MANIFEST_FILE}` : `${value}/${MANIFEST_FILE}`;
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
 *
 * 模式 3 的卡面与音频也走它（D157）：清单里写相对路径 ⇒ 按清单目录拼，写绝对 URL ⇒ 原样。
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
