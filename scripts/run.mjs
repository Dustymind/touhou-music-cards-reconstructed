#!/usr/bin/env node
/**
 * 跨平台跑一条命令：把仓库内的缓存与浏览器路径设好，再 spawn。
 *
 * ---- 为什么需要它 ----
 *
 * 原来这些 npm 脚本写成 POSIX 的**行内环境变量前缀**：
 *
 *     PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" vitest run
 *     UV_CACHE_DIR=.uv/cache uv run python -m tmc.build
 *
 * 两处都是 POSIX sh 专有语法，`cmd.exe` 不认。绕过的办法是在 Windows 上配
 * `script-shell` 指向本机 Git Bash 的绝对路径 —— 但那**既是硬编码、又把仓库绑到某个平台**：
 * 路径随安装位置变，且 Linux/macOS 上那条配置没意义。
 *
 * 这里改成 Node（本来就是硬前置）：路径**从本文件自身位置推导**，没有写死的绝对路径，
 * 三种平台的跑法完全一致，也不需要动 npm 的 `script-shell`。
 *
 * ---- 用法 ----
 *
 *     node scripts/run.mjs <命令> [参数…]
 *
 * 例：`node scripts/run.mjs vitest run --project=chromium`
 *
 * ---- 环境变量 ----
 *
 * 两个都在**仓库内**（原来的口径），但**已经在环境里设过的不覆盖** ——
 * 沙箱/CI 想指到别处就自己 export，仓库不替它决定。
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** 仓库根：本文件在 `scripts/` 下，所以是它的上一级。**不写死绝对路径。** */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error("用法：node scripts/run.mjs <命令> [参数…]");
  process.exit(2);
}

const env = { ...process.env };
// 浏览器装在仓库内（与 README / docs/WINDOWS.md 同一口径）
env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(ROOT, ".playwright-browsers");
// uv 的缓存也放仓库内：有些环境（沙箱、只读 $HOME）写不了默认位置。
// 一个仓库一个缓存，不按子项目分。
env.UV_CACHE_DIR ??= path.join(ROOT, ".uv", "cache");
// `uvx`（`pnpm license:lint` 的 reuse）还要两个位置：默认在 `~/.local/share/uv/…`，
// 只读 $HOME 时直接报 "failed to create directory"。仍是谁设过听谁的。
env.UV_TOOL_DIR ??= path.join(ROOT, ".uv", "tools");
env.UV_TOOL_BIN_DIR ??= path.join(ROOT, ".uv", "bin");
// 两个数据仓库的位置（REFACTOR-PLAN v2 §7.2/§11.4：不再是 submodule）：
// env 可覆盖，默认 data/<mode>；npm script 里写 $OTOMADS_DATA_DIR/tools，由下面的展开处理。
// 空串也算没设：调用方（pnpm / CI）常常导出空值占位，`??=` 会把空串当成有效值。
env.OTOMADS_DATA_DIR = (env.OTOMADS_DATA_DIR ?? "").trim() || path.join(ROOT, "data", "otomads");
env.CUSTOM_DATA_DIR = (env.CUSTOM_DATA_DIR ?? "").trim() || path.join(ROOT, "data", "custom");
// uv 的仓库内兜底：scripts/ensure-uv.mjs 在 postinstall 里把它装到 .tools/（§7.1）
env.PATH = path.join(ROOT, ".tools") + path.delimiter + env.PATH;

// 参数里的 `$VAR` / `${VAR}` 由**我们自己**展开，不留给 shell ——
// POSIX 认 `$VAR`、`cmd.exe` 认 `%VAR%`，交给 shell 就等于又把脚本绑回某个平台。
const expand = (s) => s.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (m, name) => env[name] ?? m);

const [file, ...args] = argv.map(expand);
if (!file) {
  console.error("用法：node scripts/run.mjs <命令> [参数…]");
  process.exit(2);
}

// 过不过 shell 按平台分，**不是**为了图省事：
//   - POSIX：不过 shell。参数原样传给 execve，含空格的参数也精确保留。
//   - Windows：要过 shell，因为 `vitest` / `playwright` / `uv` 都是 `.cmd` 垫片，
//     不过 shell 找不到可执行文件。
// （曾经写成两平台都过 shell 并把 argv 拼成一个字符串 —— 那会**吃掉带空格的参数**。）
const r = spawnSync(file, args, {
  stdio: "inherit",
  env,
  cwd: ROOT,
  shell: process.platform === "win32",
});
if (r.error) {
  console.error(`启动失败：${r.error.message}`);
  process.exit(1);
}
process.exit(r.status ?? 1);
