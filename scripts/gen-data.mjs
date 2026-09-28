#!/usr/bin/env node
/** dev 懒生成：真源（data/** 的 TOML 与源文件）内容哈希没变就不重跑 tmc.build。
 *
 * 为什么是哈希缓存而不是 mtime：检出版本的 mtime 全是 checkout 时间，哈希才反映**内容**。
 * 缓存落在 gitignored 的 .cache/data-gen/；命中 ⇒ 零等待，未命中 ⇒ 跑一次构建（约数秒）。
 * 与 scripts/run.mjs 同一套环境口径：UV_CACHE_DIR 指仓库内，不覆盖调用方已设的值。
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".cache", "data-gen");

/** 真源指纹 = 每个参与构建的 TOML 的「相对路径 + 内容」的 sha256（只认 data/ 下**进仓库**的文件）。 */
function fingerprint() {
  const hash = createHash("sha256");
  const roots = [
    "data/characters", "data/sources", "data/originals.toml", "data/card-sets.toml",
    "data/packs", "data/otomads/packs", "data/otomads/sources",
  ];
  for (const rel of roots) {
    const abs = path.join(ROOT, ...rel.split("/"));
    if (!existsSync(abs)) continue;
    if (statSync(abs).isFile()) {
      hash.update(rel);
      hash.update(readFileSync(abs));
      continue;
    }
    for (const name of readdirSync(abs).sort()) {
      const child = path.join(abs, name);
      const childRel = rel + "/" + name;
      if (statSync(child).isDirectory()) {
        for (const leaf of readdirSync(child).sort()) {
          const leafAbs = path.join(child, leaf);
          if (statSync(leafAbs).isFile()) {
            hash.update(childRel + "/" + leaf);
            hash.update(readFileSync(leafAbs));
          }
        }
      } else {
        hash.update(childRel);
        hash.update(readFileSync(child));
      }
    }
  }
  return hash.digest("hex");
}

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
