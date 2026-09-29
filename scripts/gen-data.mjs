#!/usr/bin/env node
/** dev 懒生成：真源（data/** 与两个数据仓库的数据集）内容哈希没变就不重跑 tmc.build。
 *
 * 为什么是哈希缓存而不是 mtime：检出版本的 mtime 全是 checkout 时间，哈希才反映**内容**。
 * 缓存落在 gitignored 的 .cache/data-gen/；命中 ⇒ 零等待，未命中 ⇒ 跑一次构建（约数秒）。
 * 与 scripts/run.mjs 同一套环境口径：UV_CACHE_DIR 指仓库内，不覆盖调用方已设的值。
 *
 * 两个数据仓库的数据集**先**由 scripts/build-datasets.mjs 确保最新（它自己也会跳过没变的），
 * 数据集目录进指纹 ⇒ 数据集一变这里就重跑 tmc.build（REFACTOR-PLAN v2 §7.2）。
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".cache", "data-gen");

/** 数据仓库位置：env 覆盖 ⇒ 默认 data/<mode>（与 scripts/run.mjs 同一口径）。 */
function dataDir(mode, dirEnv) {
  const value = (process.env[dirEnv] ?? "").trim();
  return value ? path.resolve(value) : path.join(ROOT, "data", mode);
}

/** 真源 = 主仓库进仓库的 TOML + 两个数据仓库**已生成的数据集**（绝对路径）。 */
function sourceRoots() {
  return [
    path.join(ROOT, "data", "characters"),
    path.join(ROOT, "data", "sources"),
    path.join(ROOT, "data", "originals.toml"),
    path.join(ROOT, "data", "card-sets.toml"),
    path.join(ROOT, "data", "packs"),
    path.join(dataDir("otomads", "OTOMADS_DATA_DIR"), "dataset"),
    path.join(dataDir("custom", "CUSTOM_DATA_DIR"), "dataset"),
  ];
}

/** 每个参与构建的东西的「路径 + 内容」的 sha256（两层目录足够深：见 sourceRoots）。 */
function fingerprint() {
  const hash = createHash("sha256");
  const walk = (abs, depth) => {
    if (!existsSync(abs)) return;
    const stat = statSync(abs);
    if (stat.isFile()) {
      hash.update(path.relative(ROOT, abs));
      hash.update(readFileSync(abs));
      return;
    }
    if (depth <= 0) {
      hash.update(path.relative(ROOT, abs) + "#dir");   // 目录内容不看了，但目录在不在算数
      return;
    }
    for (const name of readdirSync(abs).sort()) walk(path.join(abs, name), depth - 1);
  };
  for (const root of sourceRoots()) walk(root, 2);
  return hash.digest("hex");
}

/** 先让两个数据仓库各自生成数据集（它们自己判断"最新就跳过"）。 */
const datasets = spawnSync(process.execPath, [path.join(ROOT, "scripts", "build-datasets.mjs")], {
  stdio: "inherit", cwd: ROOT,
});
if (datasets.status !== 0) process.exit(datasets.status ?? 1);

const stamp = path.join(CACHE, fingerprint());
if (existsSync(stamp + ".ok")) {
  console.log("[data:ensure] 真源未变，跳过构建");
  process.exit(0);
}
mkdirSync(CACHE, { recursive: true });
for (const name of readdirSync(CACHE)) rmSync(path.join(CACHE, name), { recursive: true, force: true });

const env = { ...process.env };
env.UV_CACHE_DIR ??= path.join(ROOT, ".uv", "cache");
const result = spawnSync("uv", ["run", "--project", "tools", "python", "-m", "tmc.build"], {
  stdio: "inherit",
  env,
  cwd: ROOT,
  shell: process.platform === "win32",
});
if (result.error) {
  console.error("启动失败：" + result.error.message);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);
writeFileSync(stamp + ".ok", String(Date.now()));
console.log("[data:ensure] 构建完成，缓存已更新");
