# 曲包音频契约 v1（抓取与裁剪）

**状态：已实现**（D107）。字段与流程按用户 11 条答复定（见 §7）；实现结果与偏差见 §12。

对象：曲包**角色文件**（`<曲包根>/<曲包 id>/<角色 key>.toml`，一角色一份；清单只放 `[pack]` / `[[album]]`。音MAD 的根是数据 submodule `data/otomads/packs/`，见 D128）
的 `[[track]]` 新增三个键 —— `source`（抓取）、`start_time` / `stop_time`（裁剪）。
目的：音MAD 这类曲包曲目不必再手工下载、手工剪，改成"数据里写清来源与裁剪区间，一条命令产出可播放的音频"。

## 1. 字段

| 键 | 类型 | 语义 | 缺省 / 单侧 |
|---|---|---|---|
| `source` | http(s) URL | 该曲目的音频来源，交给 yt-dlp 抓取（任意 yt-dlp 支持的站点，不写死 B 站） | 缺省 ⇒ 视为"音频由人工放进曲库"，抓取命令跳过它 |
| `start_time` | `HH:MM:SS.mmm` | 裁剪**开始**位置 | 缺省 = 文件开头；只给 `stop_time` 时按开头处理 |
| `stop_time` | `HH:MM:SS.mmm` | 裁剪**结束**位置 | 缺省 = 文件结尾；只给 `start_time` 时按结尾处理（即等效不裁） |

- 两个时间键**都为空 ⇒ 不裁剪**（不调 ffmpeg，原件直接作为成品）。
- 两个键**都只在抓取/裁剪期存在**：运行时（`characters.json` / 前端 / 播放器）**不读它们**，部署时播放的就是裁好的文件。
- 校验（`tmc.packs.load_packs` + `tmc.validate.check_packs`）：格式必须严格匹配 `^\d{1,2}:\d{2}:\d{2}\.\d{3}$`；
  两者都在时必须 `stop > start`；`stop` 超过文件时长给**警告**（ffmpeg 会静默截断）；`source` 必须是 `http(s)://`。
- 已知坑：`tools/src/tmc/packs.py` 现在**只读它认识的键，未知键静默丢弃** —— 所以必须显式解析这三个键，
  否则 TOML 里写了也等于没写。

```toml
# data/otomads/packs/otomads/cirno.toml（文件名必须等于 key；曲目的角色由它决定）
key = "cirno"

[[track]]
album = "otomads"
author = "鞍山侯国玉电乐团"
title = "无何有之棍 ~ Deep Silver"
extra = "角色曲"
source = "https://www.bilibili.com/video/BV1kw411q7S8"
start_time = "00:00:40.000"
stop_time = "00:01:10.000"
```

## 2. 存储布局

```
.music/otomads/<作者> - <标题>.mp3     ← 成品：运行时唯一被读到的文件（曲库助手扫的就是它）
.music/.raw/<key>.<ext>                ← 原始件：保留，改裁剪时从它重裁（不叠损、不二次裁剪）
.music/.state/otomads.json             ← 幂等状态：source / 原件 hash / start / stop / 成品 hash / yt-dlp 版本
```

**必须注意**（会让计数和 e2e 一起错）：`tmc.local_source.scan_library()` 把**库根下的第一层目录名当专辑名**，
而且是 `os.walk` 递归 —— 库根是 `.music`（`local-source.toml`）。原始件若放在 `.music/raw/` 这种普通目录，
manifest 里就会多出 `album = "raw"` 的垃圾条目，**曲目计数直接变多**（音MAD 统计那条 e2e 就是拿 manifest 数的）。
因此：原始件放**点目录** `.music/.raw/`，**并且**给 `scan_library` 加一条"跳过任何点目录/点文件"的防线（两处都做）。

## 3. 命令与流程（独立命令，不进 `tmc.build`）

```bash
pnpm audio:fetch          # = cd tools && UV_CACHE_DIR=.uv/cache uv run python -m tmc.fetch_audio
```

参数（**不做** `--only <pack>`：现在只有一个曲包，多包时再加；真正有用的是按曲目筛）：

| 参数 | 作用 |
|---|---|
| `--track <子串>` | 只处理标题或作者含该子串的曲目（调某一首的 `start/stop` 时反复跑） |
| `--dry-run` | 只打印计划，不下载不裁剪 |
| `--force` | 忽略状态，重下重裁（怀疑源内容变了、但 URL 没变时用） |
| `--offline-ok` | 检查不到 yt-dlp 新版时也继续（默认中止，见 §4） |

1. **依赖检查**：`ffmpeg -version`（系统二进制，缺就报错并给出安装提示）；yt-dlp 走 uv 管（见 §4）。
2. **yt-dlp 更新**：`uv lock --upgrade-package yt-dlp && uv sync`，然后继续（见 §4 的失败与离线行为）。
3. **逐条处理** `[[track]]`：状态命中就跳过 → 否则下载原件 → 按 §5 裁剪 → 写成品 + 状态。
4. **顺便量响度**（用户第 9 条）：先把本次**裁过/换过**的曲目从 `loudness.json` 的缓存里删掉（否则会沿用
   裁剪前的 dB ✗），再整体跑一次量响度，产出新的 `public/data/loudness.json`。
   实现上把 `tools/measure_loudness.py` 的核心搬进 `tools/src/tmc/loudness.py`（可被调用），
   原脚本保留成薄封装（D102 里那条命令照旧可用）。顺带修一个既有小毛病：`measuredDb` 里**已删除文件**的旧键
   从不清理，这次一并清掉。
5. **汇总报告**：成功 / 跳过 / 失败各多少条；有失败则以非 0 退出（但不中断其余曲目）。

**`tmc.build` / `pnpm data:check` 保持离线和机器无关**：只做 TOML 的**结构校验**，**不检查音频文件是否存在**。
理由：曲库根在 `local-source.toml` 里，而那个文件是 gitignored 的**机器相关**配置 —— 让构建依赖它，
CI 与别人的机器会直接失败。"音频齐不齐"由 `audio:fetch` 自己把关（它本来就需要那份配置）。

## 4. 依赖：yt-dlp 与 ffmpeg

| 依赖 | 管理方式 | 说明 |
|---|---|---|
| `yt-dlp` | 加进 `tools/pyproject.toml` 的 `dependencies`，用 **Python API**（`yt_dlp.YoutubeDL`）而不是 subprocess | "与 uv 一起管理"；`uv.lock` 是**跟踪文件**，升级后会变脏，需一并提交 |
| `ffmpeg` | 系统二进制，无法用 uv 管 | 命令启动时探测；缺失/过旧 ⇒ 明确报错 |

- **运行前检查更新（并更新）才能继续**：先 `uv lock --upgrade-package yt-dlp`，再 `uv sync`，成功才继续抓取。
- **网络环境**（用户提醒）：更新检查本身要联网。
  - 能查到新版 → 自动升级 → 继续；
  - **连不上 PyPI** → 打印"无法检查 yt-dlp 更新（离线/受限网络），本次抓取可能因站点改动而失败"并**中止**；
    需要强行继续时用显式逃生开关 `--offline-ok`（默认不用，避免把"该升级没升级"的失败当成站点问题排查）。
- **任意站点**：命令只把 `source` 原样交给 yt-dlp，不硬编码 B 站；单条失败只跳过该条并计入汇总。
  哪些站点能抓到**取决于构建时的网络环境**（地区限制、登录 cookies、站点改版），
  这一点要写进主 `README.md` 的依赖说明里。
- 主 `README.md` 增加"音MAD 音频的抓取与裁剪"小节：`ffmpeg` + `yt-dlp`（经 uv）、命令、网络说明。

## 5. 裁剪（`-c copy`，不重编码）

```bash
# 两侧都给
ffmpeg -y -ss <start> -i <原件> -t <stop-start> -c copy <成品>
# 只给 start_time（裁到结尾）
ffmpeg -y -ss <start> -i <原件> -c copy <成品>
# 只给 stop_time（从开头裁）
ffmpeg -y -i <原件> -t <stop> -c copy <成品>
```

- 成品**统一 mp3**：`yt-dlp -x --audio-format mp3 --audio-quality 0`。原因是现有的三处都写死了 `.mp3` ——
  `local_source.media_path()` 拼的是 `/media/<专辑>/<曲名>.mp3`、manifest 里的 URL 也来自它、
  响度脚本只 `glob("*.mp3")`。已经是 mp3 的源不会被重编码；其它容器（m4a/opus/webm）会在**下载这一步**
  转一次（这一步之后 `-c copy` 裁剪仍然不重编码）。
- 用 `-t <时长>` 而不是 `-to <终点>`：`-ss` 放在 `-i` **之前**时 `-to` 的时间基准容易踩坑，`-t` 无歧义。
- `-c copy` = 流拷贝：不重编码、无损、快；代价是切点落在**帧边界**（mp3 帧约 26ms @44.1kHz），
  即误差 ≤ 一帧。这是用户选定的精度（要 sample-accurate 就得重编码，二次有损，不做）。
- 成品文件名保持 `<作者> - <标题>.mp3`（见 §6 第 4 条，**不能改名**）。
- 裁完用 `ffprobe -show_format` 断言成品时长 ≈ `stop − start`。

## 6. 与既有机制的接口（四条硬约束）

1. **解析**：`packs.py` 必须显式读这三个键（现在未知键静默丢弃）。
2. **`contentHash` 纳入裁剪与来源**（用户第 4 条决定）：`build.py` 的 `content_hash(characters, albums)`
   扩成把每条的 `(album, title, start_time, stop_time, source)` 也算进去 —— 于是"两端裁剪/抓取不同"
   会在**握手期**被拒绝，而不是等抢答时发现起点不一样。代价：改一条 trim 就要两端同步数据（本来也该如此）。
3. **响度缓存必须失效**：`tools/measure_loudness.py` 的缓存键是**文件名 stem**
   （`p.stem in cache` 就跳过）。裁剪后文件名不变 ⇒ 会沿用**裁剪前**的 dB，逐曲均衡就错了。
   裁剪流程要删掉该曲目的缓存键，并重跑量响度；`public/data/loudness.json` 是**跟踪文件**，与音频一起提交。
4. **文件名不许改**：manifest 匹配（`sources.ts` 的 `normalizeTitle` + "以 `作者 - 曲名` 结尾"兜底）、
   `loudness.json` 的键、单曲模式存档，全都建立在 `<作者> - <标题>.mp3` 上。

## 7. 决策记录（用户答复）

| # | 议题 | 决定 |
|---|---|---|
| 1 | 抓取时机 | **独立命令**（`pnpm audio:fetch`），不塞进 `tmc.build` / `pnpm build` |
| 2 | 原始件 | **保留**（`.music/.raw/`），改裁剪时从原件重裁 |
| 3 | 裁剪精度 | **`-c copy`**（无损、快、误差 ≤ 一帧） |
| 4 | 一致性 | trim 参数（与 source）**进 `contentHash`** |
| 5 | yt-dlp 更新 | **自动升级并继续**（`uv lock --upgrade-package yt-dlp` + `uv sync`） |
| 6 | 站点范围 | **任意 yt-dlp 支持的站点**；提示"能否抓到取决于构建时网络环境" |
| 7 | 一源多段 | **不需要**：一条 `source` 对应一条曲目（重复 `source` 只告警，抓取时复用原件） |
| 8 | 随机起播与裁剪 | **不是问题**：两个时间键只在抓取/裁剪期存在，运行时不读；随机起播按成品时长照旧（与其它曲目同规则，本次不特殊处理） |
| 9 | 量响度 | **抓取命令顺带跑**（裁过/换过的曲目先失效缓存，再整体重量） |
| 10 | 重复 `source` | **硬链接**（同一 inode，不占额外磁盘）；代价是**绝不能就地写文件**，见 §8 |
| 11 | 筛选参数 | **不做** `--only <pack>`（只有一个包，多包时再加）；改用 `--track <子串>` |

## 8. 幂等规则

| 情况 | 行为 |
|---|---|
| 状态里有 `source`，原件存在，`start/stop` 未变，成品存在且 hash 一致 | **跳过** |
| `start/stop` 变了，原件在 | **重裁**（从原件），不重新下载 |
| 原件丢了或 `source` 变了 | **重新下载**，再裁 |
| 没有 `source`，成品存在 | 跳过（人工放的文件，不碰） |
| 没有 `source`，成品也不存在 | 汇总里列为"缺失"，非 0 退出，并提示"该曲目要么补 `source`，要么手工放入曲库" |

**重复 `source` 用硬链接**（用户第 10 条）：

- 同一 `source` 的两条曲目：原件只下一份（`.music/.raw/<key>.<ext>`），成品按各自的名字生成，
  第二条起用 `os.link()` 指向第一份成品（同一 inode，磁盘占用为 0）。
- **硬链接的硬约束：永远不许就地写文件。** 任何写成品的路径都必须"写临时文件 → `os.replace()` 原子改名"，
  否则就地写会把共享 inode 的另一首也改掉。原子改名天然解决了"同一源、不同 trim"：重裁 A 会换成新 inode，
  B 仍指向旧内容（B 的状态没变，行为正确）。
- 平台差异：硬链接要求同一文件系统（`.raw` 与成品都在 `.music/` 下 ✓）；不支持硬链接的文件系统
  （FAT/exFAT、部分网络盘）回落成复制，并**打印一行提示**（不静默）。
- 量响度按文件名 stem 缓存，硬链接的重复曲目内容相同 ⇒ 各算一次即可（结果必然一致）；重裁 A 只失效 A 的键，B 的键仍然有效。

## 9. 迁移：86 条现有音MAD 的 `source`（已完成 84/86）

BV 号原先散在三处：`tools/ingest_otomads.py` 的 `ROWS`（61 条）、`tools/ingest_rows_*.json`（30 条）、
以及**音频文件自己的 ID3 标签**（`purl` / `comment`，24 条）—— 三处并集、按
`(标题, 作者)` 做 NFKC 归一化匹配后回填：

```
候选来源 84 组 | TOML 曲目 86 条 | 回填 84 | 仍缺 2
   缺：(无作者) 最终鬼畜蓝蓝路 (2023 Remix)     ← 用户本地 wav，本来就没有来源
   缺：y的自然对数 对了 向北邮出发吧             ← 需要手工补 source
```

两条缺失的曲目**不阻塞**：没有 `source` 时命令按"人工入库"处理（文件在就跳过，不在就报 missing）。
以后补 `source` 只需在 TOML 里加一行。回填后 `ingest_otomads.py` 仍是历史脚本，但 **TOML 才是真相源**。

## 10. 验证计划

- **Python 单测**：时间格式（合法/非法/缺毫秒/超 24 小时）、单侧语义、`stop ≤ start` 报错、
  未知键不再被静默丢弃、`source` scheme、重复 `source` 告警。
- **幂等**：连跑两次零下载；只改 `stop_time` ⇒ 从原件重裁且成品变化；改回原值 ⇒ 与首次产物一致（hash 相同）。
- **裁剪正确性**：`ffprobe` 时长 ≈ `stop − start`（±一帧）；比对 codec/bitrate 证明未重编码。
- **响度**：裁剪后 `loudness.json` 中该键刷新（用例守住"裁了必须失缓存"）；未被裁的曲目键值不变。
- **硬链接**：重复 `source` 的两条成品 `os.stat().st_ino` 相同、目录磁盘占用不翻倍；
  重裁其中一条后两条内容**分道扬镳**（证明"写临时文件 + 原子改名"没被破坏）；不支持硬链接时回落复制并有提示。
- **构建**：`pnpm data:check` 仍绿且仍**不依赖**音频与机器配置；`contentHash` 随 trim 变化。
- **端到端**：`otomads` 模式能播裁好的曲目；manifest 计数仍为 86（验证 `.raw/` 没被扫进 manifest）。
- **文档**：主 `README.md`（依赖与命令）、`data/packs/README.md`（新字段）、`docs/DECISIONS.md`（一条决定）。

## 11. 本期明确不做

- **`--only <pack>`**：只有一个曲包时没有意义（多包时再加）；改用 `--track <子串>` 做"只调一首"。
- **一源多段**：用户第 7 条不需要；重复 `source` 只告警并复用原件。
- **sample-accurate 裁剪**：要重编码、二次有损，用户第 3 条选了 `-c copy`。
- **运行时抓流**（浏览器直接取 B 站音频）：见之前那份可行性分析 —— 需要服务端解析 + 转封装，
  本次只做"构建期抓取 + 本地成品"，运行时的接口形态不变（仍是 manifest + `/media`）。
- **非 mp3 容器**：`media_path()` 写死 `.mp3`；要支持别的容器得先改成从 manifest 读扩展名，
  并让响度脚本的 glob 跟着变 —— 单独排期。

## 12. 实现结果（D107）

| 位置 | 做了什么 |
|---|---|
| `tools/src/tmc/packs.py` | 解析三个新键 + **未知键直接报错**；纯函数 `parse_time` / `trim_seconds` / `audio_filename` / `source_key` / `audio_descriptors` |
| `tools/src/tmc/validate.py` | 曲包检查新增时间格式、区间先后、`source` scheme、重复 `source` 告警；报告加"带 source / 带裁剪"计数 |
| `tools/src/tmc/build.py` | `contentHash` 纳入曲包音频描述符 `[专辑, 曲名, start, stop, source]` |
| `tools/src/tmc/local_source.py` | `scan_library` 跳过点目录/点文件（`.raw/`、`.state/` 不进 manifest） |
| `tools/src/tmc/loudness.py` | 从 `measure_loudness.py` 抽出的可调用核心；顺手修掉"`reset` 的键没被删"与"已删文件的旧键不清" |
| `tools/src/tmc/fetch_audio.py` | 新增：依赖检查、yt-dlp 更新策略、幂等状态、下载、裁剪、硬链接去重、顺带量响度、汇总与退出码 |
| `tools/pyproject.toml` + `uv.lock` | 加 `yt-dlp` 依赖（uv 管理；升级会改 lock，属预期） |
| `data/packs/otomads.toml` | 84 条回填 `source`（见 §9；当时还是单文件 —— D109 之后曲目在 `data/packs/otomads/*.toml` 一角色一份，见 `data/packs/README.md`） |
| `public/data/index.json` | `contentHash` 从 `d5fd15d4…` 变成 `93bdb1a9…` —— 这正是"音频口径进握手"的效果 |
| 测试 | `tools/tests/test_pack_audio.py`；Python 测试 33 → **71** |

**实测**（真抓一首 `thwy - 岁月`，`BV18t411F71d`）：

```
--dry-run         → dry 1（打印计划与来源）
抓取              → fetched 1；成品与原件同一 inode（硬链接 874494，链接数 2）；时长 63.338667 不变
临时 5s–15s 再抓   → trimmed 1；时长 10.008s（10s + 一帧）；mp3 / 235kbps ≈ 源 232kbps ⇒ 未重编码；
                    原子改名后成品换新 inode、原件不动；响度该曲重量（−16.6 → −16.3），表仍是 86 条
再跑一次          → skip 1（"已是目标状态"）
去掉区间再跑       → fetched 1（回到整首并重新硬链接到原件）
```

**与设计稿的偏差**：`--only <pack>` 按 §11 不做；除 `--track` 外没有别的筛选；
`source` 覆盖 84/86（两条见 §9，其中一条本来就是本地文件）。
