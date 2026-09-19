# 东方歌牌（重建版）

把东方角色的卡面、音乐与对战规则做成一个能在浏览器里玩的歌牌游戏：听前奏抢先认出是哪首曲子、抢到对应角色的卡。

本仓库是**从零重建**，不搬运上游的二进制素材；代码、数据管线与部署脚本都在这里。
音乐来自公开镜像（网易云 / Cloudflare R2 / THBWiki），卡面来自公开图集，音MAD 曲库走本地助手。

## 跑起来

```bash
fnm use && pnpm install      # Node 24 + pnpm
pnpm dev                     # http://127.0.0.1:5173/?locale=zh
```

音MAD 要本地曲库助手（另开一个终端；仓库根目录放 `local-source.toml`，`[library] root` 指向音乐目录）：

```bash
cd tools && UV_CACHE_DIR=.uv/cache uv run python -m tmc.local_source
```

开发服务器已经把 `/manifest.json` 与 `/media` 代理到这个助手，所以页面里**不用填地址**。

### 音MAD 音频：自动抓取与裁剪（可选）

音频默认由人工放进曲库；`data/packs/otomads.toml` 里写了 `source` 的曲目可以自动抓，并按
`start_time` / `stop_time` 裁掉前摇（只留正题）：

```bash
cd tools && UV_CACHE_DIR=.uv/cache uv run python -m tmc.fetch_audio              # 抓全部缺的
cd tools && UV_CACHE_DIR=.uv/cache uv run python -m tmc.fetch_audio --track 岁月 --dry-run
```

依赖：**ffmpeg**（裁剪，系统二进制；`apt install ffmpeg` / `brew install ffmpeg`）+
**yt-dlp**（抓取，已写进 `tools/pyproject.toml`，由 uv 管理）。
抓取前会检查 yt-dlp 更新：有新版本就自动升级并继续，**升级失败即中止**；离线环境可加 `--offline-ok` 跳过检查。
能否抓到**取决于运行时的网络环境**（站点地区限制、是否需要登录、站点是否改版）。
原件留在 `<曲库>/.raw/`、状态在 `<曲库>/.state/`（都是点目录，助手扫描会跳过），
成品是 `<曲库>/<专辑>/<作者> - <标题>.mp3` —— 语义与流程见 [`docs/packs-audio-v1.md`](docs/packs-audio-v1.md)。

## 现状

数据由 `pnpm data:check` 守住：**121 个角色 / 40 张专辑 / 464 条角色曲目条目（454 首去重曲目）/ 6 套卡面**；
另有**音MAD 曲包 86 首（35 个角色）**，音频走本地曲库助手。
测试基线：`pnpm test` **251 条**、`uv run pytest` **71 条**、e2e **68 条通过 + 1 条跳过**。
完整的现状表（含每一项的复现命令）与文档索引见 [`docs/README.md`](docs/README.md)。

## 怎么玩

- **播放**：轮播所有角色，一首一首放；点卡牌跳过，底部可「重新抽选 / 重置顺序」。
- **列表**：搜角色，点一行展开曲目，点曲目直接播；正在播的那首会高亮。
- **设置**：音乐模式（原曲 / 音MAD）、镜像顺序、卡面图集、音乐预设（秘封曲 / 三态开关 / 单曲模式）。
- **游戏**：单人 / 电脑 / 多人；经典与休闲两套规则。选牌阶段点未使用卡进牌组、点牌组里的卡拿回来；
  窄屏下选卡是底部面板，手机上也能正常玩。

## 联机

同一个页面既是主机也是客户端：一方「创建房间」，把房间号给对方即可（1v1 或混战）。
信令默认走本机 PeerJS（`*:9100`）；音视频是 WebRTC P2P（UDP），跨 NAT 需要 STUN/TURN。

## 部署

单端口就能把应用、曲库、信令一起带出去（`deploy/single-port-proxy.mjs` 或 `deploy/Caddyfile`），
细节见 [`deploy/README.md`](deploy/README.md)。静态产物：`pnpm build`。

## 开发

| 命令 | 作用 |
|---|---|
| `pnpm typecheck` / `pnpm test` | 类型检查 / 单测（251 条） |
| `pnpm e2e` | 浏览器端到端：chromium + firefox + 移动端（Pixel 7） |
| `pnpm e2e:chromium` / `pnpm e2e:firefox` / `pnpm e2e:mobile` | 只跑其中一端（调试用） |
| `pnpm e2e:perf` | 单独跑「点击长任务」性能守卫（对机器负载敏感，不进全量） |
| `pnpm data:check` | 数据生成物是否漂移（`tools/` 是 Python，用 `uv` 管环境） |
| `cd tools && uv run pytest` | 数据管线的 Python 测试（33 条） |

**e2e 有个前置条件**：音MAD 相关用例会取同源的 `/manifest.json`（开发服务器代理到本地曲库助手），
所以要先起助手再跑，否则那几条会红 —— 这是环境问题，不是代码问题。

技术栈：Vite 7 + React 19 + TypeScript + MUI 7（主题按 **Material Design 2** 写：4dp 圆角、8dp 栅格、
按钮 36dp、chip 32dp、深色基线），状态用 zustand，联机用 PeerJS。

设计取舍、踩过的坑与每个决定的实测数字记在 [`docs/DECISIONS.md`](docs/DECISIONS.md)；
`附加信息` 分类规则在 [`docs/rules-classification-v1.md`](docs/rules-classification-v1.md)；
随机数与"种子由谁生成"的契约在 [`docs/rng-v1.md`](docs/rng-v1.md)（改动即破坏联机一致性）。
文档全景（哪份是契约、哪份是历史快照、现状数字从哪来）见 [`docs/README.md`](docs/README.md)。
