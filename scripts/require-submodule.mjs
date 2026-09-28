#!/usr/bin/env node
/**
 * 数据 submodule 没初始化就报错退出。
 *
 * 原来内联在脚本里，是 POSIX 写法：
 *
 *     [ -d data/otomads/tools ] || { echo "…"; exit 1; }
 *
 * `cmd.exe` 不认（`[` 不是命令、`|| { …; }` 也不是它的语法）。这里换成 Node，
 * 路径仍从**本文件自身位置**推导，无硬编码。
 *
 * 用法：`node scripts/require-submodule.mjs [相对路径=data/otomads]`
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = process.argv[2] ?? "data/otomads";

// submodule 初始化与否的判据：它下面那个 `tools/` 在不在（与原来的 `[ -d …/tools ]` 同一判据）
if (!existsSync(path.join(ROOT, rel, "tools"))) {
  console.error(`音MAD 数据 submodule 未初始化：git submodule update --init ${rel}`);
  process.exit(1);
}
