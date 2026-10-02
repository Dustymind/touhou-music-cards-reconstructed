#!/usr/bin/env node
/**
 * 把 `deploy/headers.txt` 铺成 `dist/_headers`（Cloudflare 的逐路径响应头文件）。
 *
 * 为什么需要有这一步：响应头原先只写在 `vercel.json` 的 `headers` 里，而 Cloudflare **不读**它。
 * 又**不能**把 `_headers` 放进 `publicDir` —— 那是 `data/public/`（见 `vite.config.ts`），
 * gitignored 且由 `tmc.build` 每次重新生成 ⇒ 会被构建覆盖、也不进版本库。
 *
 * 顺序要求：`vite build` 会清空 `dist/`，所以这一步必须在它之后 ——
 * 挂在 `build` 链末尾，与 `gen-notices.mjs --dist-only` 同一个位置。
 *
 * `headers.txt` 允许 `#` 注释行与空行，守卫会跳过它们再看第一条真正的规则。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "deploy", "headers.txt");
const DIST = path.join(ROOT, "dist");
const TARGET = path.join(DIST, "_headers");

if (!existsSync(path.join(DIST, "index.html"))) {
  console.error("[FAILED] dist/index.html 不存在 —— 这一步要挂在 `vite build` 之后");
  process.exit(1);
}
if (!existsSync(SOURCE)) {
  console.error("[FAILED] 缺 " + path.relative(ROOT, SOURCE));
  process.exit(1);
}

const text = readFileSync(SOURCE, "utf-8").trimEnd() + "\n";

// 注释行（`#`）与空行不算规则 ⇒ "第一行"指第一条真正的路径模式。
// （headers.txt 开头就是一整块注释，所以不能直接对原文做 startsWith("/")。）
const body = text
  .split("\n")
  .filter((line) => {
    const t = line.trim();
    return t !== "" && !t.startsWith("#");
  });

if (body.length === 0 || !body[0].startsWith("/")) {
  console.error("[FAILED] " + path.relative(ROOT, SOURCE) + " 去掉注释后，第一条必须是 / 开头的路径模式");
  process.exit(1);
}
// 硬判据：少了这条，Workers 静态资源的默认 max-age=0 会让带指纹的 bundle 每次回源
if (!/^\/assets\/\*/m.test(text)) {
  console.error("[FAILED] " + path.relative(ROOT, SOURCE) + " 缺 `/assets/*` 的缓存规则");
  process.exit(1);
}

writeFileSync(TARGET, text);
const rules = text.split("\n").filter((line) => line.startsWith("/")).length;
console.log("[  OK  ] dist/_headers（" + rules + " 条路径规则）");
