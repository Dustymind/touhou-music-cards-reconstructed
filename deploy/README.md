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
> （`otomads-cdn`），它由**数据仓库**的 `data/otomads/.github/workflows/publish.yml` 部署
> （`wrangler deploy`）。主仓库里早先那个 `.github/workflows/deploy-otomads-cdn.yml`
> 已在 D150 并入数据仓库的 publish 流程，**本仓库现存的工作流只有 `deploy-pages.yml`**。

三家的构建命令都是 `pnpm build`（= `tsc --noEmit && vite build`，类型检查也是这一关的一部分），
构建期需要 **Python（uv）**：数据集由 `pnpm build` 现生成（Vercel 的 `installCommand` 装 uv）；submodule 仍不需要。

### 部署形态对数据的要求（D131）

`table_url` 只能是**相对路径**（`data/sources/x.json`）或 **http(s) 绝对 URL**：

* 相对路径在三种形态下都对 —— 域名根、子目录、本地直开；
* ✗ 根绝对路径（`/data/sources/x.json`）**只在域名根部署时**看着正常：子目录部署会打到
  `https://<user>.github.io/data/...` → 404 → 那一模式所有曲目都解析不出地址
  （界面显示"所有已启用的音源都取不到"）。前端 `base: "./"` 治不了这个 —— 它管不到
  `fetch()` 手里的那条字符串。
* 守在两处：`pnpm data:build` 当场报错 + `pnpm data:validate` 检查**生成物**（含数据仓库里那份音MAD 注册表）。

### 缓存

平台默认按文件类型缓存，够用。要显式控制就按平台加：响应头统一写在 `vercel.json` 的 `headers`（S3 起）；
Vercel 用 `vercel.json` 的 `headers`；GitHub Pages **不认** `_headers`（会被当普通文件发出去，无害）。
原则：带指纹的 `/assets/*` 可长缓存；`/index.html` 与 `/data/**` 要短缓存 ——
数据 JSON 里的 `contentHash` 是联机握手要比的，压住旧数据会让两端哈希不一致（协议 v4 会拒）。

### 静态托管下的音频（重要）

静态站没有代理层，音源表默认是**同源**相对路径（原曲 `data/sources/*.json`）；
**音MAD 的默认源是项目 CDN 的绝对地址**（D141）⇒ 什么素材都不用自带就能出声。**原曲**照常可播
（两份镜像表跟站点一起发出去，音频来自网易云 / THBWiki）。**音MAD** 有三条路：

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
   **Cloudflare 那边的 Worker** 自己构建（连数据仓库，见下面「素材站（默认 CDN）的部署」）—— 本仓库的 Pages 工作流仍然**不**拉素材。
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

### 素材站（默认 CDN）的部署（D150：**数据仓库的 `publish.yml` 构建并部署**）

默认音源指的 `otomads-cdn.tsukinomiyako-mangesui.top` 是 Cloudflare 上**独立于应用**的一个站点，
内容就是素材归档解出来的那一份。**当前由数据仓库的 `.github/workflows/publish.yml` 一条链跑完**
（D150，2026-09-25）：测试 → 重打归档并换 Release 资产 → `python3 tools/build_cdn_site.py` 构建站点
→ `npx wrangler deploy`（需要 secret `CLOUDFLARE_API_TOKEN`，没配就跳过部署那一步）。

> 中间退场过的东西，**别再找**：数据仓库那条 `deploy-cdn`（wrangler 直传老 Pages 项目，2026-09-25
> 随老项目退场）、主仓库的 `deploy-otomads-cdn.yml` / `trigger-cdn.yml` / `repack-media.yml`
> （均已并入上述 publish 流程），以及 CF 面板的 Git 集成（D148 短暂用过）。
> 面板那套的留档见下面「面板那套已经退役」——留它只是为了解释 `wrangler.jsonc` 的形状。

**先看清是哪一种宿主**（2026-09-25 实测踩过）：CF 面板的 "Create → Connect to Git" 现在默认给的是
**Workers Builds 项目**（一个只放静态资源的 **Worker**），不是老的 Pages 项目 —— 构建日志里会出现
`Executing user deploy command: npx wrangler deploy …`。两者要的配置不同：

| | Pages 项目 | **Workers Builds（现在这个）** |
|---|---|---|
| 资源目录 | 面板里的 "Build output directory" | 仓库里的 **`wrangler.jsonc`** → `assets.directory` |
| 部署命令 | 面板自动处理 | 面板里的 **Deploy command**，要写 `npx wrangler deploy`（**不带** `dist` 参数 —— 位置参数会被当成 Worker 脚本路径） |
| 域名 | Custom domains | Worker → Settings → **Domains & Routes** |
| 旧项目能不能改造成它 | — | **不能**：Direct Upload 的项目不能转 Git 集成（[官方文档](https://developers.cloudflare.com/pages/get-started/direct-upload/)），所以是"新建一个 + 搬域名" |

**面板那套已经退役**（D150，2026-09-25）：下面这六步是当初接 Workers Builds 时做的，现在**不需要了** ——
构建与部署搬进 GitHub Actions（数据仓库 `.github/workflows/publish.yml`），面板上那个 Workers Builds 项目**已删**（2026-09-25）。
留档是因为它解释了 `wrangler.jsonc` 的形状：

1. Workers & Pages → Create → Connect to Git → 选 `Dustymind/touhou-music-cards-otomads-data`，生产分支 `main`；
2. **Build command** = `python3 tools/build_cdn_site.py`；
3. **Deploy command** = `npx wrangler deploy`（**不带** `dist` 参数）；
4. 环境变量 `SKIP_DEPENDENCY_INSTALL=1`；
5. Worker 名 = `otomads-cdn-git`（与 `wrangler.jsonc` 的 `name` 一致）；
6. 第一次手动跑 → 用 `<worker>.<account>.workers.dev` 验证 → 再把自定义域名从老 Pages 项目搬过来。

**现在唯一要人做的一步**：CF 面板建一个 API Token（模板 **Edit Cloudflare Workers**；自定义则要
`Workers Scripts:Edit` + `Workers Routes:Edit`），然后

```bash
gh secret set CLOUDFLARE_API_TOKEN -R Dustymind/touhou-music-cards-otomads-data
```

没配这个 secret 时 `publish` 的第③段会**跳过并打一条 notice**（不算失败）。

**迁移已完成并复验**（2026-09-25，域名从老 Pages 项目搬到 Worker）：

| 项 | 结果 |
|---|---|
| `build-info.json` | **200**（老 Pages 项目没有这个路径 ⇒ 域名确实指向新 Worker）|
| manifest / 响度表 | CORS `*` + `max-age=0, must-revalidate` + **与归档逐字节相同** |
| 媒体 | `accept-ranges: bytes` + CORS + `max-age=14400, must-revalidate`；`Range` → **206**；越界 **416** |
| 根路径 | 404 |
| **真浏览器（无任何覆盖，走默认源）** | 取到表并解析出 `…/media/otomads/川先僧%20-%20普通肥猫魔法使.mp3?v=…`，**零失败请求** |

**`wrangler.jsonc` 里为什么是这几样**：`name`（对齐 Worker 名）、`compatibility_date`（wrangler 上传 Worker 的硬要求，
删了直接报错）、`assets.directory = "./dist"` + `not_found_handling = "none"`（找不到就 404，
与老站一致 —— 这个站点只放 manifest / 媒体 / 响度表，**不能**回退成 HTML），
以及 **`routes` 里的自定义域名**（D150 加的）：`wrangler deploy` 只保证"配置里声明过的"绑定，
不声明就有可能把域名摘掉 —— 而 `sources/otomads.toml` 的 `table_url` 指着它，掉了等于素材站下线。

**构建里发生什么**（数据仓库 `tools/build_cdn_site.py`，纯标准库、不装依赖）：

```
取 Release（tag `media`，公开 ⇒ 无令牌）→ stage_media review（不过就不铺）→ 解到 dist/ → 打印摘要
```

`review` 是**部署守卫**：清单五键、每一行都有对应文件，并拿**仓库里的 `packs/`** 对照
（"归档少了 = 改完 packs 忘了重打包"，只警告不拦）。**这个构建脚本本身不重算 manifest** ——
它只是解包铺盘；清单是第②段（CI 重打）或本机 `pack` 写出来的，逐曲版本号是**内容**哈希（D149）。
（实测一次构建：Python 用镜像自带的、下 340 MB 约 15 秒、`review` + 解包 1 秒。
所以数据仓库根**故意不放 `.python-version`** —— 钉 `3.13` 会让 CF 现装一份 Python，白等 2 分 40 秒。）

**触发**（D150 起：一条链，全在 GitHub Actions）

```
push(main) ─▶ ① test ─▶ ② repack（变了才换 media 资产）─▶ ③ deploy（build_cdn_site.py → wrangler deploy）
```

| 更新类型 | 怎么触发 | 线上会变吗 |
|---|---|---|
| 曲目表元数据（标题/作者/附加信息/卡面**引用**、删曲目）、响度表 | 数据仓库 **push 即自动**（第②段用上一份归档的媒体重打）| **会** |
| 站点侧文件（`wrangler.jsonc`、`media-worker.mjs`、`tools/**`、工作流）| 同一条链（第③段重建并部署）| **会** |
| **新音频**（新抓/重裁）| 只能在**本机**，且**先传资产、再推源码**：`pnpm media:pack` → `gh release upload media … --clobber` → push（packs 变了才要推；没推就补 `gh workflow run publish.yml -R …`）| **会** |
| 只改文档 | push 照旧走完三段，但归档逐字节没变 ⇒ 不换资产 | 站点重建一次，内容不变 |

> **为什么不走 Cloudflare 的 Workers Builds / Deploy Hook 了**：那条路依赖 CF 侧的 Git 集成，
> 连接一失效就**零构建**，而 Deploy Hook 照样回 **2xx** ⇒ 静默失败 —— 2026-09-25 就这么停了一整天，
> 站点一直停在旧构建上，`gh run list` 全绿、面板里"根本没触发"。搬进 Actions 后失败在日志里看得见，
> 而且 `wrangler` 对静态资源按哈希**增量上传**（首次全量约几分钟，之后只传变化的那几首）。
> 前提仍是逐曲版本号用**内容**哈希（`packformat.content_revision`，D149）——
> 否则 CI 重打的清单与本机打的永远对不上、客户端每次重下 324 MB；
> `tools/tests/test_repack.py` 钉着"本机打包 == CI 重打（逐字节相同）"。

**D150 首次上线复验**（2026-09-25，run `36178163651` 手动触发；③ 三段全跑）：

| 项 | 值 |
|---|---|
| `build-info.json` | `builtAt 2026-09-25T19:12:46Z` / `commit 053f21d8fee0` / `branch main` / 归档 sha `c8a7d0795a3c9666…` |
| `manifest.json` | **87 行**（86 + 新曲目）、`revision 82d65f99b835f10f`、36 角色、声明 `loudness/otomads.json` |
| 新曲目音频 | `Range: bytes=0-99` → **206** + `content-range: bytes 0-99/4672583` + `accept-ranges: bytes` + CORS `*` |
| 响度表 / 根路径 | `200 application/json` / **404**（照旧） |

（`19:06` 那次 push 触发的 `publish` 里第③段还是 **skipped** —— 那时 `CLOUDFLARE_API_TOKEN` 刚配上，
所以首次真正上线是紧接着的手动那次。）

**push 自动路径复验**（2026-09-25，`ceaed33` 一个纯空白改动）：run `36178815196` ① ② ③ 全绿、③ 四步全部**真的执行**
（不是 skipped），线上 `builtAt` 换成 `19:19:41Z`、`commit ceaed33bb8bd`，而归档 sha 仍是 `c8a7d079…`
⇒ **内容没变、站点重建一次**（第②段正确判定"逐字节没变 ⇒ 不换资产"）。整条链约 3 分钟。

**新音频仍然得在本机打包发布**（素材不进仓库，打包要读本机文件才能算内容哈希）：

```bash
cd <主仓库> && pnpm media:pack
gh release upload media otomads-media.tar.gz --clobber -R Dustymind/touhou-music-cards-otomads-data
gh workflow run publish.yml -R Dustymind/touhou-music-cards-otomads-data   # 或者再推一次数据仓库
```

卡点是**出口 IP**，不是"有没有曲库"：2026-09-25 实测 GitHub 托管 runner 出口是数据中心
（`130.131.55.228`），`bilibili.com` 首页回 200 但 86 条 source 随便挑三条抓都吃
`HTTP Error 412: Precondition Failed`（风控），且 86 条**全是** bilibili ⇒ 没有"换源"退路；
那份 ffmpeg 也**没有 `libmp3lame`**，D142 的重编码裁切会失败。想全自动只有**自托管 runner**
（`runs-on: [self-hosted, linux]`，只挂 `push`/`workflow_dispatch`，**不要** `pull_request`）。
纯元数据改动不需要本机 —— 第②段拿上一份归档的媒体重打即可。

**回滚两条**：① CF 面板 → Worker `otomads-cdn-git` → Deployments → 选上一版 **Rollback**（秒级）；
② `git revert` 那次改动再 push（重跑一遍链），或手动 `gh workflow run publish.yml -R Dustymind/touhou-music-cards-otomads-data`。
（D147 那套 `deploy-cdn`（wrangler 直传老 Pages 项目）已随老项目退场 —— 2026-09-25 真域名复验通过后删的。）

**媒体由一个小 Worker 脚本接管**（数据仓库 `media-worker.mjs`，`wrangler.jsonc` 里
`main` + `assets.binding` + `run_worker_first = ["/media/*"]`）：

- 静态资源那条路**不认 `Range`**（实测三种写法都回 200 + 整份，老 Pages 项目给的是 206）⇒ 脚本自己切片：
  `bytes=a-b` / `bytes=a-` / `bytes=-n` 回 206 + `content-range`，越界/乱写回 416，`HEAD` 只回头；
- 脚本生成的响应**不吃 `_headers`**（CF 文档明说）⇒ CORS、`accept-ranges`、媒体缓存头都在脚本里设；
- **只匹配 `/media/*`**：清单、响度表、404 仍走静态资源那条路（免费、走边缘、`_headers` 照旧生效）；
- 代价：命中 `/media/*` 的请求从"静态资源（免费无限）"变成"Worker 请求"（免费额度 10 万/天，
  超了会回 429 —— 191 首的站够用）；
- **本地可验**（CF 上跑不了的东西在本地钉死）：
  `node --test tools/tests/media_worker.test.mjs` 测 `Range` 解析；
  `wrangler dev --config <数据仓库>/wrangler.jsonc` + `curl -H 'Range: bytes=0-99'` 测整条路
  （2026-09-25 实测：206 + 切片逐字节相同；**注意本地那条路给的是流式响应、没有 `Content-Length`** ——
  脚本因此会在必要时把正文读进来量长度，别改回去）。

**为什么构建还要写一个 `_headers`**（`tools/build_cdn_site.py` 生成，2026-09-25 实测）：

| 头 | 老 Pages 项目 | Workers 静态资源（默认） | 所以 |
|---|---|---|---|
| `Access-Control-Allow-Origin: *` | 自带 | **没有** | **必须写**：应用在别的源上 `fetch()` 读 manifest，少了它会被浏览器挡掉（"源状态一直 error、曲目表永远走兜底"）。媒体播放不受影响（`<audio>` 没设 `crossOrigin`、且 `preload="auto"`） |
| 清单/响度表 `max-age=0, must-revalidate` | 有 | 默认就是这个 | 显式写出来，不再依赖默认值 |
| 媒体 `max-age=14400` | 有（zone 规则） | 默认 `max-age=0` | 显式写出来恢复老行为（`?v=` 已经保证换版本必换 URL） |
| `Range` → **206** | 支持 | **不支持**（实测：三种 `Range` 都返回 200 + 整份） | 只影响"跳到随机起播位"要多下一些字节；`preload="auto"` 本来就会下整首 ⇒ 接受，要恢复就得写 Worker 脚本（见下） |

**排查**

- 构建失败（`review` 不通过）⇒ 日志里会原样打出问题，**线上保持原样**（这次没部署）；
- `[ERROR] A compatibility_date is required` ⇒ `wrangler.jsonc` 缺 `compatibility_date`（或 deploy 命令没走到配置）；
- `[WARNING] Failed to match Worker name … expected "otomads-cdn-git"` ⇒ `wrangler.jsonc` 的 `name` 与面板不一致；
- 线上清单没变 ⇒ 多半是"只换了音频、没触发构建"，而不是缓存（manifest 是 `max-age=0, must-revalidate`）；
- 线上 manifest 取不到 / 源状态一直 error ⇒ 先看 `_headers` 有没有跟着部署上去（`curl -D - -o /dev/null <站点>/manifest.json | grep -i access-control`）；
- **想让媒体重新支持 `Range`（206）**：Workers 静态资源不认 Range（实测）。要恢复就得加一个**很小的 Worker 脚本**
  （`main` + `assets.binding = ASSETS` + `run_worker_first = ["/media/*"]`，在脚本里按下 `Range` 头切片返回 206）——
  代价是媒体请求改走 Worker（免费额度 100k/天，够用），收益只是"随机起播省点字节"。**默认不做**，
  因为 `<audio>` 的 `preload="auto"` 本来就会把整首拉下来。

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
pnpm local                                            # 2) 曲库助手（8011；助手在数据仓库的 otomads.local_source）
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

数据侧已经确认**没有任何 `http://` 资源**（两份镜像表、卡面 origins 全是 https），所以不用改数据。

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
