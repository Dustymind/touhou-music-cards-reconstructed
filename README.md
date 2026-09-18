# 东方歌牌 · 重构版（touhou-music-cards-reconstructed）

东方 Project 的**歌牌游戏**：在卡组里排好角色卡 → 放歌 → 抢拍对应角色的卡 → 抢对得牌、抢错罚牌。
玩法、界面与联机模型参考上游 [lightbulb128/touhou-card-player-v3](https://github.com/lightbulb128/touhou-card-player-v3)，
但这是一次**独立重写**（不是 fork）：

| 维度 | 上游 | 本项目 |
|---|---|---|
| 数据真相源 | 手抄的 JSON | TOML（`data/`）+ Python 管线生成运行时 JSON |
| 曲目身份 | 路径字符串 | `(专辑, 曲目)` 二元组（`trackId`） |
| 音乐源 | 单选、写盘时机有 bug | 开关 + 可调 fallback 顺序 + 会话内失败跳过 |
| 选曲 | 逐角色下标 | 「专辑勾选 + 秘封碟 + 三个三态开关」派生（另有仅单曲模式） |
| 界面 | 自绘 canvas 风 | Material Design 2（MUI 主题：类型比例 / 形状 / 组件规格） |

**当前状态**：里程碑 **M0–M47 全部完成**，决策记录累计 **D1–D52**（含每轮需求变更的理由与验收数字）。
数据指纹 `7ea10d138e82`：**121 角色 / 40 专辑 / 402 曲目条目 / 392 去重曲目 / 4 音源 / 6 卡面图集 / 1 曲包（音MAD 24 曲）**。

- 方案与里程碑：[`docs/PLAN.md`](docs/PLAN.md)
- 决策记录（含理由、被否方案、每轮验收）：[`docs/DECISIONS.md`](docs/DECISIONS.md)
- `附加信息` 分类规则：[`docs/rules-classification-v1.md`](docs/rules-classification-v1.md)
- 验收报告：[`reports/M9-acceptance.md`](reports/M9-acceptance.md) · 数据体检：[`reports/M1-data-health.md`](reports/M1-data-health.md)

---

## 目录

- [功能一览](#功能一览)
- [快速开始](#快速开始)
- [音MAD（otomads）模式与本地曲库](#音madotomads模式与本地曲库)
- [部署（单端口）](#部署单端口)
- [测试](#测试)
- [数据管线](#数据管线)
- [目录结构](#目录结构)
- [架构速览](#架构速览)
- [界面与设计规范](#界面与设计规范)
- [外部依赖（网络）](#外部依赖网络)
- [约定](#约定)
- [已知限制](#已知限制)

---

## 功能一览

**播放页** —— 当前角色的卡面 + 曲目信息；播放/暂停/上一首/下一首（MD2 48dp 图标按钮）、进度与音量滑杆
（音量滑杆收在图标按钮后面）、随机起点；下一批卡条（共享 `CardStrip`：滑轨 + 滑块平移、hover 只变色、点击跳过）。

**列表页** —— 全部 121 角色的 MD2 `List`（序号头像 + 主角名 + 次行「曲目 · 专辑」+ 尾部曲目数 chip），
搜索、点行切歌、临时停用（置灰）。

**设置页** —— MD2 可折叠扩展面板（默认全部折叠、折叠时不挂载内容）：

| 分区 | 内容 |
|---|---|
| 数据 | 角色/专辑/曲目统计、可用曲目数、内容指纹、语言切换（en / zh） |
| 卡面图集 | 6 套图集的 MD2 单选组（原版说明文案 + 三张示例卡右对齐） |
| 音乐源 | **音乐模式（原曲 / 音MAD）**、本地曲库、三个镜像的开关与 fallback 顺序（整行移动） |
| 音乐选择预设 | 专辑勾选、秘封父项三态、三类三态开关、重置 |
| 仅单曲模式 | 总开关 + 逐角色选曲（只列预设启用的曲目）+ 禁用角色 |

**游戏页** —— 三种模式（单人 / 电脑 / 多人）：对方棋盘与联机栏按模式显隐（`Collapse` + `Fade`），
电脑卡组只在电脑模式可调；卡组行列用 MD2 下拉框、卡组尺寸/卡牌大小成对按钮；拖动放置卡牌（交换/移动/交牌）、
未使用卡牌区、计时器与回合状态、卡槽滑块；按钮尺寸与图标间距全页统一。

**联机** —— 主机权威 + WebRTC（PeerJS）/ 同浏览器 `BroadcastChannel` 双后端，可插拔传输层；
大厅（房间号、参与者、聊天、数据指纹一致性校验）、意图 RPC（客户端只能动自己的牌库）、
快照同步（**含音乐模式**，两端同模式同曲目）。跨机器与同浏览器双标签页都有 E2E 覆盖。

**其它** —— 全界面 en / zh（`?locale=zh` 或浏览器语言自动判定）；上游的 Alice 彩蛋按钮；
数据指纹漂移守卫；`?peerhost=…` 参数指向自建信令。

---

## 快速开始

系统层依赖：`fnm` + Node（实测 v24.21.0）、`pnpm`（12.4.2）、`uv` + Python 3.12（数据管线）。
沙箱环境里 `$HOME` 只读，所以 pnpm store、uv 缓存、Playwright 浏览器都落在仓库内
（见 `.npmrc` / `pnpm-workspace.yaml` / `.gitignore`）。

```bash
fnm use && pnpm install            # 前端依赖（store 在仓库内）
pnpm dev                           # http://127.0.0.1:5173 （中文：?locale=zh）
pnpm dev -- --host 0.0.0.0         # 手机/外部浏览器一起测：http://<本机地址>:5173/?locale=zh

pnpm typecheck                     # tsc --noEmit
pnpm test                          # vitest（199 个）
pnpm build                         # tsc + vite build（产物 dist/）
pnpm preview                       # 预览构建产物（默认 4173）

cd tools                           # 数据管线（Python）
UV_CACHE_DIR=.uv/cache uv sync
UV_CACHE_DIR=.uv/cache uv run pytest
```

常用数据命令（在仓库根）：

```bash
pnpm data:validate    # 不变量校验（引用完整性、专辑注册、分类归属、曲包…）
pnpm data:build       # data/ (TOML) → public/data/ (JSON)
pnpm data:check       # 漂移守卫：重建后必须与已提交的生成物一致
```

---

## 音MAD（otomads）模式与本地曲库

音MAD 曲目**只存在于本机**（版权与体积原因不进仓库），由 `tools/src/tmc/local_source.py`
起的**本地曲库助手**提供；应用侧按"专辑的 `pack` 字段"判定曲目属于哪个模式。

**1. 放音频**：按 `<曲库根>/<专辑>/<曲目>.mp3` 摆放，音MAD 就是 `.music/otomads/*.mp3`
（`.music/` 已在 `.gitignore`；当前示例 24 首 / 13 角色 / 约 82 MB）。

**2. 写配置**：把 `tools/local-source.toml.example` 复制成仓库根的 `local-source.toml`（已 gitignore）：

```toml
[server]
host = "127.0.0.1"
port = 8011
port_tries = 10

[library]
root = ".music"        # 相对配置文件所在目录

[pack]
id = "otomads"
label_en = "Otomads"
label_zh = "音MAD"
```

**3. 起服务**：

```bash
cd tools
UV_CACHE_DIR=.uv/cache uv run python -m tmc.local_source                 # 起服务（默认 8011）
UV_CACHE_DIR=.uv/cache uv run python -m tmc.local_source --print-url     # 只打印地址
UV_CACHE_DIR=.uv/cache uv run python -m tmc.local_source --print-table   # 只打印曲目表
```

它同时提供 `GET /manifest.json`（曲目表，形状 `[专辑, 曲目, URL]` + `pack` 字段，**按请求 Host 动态生成**）
与 `GET /media/<专辑>/<曲目>.mp3`（音频本体，支持 **Range** 与 **CORS**——这正是不能用
`python3 -m http.server` 的原因）。

**4. 切换模式**：设置页 → 音乐源 → 音乐模式 → **音MAD**。模式只过滤"接下来能选哪些曲目"，
**不打断正在播放的这一首**；音MAD 模式下应用会自动使用本地曲库（不改写你的开关状态）。
若助手没起，只有音MAD 曲目无声，其余曲目照常。

---

## 部署（单端口）

`deploy/` 里给了**方案 B**：应用、本地曲库、联机信令都走**一个端口**，由反向代理分流。

| 路径 | 去处 | 说明 |
|---|---|---|
| `/manifest.json`、`/media/*` | `127.0.0.1:8011` | 本地曲库助手；manifest 里的音频地址按 `X-Forwarded-Proto`/`Host` 现拼，**https 站点也不会混合内容拦截** |
| `/peerjs`、`/peerjs/*` | `127.0.0.1:9100` | 自建 PeerJS 信令（可选，只用公网 PeerJS 时删掉这段） |
| 其余 | `dist/` | 应用静态产物 + SPA 回退 |

```bash
pnpm build                                     # 应用产物
cd tools && uv run python -m tmc.local_source   # 曲库助手（8011）
pnpm e2e:peer                                   # 信令（9100，可选）
caddy run --config deploy/Caddyfile             # 一个端口对外（默认 :8080）

# 没装 Caddy 时等价的本机验证（Node 版代理，逻辑与 Caddyfile 一致）
node deploy/single-port-proxy.mjs               # 0.0.0.0:8080；PORT=/HOST= 可改
```

> **注意监听地址**：应用 dev（5173）与曲库助手（8011）默认只绑 `127.0.0.1`，从外部浏览器访问不到；
> 单端口部署时**只把代理绑到 `0.0.0.0`**（默认如此），用 `http://<本机地址>:8080/?locale=zh` 打开。
> 端口冲突就 `PORT=9000 node deploy/single-port-proxy.mjs`。

细节与"本机分开跑（5173 + 8011）怎么办"见 [`deploy/README.md`](deploy/README.md)：
数据里 `local` 源的 `table_url` 默认是**相对路径** `/manifest.json`（同源 ✓ 不需要 CORS ✓）；
分开跑时用 `?localmusic=127.0.0.1:8011` 或设置页的「本地曲库地址」覆盖。
**联机的音视频仍是 WebRTC P2P（UDP）**，不在这一个端口里，跨 NAT 另需 STUN/TURN。
https 部署时若浏览器报"连接不完全安全"，是**最外层代理没转发 `X-Forwarded-Proto: https`**
（本地助手的音频地址按它现拼）；Caddy 自动带、`deploy/single-port-proxy.mjs` 原样传下去，
必要时用 `PROTO=https` 或助手 `--public-base` 显式指定，详见 [`deploy/README.md`](deploy/README.md)。

## 测试

| 层 | 命令 | 规模 | 覆盖重点 |
|---|---|---|---|
| 单元 / 集成 | `pnpm test` | 199 个（27 文件） | 数据派生、预设/单曲、音乐模式、规则、CPU、拖拽、存档迁移、选源、协议与意图、React 层联机 |
| 端到端 | `pnpm e2e` | 54 通过 / 1 跳过（chromium + firefox + **mobile**） | 真浏览器行为：MUI 组件规格、滑块对齐、拖动放置、模式显隐动画、联机握手与快照、移动端布局与触摸 |
| 数据 | `cd tools && uv run pytest` | 33 个 | 分类规则、数据不变量、曲包、生成物 |

```bash
pnpm e2e                 # 两个 project 全跑（约 5 分钟）
pnpm e2e:chromium        # 只跑 chromium
pnpm e2e:firefox         # 只跑 firefox
pnpm e2e:mobile          # 只跑移动端（Pixel 7：412×915、触摸、DPR 2.625）
pnpm e2e:peer            # 单独起本地 PeerJS 信令（127.0.0.1:9100）
```

- 浏览器装在仓库内 `.playwright-browsers/`（约 964 MB，已 gitignore）；首次需要
  `PLAYWRIGHT_BROWSERS_PATH=$PWD/.playwright-browsers pnpm exec playwright install chromium firefox`。
- `playwright.config.ts` 自带两个 `webServer`：Vite dev（5190，`reuseExistingServer`）与本地 PeerJS 信令
  （`e2e/peer-server.mjs`，9100）；跨浏览器用例由 chromium project 自己拉起 chromium 主机 + firefox 客户端。
- 必须真浏览器跑的原因：`Switch` 的 `slotProps.input`、三态开关的 `aria-checked="mixed"`、
  `Collapse` 的动画与卸载、以及 PeerJS 真的建 WebRTC 连接，jsdom 都验证不了。
- 本机回环联调要关掉 mDNS 候选混淆（`.local` 在容器里解析不了）：chromium
  `--disable-features=WebRtcHideLocalIpsWithMdns`、firefox `media.peerconnection.ice.obfuscate_host_addresses=false`。

---

## 数据管线

```
data/                    手写真相源（TOML / TSV / JSON）
 ├─ albums.toml          专辑注册表：key / name / kind / pack / order
 ├─ characters/*.toml    121 个角色（卡面文件名、搜索名、[[专辑, 曲目, 附加信息]]）
 ├─ packs/*.toml         附加曲包（目前：otomads.toml，24 首音MAD 曲目）
 ├─ card-sets.toml       6 套卡面图集（远程 origins + 本地前缀）
 ├─ sources/             三份镜像源表 + sources.toml 注册表
 └─ meta/                作品×曲目×类别参照表、不归属清单、人工裁定表

tools/src/tmc/
 ├─ build.py             data/ → public/data/（characters/albums/index/sources/cardsets/packs）
 ├─ validate.py          不变量校验（含曲包自身检查；曲包曲目豁免"三表齐备"）
 ├─ packs.py             曲包加载与并入角色表
 ├─ local_source.py      本地曲库助手（manifest + Range/CORS 音频）
 ├─ stages.py / roles.py / migrate.py / check_urls.py / fetch_roles.py
 └─ repo.py              路径与轻量文本处理

public/data/             生成物（提交进仓库）
```

- 生成物**随源码提交**：`pnpm data:build` 之后 `git diff` 必须为空（`pnpm data:check` 是漂移守卫）。
- `index.json` 的 `contentHash` 是联机一致性依据（两端不一致直接拒绝连接）。
- 曲目身份是 `(专辑, 曲目)`，`曲目` **保留** `NN. ` 序号（去掉会撞名，见 D6）。

---

## 目录结构

```
data/            数据真相源（见上）
docs/            PLAN（里程碑）/ DECISIONS（决策）/ rules-classification-v1
public/data/     运行时 JSON（生成物，提交）
src/
 ├─ audio/        播放器（usePlayer）、铃声合成（Web Audio，无二进制）
 ├─ cheat/        彩蛋（抖动 / 故障效果）
 ├─ data/         运行时数据类型与身份函数
 ├─ game/         规则、CPU、拖拽、对局 store、计时循环、卡组设置
 ├─ i18n/         en/zh 文案（`t()` 支持占位符；彩蛋下抖动文字）
 ├─ music/        选曲派生、预设视图、音乐模式、音源解析与加载
 ├─ net/          协议、主机/客户端引擎、PeerJS 与 BroadcastChannel 传输、意图
 ├─ store/        session / preset / queue / single（版本化 localStorage）
 ├─ theme/        MD2 主题（类型比例、形状、组件规格、深色基准配色）
 └─ ui/           shell（AppBar+Tabs）/ panels（播放、列表、设置、对战）/ components / game / player
deploy/          单端口部署（Caddyfile + Node 版等价代理）与说明
e2e/             Playwright 用例 + 本地 PeerJS 信令服务器 + 拖动辅助
tools/           Python 数据管线与本地曲库助手（uv 工程）
reports/         验收与体检报告、核对表
.ref/            上游只读参考与调研笔记（不进 git）
.music/          本地曲库（音MAD 音频，不进 git）
```

---

## 架构速览

- **状态**：zustand 四个 store —— `session`（语言/页签/卡面图集/**音乐模式**/音源开关与顺序）、
  `preset`（专辑勾选与三态开关）、`queue`（播放顺序、临时停用、当前曲目）、`single`（仅单曲模式）。
  一律走 `persist.ts` 的版本化存储：**逐键独立校验**，缺字段回退默认值而不是丢弃整份偏好。
- **选曲派生**：`selection.ts`（`isTrackEnabled` / `allowedTracks`）是纯函数，界面只喂状态；
  优先级为「单曲模式手选 > 三态显式 > 专辑/秘封碟勾选」，再叠加**音乐模式**过滤。
- **音乐模式**：`music/mode.ts`。曲目的模式 = 它所属专辑的 `pack`（`originals` = 镜像，其它 = 对应曲包），
  比改版仓库"键在哪张表里"的启发式更确定；模式只影响后续选曲，不改写存档、不打断当前曲目。
- **播放**：`audio/usePlayer.ts` 自己创建不挂 DOM 的 `Audio`；对局里用 `turnSeed(gameSeed, turnSeq, key)`
  派生随机种子，保证**两端同一回合听同一首**；源失败时按 fallback 顺序跳到下一个候选。
- **联机**：`net/engines.ts` 主机权威（意图 → 本地落地 → 广播快照），客户端只发意图；
  `transport.ts` 抽掉传输层（BroadcastChannel / PeerJS）；协议带 `PROTOCOL_VERSION` + 数据指纹校验，
  快照附带**音乐模式**（两端模式不同会导致轮换分叉）。
- **部署形态**：默认就是"应用 + 本地曲库 + 信令一个端口"（`deploy/Caddyfile`）；数据里本地源用相对路径，
  所以换域名/端口/协议都不用改数据，也不需要 CORS。
- **可测性**：dev 构建把 `useGame` / `useNet` 挂到 `window.__TMC_GAME__` / `window.__TMC_NET__`
  供调试与 E2E（`import.meta.env.DEV` 守卫，生产构建里不存在）。

---

## 界面与设计规范

**Material Design 2**（参考 <https://m2.material.io/>；MUI 本身就是 MD2 实现，主题里显式写死规格）：

| 项 | 规格 |
|---|---|
| 形状 | 4dp 圆角（卡面、卡片、下拉、扩展面板一致） |
| 类型比例 | h1…overline 全套；button 14/500/**1.25px 大写**、overline 10/1.5px 大写（字距显式写，因为字体不是 Roboto） |
| 按钮 | small 32 / medium 36 / large 44；页面内统一 36dp 高、左右 16dp、图标 18dp、图标间距 8dp |
| 卡片 / Chips | 卡片 elevation 1 + 16dp 内边距；chip 高 32、圆角 16 |
| 扩展面板 | 头部 56dp（展开前后同高）、展开图标 onSurface 60%、头部与内容间 1px 分隔线、标准缓动 250/200ms |
| 列表 | `List` + 头像 + 主/次文本 + 尾部动作，单行 56dp |
| 输入框 | 带标签用 filled（标签在框内）；**无标签必须 outlined**（filled 会为标签留出上方空白） |
| 布局 | 响应式页边距：移动 16dp / 桌面 24dp（整页宽度自适应，不设最大宽度）；移动端见下 |
| 移动端 | 应用栏窄屏折两行（标题 + 彩蛋 / 页签整行滚动）、播放控制两行（进度条整行）、按钮文字不折行（整组换行）、触摸目标图标按钮 ≥40dp；选卡改为**非模态底部面板**（无遮罩、30vh、32×4 拖拽把手、4dp 上圆角），面板里卡面**多行铺开且与卡槽同尺寸** |
| 配色 | MD2 深色基准：primary `#BB86FC`、secondary `#03DAC6`、surface `#121212`、error `#CF6679`；onSurface 100% / 70% / 12% |

字体顺序见 [`docs/DECISIONS.md`](docs/DECISIONS.md) D15（本机 Whitney → 苹果默认 → 鸿蒙默认 → 微软雅黑 → Noto CJK）；
「选卡区」那条滑轨 + 滑块是用户点名要的类滚动条控件，未替换成 MD2 Slider。

---

## 外部依赖（网络）

| 依赖 | 用途 | 备注 |
|---|---|---|
| `r2bucket-touhou.hgjertkljw.org` | 卡面图 / 音乐镜像（上游作者的 R2 桶） | 首选 origin；第三方托管，非本项目可控 |
| `lightbulb128.github.io/touhou-card-player-v3` | 卡面备用 origin | 与上游线上一致 |
| `cdn.jsdelivr.net/gh/lightbulb128/...`、`raw.githubusercontent.com/...` | 卡面兜底 origin | 已实测均 200 |
| `music.163.com` / `upload.thbwiki.cc` | 网易云 / THBWiki 音乐源 | 外链统一 https；网易云部分曲目境外不可用，会按 fallback 跳到下一个源 |
| `thbwiki.cc`（经 THBWiki-Markdown 镜像） | `附加信息` 分类依据 | **只用于离线生成数据**，运行时不访问 |
| 本地曲库助手（`127.0.0.1:8011`） | 音MAD 曲目与音频 | 本机服务，见上文 |

卡面与音频素材**不随仓库分发**（版权与体积）；仓库里没有任何上游二进制文件——倒计时铃声用 Web Audio
现场合成（`src/audio/bell.ts`，不支持时退化为等长静音）。

---

## 约定

- 提交信息：`<type>: <英文小写短句>`，`type ∈ feat|fix|data|docs|test|chore|refactor`；
  一个逻辑改动一个提交；需折行时 ≤ 75 列。
- 远端：`origin` = <https://github.com/Dustymind/touhou-music-cards-reconstructed>（分支 `main`），
  `git push` 前先确认 `git status` 干净、`pnpm data:check` 无漂移。
- 生成物（`public/data/**`）随源码提交，`pnpm data:build` 后 `git diff` 必须为空。
- 每轮需求变更都记进 `docs/DECISIONS.md`（结论 + 理由 + 实测数字 + 回归锁），里程碑记进 `docs/PLAN.md`。
- 界面文案 en / zh 全覆盖；数据诊断类信息（校验、迁移、断线原因）暂保留中文（见 D16）。
- 「真浏览器验证」是硬要求：涉及 MUI / 动画 / 拖动 / 联机的改动必须补 E2E，并在文档里给实测数字。
- `.ref/` 里的上游参考与调研笔记不随仓库分发。

---

## 已知限制

- **卡面与音频走远程/本机**：卡面按 origin 顺序远程取（可自行放 `public/cards*/` 离线化）；
  音MAD 音频需要本机助手在跑，否则那批曲目无声（不影响其余功能）。
- **异常路径文案**：数据校验／存档迁移／断线原因等诊断信息仍是中文。
- **283 首无人认领曲目**只读可见，不参与任何角色的曲池（不会出现在对局里）。
- **真实跨机器联机**已实现并有同浏览器 + 跨浏览器 E2E，但尚未在真实广域网上长时间压测；
  自建信令参数走 URL（`?peerhost=…&peerport=…&peerpath=…&peersecure=0`）。
- 未做：上游的"观察者/混战"完整流程、卡面图集的本地多目录扫描、en / zh 之外的其它语言。

---

## 相关文档

| 文档 | 内容 |
|---|---|
| [`docs/PLAN.md`](docs/PLAN.md) | 需求 → 方案 → 里程碑（M0–M47）与每步验收条件 |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | D1–D52：选型、被否方案、每轮变更的理由与实测 |
| [`docs/rules-classification-v1.md`](docs/rules-classification-v1.md) | `附加信息` 四类判定规则（角色曲／道中曲／更多道中曲／秘封曲） |
| [`reports/M9-acceptance.md`](reports/M9-acceptance.md) | 验收报告（含各功能实测数字） |
| [`reports/validation-report.md`](reports/validation-report.md) | 最近一次数据校验报告 |
