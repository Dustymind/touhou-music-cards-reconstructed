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
 * 最新就不用重跑：`dataset/.built` 里存的是数据仓库真源（packs/**、sources/**、loudness/**、
 * tools/src/**）的**内容指纹**，一致就跳过 —— dev 反复启动不该反复跑 Python，也不该因为
 * 跑过一次测试（重写 `__pycache__`）就白重生成一遍。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
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

/** 数据仓库真源的**内容**指纹（决定数据集要不要重跑）。

为什么不是 mtime：跑一次数据仓库的 Python（测试 / 工具）就会重写 `__pycache__/*.pyc`，
把 `tools/src` 的目录 mtime 顶到最新 —— 于是每次都会"看起来变了"、白重生成一遍数据集。
内容指纹没有这个问题，顺带也挡住了"mtime 被 checkout/恢复备份改掉"的误判。
`__pycache__` 与 `.pyc` 本身不进指纹（它们不是真源）。 */
function inputsFingerprint(dir) {
  const hash = createHash("sha256");
  const walk = (abs) => {
    if (!existsSync(abs)) return;
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      for (const name of readdirSync(abs).filter((item) => item !== "__pycache__").sort()) {
        walk(path.join(abs, name));
      }
      return;
    }
    if (abs.endsWith(".pyc")) return;
    hash.update(path.relative(dir, abs));
    hash.update(readFileSync(abs));
  };
  for (const sub of ["packs", "sources", "loudness", "tools/src"]) walk(path.join(dir, sub));
  return hash.digest("hex");
}

/** 数据集是不是当前真源生成的（marker 里存的是指纹，不是时间戳）。 */
function datasetIsFresh(dir, datasetDir) {
  const marker = path.join(datasetDir, MARKER);
  if (!existsSync(marker) || !existsSync(path.join(datasetDir, "characters.json"))) return false;
  return readFileSync(marker, "utf-8").trim() === inputsFingerprint(dir);
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

/** 带超时 + 一次重试的 GET：卡住的连接不该把构建永远挂在那儿（CI 有 job 超时，本地没有）。 */
async function download(url, timeoutMs = 60_000) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      lastError = error;
      if (attempt === 1) console.error("[ WARN ] 下载失败，重试一次：" + url + " —— " + String(error));
    }
  }
  throw lastError;
}

async function downloadSnapshot(mode, base, datasetDir) {
  mkdirSync(datasetDir, { recursive: true });
  const prefix = base.endsWith("/") ? base : base + "/";
  const wanted = [...SNAPSHOT_FILES, ["loudness-" + mode + ".json", "loudness/" + mode + ".json"]];
  for (const [asset, rel] of wanted) {
    let response;
    try {
      response = await download(prefix + asset);
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

  if (datasetIsFresh(dir, datasetDir)) {
    console.log("[ SKIP ] " + mode + " 数据集是最新的：" + path.relative(ROOT, datasetDir));
    return;
  }
  if (existsSync(path.join(dir, "tools", "src"))) {
    console.log("[  ..  ] " + mode + " 用 " + path.relative(ROOT, dir) + " 的 dataset.py 现生成");
    if (buildFromClone(mode, pkg, dir, datasetDir)) writeFileSync(marker, inputsFingerprint(dir) + "\n");
    return;
  }
  if (url) {
    console.log("[  ..  ] " + mode + " 从快照下载：" + url);
    if (await downloadSnapshot(mode, url, datasetDir)) writeFileSync(marker, inputsFingerprint(dir) + "\n");
    return;
  }
  console.log("[ WARN ] " + mode + " 数据集不可得（" + dirEnv + " 没指向 clone，" + urlEnv
    + " 也没设）⇒ 该模式走空兜底，运行时回退远程清单");
}

for (const spec of MODES) await runMode(spec);
