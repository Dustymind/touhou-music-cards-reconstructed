# 单端口部署（方案 B）

应用、本地曲库（音MAD）、联机信令都在**一个端口**上，用反向代理分流：

| 路径 | 去处 | 说明 |
|---|---|---|
| `/manifest.json`、`/media/*` | `127.0.0.1:8011` | 本地曲库助手；manifest 里的音频地址按 `X-Forwarded-Proto`/`Host` 现拼，https 站点也不会混合内容拦截 |
| `/peerjs`、`/peerjs/*` | `127.0.0.1:9100` | 自建 PeerJS 信令（可选；只用公网 PeerJS 时删掉这段） |
| 其余 | `dist/` | 应用静态产物 + SPA 回退 |

## 跑起来

```bash
pnpm build                                            # 1) 应用产物
cd tools && uv run python -m tmc.local_source          # 2) 曲库助手（8011）
pnpm e2e:peer                                          # 3) 信令（9100，可选）
caddy run --config deploy/Caddyfile                    # 4) 一个端口对外（默认 :8080）

# 没装 Caddy 时的等价代理（默认也是 0.0.0.0:8080；PORT/HOST 可改）
node deploy/single-port-proxy.mjs
PORT=9000 node deploy/single-port-proxy.mjs
HOST=127.0.0.1 node deploy/single-port-proxy.mjs       # 只给本机用
APP=static node deploy/single-port-proxy.mjs           # 直接服务 dist/，不依赖 dev server
```

打开 `http://<主机>:8080/`，设置页 → 音乐源 → 音乐模式切到**音MAD** 即可。

### 监听地址（踩过的坑）

**只绑 `127.0.0.1` 的端口，从外部浏览器是访问不到的**——容器/沙箱里尤其明显：应用 dev（5173）、
曲库助手（8011）默认都只绑回环，所以"把 8090 透出去"不成立。正确做法是**只把代理绑到 `0.0.0.0`**，
应用与助手继续留在回环后面（少暴露两个端口）：

```bash
node deploy/single-port-proxy.mjs        # 默认 0.0.0.0:8080
```

然后用本机的可路由地址访问，例如 `http://10.21.218.160:8080/?locale=zh`（`hostname -I` 看本机地址）。
**端口冲突或环境不让你用 8080** 时直接换：`PORT=9000 node deploy/single-port-proxy.mjs`。
（Caddy 那边同理：`PORT=9000 caddy run --config deploy/Caddyfile`。）

## 热更新（HMR）与 WebSocket

经代理打开的页面，HMR 的 WebSocket 会连到**页面自己的 origin**（即代理端口）。`single-port-proxy.mjs`
已经把 `upgrade` 请求按同一套分流规则转发（`/peerjs*` → 9100，其余 → 应用），所以经 8080 打开的页面
同样能热更新；Caddy 的 `reverse_proxy` 本身就会透传升级。实测：直连 5173 与经 8080 的页面都会建立
`ws://<页面 origin>/?token=…` 连接。

## 为什么本地源默认是相对路径

`data/sources/sources.toml` 里 `local` 源的 `table_url = "/manifest.json"` —— **同源**，所以：

- 不需要 CORS（助手发的 `Access-Control-Allow-Origin: *` 只是给跨源场景留的）；
- 代理换域名/端口/协议都不用改数据，也不用重新生成 manifest（地址按请求现拼）。

## 本机分开跑（不是单端口）怎么办

应用在 5173、助手在 8011 时，同源的 `/manifest.json` 会打到应用服务器上 ✗。两种办法：

- 打开 `http://127.0.0.1:5173/?localmusic=127.0.0.1:8011`（URL 参数，**优先于**存档）；
- 或在设置页 → 音乐源 → **本地曲库地址** 填 `127.0.0.1:8011` 再点「应用」（会落盘）。

两种写法都接受：完整 manifest 地址、基地址（自动补 `/manifest.json`）、省略协议的 `host:port`（自动补 `http://`）。

## https 与"连接不完全安全"

浏览器报**"连接不完全安全"就是混合内容**：https 页面上混进了 `http://` 子请求。这个项目里只会来自两处：

| 来源 | 说明 |
|---|---|
| **本地曲库的音频地址** | manifest 里的音频地址由助手按**请求头**现拼。所以最外层那层 https 隧道/反代**必须转发 `X-Forwarded-Proto: https`**（Cloudflare Tunnel、ngrok、Caddy 都会自动带；Caddyfile 里也显式写了 `header_up X-Forwarded-Proto {scheme}`）。`deploy/single-port-proxy.mjs` 会把上游传来的值**原样传下去**；上层完全不转发时用 `PROTO=https node deploy/single-port-proxy.mjs` 或助手的 `--public-base https://<域名>/` 显式指定。 |
| **联机信令** | `?peersecure=` 省略时**跟着页面协议走**（https 页面用 `wss://`），不会再被当混合内容拦掉；要强制可用 `peersecure=0/1`。 |

数据侧已经确认**没有任何 `http://` 资源**（三份镜像表、卡面 origins 全是 https），所以不用改数据。

**自查方法**：浏览器 DevTools → Console 会直接点名被拦的 `http://…` 请求；或 Network 面板按协议筛。
另外 https 页面上**不要**在设置页把「本地曲库地址」填成 `http://127.0.0.1:8011` —— 同源部署时留空即可。

## 联机注意

信令只是"牵线"，真正的音视频/数据走 **WebRTC P2P（UDP）**，不在这一个端口里；
跨 NAT 稳定连通还需要 **STUN/TURN**（TURN 常见 3478/5349/443）。页面参数：

```
?peerhost=<域名>&peerport=<端口>&peerpath=/peerjs&peersecure=1
```

`peersecure` 可以省略 —— **省略时跟页面协议走**（https → `wss://`，http → `ws://`）；要显式指定才写 `peersecure=1` / `peersecure=0`。
