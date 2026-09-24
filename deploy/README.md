# 部署

两种形态，任选：

| 形态 | 用什么 | 什么时候用 |
|---|---|---|
| **纯静态托管**（§A） | GitHub Pages / Cloudflare Pages / Vercel / 任意静态服务器 | 只想把网页放出去；音源由访客自己在本机跑助手 |
| **单端口透传**（§B） | Caddy / `deploy/single-port-proxy.mjs` | 自用或小圈子：应用 + 本机曲库 + 联机信令一个端口出去 |

## A. 纯静态托管（无后端）

应用是**纯前端**：`dist/` 里只有 JS/CSS + JSON + 字体（约 1.4 MB），音频与卡面都不在里面
（卡面走远程 origin，音频走音源表 → 用户本机的助手）。三家平台的开箱配置都在仓库里：

| 平台 | 地址形态 | 配置文件 | 备注 |
|---|---|---|---|
| **GitHub Pages** | `https://<user>.github.io/<repo>/`（**子目录**） | `.github/workflows/deploy-pages.yml` | 一次性设置：Settings → Pages → Source 选 **GitHub Actions**；`base: "./"` 不用改 |
| **Cloudflare Pages** | `https://<project>.pages.dev/` | 无（面板填构建配置） | 构建命令 `pnpm build`、输出目录 `dist`、Node 24、包管理器 pnpm 12；响应头见 `public/_headers` |
| **Vercel** | `https://<project>.vercel.app/` | `vercel.json` | 框架选 Other（配置里 `framework: null`）；构建/安装命令都写死在配置里 |

三家的构建命令都是 `pnpm build`（= `tsc --noEmit && vite build`，类型检查也是这一关的一部分），
**不需要 Python / uv / submodule**：`public/data/**` 的 13 个生成物随仓库提交。

### 部署形态对数据的要求（D131）

`table_url` 只能是**相对路径**（`data/sources/x.json`）或 **http(s) 绝对 URL**：

* 相对路径在三种形态下都对 —— 域名根、子目录、本地直开；
* ✗ 根绝对路径（`/data/sources/x.json`）**只在域名根部署时**看着正常：子目录部署会打到
  `https://<user>.github.io/data/...` → 404 → 那一模式所有曲目都解析不出地址
  （界面显示"所有已启用的音源都取不到"）。前端 `base: "./"` 治不了这个 —— 它管不到
  `fetch()` 手里的那条字符串。
* 守在两处：`pnpm data:build` 当场报错 + `pnpm data:validate` 检查**生成物**（含数据仓库里那份音MAD 注册表）。

### 缓存

平台默认按文件类型缓存，够用。要显式控制就按平台加：CF Pages 用 `public/_headers`（已在仓库里）；
Vercel 用 `vercel.json` 的 `headers`；GitHub Pages **不认** `_headers`（会被当普通文件发出去，无害）。
原则：带指纹的 `/assets/*` 可长缓存；`/index.html` 与 `/data/**` 要短缓存 ——
数据 JSON 里的 `contentHash` 是联机握手要比的，压住旧数据会让两端哈希不一致（协议 v4 会拒）。

### 静态托管下的音频（重要）

静态站没有代理层，音源表默认是**同源**相对路径（原曲 `data/sources/*.json`、音MAD `manifest.json`）。
**原曲**照常可播（三份镜像表跟站点一起发出去，音频来自网易云 / R2 / THBWiki）。**音MAD** 有两条路：

1. **站点自带素材**（推荐，D138）：把音MAD 的音频与卡面铺进 `dist/`，访客什么都不用做 ——

   ```bash
   pnpm build && pnpm media:stage     # 本机素材直接铺
   OTOMADS_MEDIA_URL=<归档 URL> pnpm media:pull   # 或构建时从归档拉
   ```

   铺完站点上就有同源的 `manifest.json` + `media/otomads/*.mp3`（+ `cards-otomads/*`）。
   **素材不进仓库**：归档由 `pnpm media:pack` 生成（可复现）并发布成 Release 资产，**由人手动铺** ——
   本仓库的 Pages 工作流**不**拉素材（用户裁定，D138）；而且主仓库是**私有**的，匿名取 Release 资产会 404，
   要取就带令牌：`gh release download th09.5-260925 --pattern otomads-media.tar.gz`（或本机 `pnpm media:pack`）。
   注意顺序永远是**先 `pnpm build` 再铺素材** —— 重新构建会清空 `dist/`。
   **验证要用真静态服务器**：`pnpm preview` 会继承 dev 的代理（`/manifest.json` 与 `/media` → 8011 助手），
   助手没跑时那两条是 **500**；用 `python3 -m http.server --directory dist` 才验得到静态素材
   （实测：manifest 200 + 音频 200，且请求都落在同源 `/media/otomads/…`）。
2. **访客自己在本机跑助手**：设置页（音乐源 → 本地曲库地址）或 `?localmusic=127.0.0.1:8011` 填地址。
   **https 页面也能读 http 回环**（实测 chromium + firefox 都放行：manifest 200、音频 206）——
   回环地址被浏览器当可信来源，不算混合内容。填 `http://<私有 IP>:8011` 就**会被拦**（只有 loopback 豁免），
   那种情况要给助手套一层 TLS 反代并转发 `X-Forwarded-Proto`。

## B. 单端口部署（方案 B）

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

`data/otomads/sources/otomads.toml` 里 `local` 源的 `table_url = "manifest.json"`（**不带前导 `/`**）——
相对**数据集目录**解析，所以：

- 域名根部署时它就是同源的 `/manifest.json`，**不需要 CORS**（助手发的
  `Access-Control-Allow-Origin: *` 只是给跨源场景留的）；
- 代理换域名/端口/协议都不用改数据，也不用重新生成 manifest（地址按请求现拼）；
- 子目录部署时它跟着页面走（`/sub/manifest.json`），不会打到域名根上去（D131）。

**子目录部署 + 同源助手**这种组合要反代同时认两条路径（`single-port-proxy.mjs` 与 Caddyfile 目前只认根那一层）：

```
/manifest.json  → 8011
/sub/manifest.json → 8011      # 应用挂在 /sub/ 时
```

只做**纯静态**托管（应用在 Pages/Vercel、助手在本机 8011）不需要这一条 —— 那时走的是
设置页填的绝对地址（`127.0.0.1:8011`）。

## 本机分开跑（不是单端口）怎么办

应用在 5173、助手在 8011 时，同源的 `manifest.json` 会打到应用服务器上 ✗。两种办法：

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

### 哪些 `http://` 地址在 https 页面上是非法的（实测）

在**真实 https 页面**（自签证书 + chromium/firefox 两个引擎）里逐个试过：

| 页面里读的地址 | 结果 | 说明 |
|---|---|---|
| `http://127.0.0.1:8011/manifest.json` | **200 + 音频 206 ✓** | **回环地址被当可信来源**，不算混合内容 |
| `http://localhost:8011/…` | **200 + 206 ✓** | 同上 |
| `https://127.0.0.1:8444/…`（助手外套 TLS 反代） | **200 + 206 ✓** | manifest 里的音频地址跟着变 `https://`（反代转发了 `X-Forwarded-Proto`）|
| `http://192.168.x.x:8011/…`（私有 IP） | ✗ 被拦 | **只有 loopback 豁免**；要给助手套 TLS 反代 |
| `https://127.0.0.1:8011/…`（https 打到只讲 http 的助手） | ✗ `SSL_PROTOCOL_ERROR` | 助手本身不发 TLS |

所以 https 站点上：**同源部署留空**即可；**本机助手可以填 `http://127.0.0.1:8011`**（能通）；
跨机器/私有 IP 必须 https。

## 联机注意

信令只是"牵线"，真正的音视频/数据走 **WebRTC P2P（UDP）**，不在这一个端口里；
跨 NAT 稳定连通还需要 **STUN/TURN**（TURN 常见 3478/5349/443）。页面参数：

```
?peerhost=<域名>&peerport=<端口>&peerpath=/peerjs&peersecure=1
```

`peersecure` 可以省略 —— **省略时跟页面协议走**（https → `wss://`，http → `ws://`）；要显式指定才写 `peersecure=1` / `peersecure=0`。
