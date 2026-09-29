#!/usr/bin/env node
/**
 * 让两个数据仓库**各自**生成自己的数据集（REFACTOR-PLAN v2 §7.2；§11.4 起它们不再是 submodule）。
 *
 * 每个模式按优先级取：
 *   ① `<MODE>_DATA_DIR`（默认 `data/<mode>`）里是一份 clone（有 `tools/`）⇒ 调它自己的
 *      `python -m <pkg>.dataset` 现生成到 `<data_dir>/dataset/`；
 *   ② `<MODE>_DATASET_URL`（Release 快照的**逐文件**下载前缀，见数据仓库的 CI）⇒ 下载那几件；
 *   ③ 都没有 ⇒ 什么都不做：`tmc.build` 写空兜底并提示，运行时回退远程清单（§7.2 ③）。
 *
 * 最新就不用重跑：`dataset/.built` 比数据仓库的真源（packs/**、sources/**、loudness/**、
 * tools/src/**）新就跳过 —— dev 反复启动不该反复跑 Python。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARKER = ".built";

const MODES = [
  { mode: "otomads", pkg: "otomads", dirEnv: "OTOMADS_DATA_DIR", urlEnv: "OTOMADS_DATASET_URL" },
  { mode: "custom", pkg: "custom", dirEnv: "CUSTOM_DATA_DIR", urlEnv: "CUSTOM_DATASET_URL" },
];

/** 快照的逐文件清单：远端资产名 → 数据集目录里的相对路径。 */
const SNAPSHOT_FILES = [
  ["characters.json", "characters.json"],
  ["albums.json", "albums.json"],
  ["tracks.json", "tracks.json"],
  ["pack-audio.json", "pack-audio.json"],   // 可选（自定义模式那份没有）
  ["sources.json", "sources.json"],
  ["index.json", "index.json"],
];

function dataDir(mode, dirEnv) {
  const value = (process.env[dirEnv] ?? "").trim();
  return value ? path.resolve(value) : path.join(ROOT, "data", mode);
}

/** 目录树里最新的 mtime（毫秒）。 */
function newestMtime(target) {
  if (!existsSync(target)) return 0;
  const stat = statSync(target);
  if (!stat.isDirectory()) return stat.mtimeMs;
  return Math.max(stat.mtimeMs, ...readdirSync(target).map((name) => newestMtime(path.join(target, name))));
}

/** 数据仓库的真源（决定数据集要不要重跑）。 */
function inputsMtime(dir) {
  return Math.max(
    newestMtime(path.join(dir, "packs")),
    newestMtime(path.join(dir, "sources")),
    newestMtime(path.join(dir, "loudness")),
    newestMtime(path.join(dir, "tools", "src")),
  );
}

function buildFromClone(mode, pkg, dir, datasetDir) {
  mkdirSync(datasetDir, { recursive: true });
  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts", "run.mjs"), "uv", "run", "--project", path.join(dir, "tools"),
     "python", "-m", pkg + ".dataset", "--out", datasetDir],
    { stdio: "inherit", cwd: ROOT },
  );
  if (result.status !== 0) {
    console.error("[ WARN ] " + mode + " 数据集生成失败（exit " + (result.status ?? "?") + "）");
    return false;
  }
  return true;
}

async function downloadSnapshot(mode, base, datasetDir) {
  mkdirSync(datasetDir, { recursive: true });
  const prefix = base.endsWith("/") ? base : base + "/";
  const wanted = [...SNAPSHOT_FILES, ["loudness-" + mode + ".json", "loudness/" + mode + ".json"]];
  for (const [asset, rel] of wanted) {
    let response;
    try {
      response = await fetch(prefix + asset, { redirect: "follow" });
    } catch (error) {
      console.error("[ WARN ] " + mode + " 快照下载失败：" + asset + " —— " + String(error));
      return false;
    }
    if (!response.ok) {
      // 可选件：响度表（有的模式没有）与 pack-audio.json（只有音MAD 有音频口径）
      if (asset.startsWith("loudness-") || asset === "pack-audio.json") continue;
      console.error("[ WARN ] " + mode + " 快照缺 " + asset + "（HTTP " + response.status + "）");
      return false;
    }
    const body = Buffer.from(await response.arrayBuffer());
    const target = path.join(datasetDir, rel);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, body);
  }
  return true;
}

async function runMode({ mode, pkg, dirEnv, urlEnv }) {
  const dir = dataDir(mode, dirEnv);
  const datasetDir = path.join(dir, "dataset");
  const marker = path.join(datasetDir, MARKER);
  const url = (process.env[urlEnv] ?? "").trim();

  if (existsSync(marker) && existsSync(path.join(datasetDir, "characters.json"))
      && statSync(marker).mtimeMs >= inputsMtime(dir)) {
    console.log("[ SKIP ] " + mode + " 数据集是最新的：" + path.relative(ROOT, datasetDir));
    return;
  }
  if (existsSync(path.join(dir, "tools", "src"))) {
    console.log("[  ..  ] " + mode + " 用 " + path.relative(ROOT, dir) + " 的 dataset.py 现生成");
    if (buildFromClone(mode, pkg, dir, datasetDir)) writeFileSync(marker, new Date().toISOString() + "\n");
    return;
  }
  if (url) {
    console.log("[  ..  ] " + mode + " 从快照下载：" + url);
    if (await downloadSnapshot(mode, url, datasetDir)) writeFileSync(marker, new Date().toISOString() + "\n");
    return;
  }
  console.log("[ WARN ] " + mode + " 数据集不可得（" + dirEnv + " 没指向 clone，" + urlEnv
    + " 也没设）⇒ 该模式走空兜底，运行时回退远程清单");
}

for (const spec of MODES) await runMode(spec);
