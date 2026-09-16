# 东方歌牌 · 重构版（touhou-music-cards-reconstructed）

东方 Project 的**歌牌游戏**重构实现：卡组里排好角色卡 → 放歌 → 抢拍对应角色的卡 → 抢对得牌、抢错罚牌。
参考上游 [lightbulb128/touhou-card-player-v3](https://github.com/lightbulb128/touhou-card-player-v3) 的玩法、界面与联机模型，**独立重写**，不是 fork：数据从 JSON 迁移到 TOML、曲目身份从"手抄路径字符串"改为 `(专辑, 曲目)` 二元组、音乐源改为开关 + 可调 fallback、选择系统改为"专辑勾选 + 三态开关"派生。

**当前状态**：**M0–M9 全部完成**；数据、管线、前端、联机与端到端测试都已跑通，验收数字见
[`reports/M9-acceptance.md`](reports/M9-acceptance.md)。

- 方案与进度：[docs/PLAN.md](docs/PLAN.md)
- 决策记录（含理由与已裁定项）：[docs/DECISIONS.md](docs/DECISIONS.md)
- 数据分类规则 v1（`附加信息` 判定）：[docs/rules-classification-v1.md](docs/rules-classification-v1.md)

---

## 技术栈

| 部分 | 选型 |
|---|---|
| 前端 | Vite + React 19 + TypeScript + MUI 7（Emotion）；**不用** Next.js / Tailwind |
| 包管理 | `fnm` + `pnpm`（开发环境实测 node v24.21.0） |
| 数据管线 | Python 3.13 + `uv`（标准库 `tomllib`；`pytest` 只用于开发） |
| 联机 | 主机权威 + WebRTC（PeerJS）+ 传输层抽象（可插拔后端） |
| 形态 | 纯前端 SPA；本地音乐库由**独立助手服务**（`tools/`）提供 |

## 目录结构

```
data/            手工维护的真相源（TOML / JSON）
  characters/    一角色一 TOML（M1 生成，共 121 个）
  meta/          参照表（作品×曲目×类别标签）与"不归属"清单
  sources/       三份音乐源表（[专辑, 曲目, URL] 数组形式）
  packs/         附加曲包（预埋，暂空）
docs/            方案、决策、规则、验收报告
public/data/     由 data/ 生成的运行时 JSON（提交进仓库）
src/             前端源码
tests/           数据测试（Python）
e2e/             Playwright 端到端测试（冒烟 + 本地双浏览器联机）与本地 PeerJS 信令服务器
tools/           Python 工具：迁移 / 校验 / 生成 / 分类 / 本地音乐源服务器
.ref/            上游只读参考与调研笔记（**不进 git**）
```

## 运行

> 功能已完整（M0–M9）：`pnpm dev` 后可以听歌/切歌、配置图集与音源、勾选音乐预设、仅单曲模式逐角色选曲，并打单机/CPU/联机对局。
> 验收数据见 [`reports/M9-acceptance.md`](reports/M9-acceptance.md)，数据体检见 [`reports/M1-data-health.md`](reports/M1-data-health.md)。

```bash
# 数据（Python 工具）
cd tools
UV_CACHE_DIR=.uv/cache uv sync     # 建立 .venv；沙箱内 HOME 只读，故把 uv 缓存放进仓库
UV_CACHE_DIR=.uv/cache uv run pytest

# 前端
fnm use && pnpm install        # pnpm store 落在仓库内（见 .npmrc，沙箱内 HOME 只读）
pnpm dev                       # http://localhost:5173
pnpm test                      # vitest（141 个）
pnpm typecheck && pnpm build
pnpm data:validate && pnpm data:check   # 数据不变量 + 生成物漂移守卫
```

## 端到端测试（Playwright，本地双浏览器）

```bash
pnpm e2e                 # chromium + firefox 两个 project 全跑
pnpm e2e:chromium        # 只跑 chromium
pnpm e2e:firefox         # 只跑 firefox
pnpm e2e:peer            # 单独起本地 PeerJS 信令服务器（127.0.0.1:9100）
```

- 浏览器**装在仓库内**（`.playwright-browsers/`，约 964 MB，已 gitignore），因为沙箱里 `$HOME` 只读；
  首次使用需要 `PLAYWRIGHT_BROWSERS_PATH=$PWD/.playwright-browsers pnpm exec playwright install chromium firefox`。
- `playwright.config.ts` 自带两个 `webServer`：Vite dev（5190，`reuseExistingServer`）+ 本地 PeerJS 信令
  （`e2e/peer-server.mjs`，9100）。跨浏览器用例由 chromium project 自己拉起 chromium 主机 + firefox 客户端，
  在 firefox project 里跳过（避免重复跑）。
- 应用侧用 URL 参数指向自建信令：`?peerhost=127.0.0.1&peerport=9100&peerpath=/&peersecure=0`；
  **链接里带这些参数时大厅的"cross-machine (PeerJS)"开关默认打开**。
- 本机回环联调要关掉浏览器的 mDNS 候选混淆（`.local` 在容器里解析不了），用例里通过
  chromium `--disable-features=WebRtcHideLocalIpsWithMdns` 与 firefox
  `media.peerconnection.ice.obfuscate_host_addresses=false` 实现；**真实跨机器联机不需要这两个开关**。

## 外部依赖（网络）

| 依赖 | 用途 | 备注 |
|---|---|---|
| `r2bucket-touhou.hgjertkljw.org` | 卡面图 / 音乐镜像（上游作者的 R2 桶） | 首选 origin；**第三方托管，非本项目可控** |
| `lightbulb128.github.io/touhou-card-player-v3` | 卡面备用 origin | 与上游线上一致 |
| `cdn.jsdelivr.net/gh/lightbulb128/...`、`raw.githubusercontent.com/...` | 卡面兜底 origin | 已实测均返回 200 `image/png` |
| `music.163.com` / `upload.thbwiki.cc` / `r2bucket-touhou.hgjertkljw.org` | 音乐源（网易云 / THBWiki / R2） | 外链已统一 https；网易云 302 落点 CDN 亦支持 https |
| `thbwiki.cc`（经 THBWiki-Markdown 镜像） | `附加信息` 分类的权威依据 | 仅用于**离线生成数据**，不在运行时访问 |

卡面素材**不随仓库分发**（版权与体积原因），运行时按 origin 列表远程加载；本地放好 `public/cards*/` 即可离线运行（见方案 §D10）。
同理，上游的二进制素材一律不搬运：倒计时铃声改成用 Web Audio **现场合成**
（`src/audio/bell.ts`，不支持 Web Audio 的环境退化为等长静音），仓库里没有任何上游二进制文件。

## 系统层依赖

| 依赖 | 状态 |
|---|---|
| `fnm` + node v24.21.0 + `pnpm` | ✅ 已就绪 |
| `uv` 0.12.13 + Python 3.14.7 | ✅ 已就绪 |
| Playwright 浏览器（chromium / firefox，约 964 MB，装在仓库内 `.playwright-browsers/`，已 gitignore） | ✅ 已安装；因沙箱 `$HOME` 只读才落在仓库里 |

## 约定

- 提交信息：`<type>: <英文小写短句>`，`type ∈ feat|fix|data|docs|test|chore|refactor`；一个逻辑改动一个提交；需折行时 ≤ 75 列；**不 push**。
- 生成物（`public/data/**`）随源码提交，`pnpm data:build` 后 `git diff` 必须为空（CI 漂移守卫）。
- 参考文档 `.ref/notes/*.md` 是对上游的只读调研产物，不随仓库分发。
- 对局里音乐由**对局**驱动（倒计时响铃 → 回合开始播当前角色的曲子，两端同曲；见 D17）。
- 界面文案 en / zh 全覆盖（含游戏页与联机大厅，`?locale=zh` 或浏览器语言自动判定）；
  异常路径上的数据诊断信息（数据校验、存档迁移、断线原因）暂时保留中文，见 D16。
- 主题照搬上游的**深色**色板（页面底 `#141414`、纸面 `#262626`）；正文字体顺序见
  [`docs/DECISIONS.md`](docs/DECISIONS.md) D15（本机 Whitney → 苹果默认 → 鸿蒙默认 → 微软雅黑 → Noto CJK）。
- 端到端测试是"必须真浏览器跑"的那一层：MUI/浏览器行为（`Switch` 的 `slotProps.input`、三态开关的
  `aria-checked="mixed"`、PeerJS 真正的 WebRTC 建连）在 jsdom 里都验证不了。
- dev 构建会把 `useGame` / `useNet` 两个 store 挂到 `window.__TMC_GAME__` / `window.__TMC_NET__`
  供调试与 E2E 断言；生产构建里这两行不会存在（`import.meta.env.DEV` 守卫）。
