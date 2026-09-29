# 在 Windows 上跑这个仓库

2026-09-28 起工作区从 Linux 迁到 Windows。本文件记**迁移清单**与**平台专属设置**。

## 1. 迁移清单

### 1.1 必须带走（不在主仓库里，或很贵）

| 路径 | 体积 | 为什么 |
|---|---:|---|
| `.music/` | 780 MB | 音MAD 的本地源（gitignore）。**按"只能拷"处理** —— 虽然原理上可重抓，但依赖第三方投稿仍在线上，见 §1.4 |
| `local-source.toml` | 4 KB | 本机助手配置（gitignore）。内容 20 行，也可照数据仓库的 `local-source.toml.example` 重建（默认位置 `data/otomads/`，或 `$OTOMADS_DATA_DIR`） |
| `.ref/` | ~0.3 MB | 只剩 `notes/` 五份（S5 起 THBWiki 快照与上游克隆已删，有 URL 可随时重克隆） |
| `touhou-music-cards-otomads-data/` | 2.1 GB | 数据仓库的独立克隆（改数据、打 tag 用）。**可重新 clone**，但省事就拷 |
| `touhou-music-cards-custom-data/` | 42 MB | 同上（自定义数据） |
| `HANDOVER.md` · `UPDATING.md` · `local-docs/` | 很小 | 工作区根的文档。`UPDATING.md` 是**现行操作手册**，不在任何仓库里 |

> 只有主仓库走 git（已推到 GitHub）。上面这些**都不在主仓库里**（两个数据目录是各自的独立仓库）。
>
> 两个数据仓库**不再是 submodule**：主仓库按 env `OTOMADS_DATA_DIR` / `CUSTOM_DATA_DIR` 找它们，默认
> `data/otomads/`、`data/custom/`。只拷工作区根那两个克隆时，记得在新机器上设这两个 env（或把它们 clone 到默认位置）。

### 1.2 不要带（装了也用不了，或纯再生）

| 路径 | 体积 | 怎么办 |
|---|---:|---|
| `.uv/` · `tools/.venv/` · `data/*/tools/.venv/` | 23 MB | Linux venv ⇒ 重新 `uv sync` |

**下面这些已在 2026-09-28 就地删除，迁移时不必再考虑**（合计约 3.4 GB）：

| 已删 | 体积 | 怎么恢复 |
|---|---:|---|
| `.playwright-browsers/` | 964 MB | `pnpm exec playwright install chromium firefox`（见根 README §1） |
| `node_modules/` | 572 MB | `pnpm install` |
| `.ref/upstream-v3/` | 355 MB | `git clone https://github.com/lightbulb128/touhou-card-player-v3.git .ref/upstream-v3`（上游公开，本地所在提交 `af8b0aa` 在 `origin/main` 上） |
| 两个 `otomads-media.tar.gz` | 1.05 GB | `pnpm media:pack`，或 `gh release download media --pattern otomads-media.tar.gz -R Dustymind/touhou-music-cards-otomads-data`（数据仓库已公开，可匿名下） |
| `.pnpm-store/` · `dist/` · `test-results/` · 各 `.pytest_cache/` | ~1.6 MB | 各自重跑即自建 |
| 工作区根的 13 张一次性验证截图 | 2.9 MB | 一次性产物，无保留价值，**不恢复** |

**只保留不可再生的**：

- `.music/`（780 MB）—— 见 §1.4：**理论可重建，但没有把握**，所以留着。
- `.ref/notes/`（332 KB）—— 被 `src/game/rules.ts`、`src/i18n/localization.ts` 当**出处的依据**引用。
- （S5 起 `.ref/scripts/` 与 `.ref/thbwiki/`（45 份 Music Room 快照）都已删 —— 分类派生链整体退场；
  真要重推导就照 `docs/data-provenance.md` §3 重抓一轮）

### 1.4 `.music/` 为什么没删

`.music/` 里几乎没有"用户手工放的音频"：`incoming/` 只有一份说明用的 `README.txt`，780 MB 全是
`otomads/` 下抓取与裁剪的成品（191 个 mp3 + 8 个 1 MB 的 REAPER `peaks/` 缓存）。

它**在原理上完全可重建**：191 条曲目**每条都带 `source`**（36 条另带 `start_time`），
在主仓库根跑 `pnpm audio:fetch` 就能重新下载并按区间重裁 —— 这条命令用的
`--config local-source.toml` 里 `library.root = ".music"` 是**相对配置文件所在目录**解析的，
所以在主仓库根跑写的就是主仓库这份（在数据仓库里跑则写数据仓库那份，两份互相独立）。
数据仓库里还有**第二份拷贝**（898 MB，同样 191 个 mp3）。

但不删的理由是**重建依赖第三方**：源是 bilibili / YouTube 上的音MAD 投稿，被删除或设为私有的概率
不低，而且失效时**不会有任何提示**——重抓才发现少了。相比之下它只占 780 MB，
而迁移载荷总量已经是 GB 级，省这一份不划算。真要重抓，先 `pnpm audio:fetch --dry-run` 看能拿到几条。

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
| `[ -d … ] \|\| { echo …; exit 1; }` | `local` / `audio:*` / `media:*` | `node scripts/require-data.mjs otomads` |
| `[ -n "$VAR" ] \|\| { … }` | `media:pull` | `node scripts/require-env.mjs` |
| `PLAYWRIGHT_BROWSERS_PATH="$PWD/…" cmd` | `test*` / `e2e*` | `node scripts/run.mjs cmd`（它自己设） |
| `UV_CACHE_DIR=.uv/cache cmd` | 全部 `data:*` | 同上 |
| `cd data/otomads/tools && …`（`cd` 带斜杠，cmd 不认） | `local` / `audio:*` / `media:*` | `uv run --project $OTOMADS_DATA_DIR/tools`（`run.mjs` 补默认值） |
| `$VAR` 传参（POSIX 认 `$VAR`、cmd 认 `%VAR%`） | `media:pull` | `run.mjs` 自己展开 |

改法是四个 Node 帮助脚本（Node 本来就是硬前置），路径**一律从脚本自身位置推导**、
没有一个写死的绝对路径：

| 脚本 | 干什么 |
|---|---|
| `scripts/run.mjs <命令> [参数…]` | 设好 `PLAYWRIGHT_BROWSERS_PATH` / `UV_CACHE_DIR`（**已在环境里设过的不覆盖**）再 spawn；`$VAR` 由它展开；仅在 Windows 过 shell（`.cmd` 垫片需要），POSIX 走 `shell:false` 以**精确保留带空格的参数** |
| `scripts/require-data.mjs <otomads\|custom>` | 数据仓库不在场就 exit 1（位置 = env `OTOMADS_DATA_DIR` / `CUSTOM_DATA_DIR`，默认 `data/<mode>`） |
| `scripts/ensure-uv.mjs` | `pnpm install` 的 postinstall：PATH 上没有 uv 就下载官方发行包到仓库内 `.tools/`（`run.mjs` 会加进 PATH）；装不上即非 0 退出 |
| `scripts/require-env.mjs <变量> [提示]` | 变量没设就 exit 1 |

**所以不要**再配 `script-shell` 指向某个 bash 绝对路径 —— 那既硬编码、又把仓库绑到某个平台。
三种平台的跑法完全一致，且 Linux 侧已实测（见 §3）。

### 2.3 行尾：**别设 `core.autocrlf=true`**

仓库根的 `.gitattributes` 已把整仓钉成 LF（`* text=auto eol=lf`）。

为什么这条是硬的：生成物与真源要逐字节可复现（`pnpm gate` 在 CI 里做两次构建比对）。
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

### 2.5 装完却报 `ERR_MODULE_NOT_FOUND`（pnpm 退化成目录联接）

**症状**：`pnpm install` 成功，但 `pnpm build` / `pnpm dev` 报

`@
Cannot find package 'rollup' imported from …/node_modules/vite/dist/node/…
`@

**原因**：创建**符号链接**需要权限（管理员，或打开"开发者模式"）。没有权限时 pnpm 退化成
**目录联接（junction）**，而 **Node 的模块解析不解析联接** —— 实测同一路径
`fs.realpathSync`（JS 实现）返回顶层路径、`fs.realpathSync.native` 才落到
`node_modules/.pnpm/<pkg>@<ver>/node_modules/`；模块解析走前者，于是找不到那个包的**兄弟依赖**
（pnpm 默认不把传递依赖提升到顶层）。

**做法**（任选其一）：

`@powershell
# A. 扁平布局：不需要任何权限；代价是失去 pnpm 的严格隔离
pnpm install --frozen-lockfile --node-linker hoisted

# B. 打开 设置 → 系统 → 开发者选项，再用默认布局重装
`@

**本仓库刻意不把 `node-linker` 写进 `.npmrc`** —— 它是环境绕法，不是项目口径；
默认布局在有符号链接权限的机器上更好。

**另一条**：受限环境（沙箱 / `$HOME` 只读）里 pnpm 的**依赖构建脚本**可能因为拿不到管道而失败
（`spawn EPERM`，典型是 `esbuild` 的 postinstall）。此时加 `--ignore-scripts` ——
平台包（`@.gitignore`@ 里的 `.esbuild/win32-x64` 那类）照常安装，esbuild 的二进制来自它，通常仍可用。

## 3. 迁后自检

```bash
git config core.longpaths                # → true
node --version                           # → 24.x（fnm use 24；仓库没有版本文件）
pnpm install
pnpm typecheck
pnpm test:chromium                       # 先跑单引擎
pnpm gate                               # build + validate + notices 守卫 —— 行尾问题在这里暴露
pnpm exec playwright install             # 见 §2.4
```

数据管线那侧（Python）：

```bash
pnpm data:sync && pnpm data:test         # 期望全绿（条数见 docs/README.md 的现状表）
```

音MAD 相关的 e2e 要先起本地曲库助手：`pnpm local`（需要数据仓库在场：`OTOMADS_DATA_DIR` 或默认
`data/otomads`；再加 `.music/` 已拷过来）。

## 4. 平台差异速查

| 项 | Linux（旧） | Windows（新） |
|---|---|---|
| 脚本 shell | `/bin/sh` | Git Bash（靠 §2.2 指定） |
| uv 缓存 | `UV_CACHE_DIR=.uv/cache`（沙箱里 `$HOME` 只读） | 仍走仓库内缓存，但改由 `scripts/run.mjs` 设（`<仓库>/.uv/cache`），**不写进脚本**；已在环境里设过的不覆盖 |
| 浏览器 | 仓库内 `.playwright-browsers/` | 同左，但**要重装** |
| 长路径 | 无限制 | 需 `core.longpaths`（§2.1） |
| 大小写 | 敏感 | **不敏感** —— 本仓库已核过：**无仅大小写不同的路径**，安全 |
| pnpm 布局 | 符号链接 | 无符号链接权限时退化成**目录联接** ⇒ Node 解析不了、报 `ERR_MODULE_NOT_FOUND`，需 `--node-linker hoisted`（§2.5） |
