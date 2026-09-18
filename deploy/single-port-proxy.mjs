/** 单端口反向代理（Node 版，用于本机验证 `deploy/Caddyfile` 的分流规则）。
 *
 *   node deploy/single-port-proxy.mjs                       # 默认 0.0.0.0:8080（与 Caddyfile 一致）
 *   PORT=9000 node deploy/single-port-proxy.mjs             # 换端口
 *   HOST=127.0.0.1 node deploy/single-port-proxy.mjs        # 只监听回环
 *   APP=static PORT=8080 node deploy/single-port-proxy.mjs  # 直接服务 dist/（不依赖 dev server）
 *   PROTO=https node deploy/single-port-proxy.mjs           # 上层代理没转发协议时手动指定
 *
 * 分流：/manifest.json + /media/* → 8011；/peerjs* → 9100；其余 → APP（默认 dev 5173；
 * `APP=static` 时改服务 `dist/` 静态产物）。
 * 与 Caddyfile 等价，只是不装 Caddy 时也能演示/自测。转发 X-Forwarded-Proto/Host，
 * 所以助手生成的音频地址会跟着对外地址走。
 */
import http from "node:http";
import net from "node:net";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

// 默认 0.0.0.0：容器/沙箱里只绑回环的话，从外部浏览器访问不到（实测踩过）
const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number(process.env.PORT ?? 8080);
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

const FORCED_PROTO = (process.env.PROTO ?? "").trim();   // 例：PROTO=https

/** WebSocket 升级（Vite 的 HMR、PeerJS 的 /peerjs 都需要）——`http.request` 不处理升级，必须单开一条。 */
function proxyUpgrade(req, socket, head, target) {
  const url = new URL(req.url ?? "/", target);
  const upstream = net.connect(Number(url.port || 80), url.hostname, () => {
    upstream.write(`${req.method} ${url.pathname}${url.search} HTTP/1.1\r\n`);
    for (const [key, value] of Object.entries(req.headers)) {
      if (key === "host") continue;
      upstream.write(`${key}: ${Array.isArray(value) ? value.join(", ") : value}\r\n`);
    }
    upstream.write(`host: ${url.host}\r\n\r\n`);
    if (head?.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
}

function proxy(req, res, target) {
  const url = new URL(req.url ?? "/", target);
  // **不要谎报协议**：https 隧道（Cloudflare Tunnel / ngrok / 自己那层反代）会带
  // X-Forwarded-Proto: https 过来，本代理必须原样传下去，否则本地助手会把音频地址
  // 拼成 http://… → 浏览器报"连接不完全安全"（混合内容）。实测踩过。
  const incomingProto = (req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim()
    || (req.socket.encrypted ? "https" : "http");
  const incomingHost = (req.headers["x-forwarded-host"] ?? "").split(",")[0].trim()
    || req.headers.host || "";
  const headers = {
    ...req.headers,
    host: new URL(target).host,
    "x-forwarded-proto": FORCED_PROTO || incomingProto,
    "x-forwarded-host": incomingHost,
  };
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

const server = http.createServer((req, res) => {
  const pathname = (req.url ?? "/").split("?")[0];
  if (pathname === "/manifest.json" || pathname.startsWith("/media/")) return proxy(req, res, LOCAL);
  if (pathname === "/peerjs" || pathname.startsWith("/peerjs/")) return proxy(req, res, PEER);
  if (SERVE_STATIC) return void serveStatic(req, res);
  return proxy(req, res, APP);
});

// 升级请求按同一套分流规则转发（否则经代理打开的页面 HMR 不工作、/peerjs 也连不上）
server.on("upgrade", (req, socket, head) => {
  const pathname = (req.url ?? "/").split("?")[0];
  const target = pathname === "/peerjs" || pathname.startsWith("/peerjs/") ? PEER
    : SERVE_STATIC ? null : APP;
  if (!target) return void socket.destroy();
  return proxyUpgrade(req, socket, head, target);
});

server.listen(PORT, HOST, () => {
  const shown = HOST === "0.0.0.0" ? "0.0.0.0（本机所有网卡）" : HOST;
  console.log(`[single-port] 监听 ${shown}:${PORT}  (app=${SERVE_STATIC ? DIST : APP}, local=${LOCAL}, peer=${PEER})`);
  console.log(`              浏览器打开 http://<本机地址>:${PORT}/?locale=zh`);
  console.log(`              只在本机用就开 http://127.0.0.1:${PORT}/?locale=zh`);
});
