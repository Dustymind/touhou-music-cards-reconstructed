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

## 为什么本地源默认是相对路径

`data/sources/sources.toml` 里 `local` 源的 `table_url = "/manifest.json"` —— **同源**，所以：

- 不需要 CORS（助手发的 `Access-Control-Allow-Origin: *` 只是给跨源场景留的）；
- 代理换域名/端口/协议都不用改数据，也不用重新生成 manifest（地址按请求现拼）。

## 本机分开跑（不是单端口）怎么办

应用在 5173、助手在 8011 时，同源的 `/manifest.json` 会打到应用服务器上 ✗。两种办法：

- 打开 `http://127.0.0.1:5173/?localmusic=127.0.0.1:8011`（URL 参数，**优先于**存档）；
- 或在设置页 → 音乐源 → **本地曲库地址** 填 `127.0.0.1:8011` 再点「应用」（会落盘）。

两种写法都接受：完整 manifest 地址、基地址（自动补 `/manifest.json`）、省略协议的 `host:port`（自动补 `http://`）。

## 联机注意

信令只是"牵线"，真正的音视频/数据走 **WebRTC P2P（UDP）**，不在这一个端口里；
跨 NAT 稳定连通还需要 **STUN/TURN**（TURN 常见 3478/5349/443）。页面参数：

```
?peerhost=<域名>&peerport=<端口>&peerpath=/peerjs&peersecure=1
```

`peersecure=1` 对应 https 站点（走 `wss://`）；http 站点用 `peersecure=0`。
