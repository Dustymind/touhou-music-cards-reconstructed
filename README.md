# 东方谐频拾遗 ~ Forgotten Harmonic Frequencies in Cards and Otomads

把东方角色的卡面、音乐与对战规则做成一个能在浏览器里玩的歌牌游戏：听前奏抢先认出是哪首曲子、抢到对应角色的卡。

本仓库是**从零重建**，不搬运上游的二进制素材；代码、数据管线与部署脚本都在这里。
音乐来自公开镜像（网易云 / THBWiki），卡面来自公开图集，音MAD 曲库走本地助手；
第三个模式「**自定义**」不带任何数据 —— 卡名、卡面与曲目都来自**你自己托管的一份清单**
（契约 [`docs/custom-mode-v1.md`](docs/custom-mode-v1.md)）。

## 快速开始

```bash
fnm use 24 && pnpm install   # Node 24 + pnpm（裸 `fnm use` 在本仓库会报找不到版本文件）
pnpm dev                     # http://127.0.0.1:5173/?locale=zh
```

只玩**原曲**模式的话到这里就够了（三个镜像源都在公网）。**音MAD** 模式要另开一个终端起本地曲库助手 ——
依赖、曲库、抓取、部署、测试与排错的完整步骤见下一节。**自定义**模式不用起任何服务：
在设置页的「音乐源」里填一行清单地址（或加 `?customsource=<清单地址>`）就能用。

## 本地部署（完整指南）

### 0. 前置依赖

| 依赖 | 版本 / 装法 | 需要它的场合 |
|---|---|---|
| **Node** | 24（`fnm use 24`） | 前端全部命令 |
| **pnpm** | `corepack enable`，或 `npm i -g pnpm`（本机实测 12.4.2） | 同上 |
| **Python ≥ 3.11 + uv** | `curl -LsSf https://astral.sh/uv/install.sh \| sh` | `tools/`：数据管线、曲库助手、抓取 |
| **ffmpeg** | 系统二进制：`apt install ffmpeg` / `brew install ffmpeg` | 只用于曲包音频的**抓取与裁剪**（缺失时抓取命令启动即报错） |
| **Playwright 浏览器** | 装进仓库内 `.playwright-browsers/`（已 gitignore） | 只用于 `pnpm test` / `pnpm e2e` |
| **yt-dlp** | 不用手装：写在**数据仓库**的 `data/otomads/tools/pyproject.toml` 里，由 uv 管（主仓库 `tools/` 自 D130 起已不再依赖它） | 只用于抓取 |

仓库内已有两处约定：`.npmrc` 把 pnpm store 放进仓库（`.pnpm-store/`，HOME 只读的沙箱里也能装）；
`pnpm-workspace.yaml` 关掉严格 peer 检查（MUI 7 + React 19 有可选 peer）。

### 1. 装依赖

```bash
fnm use 24
pnpm install                                         # 前端
git submodule update --init data/otomads              # 音MAD 曲包真源（可选；不拉也能跑原曲模式）
pnpm data:sync                                        # 数据管线（建 tools/.venv）
# 只为跑测试 / e2e（浏览器落在仓库内，已 gitignore）
pnpm exec playwright install chromium firefox   # 装进仓库内 .playwright-browsers/（脚本会指过去）
```

数据集是**构建期生成**的（`data/public/data/*.json`，gitignored），`pnpm dev` 会自动懒生成（内容哈希缓存，命中即零等待）—— 起开发服务器**不需要**手动先跑数据管线；
只有改了 `data/`（真相源）才需要 `pnpm data:build` 重新生成。

### 2. 起开发服务器

```bash
pnpm dev            # http://127.0.0.1:5173/ ；中文界面加 ?locale=zh
```

Playwright 跑 e2e 时会自己起一个（5190 端口）与联机信令（9100），不用手动开。

### 3. 本地曲库与助手（音MAD 模式，可选）

音MAD 侧的音乐由数据仓库的 `otomads.local_source` 就地提供（主仓库里用 `pnpm local` 起）：`manifest.json`（曲目表，**按请求现拼**）与
`/media/<专辑>/<曲目>.mp3`（支持 Range / CORS）。

目录布局（`<曲库>` 默认是仓库根的 `.music/`）：

```
<曲库>/<专辑>/<作者> - <标题>.mp3    ← 成品：助手扫的就是它（第一层目录名 = 专辑名）
<曲库>/.raw/<key>.<ext>              ← 抓取保留的原件：改裁剪时从它重裁
<曲库>/.state/<曲包>.json            ← 抓取/裁剪的幂等状态
<曲库>/incoming/                     ← 人工待转音频（见下）
```

点目录（`.raw` / `.state`）助手会跳过：原始件**别**放普通子目录，否则会被当成一张专辑、曲目计数跟着变多。

配置 `local-source.toml` 放**仓库根**（已 gitignore，所以要自己建）：

```toml
[server]
host = "127.0.0.1"
port = 8011
port_tries = 10          # 端口被占就往上试 10 个

[library]
root = ".music"          # 相对配置文件所在目录

[pack]
id = "otomads"
label_en = "Otomads"
label_zh = "音MAD"
```

启动：

```bash
pnpm local                                            # 起助手（工具在数据仓库 tools/，D130）
# 等价于 cd data/otomads/tools && uv run python -m otomads.local_source --config ../../../local-source.toml
# --root / --port / --host / --public-base 可覆盖配置；
# --print-url 只打印实际地址；--print-table 只打印曲目表 JSON
```

**音MAD 的默认源是项目 CDN**（`https://otomads-cdn.tsukinomiyako-mangesui.top`，写在数据里的 `table_url` 绝对地址，D141）——
开箱即用，站点不必自带那 324 MB 素材。想改用**本机曲库**（开发时的常规做法）：
开发服务器已经把 `/manifest.json` 与 `/media` 代理到 `127.0.0.1:8011`，页面加上 `?localmusic=127.0.0.1:8011` 即可
（助手回落到别的端口就改这个数），或在设置页 → 音乐源 → **本地曲库地址** 里填（会落盘；
填错了点它右边的**「重置」**即回到默认 = CDN）。

人工放音频：把 `<作者> - <标题>.wav/flac/m4a/...` 丢进 `<曲库>/incoming/`，再跑
`uv run --project data/otomads/tools python -m otomads.ingest_local_audio`（转 320k mp3 并移进 `<曲库>/otomads/`）。

### 4. 曲包音频的抓取与裁剪（可选）

音MAD 曲包的真源在主仓库外的数据 submodule（`data/otomads/packs/otomads/*.toml`，一角色一份，见 D128）。
submodule **pin 在一个 commit 上**（不是分支；tag 只是那个 commit 的名字，换成数据不必等打 tag）——
数据仓库改完先 `git -C data/otomads fetch` 再 `git -C data/otomads checkout <commit>`，然后 `pnpm data:build`：
写了 `source` 的曲目可以自动抓，并按 `start_time` / `stop_time` 裁掉前摇。裁剪走"**解码后精确切 + 重编码**"
（D142）——起点与时长**按采样点**对齐，不是就近取整到 mp3 帧边界（改之前 `-c copy` 实测偏过 90 ms，
见 `docs/packs-audio-v1.md` §5）。

**一条 `source` = 一首曲目**（D143）：指向 bilibili **多 P 视频**时**默认取 p1**；要别的 P 就把 `?p=N`
写进链接（`source = "https://www.bilibili.com/video/BV…/?p=3"`），由 yt-dlp 按参数解析。
`source` 若解析出多个条目会**直接报错**，不会随便挑一个 —— 详见 `docs/packs-audio-v1.md` §14。

```bash
pnpm audio:fetch                                    # 抓全部缺的 / 重裁（幂等：已就绪的会 skip）
pnpm audio:fetch --jobs 8                            # 并发数（默认 4；1 = 串行）
pnpm audio:fetch --track 岁月 --dry-run              # 只看计划：标题或作者含该子串的曲目
```

**并发（D132）**：默认 **4 路并发**。抓取的瓶颈**全在网络**（bilibili 的 playurl 往返 + 音频本体），
本地那点活可以忽略：实测 `import yt_dlp` + `YoutubeDL()` ≈ 0.13 秒/首、4 分钟 m4a 全量重编码 ≈ 1.0 秒/首、
**裁剪**（D142：解码后精确切 + V0 重编码）≈ 0.4–0.6 秒/首且只有带区间的 **36** 首付 ——
**191** 首的**本地**开销合计约 30 秒。所以并发重叠的是**网络等待**，
收益由带宽与站点风控决定：`--jobs` 给太大可能撞 bilibili 的 412 风控，**先用 4**，要更快再往上试。

> yt-dlp 自己的 `--concurrent-fragments` 对这个场景**无效** —— 它只并行 HLS/DASH 的**分片**流，
> 而 bilibili 的音频是**单个文件**直链，没有分片可并行；所以并发只能在应用层做。

依赖 **ffmpeg**（裁剪）+ **yt-dlp**（抓取，uv 管）。跑之前会检查 yt-dlp 更新：有新版本就自动升级并继续，
**升级失败即中止**（离线环境加 `--skip-update` 跳过检查）。能否抓到**取决于运行时的网络环境**
（站点地区限制、是否需要登录、站点改版）。原件留在 `<曲库>/.raw/`、状态在 `<曲库>/.state/`，
成品是 `<曲库>/<专辑>/<作者> - <标题>.mp3` —— 语义与流程见 [`docs/packs-audio-v1.md`](docs/packs-audio-v1.md)。

**强制 / 覆盖重拉**：默认只在"状态、原件、成品 hash 三者都对得上"时跳过，所以下面这些场景各有对应做法：

| 想要什么 | 命令 | 说明 |
|---|---|---|
| 覆盖重拉**全部**（重下 + 重裁） | `pnpm audio:fetch --force` | 忽略状态：原件与成品都重新产出（不含 `--track` 时就是整包覆盖） |
| 只覆盖重拉**一部分** | `pnpm audio:fetch --track 岁月 --force` | `--track` 按**标题或作者**的子串筛；先加 `--dry-run` 看命中哪些 |
| 只在**改裁剪**后重裁（不重下） | 改 `start_time` / `stop_time` 后直接 `pnpm audio:fetch` | 原件是按 `source` 存 `.raw/` 的：原件在且来源没变就**复用原件重裁**，不联网 ✓ |
| **连原件一起丢掉**重来 | `rm -rf <曲库>/.raw <曲库>/.state && pnpm audio:fetch` | 原件没了就得重新下载（适合怀疑原件本身坏了/被裁过） |
| 换掉了 `source`（换源） | 改数据后直接 `pnpm audio:fetch` | 工具检测到来源变了会**自动重下**，不用手动 `--force` |
| 只想确认要做什么 | 任意命令加 `--dry-run` | 打印"下载 / 下载 + 裁剪 / 裁剪（原件已在） / 落成品（原件已在）"而不落地 |

汇总行里的状态：`skip` = 已是目标状态（没动）、`fetched` = 新下载（整首）、`trimmed` = 用原件裁出来、
`linked` = 同来源同区间的第二条复用了硬链接、`missing` = 没有 `source` 且库里也没有（要手工放或补 `source`）、
`failed` = 这一条失败（其余照抓）。

> ⚠️ `--dry-run` 的预览**不体现 `--force`**（它只看原件在不在）：`--force --dry-run` 仍会打印"原件已在"，
> 但真正跑起来是**重下重裁**。想看"哪些命中"，用 `--track <子串> --dry-run` 筛就够了。

`--force` 会重下全部命中项，跑完还会**重量一遍响度表**（数据仓库的 `loudness/otomads.json`，在那边提交；
主仓库 `pnpm data:build` 会把它拷成 `data/public/data/otomads/loudness/otomads.json`）。
**源部署时它还会跟着归档走**：`pnpm media:pack` 把表打进归档并在 manifest 里声明 `loudness`，
前端优先取源侧那份（D139）。

### 5. 构建与部署

```bash
pnpm build      # = tsc --noEmit && vite build → dist/
pnpm preview    # 本地预览 dist/
```

- **纯静态托管**：把 `dist/` 交给任意静态服务器即可（`base` 是 `./`，子目录部署也能直接跑）。
  音MAD 素材**默认从项目 CDN 取**（D141）⇒ 什么都不用做；要**站点自带素材**（同源、不依赖外网）就照
  「音MAD 素材」把素材铺进 `dist/`，并把数据里的 `table_url` 改回相对路径 `manifest.json` 再 `pnpm data:build`
  （也可以让访客在设置页「本地曲库地址」里填本站地址，例如 `cards.example.com` —— 会自动补 `/manifest.json`）。
  三家的开箱配置都在仓库里：GitHub Pages（`.github/workflows/deploy-pages.yml`）、
  Cloudflare Pages（设置见 `deploy/README.md`）、Vercel（`vercel.json`，响应头 S3 起统一放在它的 `headers` 里）。
- **单端口透传**（应用 + 曲库 + 信令同端口）：见下面小节。
- **联机**：信令默认走本机 PeerJS（`*:9100`）；音视频是 WebRTC P2P（UDP），跨 NAT 需要 STUN/TURN。
  页面参数 `?peerhost=<域名>&peerport=<端口>&peerpath=/peerjs&peersecure=`（`peersecure` 省略时跟页面协议走）。

#### 静态托管的三种形态（都实测过）

| 形态 | 地址 | 要做什么 |
|---|---|---|
| 域名根 | `https://cards.example.com/` | 什么都不用改：`base: "./"` + 源表相对路径 |
| **子目录**（GitHub Pages 项目页） | `https://user.github.io/<repo>/` | 同上，**不需要**设 `base` |
| 本地直开 | `python3 -m http.server` / `pnpm preview` | 同上 |

**源表地址必须是相对路径**（`data/sources/x.json`，不带前导 `/`）：带前导 `/` 会打到**域名根**，
子目录部署时那两份镜像表全 404 → 原曲一首都放不出来。这条由 `tmc.build` / `tmc.validate` 守（D131），
改注册表时不用记，写错就 build 不过。

#### 音MAD 素材（可选，D138）

音MAD 的音频（191 首 / 约 722 MiB）与音MAD 卡面**不进仓库**。想让它们跟着站点走：

```bash
pnpm build                                    # 先构建（vite 会清空 dist）
pnpm media:pack                               # 打归档 → otomads-media.tar.gz（已 gitignore）→ 发布成 Release 资产
pnpm media:stage                              # 从本机 .music + cards-otomads 铺进 dist
OTOMADS_MEDIA_URL=<归档 URL> pnpm media:pull  # 构建时从归档拉（CI 用的就是这条思路）
```

**部署方式：静态音MAD 源由人手动铺**（**不接 CI** —— 主仓库的 Pages 工作流保持"纯静态、不需要 Python"
的原取舍，见 D138）。拿到归档两条路：`gh release download th09.5-260925 --pattern otomads-media.tar.gz`
（**主仓库是私有的**，匿名 `curl` 那个 release 地址会 404），或本机 `pnpm media:pack` 现打一份；
把归档解到静态站根目录即可（里面就是 `manifest.json` + `media/otomads/*.mp3` + `loudness/otomads.json`）。
归档里是一份**相对地址**的 `manifest.json` + `media/otomads/*.mp3` + **本源响度表**（`loudness/otomads.json`，
manifest 用 `loudness` 键声明它 —— **表跟着源走**，D139）+ 可选 `cards-otomads/*`，
所以同一份归档在域名根与子目录下**都能用**，不必按部署形态重打；`pnpm media:pack` 是**可复现**的
（同一份曲库打两次逐字节相同）。
口径与坑（归档按不可信输入处理、`dist` 会被重建清空、素材不入库）见数据仓库 `README.ai.MD`
的「静态部署」一节与 `docs/DECISIONS.md` D138。
**预览时注意**：`pnpm preview` 会**继承 dev 的代理**（`/manifest.json` 与 `/media` 转发给 8011 助手），
所以它**不能**用来验静态素材 —— 请用 `python3 -m http.server --directory dist` 或任意静态服务器
（实测：真静态服务器上 `/manifest.json` 200、音频 200；`pnpm preview` 在助手没跑时是 500）。

**生产构建默认不出 sourcemap**（`vite.config.ts`）：那份 `.js.map` 3.7 MB，比整个站点其余内容
（约 0.8 MB）还大四倍。要线上排查用 `pnpm exec vite build --mode development`。

#### 单端口透传（应用 + 曲库 + 信令同端口）

应用、本地曲库助手、联机信令各跑各的，对外**只暴露一个端口**，由反向代理按路径透传：

```bash
pnpm build                                                             # 1) 应用产物 dist/
pnpm local                                                          # 2) 曲库助手 → 127.0.0.1:8011
pnpm e2e:peer                                                          # 3) 自建信令 → 127.0.0.1:9100（可选，联机才要）
APP=static node deploy/single-port-proxy.mjs                           # 4) 对外单端口 → 0.0.0.0:8080
# 开发时想保留 HMR：`pnpm dev` + `node deploy/single-port-proxy.mjs`（默认把其余请求转到 5173）
# 装了 Caddy 的等价物：`caddy run --config deploy/Caddyfile`
```

打开 `http://<本机可路由地址>:8080/?locale=zh`（`hostname -I` 看本机地址）。

| 路径 | 透传到 | 说明 |
|---|---|---|
| `/manifest.json`、`/media/*` | `127.0.0.1:8011` | 曲库助手；manifest 里的音频地址按 `X-Forwarded-Proto`/`Host` 现拼，Range 由助手处理 |
| `/peerjs`、`/peerjs/*` | `127.0.0.1:9100` | 自建 PeerJS 信令 |
| 其余 | `127.0.0.1:5173`（`APP=static` 时是 `dist/`） | 应用；SPA 回退也在这里 |

**三条必须守住的规则**：

1. **只把代理绑 `0.0.0.0`**，应用与助手留在回环后面 —— 只绑 `127.0.0.1` 的端口从外部浏览器根本连不上（容器/沙箱里尤其明显），全绑又白白多暴露两个端口。
2. **`X-Forwarded-Proto` 原样往下传**：最外层是 https 隧道/反代时（Cloudflare Tunnel、ngrok、Caddy 都会带 `https` 进来），代理不许改写它，否则助手把音频地址拼成 `http://…`，https 页面报「连接不完全安全」。上层完全不转发协议时用 `PROTO=https node deploy/single-port-proxy.mjs`，或给助手 `--public-base https://<域名>/` 显式指定。
3. **WebSocket 的 `upgrade` 也按同一套分流转发**：否则经代理端口打开的页面 HMR 不工作，`/peerjs` 也连不上。

环境变量：`HOST`（默认 `0.0.0.0`）、`PORT`（默认 `8080`）、`APP`（默认 `http://127.0.0.1:5173`，`static` = 直接服务 `dist/`）、`LOCAL`（默认 `8011`）、`PEER`（默认 `9100`）、`PROTO`（上层不转发协议时手填 `https`）。

音MAD 默认源是 CDN 上的绝对地址（带 CORS `*` 与 Range，D141），manifest 里的媒体地址是**相对路径**、由前端按
manifest 所在那一层解析 ⇒ 换域名/端口/协议、换宿主与子路径都不用改数据、不用重新生成 manifest；要**站点自带素材**
（同源）就把注册表的 `table_url` 改回 `manifest.json`。更细的踩坑（监听地址、HMR、https 与混合内容、
本机分开跑的 `?localmusic=` 覆盖）见 [`deploy/README.md`](deploy/README.md)。

### 6. 跑测试与数据守卫

| 命令 | 作用 |
|---|---|
| `pnpm typecheck` | 类型检查 |
| `pnpm test` | 单测（真实浏览器）：chromium + firefox 两个引擎各跑一遍；只跑一个引擎用 `pnpm test:chromium` / `pnpm test:firefox` |
| `pnpm e2e` | 端到端：chromium + firefox + 移动端（Pixel 7）；会自己起 dev（5190）与信令（9100） |
| `pnpm e2e:perf` | 「点击长任务」性能守卫（对机器负载敏感，单独跑） |
| `pnpm data:test` | 数据管线测试（音频/本地源那些在数据仓库里，各有自己的 `pnpm` 脚本） |
| `pnpm gate` | build + validate + notices --check（提交前必跑；CI 再加两次构建比对） |
| `pnpm data:validate` | 数据不变量校验（分类、面次、覆盖表、曲包） |
| `pnpm data:build` | 改了 `data/` 之后重新生成 `data/public/data/*.json` |
| `pnpm data:scaffold` | 给「真源里有、音MAD 曲包里还没有」的角色预置骨架文件（幂等、**不覆盖**手写内容、不影响生成物；D137） |

> **各套测试当前的实测条数以 [`docs/README.md`](docs/README.md) 的现状表为准** —— 那里是唯一维护点。
> 本表原先抄过一份（写着 856 passed / 95 passed），抄完就过期了，所以现在只写"跑什么、怎么跑"。

**e2e 的两个前置条件**：① 音MAD 相关用例会取同源的 `/manifest.json`（代理到本地曲库助手），
**先起助手**（§3）再跑，否则那几条会红 —— 这是环境问题，不是代码问题；② 浏览器装在仓库内（§1）。

### 7. 故障排查

| 症状 | 原因 / 处置 |
|---|---|
| 音MAD 列表为空 | 默认源是 **CDN**（D141）⇒ 先确认连得上它；要用本机曲库就加 `?localmusic=127.0.0.1:8011`（e2e 一律这么钉，跑前先 `pnpm local`）。助手没起或不在 8011：`curl -s http://127.0.0.1:8011/manifest.json \| head` |
| 助手起来了、页面还是没歌 | 默认源是 CDN（D141），不会自动用助手：`?localmusic=127.0.0.1:8011` 或设置页填地址（助手回落到别的端口就改这个数） |
| 音频 404、拖进度条失效 | 站点自带素材但没铺好、或没把 `table_url` 改回 `manifest.json`；也可能是 `python3 -m http.server` 这类服务器（不支持 Range/CORS；CDN 与助手都支持） |
| https 页面报"连接不完全安全" | 混合内容：最外层反代要转发 `X-Forwarded-Proto`；或 `PROTO=https node deploy/single-port-proxy.mjs`、助手 `--public-base`（详见 §5「单端口透传」与 `deploy/README.md`） |
| `pnpm audio:fetch` 一启动就退出 | yt-dlp 的升级检查需要联网（连不上 PyPI 就中止，可加 `--skip-update`）；ffmpeg 缺失也在这里报错 |
| 抓取个别曲目失败 | 站点限制 / 需登录 / 已下架：单条失败只跳过并计入汇总，其余照抓 |
| 改了数据/换了裁剪，但音频还是老的 | 成品是按状态跳过的：`pnpm audio:fetch`（只改裁剪会复用原件重裁）；要**覆盖重拉**就加 `--force`，可配 `--track <子串>` 只重拉一部分（§4）。**改了裁剪实现**则靠状态里的**渲染口径**（`render`，D142）自动作废旧成品 —— 不用手工 `--force` |
| 曲目计数突然变多 | 曲库里放了非点目录的原始件（第一层目录名 = 专辑名）→ 原件放 `<曲库>/.raw/` |
| `fnm use` 报找不到版本文件 | 用 `fnm use 24`（仓库没有 `.node-version` 之类文件） |

## 现状

数据规模、测试条数这些**只在 [`docs/README.md`](docs/README.md) 维护一份**，这里不再抄 ——
抄成两份时必然有一份是过期的（本节原先写的数字就已经和实际对不上了）。

## 怎么玩

- **播放**：轮播所有角色，一首一首放；点卡牌跳过，底部可「重新抽选 / 重置顺序」。
- **列表**：搜角色，点一行展开曲目，点曲目直接播；正在播的那首会高亮。
  只列**当前音乐模式**下有曲目的角色，行内也只列该模式的曲目（两个模式的预设、单曲手选、队列顺序各记各的）。
- **设置**：音乐模式（原曲 / 音MAD / 自定义）、镜像顺序、卡面图集、音乐预设（秘封曲 / 三态开关 / 单曲模式）；
  自定义模式下换成「自定义源链接」那一行 + 专辑/作者三元 + 逐卡禁用（这个模式的卡面由源给，图集不可选）。
- **游戏**：单人 / 电脑 / 多人；经典与休闲两套规则。选牌阶段点未使用卡进牌组、点牌组里的卡拿回来；
  同一首曲子一局只能对应一个角色（同一角色的多张卡面也只算一张），冲突的卡会压暗且点不动；
  窄屏下选卡是底部面板，手机上也能正常玩。
- **关于**：应用栏最右的 ⓘ 打开一个弹窗 —— 项目作者 / 仓库地址 / 原作·原曲作者 / 上游版本作者（改法见 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)）。

## 联机

同一个页面既是主机也是客户端：一方「创建房间」，把房间号给对方即可（1v1 或混战）。
信令默认走本机 PeerJS（`*:9100`）；音视频是 WebRTC P2P（UDP），跨 NAT 需要 STUN/TURN。

## 开发

改这个仓库先读 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)：日常命令、迭代时怎么快跑、
改「关于」弹窗的内容、技术栈都在那儿。

设计取舍与每个决定的实测数字在 [`docs/DECISIONS.md`](docs/DECISIONS.md)；
契约（随机数 / 联机协议 / 分类规则 / 曲包音频等）见 [`docs/README.md`](docs/README.md) 的契约表。

## 许可

本仓库**聚合**了多种来源，所以没有单一许可证 —— 按路径分：

| 路径 | 许可 |
|---|---|
| `src/` `tools/` `e2e/` `deploy/` `tests/` `docs/`，以及根目录的配置文件 | **MIT**，见 [`LICENSE`](LICENSE) |
| `data/**` | **MIT**（本仓库自己的汇编；来源见 [`docs/data-provenance.md`](docs/data-provenance.md)） |
| `src/assets/Inconsolata-Medium.ttf` | **SIL OFL-1.1** —— 原样分发，**不可**按 MIT 再许可 |
| 打包进 `dist/` 的第三方 npm 包 | MIT 与 BSD-3-Clause；另有 Google Material Icons 的 Apache-2.0 |
| `data/otomads/`、`data/custom/` | 独立仓库（submodule），许可在各自仓库里声明 |

逐路径的权威映射在 [`REUSE.toml`](REUSE.toml)，可以校验：

```bash
uvx --from reuse reuse lint
```

随产物分发的第三方署名在 [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)；同一份内容
也以纯文本放在 `pnpm notices` 产出的 `dist/THIRD-PARTY-NOTICES.txt`（构建期生成）——
**署名必须跟着分发副本走**，页面「关于」弹窗里有入口。

上游授权记录见 [`docs/permissions/upstream-authorization.md`](docs/permissions/upstream-authorization.md)。

另外：本项目是**东方 Project 的非官方二次创作**，与 上海アリス幻樂団 / ZUN 无任何关联，
遵循[东方Project使用规定案](https://thbwiki.cc/%E4%B8%9C%E6%96%B9Project%E4%BD%BF%E7%94%A8%E8%A7%84%E5%AE%9A%E6%A1%88)。
页面上的卡面与音频是**运行时**从第三方地址加载的，不在 MIT 的授权范围内。
