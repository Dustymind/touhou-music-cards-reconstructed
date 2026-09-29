#!/usr/bin/env node
/**
 * 在某个数据仓库的 uv 工程里跑一条命令（REFACTOR-PLAN v2 §7.2/§11.4）。
 *
 * 位置 = env `OTOMADS_DATA_DIR` / `CUSTOM_DATA_DIR`，默认 `data/<mode>`（与 scripts/run.mjs 同口径）。
 *
 * **为什么要有这层包装**：npm script 里写 `--project $OTOMADS_DATA_DIR/tools` 是不行的 ——
 * 脚本先过 shell，POSIX 下没设过那个变量就是空串 ⇒ 变成 `/tools`（run.mjs 的 `$VAR` 展开根本
 * 拿不到）。这个包装让 package.json 里**一个 `$` 都不出现**。
 *
 * 用法：
 *   node scripts/data-tool.mjs otomads -m otomads.local_source --config local-source.toml
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODES = { otomads: "OTOMADS_DATA_DIR", custom: "CUSTOM_DATA_DIR" };

const [mode, ...args] = process.argv.slice(2);
const envName = MODES[mode];
if (!envName || args.length === 0) {
  console.error("用法：node scripts/data-tool.mjs <otomads|custom> <python 参数…>");
  process.exit(2);
}
const dir = (process.env[envName] ?? "").trim() || path.join(ROOT, "data", mode);
const result = spawnSync(
  process.execPath,
  [path.join(ROOT, "scripts", "run.mjs"), "uv", "run", "--project", path.join(dir, "tools"), "python", ...args],
  { stdio: "inherit", cwd: ROOT },
);
if (result.error) {
  console.error("启动失败：" + result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
