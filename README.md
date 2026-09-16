# 东方歌牌 · 重构版（touhou-music-cards-reconstructed）

东方 Project 的**歌牌游戏**重构实现：卡组里排好角色卡 → 放歌 → 抢拍对应角色的卡 → 抢对得牌、抢错罚牌。
参考上游 [lightbulb128/touhou-card-player-v3](https://github.com/lightbulb128/touhou-card-player-v3) 的玩法、界面与联机模型，**独立重写**，不是 fork：数据从 JSON 迁移到 TOML、曲目身份从"手抄路径字符串"改为 `(专辑, 曲目)` 二元组、音乐源改为开关 + 可调 fallback、选择系统改为"专辑勾选 + 三态开关"派生。

**当前状态**：M0（地基）已完成。数据迁移（M1）尚未开始。

- 审阅中的完整方案：[docs/PLAN.md](docs/PLAN.md)
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
tests/           数据测试（Python）与端到端测试（Playwright，双引擎）
tools/           Python 工具：迁移 / 校验 / 生成 / 分类 / 本地音乐源服务器
.ref/            上游只读参考与调研笔记（**不进 git**）
```

## 运行

> 前端已可运行（M4）：`pnpm dev` 后能看到页签外壳、角色列表、数据概览与音源开关。播放层在 M5。

```bash
# 数据（Python 工具）
cd tools
UV_CACHE_DIR=.uv/cache uv sync     # 建立 .venv；沙箱内 HOME 只读，故把 uv 缓存放进仓库
UV_CACHE_DIR=.uv/cache uv run pytest

# 前端
fnm use && pnpm install        # pnpm store 落在仓库内（见 .npmrc，沙箱内 HOME 只读）
pnpm dev                       # http://localhost:5173
pnpm test                      # vitest（20 个：持久化 / 数据校验 / 本地化 / 冒烟）
pnpm typecheck && pnpm build
```

## 外部依赖（网络）

| 依赖 | 用途 | 备注 |
|---|---|---|
| `r2bucket-touhou.hgjertkljw.org` | 卡面图 / 音乐镜像（上游作者的 R2 桶） | 首选 origin；**第三方托管，非本项目可控** |
| `lightbulb128.github.io/touhou-card-player-v3` | 卡面备用 origin | 与上游线上一致 |
| `cdn.jsdelivr.net/gh/lightbulb128/...`、`raw.githubusercontent.com/...` | 卡面兜底 origin | 已实测均返回 200 `image/png` |
| `music.163.com` / `upload.thbwiki.cc` / `r2bucket-touhou.hgjertkljw.org` | 音乐源（网易云 / THBWiki / R2） | 外链已统一 https；网易云 302 落点 CDN 亦支持 https |
| `thbwiki.cc`（经 THBWiki-Markdown 镜像） | `附加信息` 分类的权威依据 | 仅用于**离线生成数据**，不在运行时访问 |

卡面素材**不随仓库分发**（版权与体积原因），运行时按 origin 列表远程加载；本地放好 `public/cards*/` 即可离线运行（见方案 §D10）。

## 系统层依赖

| 依赖 | 状态 |
|---|---|
| `fnm` + node v24.21.0 + `pnpm` | ✅ 已就绪 |
| `uv` 0.12.13 + Python 3.14.7 | ✅ 已就绪 |
| Playwright 浏览器（chromium / firefox，约 300 MB，下载到 `~/.cache/ms-playwright`，**在仓库之外**） | ⏳ 需要时先与用户确认安装方式 |

## 约定

- 提交信息：`<type>: <英文小写短句>`，`type ∈ feat|fix|data|docs|test|chore|refactor`；一个逻辑改动一个提交；需折行时 ≤ 75 列；**不 push**。
- 生成物（`public/data/**`）随源码提交，`pnpm data:build` 后 `git diff` 必须为空（CI 漂移守卫）。
- 参考文档 `.ref/notes/*.md` 是对上游的只读调研产物，不随仓库分发。
