/** 单端口反向代理（Node 版，用于本机验证 `deploy/Caddyfile` 的分流规则）。
 *
 *   node deploy/single-port-proxy.mjs            # 默认 :8090
 *   PORT=9000 node deploy/single-port-proxy.mjs
 *
 * 分流：/manifest.json + /media/* → 8011；/peerjs* → 9100；其余 → APP（默认 dev 5173；
 * `APP=static` 时改服务 `dist/` 静态产物）。
 * 与 Caddyfile 等价，只是不装 Caddy 时也能演示/自测。转发 X-Forwarded-Proto/Host，
 * 所以助手生成的音频地址会跟着对外地址走。
 */
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const PORT = Number(process.env.PORT ?? 8090);
// APP=static 时改为直接服务 dist/（等价于 Caddyfile 的 file_server）
const APP = (process.env.APP ?? "http://127.0.0.1:5173").trim();
const SERVE_STATIC = APP === "static" || APP === "";
const LOCAL = process.env.LOCAL ?? "http://127.0.0.1:8011";
const PEER = process.env.PEER ?? "http://127.0.0.1:9100";
const DIST = process.env.DIST ?? path.resolve("dist");

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".webp": "image/webp", ".ttf": "font/ttf", ".woff2": "font/woff2",
  ".mp3": "audio/mpeg", ".ico": "image/x-icon",
};

function proxy(req, res, target) {
  const url = new URL(req.url ?? "/", target);
  const headers = { ...req.headers, host: new URL(target).host, "x-forwarded-proto": "http",
    "x-forwarded-host": req.headers.host ?? "" };
  const upstream = http.request({ hostname: url.hostname, port: url.port, path: url.pathname + url.search,
    method: req.method, headers }, (up) => {
    res.writeHead(up.statusCode ?? 502, up.headers);
    up.pipe(res);
  });
  upstream.on("error", () => { res.writeHead(502).end("upstream down"); });
  req.pipe(upstream);
}

async function serveStatic(req, res) {
  const url = new URL(req.url ?? "/", "http://x");
  let file = path.join(DIST, decodeURIComponent(url.pathname));
  try {
    const info = await stat(file).catch(() => null);
    if (!info || info.isDirectory()) file = path.join(DIST, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream",
      "accept-ranges": "bytes" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}

http.createServer((req, res) => {
  const pathname = (req.url ?? "/").split("?")[0];
  if (pathname === "/manifest.json" || pathname.startsWith("/media/")) return proxy(req, res, LOCAL);
  if (pathname === "/peerjs" || pathname.startsWith("/peerjs/")) return proxy(req, res, PEER);
  if (SERVE_STATIC) return void serveStatic(req, res);
  return proxy(req, res, APP);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`[single-port] http://127.0.0.1:${PORT}  (app=${SERVE_STATIC ? DIST : APP}, local=${LOCAL}, peer=${PEER})`);
});
