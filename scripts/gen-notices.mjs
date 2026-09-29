#!/usr/bin/env node
/**
 * 生成 THIRD-PARTY-NOTICES.md 里的第三方包清单，并产出 dist/THIRD-PARTY-NOTICES.txt。
 *
 * 口径
 * ----
 * - **清单与版本**：从 `package.json` 的 `dependencies` 出发，按 Node 的解析规则在
 *   `node_modules` 里走**生产闭包**（pnpm 的符号链接照走）。构建期依赖不进闭包，因此不署名。
 * - **SPDX 标识**：各包 `package.json` 的 `license` 字段。
 * - **版权行**：各包自己的 `LICENSE*` / `COPYING*` 里**第一个以 Copyright 开头的行**；
 *   抽不到就回落 `author`，再回落包名。
 * - **许可证正文**：`LICENSES/<SPDX>.txt`（REUSE 的既有约定，只有一份）。
 *
 * 产物
 * ----
 * 1. `THIRD-PARTY-NOTICES.md`：**只替换** `<!-- gen:packages:start -->` 与
 *    `<!-- gen:packages:end -->` 之间的表格；其余散文（字体 / 图标 / 运行时内容 / 其他说明）
 *    **手写、不被脚本碰**。
 * 2. `dist/THIRD-PARTY-NOTICES.txt`：正文 + 附录（把用到的 `LICENSES/*.txt` 全文拼上）——
 *    分发副本因此一定带得上许可全文（D170 的要求）。
 *
 * 用法：`pnpm notices`（或 `node scripts/gen-notices.mjs`）。加 `--check` 只比对不写盘。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MD = path.join(ROOT, "THIRD-PARTY-NOTICES.md");
const LICENSES = path.join(ROOT, "LICENSES");
const TXT = path.join(ROOT, "dist", "THIRD-PARTY-NOTICES.txt");
const START = "<!-- gen:packages:start -->";
const END = "<!-- gen:packages:end -->";
const CHECK = process.argv.includes("--check");

/** 按 Node 的解析规则找 `<fromDir>/…/node_modules/<name>`。 */
function resolvePackage(fromDir, name) {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, "node_modules", name);
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** 读一个包的 `package.json`。 */
function readManifest(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

/** SPDX 标识：`license` 字符串 / `{type}` / `licenses[]`。 */
function licenseOf(manifest) {
  const raw = manifest.license ?? manifest.licenses;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0];
    return typeof first === "string" ? first : (first?.type ?? "UNKNOWN");
  }
  return "UNKNOWN";
}

/** 版权行：该包许可文件里第一个以 Copyright 开头的行。 */
function copyrightOf(dir, manifest) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    /* 读不到目录就当没有 */
  }
  const files = entries.filter((e) => /^(licen[cs]e|copying)/i.test(e)).sort();
  for (const file of files) {
    let text = "";
    try {
      text = fs.readFileSync(path.join(dir, file), "utf8");
    } catch {
      continue;
    }
    const line = text.split(/\r?\n/).find((l) => /^\s*copyright/i.test(l));
    if (line !== undefined) return line.trim().replace(/\s+$/, "");
  }
  if (typeof manifest.author === "string") return manifest.author;
  if (manifest.author?.name !== undefined) return manifest.author.name;
  return manifest.name;
}

/** 生产闭包（BFS）。返回 Map<name, {version, license, copyright, dir}>。 */
function productionClosure() {
  const root = readManifest(ROOT);
  const found = new Map();
  const queue = Object.keys(root.dependencies ?? {}).map((name) => ({ name, from: ROOT }));
  const seen = new Set();
  while (queue.length > 0) {
    const { name, from } = queue.shift();
    const key = `${name}\u0000${from}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const located = resolvePackage(from, name);
    if (located === null) continue;
    // pnpm 把包放在 .pnpm/<pkg>@<ver>/node_modules/<pkg> 并用符号链接接到顶层：
    // 递归找依赖必须从**真实路径**出发，否则走的是顶层（pnpm 默认不提升传递依赖）。
    let dir = located;
    try {
      // Windows 上 pnpm 用**目录联接（junction）**接顶层条目。`fs.realpathSync`（JS 实现）
      // 不解析联接，会把顶层路径原样返回，于是找不到兄弟依赖；`.native` 才会落到虚拟存储
      // `node_modules/.pnpm/<id>/node_modules/` —— 那里才有这个包的依赖。
      dir = (fs.realpathSync.native ?? fs.realpathSync)(located);
    } catch {
      /* 保持原路径 */
    }
    const manifest = readManifest(dir);
    if (manifest === null) continue;
    // 类型声明包（`@types/*`）只参与编译，必然不进产物 ⇒ 不署名。
    if (name.startsWith("@types/")) continue;
    if (!found.has(name)) {
      found.set(name, {
        name,
        version: manifest.version ?? "?",
        license: licenseOf(manifest),
        copyright: copyrightOf(dir, manifest),
        dir,
      });
    }
    for (const dep of Object.keys(manifest.dependencies ?? {})) queue.push({ name: dep, from: dir });
  }
  return found;
}

/**
 * 有 dist 的 sourcemap 时，`--from-dist` 把闭包**收窄成真正进 bundle 的那批**。
 *
 * 口径：development 构建会在 `dist/assets/*.js.map` 里留下每个模块的原始路径
 * （pnpm 的虚拟存储形式 `…/node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/…`），
 * 取**最后一段 `node_modules/`** 之后的包名即可。没有 dist 就返回 null（回落闭包口径）。
 */
function bundledFromDist() {
  const assets = path.join(ROOT, "dist", "assets");
  if (!fs.existsSync(assets)) return null;
  const maps = fs.readdirSync(assets).filter((f) => f.endsWith(".js.map"));
  if (maps.length === 0) return null;
  const names = new Set();
  for (const file of maps) {
    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(path.join(assets, file), "utf8"));
    } catch {
      continue;
    }
    for (const source of payload.sources ?? []) {
      const at = source.lastIndexOf("node_modules/");
      if (at < 0) continue;
      const rest = source.slice(at + "node_modules/".length).split("/");
      const name = rest[0].startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
      names.add(name);
    }
  }
  return names.size > 0 ? names : null;
}

const closure = productionClosure();
const measured = process.argv.includes("--from-dist") ? bundledFromDist() : null;
const mode = measured === null ? (process.argv.includes("--from-dist") ? "closure（dist 不可用，回落）" : "closure") : "dist sourcemap";
const packages = [...closure.values()]
  .filter((p) => measured === null || measured.has(p.name))
  .sort((a, b) => a.name.localeCompare(b.name));
const groups = new Map();
for (const p of packages) {
  const list = groups.get(p.license) ?? [];
  list.push(p);
  groups.set(p.license, list);
}
const usedLicenses = [...groups.keys()].filter((id) => fs.existsSync(path.join(LICENSES, `${id}.txt`)));

/** 生成清单 markdown（只含被替换的那一段）。 */
function renderTable() {
  const out = [];
  out.push(`共 **${packages.length}** 个包（构建期依赖不进这里）。每种许可的正文只存一份，见 \`LICENSES/\`。`, "");
  for (const id of [...groups.keys()].sort()) {
    const list = groups.get(id);
    out.push(`### ${id}（${list.length} 个）`, "");
    out.push("| 包 | 版本 | 版权 |", "|---|---|---|");
    for (const p of list) out.push(`| \`${p.name}\` | ${p.version} | ${p.copyright} |`);
    out.push("", `许可正文：\`LICENSES/${id}.txt\`${usedLicenses.includes(id) ? "" : "（**缺文件**）"}`, "");
  }
  return out.join("\n").trimEnd();
}

/** 分发副本：正文 + 附录（用到的许可全文）。 */
function renderDist(md) {
  const appendix = usedLicenses.map((id) => {
    const text = fs.readFileSync(path.join(LICENSES, `${id}.txt`), "utf8").trimEnd();
    return `${"=".repeat(72)}\n${id} — 全文（\`LICENSES/${id}.txt\`）\n${"=".repeat(72)}\n\n${text}`;
  });
  const plain = md
    .replace(/<!--[^>]*-->/g, "")
    .replace(/^#{1,4}\s*/gm, "")
    .replace(/\*\*/g, "")
    .trimEnd();
  return `${plain}\n\n\n${appendix.join("\n\n")}\n`;
}

const md = fs.readFileSync(MD, "utf8");
const a = md.indexOf(START);
const b = md.indexOf(END);
if (a < 0 || b < 0) {
  console.error(`缺少标记 ${START} / ${END}`);
  process.exit(2);
}
const next = md.slice(0, a + START.length) + "\n" + renderTable() + "\n" + md.slice(b);
const dist = renderDist(next);

if (CHECK) {
  const stale = next !== md || (fs.existsSync(TXT) && fs.readFileSync(TXT, "utf8") !== dist);
  console.log(stale ? "[FAILED] 署名文件与生产闭包不一致 —— 跑 pnpm notices" : "[  OK  ] 署名文件与生产闭包一致");
  process.exit(stale ? 1 : 0);
}

fs.writeFileSync(MD, next, "utf8");
fs.mkdirSync(path.dirname(TXT), { recursive: true });
fs.writeFileSync(TXT, dist, "utf8");
console.log(`[  OK  ] ${packages.length} 个包 · 口径=${mode}（${[...groups.keys()].sort().join(" / ")}）`);
console.log(`  ${path.relative(ROOT, MD)} ${next.length} 字符`);
console.log(`  ${path.relative(ROOT, TXT)} ${dist.length} 字符`);
if (!usedLicenses.every((id) => true) || usedLicenses.length !== groups.size) {
  const missing = [...groups.keys()].filter((id) => !usedLicenses.includes(id));
  console.log(`  [ WARN ] LICENSES/ 里缺：${missing.join(", ")}`);
}
