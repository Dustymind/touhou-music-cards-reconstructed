# 在 Windows 上跑这个仓库

2026-09-28 起工作区从 Linux 迁到 Windows。本文件记**迁移清单**与**平台专属设置**。

## 1. 迁移清单

### 1.1 必须带走（不在任何 git 仓库里，或很贵）

| 路径 | 体积 | 为什么 |
|---|---:|---|
| `.music/` | 780 MB | 你自己的音频曲库（音MAD 的本地源）。**gitignore，只能拷** |
| `local-source.toml` | 4 KB | 本机助手配置（gitignore）。内容 20 行，也可照 `data/otomads/local-source.toml.example` 重建 |
| `.ref/` | 359 MB | 上游只读副本 + THBWiki 快照。`tmc.fetch_roles` / `tmc.stages` 读 `.ref/thbwiki/`，缺了要重抓（要联网） |
| `touhou-music-cards-otomads-data/` | 2.1 GB | 数据仓库的独立克隆（改数据、打 tag 用）。**可重新 clone**，但省事就拷 |
| `touhou-music-cards-custom-data/` | 42 MB | 同上（自定义数据） |
| `HANDOVER.md` · `UPDATING.md` · `local-docs/` | 很小 | 工作区根的文档。`UPDATING.md` 是**现行操作手册**，不在任何仓库里 |

> 只有主仓库走 git（已推到 GitHub）。上面这些**都不在任何仓库里**。

### 1.2 不要带（装了也用不了，或纯再生）

| 路径 | 体积 | 怎么办 |
|---|---:|---|
| `.playwright-browsers/` | 964 MB | **Linux 二进制，Windows 上跑不起来** ⇒ 重装（见 §2.4） |
| `node_modules/` | 572 MB | pnpm 的 symlink 布局跨平台不通用 ⇒ 重新 `pnpm install` |
| `.uv/` · `tools/.venv/` · `data/*/tools/.venv/` | 23 MB | Linux venv ⇒ 重新 `uv sync` |
| `dist/` | 1.5 MB | `pnpm build` |
| `.pnpm-store/` | — | 重新 install 时自建 |
| `otomads-media.tar.gz` | 328 MB | 可从数据仓库的**公开** Release 匿名重下：`gh release download media --pattern otomads-media.tar.gz -R Dustymind/touhou-music-cards-otomads-data` |
| 13 张调试 PNG（`appearance-*` / `slot-*` / `opt-*` / `ratio-preview-*` / `otomads-cover-*` / `local-deploy*`） | ~2.9 MB | 一次性验证截图，无保留价值 |

### 1.3 迁移前的安全检查（**已做过，结论：干净**）

```bash
for d in . touhou-music-cards-otomads-data touhou-music-cards-custom-data; do
  git -C "$d" status -sb | head -1        # 有无未提交
  git -C "$d" log --oneline @{u}..HEAD    # 有无未推送
  git -C "$d" stash list                  # 有无 stash
done
```

2026-09-28 实测：三个仓库 **0 未推送 / 0 stash / 0 未提交**。
（otomads 克隆本地 7 个 tag、远端 13 个，只是没 `fetch --tags` 全，不是丢失 —— `git fetch --tags` 即同步。）

## 2. Windows 专属设置

### 2.1 `core.longpaths`（强烈建议，**克隆前**设）

pnpm 的 store 路径很长（`.pnpm/@mui+material@7.3.11_@mui+system@7.3.11_…/node_modules/…`），
默认 260 字符上限会 `ENAMETOOLONG` 或让 `pnpm install` 半途失败：

```bash
git config --global core.longpaths true
```

顺带把克隆放在**短路径**下（`C:\dev\tmc` 之类），别放在 `C:\Users\<你>\Documents\…` 的深处 ——
路径预算要留给 pnpm 的 store。

### 2.2 脚本已经是跨平台的 —— **不需要**配 `script-shell`

`package.json` 的 25 个脚本原先**全是 POSIX sh 写法**，`cmd.exe` 一个都不认：

| 原写法 | 用在哪 | 现在 |
|---|---|---|
| `[ -d … ] \|\| { echo …; exit 1; }` | `local` / `audio:*` / `media:*` | `node scripts/require-submodule.mjs` |
| `[ -n "$VAR" ] \|\| { … }` | `media:pull` | `node scripts/require-env.mjs` |
| `PLAYWRIGHT_BROWSERS_PATH="$PWD/…" cmd` | `test*` / `e2e*` | `node scripts/run.mjs cmd`（它自己设） |
| `UV_CACHE_DIR=.uv/cache cmd` | 全部 `data:*` | 同上 |
| `cd data/otomads/tools && …`（`cd` 带斜杠，cmd 不认） | `local` / `audio:*` / `media:*` | `uv run --project data/otomads/tools` |
| `$VAR` 传参（POSIX 认 `$VAR`、cmd 认 `%VAR%`） | `media:pull` | `run.mjs` 自己展开 |

改法是三个 Node 帮助脚本（Node 本来就是硬前置），路径**一律从脚本自身位置推导**、
没有一个写死的绝对路径：

| 脚本 | 干什么 |
|---|---|
| `scripts/run.mjs <命令> [参数…]` | 设好 `PLAYWRIGHT_BROWSERS_PATH` / `UV_CACHE_DIR`（**已在环境里设过的不覆盖**）再 spawn；`$VAR` 由它展开；仅在 Windows 过 shell（`.cmd` 垫片需要），POSIX 走 `shell:false` 以**精确保留带空格的参数** |
| `scripts/require-submodule.mjs [路径]` | 子模块没初始化就 exit 1 |
| `scripts/require-env.mjs <变量> [提示]` | 变量没设就 exit 1 |

**所以不要**再配 `script-shell` 指向某个 bash 绝对路径 —— 那既硬编码、又把仓库绑到某个平台。
三种平台的跑法完全一致，且 Linux 侧已实测（见 §3）。

### 2.3 行尾：**别设 `core.autocrlf=true`**

仓库根的 `.gitattributes` 已把整仓钉成 LF（`* text=auto eol=lf`）。

为什么这条是硬的：`pnpm data:check` 把 `public/data/*.json` 的**生成结果**与**已提交内容逐字节比对**。
检出时被转成 CRLF，这个守卫会立刻报"生成物与 data/ 不一致"，而数据其实没有任何问题 ——
那种假警报很难查。`.gitattributes` 就是为了在克隆时就杜绝它。

### 2.4 重装 Playwright 浏览器

```bash
pnpm exec playwright install chromium firefox
```

**裸敲**这条时 Playwright 会装到系统默认位置；`pnpm test*` / `pnpm e2e*` 则经
`scripts/run.mjs` 把 `PLAYWRIGHT_BROWSERS_PATH` 指到**仓库内**的 `.playwright-browsers/`
（与 Linux 上同一口径，已 gitignore）。想装到那一份就显式给：

```bash
# POSIX
PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" pnpm exec playwright install
# Windows（cmd）
set PLAYWRIGHT_BROWSERS_PATH=%CD%\.playwright-browsers && pnpm exec playwright install
```

## 3. 迁后自检

```bash
git config core.longpaths                # → true
node --version                           # → 24.x（fnm use 24；仓库没有版本文件）
pnpm install
pnpm typecheck
pnpm test:chromium                       # 先跑单引擎
pnpm data:check                          # 逐字节守卫 —— 行尾问题在这里暴露
pnpm exec playwright install             # 见 §2.4
```

数据管线那侧（Python）：

```bash
pnpm data:sync && pnpm data:test         # 期望 83 passed
```

音MAD 相关的 e2e 要先起本地曲库助手：`pnpm local`（需要 `data/otomads` submodule 已初始化 +
`.music/` 已拷过来）。

## 4. 平台差异速查

| 项 | Linux（旧） | Windows（新） |
|---|---|---|
| 脚本 shell | `/bin/sh` | Git Bash（靠 §2.2 指定） |
| uv 缓存 | `UV_CACHE_DIR=.uv/cache`（沙箱里 `$HOME` 只读） | 仍走仓库内缓存，但改由 `scripts/run.mjs` 设（`<仓库>/.uv/cache`），**不写进脚本**；已在环境里设过的不覆盖 |
| 浏览器 | 仓库内 `.playwright-browsers/` | 同左，但**要重装** |
| 长路径 | 无限制 | 需 `core.longpaths`（§2.1） |
| 大小写 | 敏感 | **不敏感** —— 本仓库已核过：**无仅大小写不同的路径**，安全 |
