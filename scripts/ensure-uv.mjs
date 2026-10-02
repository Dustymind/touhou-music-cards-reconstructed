#!/usr/bin/env node
/**
 * 保证 `uv` 可用（REFACTOR-PLAN v2 §7.1：构建期需要 uv，而托管平台的 install 阶段本身不装它）。
 *
 * 为什么挂在 postinstall 而不是写进各家平台的 install 配置：仓库的跨平台纪律是"脚本走 Node"，
 * 而 `curl … | sh` / `powershell -c …` 都是平台绑定的一行 —— 挂 postinstall 则本机与
 * CI / 部署链的每一次 `pnpm install` 都自动覆盖，不用为每个平台各配一遍。这里：
 *   ① PATH 上已经有 uv（本机开发、装了 uv 的 CI）⇒ 什么都不做；
 *   ② 否则下载官方发行包到仓库内 `.tools/`（gitignored），`scripts/run.mjs` 会把它加进 PATH；
 *   ③ 下载/解包失败 ⇒ **非 0 退出**，让问题在 install 阶段就炸出来，而不是等构建时报"uv: not found"。
 *
 * **为什么不钉版本**（2026-10-02 明确过）：这套工具链只要求 `requires-python = ">=3.11"`
 * （`tomllib` 是唯一硬依赖），uv 自己的版本差异至今没碰到过任何影响 —— 所以这里跟 CI 的
 * `astral-sh/setup-uv@v5`（同样不带 `version:`）保持一致，取 `releases/latest`。
 * 本机与 CI 的 uv 版本**可以不同**（例如本机 0.11.7、CI 装到当时的最新），这不是问题；
 * 真哪天需要对齐，就在这一处加版本号（校验和那步已经在了，钉版本是安全的），别去改 CI。
 * 完整性靠下面的 `.sha256` 校验兜：**下载什么就跑什么，这一步不能省**。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error("HTTP " + response.status);
  const body = Buffer.from(await response.arrayBuffer());
  // 校验和：官方 release 每个资产都配一份 `<资产名>.sha256`（内容是 `<hex>  <文件名>`）。
  // postinstall 里下载什么就跑什么，这一步不能省。
  const digestResponse = await fetch(url + ".sha256",
    { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  if (!digestResponse.ok) throw new Error("拿不到校验和（HTTP " + digestResponse.status + "）");
  const expected = (await digestResponse.text()).trim().split(/\s+/)[0].toLowerCase();
  const actual = createHash("sha256").update(body).digest("hex");
  if (expected !== actual) throw new Error("校验和不匹配（期望 " + expected + "，实得 " + actual + "）");
  writeFileSync(archive, body);
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
