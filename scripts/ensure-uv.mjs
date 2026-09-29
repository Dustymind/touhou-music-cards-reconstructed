#!/usr/bin/env node
/**
 * 保证 `uv` 可用（REFACTOR-PLAN v2 §7.1：Vercel 的 installCommand 要装 uv）。
 *
 * 为什么是 postinstall 而不是改 vercel.json 的 installCommand：仓库的跨平台纪律是"脚本走 Node"，
 * 而 `curl … | sh` / `powershell -c …` 都是平台绑定的一行。这里：
 *   ① PATH 上已经有 uv（本机开发、装了 uv 的 CI）⇒ 什么都不做；
 *   ② 否则下载官方发行包到仓库内 `.tools/`（gitignored），`scripts/run.mjs` 会把它加进 PATH；
 *   ③ 下载/解包失败 ⇒ **非 0 退出**，让问题在 install 阶段就炸出来，而不是等构建时报"uv: not found"。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOLS = path.join(ROOT, ".tools");
const BIN = process.platform === "win32" ? "uv.exe" : "uv";

const probe = spawnSync(BIN, ["--version"], { stdio: "ignore" });
if (probe.status === 0) {
  console.log("[ensure-uv] PATH 上已有 uv：" + (spawnSync(BIN, ["--version"]).stdout ?? "").toString().trim());
  process.exit(0);
}
if (existsSync(path.join(TOOLS, BIN))) {
  console.log("[ensure-uv] 用仓库内的 " + path.relative(ROOT, path.join(TOOLS, BIN)));
  process.exit(0);
}

/** 平台 → 官方发行包的 target 名（.tar.gz；Windows 是 .zip，bsdtar 一样能解）。 */
function asset() {
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  if (process.platform === "win32") return arch + "-pc-windows-msvc.zip";
  if (process.platform === "darwin") return arch + "-apple-darwin.tar.gz";
  return arch + "-unknown-linux-gnu.tar.gz";
}

const name = asset();
const url = "https://github.com/astral-sh/uv/releases/latest/download/uv-" + name;
console.log("[ensure-uv] 下载 " + url);
mkdirSync(TOOLS, { recursive: true });
const archive = path.join(TOOLS, name);

try {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error("HTTP " + response.status);
  writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  const unpack = spawnSync("tar", ["-xf", archive, "-C", TOOLS], { stdio: "inherit" });
  if (unpack.status !== 0) throw new Error("tar 解包失败（exit " + unpack.status + "）");
} catch (error) {
  console.error("[ensure-uv] 装不上 uv：" + String(error));
  console.error("           手动装一份（https://docs.astral.sh/uv/），或把 uv 放进 " + path.relative(ROOT, TOOLS) + "/");
  process.exit(1);
} finally {
  rmSync(archive, { force: true });
}
if (!existsSync(path.join(TOOLS, BIN))) {
  console.error("[ensure-uv] 解包后没看到 " + path.relative(ROOT, path.join(TOOLS, BIN)));
  process.exit(1);
}
console.log("[ensure-uv] 已装到 " + path.relative(ROOT, path.join(TOOLS, BIN)));
