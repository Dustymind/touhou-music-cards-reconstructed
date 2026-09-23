# 东方歌牌（重建版）

把东方角色的卡面、音乐与对战规则做成一个能在浏览器里玩的歌牌游戏：听前奏抢先认出是哪首曲子、抢到对应角色的卡。

本仓库是**从零重建**，不搬运上游的二进制素材；代码、数据管线与部署脚本都在这里。
音乐来自公开镜像（网易云 / Cloudflare R2 / THBWiki），卡面来自公开图集，音MAD 曲库走本地助手。

## 快速开始

```bash
fnm use 24 && pnpm install   # Node 24 + pnpm（裸 `fnm use` 在本仓库会报找不到版本文件）
pnpm dev                     # http://127.0.0.1:5173/?locale=zh
```

只玩**原曲**模式的话到这里就够了（三个镜像源都在公网）。**音MAD** 模式要另开一个终端起本地曲库助手 ——
依赖、曲库、抓取、部署、测试与排错的完整步骤见下一节。

## 本地部署（完整指南）

### 0. 前置依赖

| 依赖 | 版本 / 装法 | 需要它的场合 |
|---|---|---|
| **Node** | 24（`fnm use 24`） | 前端全部命令 |
| **pnpm** | `corepack enable`，或 `npm i -g pnpm`（本机实测 12.4.2） | 同上 |
| **Python ≥ 3.11 + uv** | `curl -LsSf https://astral.sh/uv/install.sh \| sh` | `tools/`：数据管线、曲库助手、抓取 |
| **ffmpeg** | 系统二进制：`apt install ffmpeg` / `brew install ffmpeg` | 只用于曲包音频的**抓取与裁剪**（缺失时抓取命令启动即报错） |
| **Playwright 浏览器** | 装进仓库内 `.playwright-browsers/`（已 gitignore） | 只用于 `pnpm test` / `pnpm e2e` |
| **yt-dlp** | 不用手装：写在 `tools/pyproject.toml` 里，由 uv 管 | 只用于抓取 |

仓库内已有两处约定：`.npmrc` 把 pnpm store 放进仓库（`.pnpm-store/`，HOME 只读的沙箱里也能装）；
`pnpm-workspace.yaml` 关掉严格 peer 检查（MUI 7 + React 19 有可选 peer）。

### 1. 装依赖

```bash
fnm use 24
pnpm install                                         # 前端
git submodule update --init data/otomads              # 音MAD 曲包真源（可选；不拉也能跑原曲模式）
cd tools && UV_CACHE_DIR=.uv/cache uv sync && cd ..   # 数据管线 + 曲库助手（建 tools/.venv）
# 只为跑测试 / e2e（浏览器落在仓库内，已 gitignore）
PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" pnpm exec playwright install chromium firefox
```

`public/data/*.json` 是**提交进仓库**的生成物，所以起开发服务器**不需要**先跑数据管线；
只有改了 `data/`（真相源）才需要 `pnpm data:build` 重新生成并提交。

### 2. 起开发服务器

```bash
pnpm dev            # http://127.0.0.1:5173/ ；中文界面加 ?locale=zh
```

Playwright 跑 e2e 时会自己起一个（5190 端口）与联机信令（9100），不用手动开。

### 3. 本地曲库与助手（音MAD 模式，可选）

音MAD 侧的音乐由 `tmc.local_source` 就地提供：`/manifest.json`（曲目表，**按请求现拼**）与
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
cd tools && UV_CACHE_DIR=.uv/cache uv run python -m tmc.local_source
# --root / --port / --host / --public-base 可覆盖配置；
# --print-url 只打印实际地址；--print-table 只打印曲目表 JSON
```

**开发服务器已经把 `/manifest.json` 与 `/media` 代理到 `127.0.0.1:8011`**，所以页面里不用填地址 ——
前提是助手就在 8011。它回落到别的端口（或你想分开跑）时，用
`http://127.0.0.1:5173/?localmusic=127.0.0.1:8012`，或在设置页 → 音乐源 → **本地曲库地址** 里填（会落盘）。

人工放音频：把 `<作者> - <标题>.wav/flac/m4a/...` 丢进 `<曲库>/incoming/`，再跑
`python3 tools/ingest_local_audio.py`（转 320k mp3 并移进 `<曲库>/otomads/`）。

### 4. 曲包音频的抓取与裁剪（可选）

音MAD 曲包的真源在主仓库外的数据 submodule（`data/otomads/packs/otomads/*.toml`，一角色一份，见 D128）：
写了 `source` 的曲目可以自动抓，并按 `start_time` / `stop_time` 裁掉前摇：

```bash
pnpm audio:fetch                                    # 抓全部缺的 / 重裁（幂等：已就绪的会 skip）
pnpm audio:fetch --track 岁月 --dry-run              # 只看计划：标题或作者含该子串的曲目
```

依赖 **ffmpeg**（裁剪）+ **yt-dlp**（抓取，uv 管）。跑之前会检查 yt-dlp 更新：有新版本就自动升级并继续，
**升级失败即中止**（离线环境加 `--offline-ok` 跳过检查）。能否抓到**取决于运行时的网络环境**
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

`--force` 会重下全部命中项，跑完还会**重量一遍响度表**（`public/data/loudness.json`）—— 那份是提交进仓库的生成物，
记得一起提交。

### 5. 构建与部署

```bash
pnpm build      # = tsc --noEmit && vite build → dist/
pnpm preview    # 本地预览 dist/
```

- **纯静态托管**：把 `dist/` 交给任意静态服务器即可（`base` 是 `./`，子目录部署也能直接跑）。
  静态站没有开发服务器那层代理，音MAD 要在设置页填「本地曲库地址」。
- **单端口透传**（应用 + 曲库 + 信令同端口）：见下面小节。
- **联机**：信令默认走本机 PeerJS（`*:9100`）；音视频是 WebRTC P2P（UDP），跨 NAT 需要 STUN/TURN。
  页面参数 `?peerhost=<域名>&peerport=<端口>&peerpath=/peerjs&peersecure=`（`peersecure` 省略时跟页面协议走）。

#### 单端口透传（应用 + 曲库 + 信令同端口）

应用、本地曲库助手、联机信令各跑各的，对外**只暴露一个端口**，由反向代理按路径透传：

```bash
pnpm build                                                             # 1) 应用产物 dist/
cd tools && UV_CACHE_DIR=.uv/cache uv run python -m tmc.local_source   # 2) 曲库助手 → 127.0.0.1:8011
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

本地源用的是相对路径 `/manifest.json`（**同源**），所以不需要 CORS，换域名/端口/协议也不用改数据、不用重新生成 manifest。更细的踩坑（监听地址、HMR、https 与混合内容、本机分开跑的 `?localmusic=` 覆盖）见 [`deploy/README.md`](deploy/README.md)。

### 6. 跑测试与数据守卫

| 命令 | 作用 |
|---|---|
| `pnpm typecheck` | 类型检查 |
| `pnpm test` | 单测（真实浏览器）：**628 passed** = 314 条 × chromium + firefox；只跑一个引擎用 `pnpm test:chromium` / `pnpm test:firefox` |
| `pnpm e2e` | 端到端：chromium + firefox + 移动端（Pixel 7），预期 **84 passed + 1 skipped**；会自己起 dev（5190）与信令（9100） |
| `pnpm e2e:perf` | 「点击长任务」性能守卫（对机器负载敏感，单独跑） |
| `cd tools && UV_CACHE_DIR=.uv/cache uv run pytest` | 数据管线的 Python 测试（**93 passed**） |
| `pnpm data:check` | `public/data` 与 `data/` 是否漂移（提交前必跑） |
| `pnpm data:validate` | 数据不变量校验（分类、面次、覆盖表、曲包） |
| `pnpm data:build` | 改了 `data/` 之后重新生成 `public/data/*.json` |

**e2e 的两个前置条件**：① 音MAD 相关用例会取同源的 `/manifest.json`（代理到本地曲库助手），
**先起助手**（§3）再跑，否则那几条会红 —— 这是环境问题，不是代码问题；② 浏览器装在仓库内（§1）。

### 7. 故障排查

| 症状 | 原因 / 处置 |
|---|---|
| 音MAD 列表为空、e2e 音MAD 用例红 | 助手没起或不在 8011：`curl -s http://127.0.0.1:8011/manifest.json \| head` |
| 助手起来了、页面还是没歌 | 它回落到了别的端口（dev 代理写死 8011）：`?localmusic=127.0.0.1:8012` 或设置页填地址 |
| 音频 404、拖进度条失效 | 静态部署时没填「本地曲库地址」；或用了 `python3 -m http.server` 这类服务器（不支持 Range/CORS；助手本身都支持） |
| https 页面报"连接不完全安全" | 混合内容：最外层反代要转发 `X-Forwarded-Proto`；或 `PROTO=https node deploy/single-port-proxy.mjs`、助手 `--public-base`（详见 §5「单端口透传」与 `deploy/README.md`） |
| `tmc.fetch_audio` 一启动就退出 | yt-dlp 的升级检查需要联网（连不上 PyPI 就中止，可加 `--offline-ok`）；ffmpeg 缺失也在这里报错 |
| 抓取个别曲目失败 | 站点限制 / 需登录 / 已下架：单条失败只跳过并计入汇总，其余照抓 |
| 改了数据/换了裁剪，但音频还是老的 | 成品是按状态跳过的：`pnpm audio:fetch`（只改裁剪会复用原件重裁）；要**覆盖重拉**就加 `--force`，可配 `--track <子串>` 只重拉一部分（§4） |
| 曲目计数突然变多 | 曲库里放了非点目录的原始件（第一层目录名 = 专辑名）→ 原件放 `<曲库>/.raw/` |
| `fnm use` 报找不到版本文件 | 用 `fnm use 24`（仓库没有 `.node-version` 之类文件） |

## 现状

数据由 `pnpm data:check` 守住：**121 个角色 / 40 张专辑 / 464 条角色曲目条目（454 首去重曲目）**、
**7 套卡面**（6 套上游 + 1 套音MAD 本地图集）；另有**音MAD 曲包 86 首（35 个角色）**，其中 84 首带 `source`（可自动抓取）、
16 首带裁剪区间，音频走本地曲库助手。
测试基线：`pnpm test` **628 passed**（314 条 × chromium + firefox，两个引擎都跑）、
`cd tools && uv run pytest` **93 passed**、e2e 预期 **84 passed + 1 skipped**。
完整的现状表（含每一项的复现命令）与文档索引见 [`docs/README.md`](docs/README.md)。

## 怎么玩

- **播放**：轮播所有角色，一首一首放；点卡牌跳过，底部可「重新抽选 / 重置顺序」。
- **列表**：搜角色，点一行展开曲目，点曲目直接播；正在播的那首会高亮。
  只列**当前音乐模式**下有曲目的角色，行内也只列该模式的曲目（两个模式的预设、单曲手选、队列顺序各记各的）。
- **设置**：音乐模式（原曲 / 音MAD）、镜像顺序、卡面图集、音乐预设（秘封曲 / 三态开关 / 单曲模式）。
- **游戏**：单人 / 电脑 / 多人；经典与休闲两套规则。选牌阶段点未使用卡进牌组、点牌组里的卡拿回来；
  同一首曲子一局只能对应一个角色（同一角色的多张卡面也只算一张），冲突的卡会压暗且点不动；
  窄屏下选卡是底部面板，手机上也能正常玩。

## 联机

同一个页面既是主机也是客户端：一方「创建房间」，把房间号给对方即可（1v1 或混战）。
信令默认走本机 PeerJS（`*:9100`）；音视频是 WebRTC P2P（UDP），跨 NAT 需要 STUN/TURN。

## 开发

日常命令速查（完整步骤与排错见上面「本地部署（完整指南）」）：

| 命令 | 作用 |
|---|---|
| `pnpm typecheck` / `pnpm test` | 类型检查 / 单测（314 条 × chromium + firefox = **628 passed**） |
| `pnpm test:chromium` / `pnpm test:firefox` | 只跑其中一个引擎（调试用） |
| `pnpm e2e` | 浏览器端到端：chromium + firefox + 移动端（Pixel 7） |
| `pnpm e2e:chromium` / `pnpm e2e:firefox` / `pnpm e2e:mobile` | 只跑其中一端（调试用） |
| `pnpm e2e:perf` | 单独跑「点击长任务」性能守卫（对机器负载敏感，不进全量） |
| `pnpm audio:fetch` | 抓取并裁剪曲包音频（见部署指南 §4） |
| `pnpm data:check` / `pnpm data:validate` | 数据生成物是否漂移 / 不变量校验（`tools/` 是 Python，用 `uv` 管环境） |
| `cd tools && UV_CACHE_DIR=.uv/cache uv run pytest` | 数据管线的 Python 测试（**93 passed**） |

**e2e 的前置条件**（音MAD 用例要先起本地曲库助手、浏览器要装在仓库内）见部署指南 §6。

技术栈：Vite 7 + React 19 + TypeScript + MUI 7（主题按 **Material Design 2** 写：4dp 圆角、8dp 栅格、
按钮 36dp、chip 32dp、深色基线），状态用 zustand，联机用 PeerJS。

设计取舍、踩过的坑与每个决定的实测数字记在 [`docs/DECISIONS.md`](docs/DECISIONS.md)；
`附加信息` 分类规则在 [`docs/rules-classification-v1.md`](docs/rules-classification-v1.md)；
随机数与"种子由谁生成"的契约在 [`docs/rng-v1.md`](docs/rng-v1.md)（改动即破坏联机一致性）。
文档全景（哪份是契约、哪份是历史快照、现状数字从哪来）见 [`docs/README.md`](docs/README.md)。
