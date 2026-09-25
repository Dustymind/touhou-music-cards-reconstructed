# 曲包音频契约 v1（抓取与裁剪）

**状态：已实现**（D107）。字段与流程按用户 11 条答复定（见 §7）；实现结果与偏差见 §12。

对象：曲包**角色文件**（`<曲包根>/<曲包 id>/<角色 key>.toml`，一角色一份；清单只放 `[pack]` / `[[album]]`。音MAD 的根是数据 submodule `data/otomads/packs/`，见 D128）
的 `[[track]]` 新增三个键 —— `source`（抓取）、`start_time` / `stop_time`（裁剪）。
目的：音MAD 这类曲包曲目不必再手工下载、手工剪，改成"数据里写清来源与裁剪区间，一条命令产出可播放的音频"。

## 1. 字段

| 键 | 类型 | 语义 | 缺省 / 单侧 |
|---|---|---|---|
| `source` | http(s) URL | 该曲目的音频来源，交给 yt-dlp 抓取（任意 yt-dlp 支持的站点，不写死 B 站） | 缺省 ⇒ 视为"音频由人工放进曲库"，抓取命令跳过它 |
| `authors` | 字符串数组 | **多作者**（D135）：`authors = ["甲", "乙"]`。与 `author` 只能写一个 | 缺省 ⇒ 用 `author`（整串） |
| `start_time` | `HH:MM:SS.mmm` | 裁剪**开始**位置 | 缺省 = 文件开头；只给 `stop_time` 时按开头处理 |
| `stop_time` | `HH:MM:SS.mmm` | 裁剪**结束**位置 | 缺省 = 文件结尾；只给 `start_time` 时按结尾处理（即等效不裁） |

- `author` / `authors`：**成品文件名那一位**永远是整串 `作者 - 标题.mp3`（D95/D96 不能改）。
  `authors = ["甲", "乙"]` 会被规范化成 `author = "甲 & 乙"`，所以**两种写法在磁盘上完全等价** ——
  把一个老条目从整串改成数组**不需要重抓/重裁音频**。`author = "乙 & 甲"` 这种整串**不拆**：
  人名里也可能有 `&`，猜分隔符会拆错。
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
# 多作者这么写（等价于 author = "甲 & 乙"）：
# authors = ["甲", "乙"]
title = "无何有之棍 ~ Deep Silver"
extra = "角色曲"
source = "https://www.bilibili.com/video/BV1kw411q7S8"
start_time = "00:00:40.000"
stop_time = "00:01:10.000"
```

## 2. 存储布局

```
.music/otomads/<作者> - <标题>.mp3     ← 成品：运行时唯一被读到的文件（曲库助手扫的就是它）
.music/.raw/<key>.mp3                  ← 原始件：保留，改裁剪时从它重裁（**永远从原件裁** ⇒ 反复调区间不叠损）
.music/.state/otomads.json             ← 幂等状态：source / start / stop / **渲染口径** / 成品 hash / yt-dlp 版本
```

**必须注意**（会让计数和 e2e 一起错）：`otomads.local_source.scan_library()` 把**库根下的第一层目录名当专辑名**，
而且是 `os.walk` 递归 —— 库根是 `.music`（`local-source.toml`）。原始件若放在 `.music/raw/` 这种普通目录，
manifest 里就会多出 `album = "raw"` 的垃圾条目，**曲目计数直接变多**（音MAD 统计那条 e2e 就是拿 manifest 数的）。
因此：原始件放**点目录** `.music/.raw/`，**并且**给 `scan_library` 加一条"跳过任何点目录/点文件"的防线（两处都做）。

## 3. 命令与流程（独立命令，不进 `tmc.build`）

```bash
pnpm audio:fetch          # = cd data/otomads/tools && uv run python -m otomads.fetch_audio --config ../../../local-source.toml
```

参数（**不做** `--only <pack>`：现在只有一个曲包，多包时再加；真正有用的是按曲目筛）：

| 参数 | 作用 |
|---|---|
| `--track <子串>` | 只处理标题或作者含该子串的曲目（调某一首的 `start/stop` 时反复跑） |
| `--dry-run` | 只打印计划，不下载不裁剪 |
| `--force` | 忽略状态，重下重裁（怀疑源内容变了、但 URL 没变时用） |
| `--skip-update` | 检查不到 yt-dlp 新版时也继续（默认中止，见 §4） |
| `--jobs N` | 并发数（默认 4；1 = 串行）。下载/裁剪与之后的量响度共用（D132） |

1. **依赖检查**：`ffmpeg -version`（系统二进制，缺就报错并给出安装提示）；yt-dlp 走 uv 管（见 §4）。
2. **yt-dlp 更新**：`uv lock --upgrade-package yt-dlp && uv sync`，然后继续（见 §4 的失败与离线行为）。
3. **并发处理** `[[track]]`（`--jobs` 路）：状态命中就跳过 → 否则下载原件 → 按 §5 裁剪 → 写成品 + 状态。
   **顺序不保证**（按完成先后收），所以进度行是"完成即打印"的 `[n/总数]`。
   并发正确性靠三处：状态**先全部读进来**再进线程池（运行期只有写）、状态落盘加锁、
   `outputs` 登记表"认领 + 产出"在同一把锁里（同源同区间的曲目只裁一次，其余硬链接）。
4. **顺便量响度**（用户第 9 条）：先把本次**裁过/换过**的曲目从响度表的缓存里删掉（否则会沿用
   裁剪前的 dB ✗），再整体跑一次量响度，产出新的 `loudness/<包>.json`（数据仓库，D130）。
   实现上 `otomads.fetch_audio` 直接调用 `otomads.loudness`（`measure_loudness` 是同一核心的 CLI）。
   顺带修一个既有小毛病：`measuredDb` 里**已删除文件**的旧键从不清理，这次一并清掉。
5. **汇总报告**：成功 / 跳过 / 失败各多少条；有失败则以非 0 退出（但不中断其余曲目）。

**为什么并发在应用层而不是 yt-dlp 的开关上**（D132）：yt-dlp 的 Python API 是**按实例**的（一个
`YoutubeDL` 处理一条 URL），而 `--concurrent-fragments` 只并行 HLS/DASH 的**分片**流 —— bilibili 的音频
是**单个文件**直链，没有分片可并行。可测的账：`import yt_dlp` + `YoutubeDL()` ≈ 0.13 秒/首、
4 分钟 m4a 全量重编码 ≈ 1.0 秒/首、裁剪（解码后精确切 + V0 重编码，D142）≈ 0.4–0.6 秒/首
且**只有 16 首**带区间 ⇒ 86 首的**本地**开销合计约 30 秒（比 `-c copy` 多约 7 秒，就是那 16 首的差价），
其余全是网络（playurl 往返 + 音频本体），
而那段时间 CPU 空闲。所以重叠网络等待即收益；上限由带宽与 bilibili 的 412 风控决定（默认 4，先用它试）。

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
    需要强行继续时用显式逃生开关 `--skip-update`（默认不用，避免把"该升级没升级"的失败当成站点问题排查）。
- **任意站点**：命令只把 `source` 原样交给 yt-dlp，不硬编码 B 站；单条失败只跳过该条并计入汇总。
  哪些站点能抓到**取决于构建时的网络环境**（地区限制、登录 cookies、站点改版），
  这一点要写进主 `README.md` 的依赖说明里。
- 主 `README.md` 增加"音MAD 音频的抓取与裁剪"小节：`ffmpeg` + `yt-dlp`（经 uv）、命令、网络说明。

## 5. 裁剪（解码后精确切 + 重编码，D142）

```bash
# 两侧都给（BACK = min(0.5, start)）
ffmpeg -y -ss <start-BACK> -i <原件> -ss <BACK> -t <stop-start> -c:a libmp3lame -q:a 0 <成品>
# 只给 start_time（裁到结尾）：同上但省掉 -t
# 只给 stop_time：start = 0 ⇒ 没有回退、也没有输出侧那次 -ss，只留 -t <stop>
```

**为什么不能是 `-c copy`**（D107 原来选的就是它；D142 推翻，用户 2026-09-25 报"音频裁剪有问题"）。
`-c copy` 是流拷贝：切点只能落在 mp3 **帧边界**上（48 kHz 帧长 24 ms、44.1 kHz 26 ms），
而 `start_time` 是拿来**点拍**的毫秒值。实测三处缺陷：

| # | 缺陷 | 实测证据 |
|---|---|---|
| 1 | 起点只能就近取整到帧边界 | 真曲目 `1.388s` 的成品偏 **+90.431 ms**；`2.339s` 偏 +1 ms；44.1 kHz 合成用例偏 −9.5 ms；源里有安静段时（码率起伏 ⇒ 定位按字节估算）见过 −78 ms |
| 2 | 容器时长 ≠ `stop − start` | +8…+32 ms 偏长；`1.388s` 那首偏**短** 90 ms |
| 3 | **头一帧解不出来** | 输入定位（`-ss` 在 `-i` **前**）让 mp3 解码器**冷启动**，而 mp3 的帧要用**比特池**（前几帧的主数据）——冷启动那一帧解不出内容。实测成品第 0 帧 RMS 只有真值的 **2%**（11307 vs 11311 是修好的样子；坏的时候是 0~65），有时整整一帧（24 ms）静音 ⇒ 听感就是"开头掉了一小块" |

**⚠ 第 3 条 `-c copy` 与朴素的"解码后重编码"都会中**（只要 `-ss` 放在 `-i` 前），所以修法不是
"换个编码器"就完事。三段式按这个顺序解决：

1. `-ss <start−0.5s>` —— 粗定位（仍然很快，不用从头解码）；
2. 输出侧 `-ss 0.5s` —— 丢掉预热段。它在 `-i` **之后**，所以不触发解码器冷启动，只丢**已经解出来**的
   样本；被丢掉的这 0.5 秒正好把冷冷解出来的头几帧一起丢掉（比特池喂热了）⇒ 起点回到**采样点级**精确；
3. `-t <时长>` —— 截时长（`duration is None` 时不给，交给 ffmpeg 读到尾）；
4. `-c:a libmp3lame -q:a 0` —— LAME **V0**（≈245 kbps VBR）重编码。

**修完的实测**（16 首真曲目全部重裁）：

- 起点偏差 **0.000 ms**；解码时长**恰等于** `stop − start`（16 首误差 ≤ 0.007 ms）；
- 首帧 RMS 与真值一致（冷启动那一帧回来了）；逐样本残差**比 `-c copy` 还小**；
- 代价一：**二次有损**（`.raw` 本身已是 mp3 ⇒ 这一遍是第二代；同一首实测逐样本残差 5.7%）。
  用最高档 V0 把这一遍压到最小，且**永远从 `.raw/` 重裁**，所以反复调区间也不会叠损；
- 代价二：每首 ≈ 0.4–0.6 秒（`-c copy` 是 0.06 秒），只对**带区间的曲目**付 —— 现在 16 首；
- 体积几乎不变：同一首 1581 vs 1586 KiB、另一首 967 vs 980 KiB。

**不重采样**：源是 44.1 / 48 kHz（84 份原件里 38 / 46），都是 mp3 原生支持的采样率 ——
再插一道 SRC 只会白添失真（ffmpeg 在编码器不支持某个采样率时会自动插重采样，这里用不上）。

**渲染口径进状态签名**（`RENDER_VERSION = "encode-v1"`）：换了裁剪实现，旧状态里的 `outHash`
仍然对得上，幂等检查会把 16 首全部跳过 ✗ ⇒ 必须让口径参与 `fresh` 判定，改一次实现就自动重裁一遍。
不裁剪的曲目是"与原件同一 inode 的硬链接"，字节与口径无关 ⇒ 它的签名位留空（否则改裁剪会连带
70 首未裁剪的曲目全部重链 + 重量响度）。

- 成品**统一 mp3**：`yt-dlp -x --audio-format mp3 --audio-quality 0`。原因是现有的三处都写死了 `.mp3` ——
  `local_source.media_path()` 拼的是 `/media/<专辑>/<曲名>.mp3`、manifest 里的 URL 也来自它、
  响度脚本只 `glob("*.mp3")`。
- 用 `-t <时长>` 而不是 `-to <终点>`：`-ss` 放在 `-i` **之前**时 `-to` 的时间基准容易踩坑，`-t` 无歧义。
- 成品文件名保持 `<作者> - <标题>.mp3`（见 §6 第 4 条，**不能改名**）。
- 裁完用 `ffprobe -show_format` 断言成品时长 ≈ `stop − start`（现在是"≈ 精确等于"）。

## 6. 与既有机制的接口（四条硬约束）

1. **解析**：`packs.py` 必须显式读这三个键（现在未知键静默丢弃）。
2. **`contentHash` 纳入裁剪与来源**（用户第 4 条决定）：`build.py` 的 `content_hash(characters, albums)`
   扩成把每条的 `(album, title, start_time, stop_time, source)` 也算进去 —— 于是"两端裁剪/抓取不同"
   会在**握手期**被拒绝，而不是等抢答时发现起点不一样。代价：改一条 trim 就要两端同步数据（本来也该如此）。
3. **响度缓存必须失效**：`otomads.measure_loudness`（数据仓库）的缓存键是**文件名 stem**
   （`p.stem in cache` 就跳过）。裁剪后文件名不变 ⇒ 会沿用**裁剪前**的 dB，逐曲均衡就错了。
   裁剪流程要删掉该曲目的缓存键，并重跑量响度；`loudness/<包>.json`（数据仓库）是**跟踪文件**，与音频一起提交。
4. **文件名不许改**：manifest 匹配（`sources.ts` 的 `normalizeTitle` + "以 `作者 - 曲名` 结尾"兜底）、
   `loudness` 表的键、单曲模式存档，全都建立在 `<作者> - <标题>.mp3` 上。
5. **响度按源（D130）**：响度表是**每个源自己的表** —— 源注册表里的可选 `loudness` 键（路径相对该源所在仓库的根）。
   表由**源的所有者**生成（音MAD 在数据仓库 `tools/`）；主仓库 `tmc.build` 只按注册表声明的路径把它
   拷进 `public/data/<mode>/`。运行时 `SourceRecord.loudnessUrl`（相对数据集目录）交给播放层，
   播放层按**解析到的 sourceId** 取表；**没有表的源**（三个远程镜像）系数按 1。
   全局那一份 `public/data/loudness.json` 已退场。
6. **表跟着源部署（D139）**：源还可以在自己的 **manifest** 里用 `loudness` 键声明表 —— 路径**相对 manifest 自身**
   （例如 `loudness/otomads.json`）。前端**优先**按它取，没声明才回落到第 5 条的 `SourceRecord.loudnessUrl`
   （数据集目录）。这样"源自包含"：表跟 `manifest.json` / `media/` 一起走，源换宿主（R2 / 别的域名 /
   独立静态站）**不用改应用**。现状：数据仓库 `stage_media.pack` 把表打进归档并声明它；
   **本机助手故意不声明**（它只发 `/manifest.json` 与 `/media/*`、不发响度表），所以本地开发与单端口形态
   照旧走回落那条 —— 两种形态都不会 404。

## 7. 决策记录（用户答复）

| # | 议题 | 决定 |
|---|---|---|
| 1 | 抓取时机 | **独立命令**（`pnpm audio:fetch`），不塞进 `tmc.build` / `pnpm build` |
| 2 | 原始件 | **保留**（`.music/.raw/`），改裁剪时从原件重裁 |
| 3 | 裁剪精度 | ~~`-c copy`（无损、快、误差 ≤ 一帧）~~ → **D142 改成"解码后精确切 + 重编码"**（用户 2026-09-25 报"裁剪有问题"；三处实测缺陷见 §5） |
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
- **裁剪正确性**：`ffprobe` 时长 ≈ `stop − start`（D142 之后是**精确等于**，不再有 ±一帧）；
  `ffmpeg -encoders` 里必须有 libmp3lame（重编码要用）；真跑一条**白噪用例**断言"解码时长恰是请求时长"
  且"第 0 帧不是坏的"（`test_render_trims_at_the_sample_and_keeps_the_first_frame`）。
- **响度**：裁剪后 `loudness.json` 中该键刷新（用例守住"裁了必须失缓存"）；未被裁的曲目键值不变。
- **硬链接**：重复 `source` 的两条成品 `os.stat().st_ino` 相同、目录磁盘占用不翻倍；
  重裁其中一条后两条内容**分道扬镳**（证明"写临时文件 + 原子改名"没被破坏）；不支持硬链接时回落复制并有提示。
- **构建**：`pnpm data:check` 仍绿且仍**不依赖**音频与机器配置；`contentHash` 随 trim 变化。
- **端到端**：`otomads` 模式能播裁好的曲目；manifest 计数仍为 86（验证 `.raw/` 没被扫进 manifest）。
- **文档**：主 `README.md`（依赖与命令）、`data/packs/README.md`（新字段）、`docs/DECISIONS.md`（一条决定）。

## 11. 本期明确不做

- **`--only <pack>`**：只有一个曲包时没有意义（多包时再加）；改用 `--track <子串>` 做"只调一首"。
- **一源多段**：用户第 7 条不需要；重复 `source` 只告警并复用原件。
- **sample-accurate 裁剪**：~~要重编码、二次有损，用户第 3 条选了 `-c copy`~~ —— **D142 已做**
  （`-c copy` 的实测缺陷见 §5；用户 2026-09-25 改口径）。
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

## 13. D142：裁剪改成"解码后精确切 + 重编码"（2026-09-25）

**需求**（用户）："现有的音频裁剪有问题，能否使用重采样方式裁剪音频" —— 即放弃 `-c copy` 流拷贝。
根因、修法与实测都在 §5，这里只记**落到代码与数据上的改动**：

| 位置 | 做了什么 |
|---|---|
| `tools/src/otomads/fetch_audio.py` | `render()` 改成三段式（`-ss <start−0.5>` 粗定位 → 输出侧 `-ss 0.5` 丢预热段 → `-t` → `libmp3lame -q:a 0`）；新增常量 `TRIM_ENCODER` / `TRIM_WARMUP` / `RENDER_VERSION` / `LINK_RENDER`；状态签名加 `render` 字段 |
| 同上（幂等） | **渲染口径进 `fresh` 判定** —— 否则旧 `outHash` 仍然匹配，16 首会被全部跳过（"改了代码但音频没变"）。未裁剪的曲目签名位留空，不被连累 |
| `tools/tests/test_pack_audio.py` | **+5**（100 → 105）：命令形状（不许 `-c copy`、两次 `-ss` 的位置与数值、`-t`、编码器）、回退在文件头截断、只给 start 时不给 `-t`、渲染口径作废旧裁剪而不作废硬链接、**真跑 ffmpeg 的白噪精度用例**（时长恰为请求值 + 首帧不许是坏的） |
| `.music/` 本地曲库 | 16 首带区间的成品**全部重裁**（从各自的 `.raw/` 离线重裁，不重新下载）；状态里全部记成 `render = "encode-v1"` |
| `loudness/otomads.json`（数据仓库） | 重裁触发的那 2 首重量后差 0.1 dB ⇒ 表改动 4 行；其余 14 首量出来一模一样 ⇒ 表不动 |
| `contentHash` | **不变**（`start_time`/`stop_time`/`source` 一个字没动 —— 改的是"怎么裁"，不是"裁哪里"）⇒ 联机两端不用一起更新 ✓ |

**反证**（两条都真跑过，确认用例是有效的守卫）：

- 把 `TRIM_ENCODER` 改回 `["-c", "copy"]` 并去掉回退 ⇒ 3 条红：
  `test_render_with_trim_decodes_and_reencodes`、`..._clamps_the_warmup_at_the_file_start`、
  `..._trims_at_the_sample_and_keeps_the_first_frame`（后者直接报出成品时长 1.020979 s，比请求的 1.000 s
  多 **1007 个采样**）；
- 把 `render` 从签名里摘掉 ⇒ `..._render_version_invalidates_previous_trims_but_not_link_only_tracks` 红。

**发布链路**：`otomads-media.tar.gz` 已用新的 16 首重打并**换掉 Release 资产**（`gh release upload --clobber`）：

| | 大小 | sha256 |
|---|---|---|
| 旧 | 336,835,277 B | `74e096756c5e9989dcfa7644acae9fe3463a7a9118b89456cba1cd7018c78e02` |
| 新 | **336,719,238 B** | **`f80fa36fbcf31196df24484e0577dbe615e21e8f85e16ce686dae4e7421cf57c`** |

换之前把归档解出来与 `.music/otomads/` 做了**全量逐字节比对**（86 首全等，不是抽样），
且上传后 GitHub 报的 digest 与本地算的一致 ✓。**主仓库的 `th09.5-260925` tag 没动**
（它仍是 `gh release create` 建的那个轻量 tag `295a3fc`；换的只是资产）。

**⚠ 还没做**：**CDN 上那份仍是旧音频** —— 静态音MAD 源按 D138/D141 的裁定是**手动部署**
（`pnpm media:pack` → 把归档解到宿主根目录：`manifest.json` + `media/otomads/*.mp3` + `loudness/otomads.json`），
本机没有 wrangler / rclone / aws 之类的凭据可用。实测 CDN 与本地新音频的差异（2026-09-25）：
`【原汤化原食】已经只能听见歌声了` 在 CDN 上是 **1,624,445 B**（旧）而新的是 **1,619,501 B**；
CDN 的 `loudness/otomads.json` 里那 2 首也还是旧 dB。**CDN 没重铺之前，线上播放的仍是有 90 ms 偏差的旧版。**

根治二次有损的正路是"下载时保留原始容器（m4a/opus）、裁剪与转 mp3 合并成一遍"（见 §11 的非 mp3 容器那条）。
