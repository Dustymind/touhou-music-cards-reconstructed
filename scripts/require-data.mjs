#!/usr/bin/env node
/**
 * 关卡：某个数据仓库**在场**才继续（REFACTOR-PLAN v2 §11.4：它们不再是 submodule）。
 *
 * 用法：`node scripts/require-data.mjs otomads`（放在 npm script 的前半段）。
 * 位置 = env `OTOMADS_DATA_DIR` / `CUSTOM_DATA_DIR`，默认 `data/<mode>`；
 * 不在了就给一条能照做的提示（clone 到默认位置，或设 env）。
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODES = {
  otomads: { env: "OTOMADS_DATA_DIR", repo: "touhou-music-cards-otomads-data" },
  custom: { env: "CUSTOM_DATA_DIR", repo: "touhou-music-cards-custom-data" },
};

const mode = process.argv[2];
const spec = MODES[mode];
if (!spec) {
  console.error("用法：node scripts/require-data.mjs <otomads|custom>");
  process.exit(2);
}
const value = (process.env[spec.env] ?? "").trim();
const dir = value ? path.resolve(value) : path.join(ROOT, "data", mode);
if (!existsSync(path.join(dir, "tools"))) {
  console.error(
    "[x] " + mode + " 数据仓库不在场：" + dir + "\n"
    + "    clone 到那里：git clone https://github.com/Dustymind/" + spec.repo + ".git " + path.relative(ROOT, dir) + "\n"
    + "    或者把 " + spec.env + " 指向已有的克隆（如工作区根的 " + spec.repo + "/）");
  process.exit(1);
}
