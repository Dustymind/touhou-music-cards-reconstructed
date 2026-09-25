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
| **Vercel**（**当前线上**） | `https://<project>.vercel.app/` | `vercel.json` | 框架选 Other（配置里 `framework: null`）；构建/安装命令都写死在配置里。push 到 `main` 由 Vercel 自己构建 |
| ~~GitHub Pages~~（**暂时停用**，D146） | `https://<user>.github.io/<repo>/`（**子目录**） | `.github/workflows/deploy-pages.yml`（**保留，但已摘掉 push 触发**） | 这个仓库的 Pages 从没启用过 ⇒ 每次 push 都在 `configure-pages` 失败（23 次全红）。要用就把工作流里 `push:` 那两行恢复 + Settings → Pages → Source 选 **GitHub Actions**；`base: "./"` 不用改 |
| **Cloudflare Pages**（可选，应用本体） | `https://<project>.pages.dev/` | 无（面板填构建配置） | 构建命令 `pnpm build`、输出目录 `dist`、Node 24、包管理器 pnpm 12；响应头见 `public/_headers` |

> 注意"Cloudflare Pages"在这个项目里有**两个不同的站点**：上面这行是**应用本体**（可选形态），
> 而默认音源用的**素材站** `otomads-cdn.tsukinomiyako-mangesui.top` 是另一个 Pages 项目
> （`otomads-cdn`），它由 `.github/workflows/deploy-otomads-cdn.yml` 部署 —— 见 §A.3。

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

静态站没有代理层，音源表默认是**同源**相对路径（原曲 `data/sources/*.json`）；
**音MAD 的默认源是项目 CDN 的绝对地址**（D141）⇒ 什么素材都不用自带就能出声。**原曲**照常可播
（三份镜像表跟站点一起发出去，音频来自网易云 / R2 / THBWiki）。**音MAD** 有三条路：

1. **默认：走 CDN**（推荐，D141）—— 打开就有声音，站点不必带那 324 MB；代价是依赖外网与 CDN 可用性。
2. **站点自带素材**（同源，不依赖外网）：把音MAD 的音频与卡面铺进 `dist/`，**并把数据里的 `table_url`
   改回相对路径 `manifest.json`**（`data/otomads/sources/otomads.toml` → `pnpm data:build`），
   否则访客仍旧走 CDN：

   ```bash
   pnpm build && pnpm media:stage     # 本机素材直接铺
   OTOMADS_MEDIA_URL=<归档 URL> pnpm media:pull   # 或构建时从归档拉
   ```

   铺完站点上就有同源的 `manifest.json` + `media/otomads/*.mp3`（+ `cards-otomads/*`）。
   **素材不进仓库**：归档由 `pnpm media:pack` 生成（可复现）并发布成 Release 资产。
   这条路上"铺"是**你自己**的事（`media:stage` 铺进你自己的 `dist/`）；**项目 CDN 那一份**由数据仓库的
   `.github/workflows/deploy-cdn.yml` 铺（D147，见 §A.3）—— 本仓库的 Pages 工作流仍然**不**拉素材。
   归档发在**数据仓库**的 Release（tag `media`，公开仓库 ⇒ 匿名可下）：
   `gh release download media --pattern otomads-media.tar.gz -R Dustymind/touhou-music-cards-otomads-data`，
   或本机 `pnpm media:pack` 现打一份。
   注意顺序永远是**先 `pnpm build` 再铺素材** —— 重新构建会清空 `dist/`。
   **验证要用真静态服务器**：`pnpm preview` 会继承 dev 的代理（`/manifest.json` 与 `/media` → 8011 助手），
   助手没跑时那两条是 **500**；用 `python3 -m http.server --directory dist` 才验得到静态素材
   （实测：manifest 200 + 音频 200，且请求都落在同源 `/media/otomads/…`）。
   想让**访客**临时切到站点自带那份而不改数据：设置页填本站地址（如 `cards.example.com`，会补
   `/manifest.json`）——注意**不能填相对路径**（`manifest.json` 会被当成 `host:port` 补成 `http://manifest.json` ✗）。
3. **访客自己在本机跑助手**：设置页（音乐源 → 本地曲库地址）或 `?localmusic=127.0.0.1:8011` 填地址。
   **https 页面也能读 http 回环**（实测 chromium + firefox 都放行：manifest 200、音频 206）——
   回环地址被浏览器当可信来源，不算混合内容。填 `http://<私有 IP>:8011` 就**会被拦**（只有 loopback 豁免），
   那种情况要给助手套一层 TLS 反代并转发 `X-Forwarded-Proto`。

### 素材站（默认 CDN）的部署（D147）

默认音源指的 `otomads-cdn.tsukinomiyako-mangesui.top` 是一个**独立的 Cloudflare Pages 项目**
（`otomads-cdn`），内容就是素材归档解出来的那一份（`manifest.json` + `media/otomads/*.mp3`
+ `loudness/otomads.json`）。**工作流住在数据仓库**：CDN 上的东西就是那边的曲包（manifest 由它的工具
生成、媒体是它 `packs/` 的成品）⇒ "谁的数据谁铺"；铺之前还能拿它的 `packs/` 当基准对一遍（别的仓库做不到）。

```bash
# ① 打包：只能在有曲库的机器上（逐曲版本号 = 本机文件的 mtime+大小，D144；曲库 377 MB 不在仓库里）
cd <主仓库> && pnpm media:pack
sha256sum otomads-media.tar.gz        # 记一下，CI 日志里会对一遍

# ② 发布归档：发到**数据仓库**的 Release（tag `media`，公开仓库 ⇒ 匿名可下）
gh release upload media otomads-media.tar.gz --clobber \
    -R Dustymind/touhou-music-cards-otomads-data

# ③ 铺到线上：数据仓库的 Actions → deploy-cdn
gh workflow run deploy-cdn.yml -R Dustymind/touhou-music-cards-otomads-data
```

工作流（数据仓库 `.github/workflows/deploy-cdn.yml`）：取归档 → **归档自检**（清单五键、每一行都有文件；
并对照本仓库 `packs/` —— 归档少了 = 改完 packs 忘了重打包，**只警告不拦**）→ 解到部署根 →
读 Pages 项目的**生产分支**（不写死 `main`：写错会静默落成 preview，表现是"CI 全绿、线上没变"）→
`npx wrangler@4 pages deploy` → **线上复核**（CDN 那份 manifest 与归档**逐字节相同**才算成功，
带 `?ci=` 绕开边缘缓存）→ 顺手把这次的 manifest + sha256 存成一个小 artifact（`otomads-cdn-deploy-<run>`，90 天）。

一次性配置（**数据仓库** Settings → Secrets and variables → Actions）：

| 名字 | 值 |
|---|---|
| secret `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → 模板 “Edit Cloudflare Workers”，或自定义 **Account → Cloudflare Pages → Edit** |
| secret `CLOUDFLARE_ACCOUNT_ID` | `5102f3861137b0abc1a12e2c793c19d2` |
| variable `CF_PAGES_PROJECT`（可选） | 默认 `otomads-cdn` |
| variable `OTOMADS_CDN_HOST`（可选） | 默认 `https://otomads-cdn.tsukinomiyako-mangesui.top` |

**为什么打包不能也交给 CI**：曲库（377 MB）不在任何仓库里（素材不进仓库，用户裁定），而 manifest 的
逐曲版本号来自本机文件的 mtime ⇒ 只有手上有曲库的机器打得出正确的清单。CI 只负责"把已发布的归档铺上去"。

**为什么归档走 Release 资产，而不是 GitHub Actions 的 artifact**（D147 讨论过）：

| | Release 资产 | Actions artifact |
|---|---|---|
| 能不能装下**本地打的**包 | ✅ `gh release upload` 随时传，从哪台机器都行 | ❌ artifact 只能由**某次 workflow run 自己**产出；CI 里没有那个 run 可挂（工作流跑的时候包早就打好了） |
| 会不会过期 | 不会（跟着 Release） | **会**：公开仓库最长 **90 天**，过期后部署源就没了 |
| 自托管的人怎么取 | 公开仓库**匿名** `curl -LO …/releases/download/media/otomads-media.tar.gz` | 永远要登录/令牌，还要先知道 run id |
| 适合装什么 | 发布的、要被消费的东西 | **这次 CI 自己产出的**东西（测试报告、构建产物、部署记录）|

所以这里的分工是：**归档 = Release 资产**（部署源 + 自托管入口），**部署记录/测试报告 = artifact**
（`deploy-cdn` 存 manifest + sha256，`tests` 存 JUnit XML，都只留 90/30 天）。

**为什么不自己写 `_headers`**：CDN 那套逐路径缓存（清单/响度表 `max-age=0, must-revalidate`、
媒体 `max-age=14400`）来自 zone 级规则 / Pages 默认，**不在部署物里**（归档里没有 `_headers`）——
CI 里加一个反而会改变现状。

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

## 音MAD 源的地址形态（D141）

`data/otomads/sources/otomads.toml` 里 `local` 源的默认 `table_url` 现在是 **CDN 的绝对地址**
（`https://otomads-cdn.tsukinomiyako-mangesui.top/manifest.json`）⇒ 静态站与单端口形态**都不必自带素材**，
反代那两条 `/manifest.json`、`/media/*`（见 B 节表格）只在**你把 `table_url` 改回相对路径**时才有用。

改回相对路径（`table_url = "manifest.json"`，**不带前导 `/`**）时它的语义是相对**应用所在那一层**：

- 域名根部署时它就是同源的 `/manifest.json`，**不需要 CORS**（助手发的
  `Access-Control-Allow-Origin: *` 只是给跨源场景留的）；
- 代理换域名/端口/协议都不用改数据，也不用重新生成 manifest（地址按请求现拼）；
- 子目录部署时它跟着页面走（`/sub/manifest.json`），不会打到域名根上去（D131）。

**子目录部署 + 同源助手**这种组合要反代同时认两条路径（`single-port-proxy.mjs` 与 Caddyfile 目前只认根那一层）：

```
/manifest.json  → 8011
/sub/manifest.json → 8011      # 应用挂在 /sub/ 时
```

只做**纯静态**托管（应用在 Pages/Vercel、素材在别处）不需要这一条 —— 默认走 CDN，或由设置页填绝对地址
（`127.0.0.1:8011` / `cards.example.com`）。

## 本机分开跑（不是单端口）怎么办

默认源是 CDN（D141），**不会自动用助手**；要用本机曲库就显式覆盖（两条等价）：

- 打开 `http://127.0.0.1:5173/?localmusic=127.0.0.1:8011`（URL 参数，**优先于**存档）；
- 或在设置页 → 音乐源 → **本地曲库地址** 填 `127.0.0.1:8011` 再点「应用」（会落盘；点旁边的「重置」回默认 = CDN）。

两种写法都接受：完整 manifest 地址、基地址（自动补 `/manifest.json`）、省略协议的 `host:port`（自动补 `http://`）。
**注意别填相对路径**（`manifest.json` 会被当成 `host:port` 补成 `http://manifest.json` ✗）。

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

所以 https 站点上：**留空 = 走 CDN**（默认，https，不涉混合内容）；**本机助手可以填
`http://127.0.0.1:8011`**（能通）；跨机器/私有 IP 必须 https。

## 联机注意

信令只是"牵线"，真正的音视频/数据走 **WebRTC P2P（UDP）**，不在这一个端口里；
跨 NAT 稳定连通还需要 **STUN/TURN**（TURN 常见 3478/5349/443）。页面参数：

```
?peerhost=<域名>&peerport=<端口>&peerpath=/peerjs&peersecure=1
```

`peersecure` 可以省略 —— **省略时跟页面协议走**（https → `wss://`，http → `ws://`）；要显式指定才写 `peersecure=1` / `peersecure=0`。
