# 曲包音频契约 v1（抓取与裁剪）

**状态：已实现**（D107）。字段与流程按用户 11 条答复定（见 §7）；实现结果与偏差见 §12。

对象：曲包**角色文件**（`<曲包根>/<曲包 id>/<角色 key>.toml`，一角色一份；清单只放 `[pack]` / `[[album]]`。音MAD 的根在数据仓库 `<OTOMADS_DATA_DIR>/packs/`，默认 `data/otomads/packs/`；D128 拆出，S3 起不再是 submodule）
的 `[[track]]` 新增三个键 —— `source`（抓取）、`start_time` / `stop_time`（裁剪）。（D153 之后同一个 `[[track]]` 里
还多了一个 `cover`（卡面素材），它不属于音频契约，但列在同一张字段表里。）
目的：音MAD 这类曲包曲目不必再手工下载、手工剪，改成"数据里写清来源与裁剪区间，一条命令产出可播放的音频"。

## 1. 字段

| 键 | 类型 | 语义 | 缺省 / 单侧 |
|---|---|---|---|
| `source` | http(s) URL | 该曲目的音频来源，交给 yt-dlp 抓取（任意 yt-dlp 支持的站点，不写死 B 站）。**一条 `source` = 一首曲目** | 缺省 ⇒ 视为"音频由人工放进曲库"，抓取命令跳过它 |
| `cover` | https URL | 该曲目的**卡面素材**：B 站封面直链（D153；由数据仓库 `otomads.fetch_covers` 生成，**手改即覆写**）| 缺省 ⇒ 这个角色要么整组都没有（回落原版卡面）、要么报错（**全有或全无**，见下） |
| `authors` | 字符串数组 | **多作者**（D135）：`authors = ["甲", "乙"]`。与 `author` 只能写一个 | 缺省 ⇒ 用 `author`（整串） |
| `start_time` | `HH:MM:SS.mmm` | 裁剪**开始**位置 | 缺省 = 文件开头；只给 `stop_time` 时按开头处理 |
| `stop_time` | `HH:MM:SS.mmm` | 裁剪**结束**位置 | 缺省 = 文件结尾；只给 `start_time` 时按结尾处理（即等效不裁） |
| `bitrate` | 整数 kbps（32–320） | 成品**CBR 码率**：整首重编码（可与裁剪同时用）。用途是长曲要压到 **CDN 单文件上限**（Cloudflare Workers 静态资产 **25 MiB**）以下 —— 超限会让 `wrangler deploy` 直接失败 | 缺省 ⇒ 老口径：不裁就硬链接原件、裁剪则按 `TRIM_ENCODER`（libmp3lame V0）重编码 |

- `cover` 与上面三个音频键不同：它**进运行时数据**（`characters[].covers`，一首一条、按曲目顺序），前端用它当音MAD 卡面。
  口径是**每个角色全有或全无**（半有半无直接报错并点名第几首）—— 运行时那个数组是**按下标对齐**的，
  留空洞会让某几首静默错位到别人的封面上。旧形状（角色文件顶层的 `cover = [...]` 数组）已废弃，
  数据仓库的 `fetch_covers` 默认会按顺序自动迁移它（不联网、不动已有内容）。

- `author` / `authors`：**成品文件名那一位**永远是整串 `作者 - 标题.mp3`（D95/D96 不能改）。
  `authors = ["甲", "乙"]` 会被规范化成 `author = "甲 & 乙"`，所以**两种写法在磁盘上完全等价** ——
  把一个老条目从整串改成数组**不需要重抓/重裁音频**。`author = "乙 & 甲"` 这种整串**不拆**：
  人名里也可能有 `&`，猜分隔符会拆错。
- **`source` 指向多 P 视频（bilibili 选集）时**（D143）：**默认取 p1**；链接里写了 `?p=N` 就**按链接参数**
  取第 N P。两者都由 yt-dlp 自己解析（`noplaylist` + extractor 的 `part_id = part_id or 1`），本工具
  **不改写 URL、也不硬编码 bilibili**。要某一 P 就在 TOML 里把 `?p=N` 写进 `source`。
  `source` 若解析出**多个条目**（播放列表/选集没被压成单个视频），命令**直接报错**而不是随便挑一个 ——
  一条 `source` 只能对应一首曲目。
- 两个时间键**都为空 ⇒ 不裁剪**（不调 ffmpeg，原件直接作为成品）。
- `bitrate` 与 `source` / 两个时间键同一类：**只在抓取/裁剪期读**，不进运行时数据。它存在的唯一理由是
  **CDN 的单文件上限** —— Cloudflare Workers 静态资产最大 **25 MiB**，**超一个文件整条发布链就断**
  （2026-09-26 实测：`ふゆこけ - セックスの杖刀人` 22.6 分钟 / 36.9 MB 让 `wrangler deploy` 直接失败）。
  写 `bitrate = 128` 会把这一首**整首**按 CBR 128 kbps 重编码（≈21 MB）；**能与裁剪同时用**
  （先按区间解码，再按码率编码）。范围 32–320，越界或非整数直接报错。
- 两个键**都只在抓取/裁剪期存在**：运行时（`characters.json` / 前端 / 播放器）**不读它们**，部署时播放的就是裁好的文件。
- 校验（`tmc.packs.load_packs` + `tmc.validate.check_packs`）：格式必须严格匹配 `^\d{1,2}:[0-5]\d:[0-5]\d\.\d{3}$`（代码比分\秒还卡了 ≤59）；
  两者都在时必须 `stop > start`；`stop` 超过文件时长**目前没有检查**（既不报错也不警告 —— 曾经想给警告，没实现）；`source` 必须是 `http(s)://`。
- 已知坑：`tools/src/tmc/packs.py` 对**未知键直接报错**（`_reject_unknown()`） —— 所以必须显式解析这三个键，
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
pnpm audio:fetch          # = uv run --project $OTOMADS_DATA_DIR/tools python -m otomads.fetch_audio --config local-source.toml
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
   实现上 `otomads.fetch_audio` 直接调用 `otomads.loudness`（量响度的 CLI 也在同一个模块：`python -m otomads.loudness`）。
   顺带修一个既有小毛病：`measuredDb` 里**已删除文件**的旧键从不清理，这次一并清掉。
5. **汇总报告**：成功 / 跳过 / 失败各多少条；有失败则以非 0 退出（但不中断其余曲目）。

**为什么并发在应用层而不是 yt-dlp 的开关上**（D132）：yt-dlp 的 Python API 是**按实例**的（一个
`YoutubeDL` 处理一条 URL），而 `--concurrent-fragments` 只并行 HLS/DASH 的**分片**流 —— bilibili 的音频
是**单个文件**直链，没有分片可并行。可测的账：`import yt_dlp` + `YoutubeDL()` ≈ 0.13 秒/首、
4 分钟 m4a 全量重编码 ≈ 1.0 秒/首、裁剪（解码后精确切 + V0 重编码，D142）≈ 0.4–0.6 秒/首
且**只有 16 首**带区间 ⇒ 86 首的**本地**开销合计约 30 秒（比 `-c copy` 多约 7 秒，就是那 16 首的差价），
其余全是网络（playurl 往返 + 音频本体），
而那段时间 CPU 空闲。所以重叠网络等待即收益；上限由带宽与 bilibili 的 412 风控决定（默认 4，先用它试）。

**`tmc.build`（`pnpm gate` 的第一步）保持离线和机器无关**：只做 TOML 的**结构校验**，**不检查音频文件是否存在**。
理由：曲库根在 `local-source.toml` 里，而那个文件是 gitignored 的**机器相关**配置 —— 让构建依赖它，
CI 与别人的机器会直接失败。"音频齐不齐"由 `audio:fetch` 自己把关（它本来就需要那份配置）。

## 4. 依赖：yt-dlp 与 ffmpeg

| 依赖 | 管理方式 | 说明 |
|---|---|---|
| `yt-dlp` | 加进**数据仓库** `<OTOMADS_DATA_DIR>/tools/pyproject.toml`（默认 `data/otomads/tools/pyproject.toml`）的 `dependencies`，用 **Python API**（`yt_dlp.YoutubeDL`）而不是 subprocess | "与 uv 一起管理"；`uv.lock` 是**跟踪文件**，升级后会变脏，需一并提交 |
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
- 代价二：每首 ≈ 0.4–0.6 秒（`-c copy` 是 0.06 秒），只对**带区间的曲目**付 —— 现在 **36** 首；
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
2. **`contentHash` 纳入裁剪与来源**（用户第 4 条决定）：`build.py` 的 `content_hash(characters, albums, pack_audio)`
   扩成把每条的 `(album, title, start_time, stop_time, source)` 也算进去 —— 于是"两端裁剪/抓取不同"
   会在**握手期**被拒绝，而不是等抢答时发现起点不一样。代价：改一条 trim 就要两端同步数据（本来也该如此）。
3. **响度缓存必须失效**：`otomads.loudness`（数据仓库）的缓存键是**文件名 stem**
   （`p.stem in cache` 就跳过）。裁剪后文件名不变 ⇒ 会沿用**裁剪前**的 dB，逐曲均衡就错了。
   裁剪流程要删掉该曲目的缓存键，并重跑量响度；`loudness/<包>.json`（数据仓库）是**跟踪文件**，与音频一起提交。
4. **文件名不许改**：manifest 匹配（`sources.ts` 的 `normalizeTitle` + "以 `作者 - 曲名` 结尾"兜底）、
   `loudness` 表的键、单曲模式存档，全都建立在 `<作者> - <标题>.mp3` 上。
5. **响度按源（D130）**：响度表是**每个源自己的表** —— 源注册表里的可选 `loudness` 键（路径相对该源所在仓库的根）。
   表由**源的所有者**生成（音MAD 在数据仓库 `tools/`）；主仓库 `tmc.build` 只按注册表声明的路径把它
   拷进 `data/public/data/<mode>/`。运行时 `SourceRecord.loudnessUrl`（相对数据集目录）交给播放层，
   播放层按**解析到的 sourceId** 取表；**没有表的源**（三个远程镜像）系数按 1。
   全局那一份共享的 `loudness.json` 已退场。
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
| 状态里有 `source`，原件存在，`start/stop` 未变，成品存在且 hash 一致，**且抓取/渲染口径都对得上** | **跳过** |
| `start/stop` 变了，原件在 | **重裁**（从原件），不重新下载 |
| 原件丢了、`source` 变了，**或抓取口径变了**（D143 的 `fetch`） | **重新下载**，再裁 |
| 没有 `source`，成品存在 | 跳过（人工放的文件，不碰） |
| 没有 `source`，成品也不存在 | 汇总里列为"缺失"，非 0 退出，并提示"该曲目要么补 `source`，要么手工放入曲库" |

> **口径也算签名**（D142 渲染 + D143 抓取）：状态里除了 `source/start/stop/outHash`，还记
> `render`（成品是怎么产出的）与 `fetch`（原件是怎么抓的）。**不记这两样会出"改了代码但音频一个字节没变"**：
> 链接没变、hash 也对得上 ⇒ 幂等检查会把该重做的东西全部跳过。改了任一实现就要把对应的版本号 +1。
> 反过来说：**只改 `start_time` 不用动版本号**（那条走 `start/stop` 的比较）。

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
- **构建**：`pnpm gate` 仍绿且仍**不依赖**音频与机器配置；`contentHash` 随 trim 变化。
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
> 本节是 **D107 落地当时**的记录：下表里的工具路径（`tools/src/tmc/...`）在当时是对的 ——
> **D130 已把本地源助手 / 抓取裁剪 / 响度与录入工具整体搬去数据仓库**（`data/otomads/tools/src/otomads/`）。
> 要按路径找文件请用数据仓库那份。

| 位置 | 做了什么 |
|---|---|
| `tools/src/tmc/packs.py` | 解析三个新键 + **未知键直接报错**；纯函数 `parse_time` / `trim_seconds` / `audio_filename` / `source_key` / `audio_descriptors` |
| `tools/src/tmc/validate.py` | 曲包检查新增时间格式、区间先后、`source` scheme、重复 `source` 告警；报告加"带 source / 带裁剪"计数 |
| `tools/src/tmc/build.py` | `contentHash` 纳入曲包音频描述符 `[专辑, 曲名, start, stop, source]` |
| `tools/src/tmc/local_source.py` | `scan_library` 跳过点目录/点文件（`.raw/`、`.state/` 不进 manifest） |
| `tools/src/tmc/loudness.py` | 从 `measure_loudness.py` 抽出的可调用核心；顺手修掉"`reset` 的键没被删"与"已删文件的旧键不清" |
| `tools/src/tmc/fetch_audio.py` | 新增：依赖检查、yt-dlp 更新策略、幂等状态、下载、裁剪、硬链接去重、顺带量响度、汇总与退出码 |
| `tools/pyproject.toml` + `uv.lock` | 加 `yt-dlp` 依赖（uv 管理；升级会改 lock，属预期） |
| `data/packs/otomads.toml` | 84 条回填 `source`（见 §9；当时还是单文件 —— D109 之后曲目在 `data/otomads/packs/otomads/*.toml` 一角色一份，见 `data/packs/README.md`） |
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
| `data/otomads/tools/src/otomads/fetch_audio.py` | `render()` 改成三段式（`-ss <start−0.5>` 粗定位 → 输出侧 `-ss 0.5` 丢预热段 → `-t` → `libmp3lame -q:a 0`）；新增常量 `TRIM_ENCODER` / `TRIM_WARMUP` / `RENDER_VERSION` / `LINK_RENDER`；状态签名加 `render` 字段 |
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

## 14. D143：一条 `source` = 一首曲目（多 P 默认 p1，`?p=N` 按链接参数）

**需求**（用户）："修复：自定义源默认解析 1p 而不是别的 p，有别的 p 时根据链接参数让 yt-dlp 自行解析"。

### 1. 根因：`noplaylist` 是搬工具时丢掉的

`yt_dlp/extractor/bilibili.py` 里：

```python
is_anthology = len(page_list_json) > 1                 # 多 P
part_id = int_or_none(parse_qs(url).get('p', [None])[-1])
if is_anthology and not part_id and self._yes_playlist(video_id, video_id):
    return self.playlist_from_matches(...)             # ← 返回**整张选集**（每 P 一个条目）
if is_anthology:
    part_id = part_id or 1                             # ← 压成单个视频时**默认 p1**
```

`fetch_audio.download()` 当年**没传** `noplaylist` ⇒ `_yes_playlist()` 为真 ⇒ 多 P 视频返回整张选集；
而 `outtmpl` 是**固定文件名** ⇒ 各 P **互相覆盖**，最后留下的是**最后一 P**。
历史脚本 `ingest_otomads.py` 传的是 CLI 的 `--no-playlist`（等价）—— **是搬到 `fetch_audio` 时丢的**。

### 2. 实测：本包 4 条 source 中招（用 pagelist API 逐条查过 86 条）

| `source` | p1 | p2 | 修前的原件 |
|---|---|---|---|
| `BV1Mk4y1673i` 月时盆 | 118 s「原曲不使用」 | 99 s「原曲只使用（对比用）」 | 98.731 s ⇒ **p2** ✗ |
| `BV167411G7UG` 献给已逝猫咪的七重奏 | 145 s「献给死猫的7重奏」 | 164 s「工程力学」 | 163.515 s ⇒ **p2** ✗ |
| `BV1Ck4y1m7qk` 千年幻想郷 ～ History of Thomas | 179 s「811」 | 182 s「工程录像」 | 181.487 s ⇒ **p2** ✗ |
| `BV17z421d7mj` 最终鬼畜全明星•BILIBILI | 79 s（本体） | 79 s「无原曲」 | 两 P 等长 ⇒ 时长分不出，但按同一逻辑也是 p2 ✗ |

### 3. 修法（两处）

1. `download()` 加 **`noplaylist: True`** ⇒ 多 P 且无 `?p=` 落到 `part_id = part_id or 1` = **p1**；
   带 `?p=N` 时 `part_id` 已有值、不进那个分支 ⇒ **仍按链接参数**。**不改写 URL、不硬编码站点。**
2. `download()` 改成"**先解析、后落地**"（`extract_info(download=False)` → 查条目数 → `process_ie_result`）：
   解析出**多个条目**就**直接报错**（提示加 `?p=N`），而不是随便挑一个。兜底用 —— 万一某个 extractor
   无视 `noplaylist`，宁可报错也不能再出现"悄悄留下最后一 P"。

### 4. 连带：抓取口径也必须进状态签名（`FETCH_VERSION`）

和 D142 的 `render` 同一个道理：这 4 条的 `source` 一个字没改、`outHash` 也对得上 ⇒
不显式判"原件是怎么抓的"，`fresh` 会把它们**当成已是目标状态全部跳过**（= 改了代码但音频没变）。
所以状态加 `fetch`（`"single-v1"`）并进 `fresh`；**源码变了或抓取口径变了都要重下原件**。

### 5. 数据修复与实测

- 先定向修 4 首（原件全部变成 p1：`117.141 / 144.299 / 178.261 / 78.848` s），
  再按用户裁定**全量重抓 86 首**：`fetched 69 / trimmed 13 / skip 4`（skip 的就是刚修的那 4 首），
  **退出码 0**（无失败、无缺失）。
- **全量重抓只改了 2 个文件**：`对了 向北邮出发吧`、`最终鬼畜蓝蓝路 (2023 Remix)`（它们原本连原件都没有）。
  其余 84 首重下得到**逐字节相同**的音频 ⇒ 反过来证明"只有多 P 源会受这个 bug 影响"。
- 响度表跟着变：`targetDb -11.3 → -11.2`（中位数因为补上那 2 首而移动）⇒ **所有增益系数重算**（49 行）；
  4 首修过的 dB 也变了（月时盆 `-21.7 → -13.7` 最明显 —— 它现在是 p1「原曲不使用」）。

### 6. 裁点：**已确认，无需改动**（我一度误判成"要重新校准"）

改 p1 时我担心过一件事：`月时盆`（11.000）、`七重奏`（2.000）、`千年幻想郷`（3.557）的 `start_time`
当年是在 p2 上落盘的，换到 p1 未必还落在同一个位置，所以把它挂成了遗留项。**用户 2026-09-25 确认：
这些时间本来就是校准好的，不用重校准** —— 遗留项撤销。

复核过当前状态（三首都是从 p1 原件裁的、`成品 = 原件 − start`，逐条一致）：

| 曲目 | `start_time` | p1 原件 | 成品 |
|---|---|---|---|
| 七重奏 | 00:00:02.000 | 144.299 s | 142.299 s |
| 千年幻想郷 | 00:00:03.557 | 178.261 s | 174.704 s |
| 月时盆 | 00:00:11.000 | 117.141 s | 106.141 s |

**教训**：`start_time` 是**用户的艺术参数**，不是能从时长推出来的量 —— "原件换了、裁点大概要重调"
只是猜测，不该写成待办、更不该拿它当发布闸门。发布前问一句比推断便宜得多。

## 15. D144：媒体地址带**数据版本**（源清单里的 `revision`）

**需求**（用户）："修正：在数据发生变动时（原曲源和同链接的自定义源）重载入最新音乐，而不是复用缓存"。

### 1. 病灶：链接没变 ⇒ 浏览器/CDN 一直拿旧的

- 应用里 `audio.src = resolved.url` **原样**用，URL 上**没有任何版本**；
- CDN 给 `.mp3` 发的是 `cache-control: public, max-age=14400`（**4 小时**）；
- 于是"音频换了、链接没变"（重裁、换 p1、换编码口径）之后，浏览器与 CDN 边缘**最多 4 小时**都拿旧的。
  实测：换掉 CDN 上的音频后，同一个 URL 仍返回旧字节；`cf-cache-status: EXPIRED` 才去回源。
- **清单与响度表不受影响**：它们是 `max-age=0, must-revalidate`（助手那份更是 `Cache-Control: no-store`），
  应用也一律 `fetch(..., {cache:"no-cache"})` ⇒ 每次都校验、拿到的一定是最新的。

**所以缺的不是"重新拉清单"，而是"让媒体地址跟着数据走"**：缓存键必须挂在**音频**上，而不是挂在链接上。

### 2. 修法：清单声明版本号，前端拼成 `?v=`

| 位置 | 做了什么 |
|---|---|
| 数据仓库 `packformat.py` | `content_revision(path)` + 带**进程内缓存**的 `content_revisions([(名字, 路径), …])`：**文件内容**的 sha1 前 16 位（缓存键 = 文件身份 `(路径, 大小, mtime)`，值仍是内容哈希 ⇒ 同一份文件在哪台机器都是同一版；§2.6 起 mtime 口径已删） |
| 数据仓库 `local_source.py` | manifest 新增顶层 `revision`（整表）**与每行第 4 位**（逐曲）；新增 `library_files()`（带路径的扫描，`scan_library` 改成它的投影） |
| 数据仓库 `stage_media.py` | `build_manifest(..., revisions=, revision=)` 同样写这两处；`pack` 与逐曲版本都从**内容哈希**算（`packformat.content_revision`，两处口径同一套） |
| 主仓库 `sources.ts` | `tableRevision(payload)` 读顶层版本号；`versionedUrl()` 拼 `?v=`（已有查询串用 `&`，值 `encodeURIComponent`）；`buildEntries(rows, manifestUrl, revision)` 里**行里第 4 位优先、顶层兜底** |
| 主仓库 `public/_headers` | 自托管形态下 `/manifest.json` 与 `/loudness/*` 明确 `max-age=0, must-revalidate`（清单被压住的话，换不换 URL 都白搭） |

**行形状是**`[专辑, 曲目, 地址, 版本?]`——前三位与原来**逐字一致**，第 4 位是新增的可选位
（老前端读 `row[2]`，多一位不受影响；新前端在没有第 4 位时也不拼任何东西）。

### 3. 为什么是**逐曲**版本而不是整表一个

整表一个版本也能修好"拿旧的"，但**任何一次变动都会让整包 86 首（321 MB）全部换 URL** ⇒ 所有客户端
重下一遍。逐曲之后只有真正变过的那几首换 URL。实测（86 首的真曲库）：只动一个文件的 mtime ⇒
**只有 1 行**的版本号变，其余 85 行逐字不变 ✓；文件没动时重算两次版本号完全相同 ✓（可复现，
不会平白让客户端重下）。

### 4. 为什么三个远程镜像**不**拼版本

`tableRevision` 只认**清单里声明的** `revision`；三个镜像的裸数组没有这个键 ⇒ 一个字节都不拼，
与改前逐字一致。它们不需要这个机制：表本身是**同源数据集文件**、每次 `no-cache` 重新校验；
媒体在别人的主机上、内容不变（真换了 URL 也就换了地址，缓存自然不命中）。
反过来说，如果给它们硬算一个"整表内容哈希"，**数据集一重建就会让 368 首原曲全部换 URL** —— 得不偿失。

### 5. 验证

> 本节数字是**落地当时**的实测值，不是现状 —— 现状条数只在 [`README.md`](README.md) 的现状表维护。

- 数据仓库 pytest **112 passed**（109 → +3：助手两条、stage_media 一条）；主仓库 `pnpm test` **752 passed**（+10 = 5 条 × 双引擎）、`pnpm typecheck` ✓。
- **真起了一次助手**（`pnpm local`）实测：`/manifest.json` 返回 `Cache-Control: no-store`，
  顶层 `revision = c754325a2dd4794c`，86 行**全是 4 位**、逐曲版本号**两两不同**。
- `pnpm media:pack` 重打的归档里 manifest 也带上了（顶层 `743231decd5f6a44`，示例行 `v=d1e9c1dd60836f3b`）。
- 前端单测新增 5 条：逐曲盖过整表、没声明时**逐字不变**、已有查询串用 `&`、加载时读顶层兜底、
  清单没 `revision` 键时不拼。

### 6. 生效条件（重要）

**这个机制要生效，源侧的 manifest 必须已经是带版本号的那一版**：

- **本机助手**：改了代码就是新的 ✓（`pnpm local` 起来即可）；
- **Release 归档 / 自托管**：归档已用新 manifest 重打并**换掉了 Release 资产**
  （336,719,238 → **340,516,723 B**，sha256 `f80fa36f…` → **`dcd2f98580a2634f…`**；
  上传前把归档解出来与 `.music/otomads/` **全量逐字节比过**，上传后 GitHub 报的 digest 与本地一致 ✓）。
  自托管的人重新取一次归档解到宿主根目录即可生效。
- **项目 CDN**（`otomads-cdn.tsukinomiyako-mangesui.top`，默认源）：**已经是带 `revision` 的那一版**。
  2026-09-25 实测 `GET /manifest.json` → 200、86 行**全是 4 位**、顶层 `revision = 797d231f6163a58a`
  （媒体与响度表更早就跟上了）⇒ D144 这个能力**线上已经生效**。
  （本节早先写着"只差一个 `manifest.json`"，那是 D144 刚落地时的状态；用户后来自己铺过。）
  **顺带**：D145（§16）之后这份清单还要再换一次 —— 要带 `albums` / `characters` 那两个键。
  静态音MAD 源按 D138/D141 的裁定本来就是手动部署。

## 16. D145：曲目表跟着源走（清单带 `albums` / `characters`，C 路线）

**需求**（用户 2026-09-25 裁定"只做 C"）：把"音MAD 包有哪些曲目"从**随应用部署的静态文件**改成
**运行时从源取**。做完之后：加曲目 / 改裁切 / 换音频 = **只动数据仓库 + 铺源**，
**主仓库一个字都不用改**（连 pin 都不用动）。

> 曾经的两条备选 **A（CI 里现算 `data:build`）/ B（`pnpm data:pin <tag>`）已弃用** —— 它们只是让
> "那份会冻结的生成物"跟上 pin，C 之后没必要。

### 1. 病灶：曲目表是**构建期**产物

| 层 | 今天从哪来 | 数据一变要做什么 |
|---|---|---|
| **音MAD 曲目表**（`data/public/data/otomads/characters.json`） | **构建期**（`pnpm data:build` 读数据仓库的 `packs/`） | 重跑 → 重新部署前端（产物不提交，S3 起） |
| 音MAD 媒体地址（manifest） | **运行时**从源取（CDN / 本机助手） | 铺源 |
| 音MAD 音频 / 响度表 | 运行时 | 铺源 |
| 原曲那 368 首 | 构建期 | 重跑 + 重新部署前端（**C 不管这个**） |

**症状很好认**：设置页「源状态」那一行数的是 **manifest 的条目数**（今天 **191**）—— 在源里加一首，
它会变成 **87**，但**曲目选不到**：`src/**` 全程遍历 `dataset.characters[].music`，而源只提供地址
（`resolveTrack` 只做 `(专辑, 曲名) → URL`）。CI（`.github/workflows/deploy-pages.yml`）只跑
`pnpm install && pnpm build`（不装 Python、不拉 submodule）⇒ "只在数据仓库改"这条路走不通。
> （**S3 起这条已经改了**：`pnpm build` 会先经 `scripts/build-datasets.mjs` 取两个数据仓库的数据集，
> uv 由 postinstall 备好 —— 上面那句"不装 Python、不拉 submodule"只是 D145 当时那条工作流的样子。）

### 2. 契约形状：manifest 多两个**顶层**键

```json
{
  "schema": 1,
  "pack": "otomads",
  "revision": "…",                       // D144 已有：整表音频版本
  "loudness": "loudness/otomads.json",   // D139 已有
  "albums":     [ { "key": "otomads", "name": "…", "kind": "…", "pack": "otomads",
                    "order": 100, "showAlbumName": false } ],
  "characters": [ { "key": "cirno",
                    "music": [["otomads", "标题", "角色曲", "作者"]],
                    "card": ["…"]?,                     // 可选：音MAD 侧卡面覆盖（D137）
                    "name": "…"?, "order": 1?, "searchNames": ["…"]? } ],   // 可选：S2 用
  "tracks":     [ ["otomads", "标题", "media/otomads/….mp3", "rev"] ]         // 形状不动（D96/D141/D144）
}
```

硬约束：

- 老前端不认这两个键就忽略 ⇒ **向后兼容**（和 D144 的 `revision` 一个道理）。
- `music` 条目的形状**必须与 `tmc.build._pack_music` 逐字一致**：`[专辑, 曲名, extra]` + 可选第 4 位作者
  （整串）+ 可选第 5 位多作者数组（D94/D135）。两侧测试里放的是**同一份测试向量**
  （数据仓库 `PACK_MUSIC_VECTOR` ↔ 主仓库 `test_build.py` 里那份）。
- **身份不搬进数据仓库**（契约 `docs/otomads-separation-v1.md` §5 S1）：应用启动时本来就把原曲数据集取全了，
  所以快照只给"角色 → 曲目"。真要"音MAD 自有身份"（S2）时，角色条目可以**可选**地自带
  `name` / `order` / `searchNames`（应用侧已经接收；今天数据仓库**不发**这三个字段）。
- **`contentHash` 不由源声明**：由**应用**按"生效的数据集"算（见 §4）。
- **清单行 = 曲库里的文件**（地址），**曲目表 = 曲包 TOML 声明**：两者不一致时**以曲目表为准**
  （曲库里多一个没写进曲包的 mp3 ⇒ 行数会多、那一首选不到；「源状态」那一行的数字仍来自行数）。

数据侧（数据仓库 `tools/`）：`packformat.pack_snapshot(albums, tracks, cards)` 出这一段；
`local_source.build_manifest(..., snapshot=)`（助手**每次请求现读** `packs/`，加一首立刻生效）与
`stage_media.pack` / `stage`（含 `--base` 重烘）都带上它。**不传这个参数时输出与改前逐字一致**
（老调用方不受影响）。

### 3. 应用侧：运行时拼数据集（`src/data/packSnapshot.ts`）

| 步骤 | 口径 |
|---|---|
| 取快照 | `loadSourceTables` 从**同一个 payload** 解析（与 D139 的 `loudnessUrl` 同一个套路，**不额外发请求**），挂在 `SourceTable.snapshot` |
| 校验 | `parsePackSnapshot` **严格**；形状不对返回 `undefined` ⇒ 走自带那份兜底，**绝不半信半疑地用** |
| 拼装 | `withPackSnapshot(baked, snapshot)`：otomads 的 `characters` = 快照每个 key 去**原曲数据集**取身份（缺身份且快照没自带 ⇒ **跳过并记一条可读错误**，不静默）；`card` 有才覆盖；`albums` 用快照的；`sources` **沿用自带那份注册表**（注册表不归源管）；`characterByKey` / `albumByName` / `counts` / `contentHash` 跟着重算 |
| 接线 | `AppShell` 是全站唯一装配点：`liveBundle = useMemo(() => withPackSnapshot(bundle, snapshot), …)`，**四个面板拿的都是它**（它们内部各自 `useCurrentDataset(bundle)`），`dataHashes()` 与 `window.__TMC_DATA_HASH__` 也用生效后的那份 |

### 4. 握手哈希的口径（**这一条最要紧**）

`packHash(albums, characters)`：`src/rng` 的 `stableHash` 跑**两个不同标签**、各 31 位拼成 16 位十六进制
（62 位）。**不用 `crypto.subtle`**——它在非安全上下文（局域网 http，单端口部署的常见形态）不存在。

- **覆盖**：专辑表（`key/name/kind/pack/order/showAlbumName`）+ 每个角色的曲目条目（`key`、`card`、
  `music`）。两处都按 key 排序 ⇒ **与数组顺序无关**。
- **不覆盖**：媒体地址（每台机器/每个宿主都不同）、**音频版本号**（D144 的 `revision`）、身份字段
  （`name`/`order`/`searchNames` 属于主仓库真源，由原曲那份哈希守）、页面来源。

用户 2026-09-25 裁定的两条：

1. **otomads 那份哈希永远由应用算**（有快照、没快照都用 `packHash`）⇒ "有源的一边"与"只有兜底的一边"
   在**同一份曲目表**上必然得到同一个哈希 ⇒ **一人用本机助手、一人用 CDN 也能一起玩**；
   两端**曲目表不同**才会在握手期被拒（这正是 D107 §6 的初衷）。代价：没有快照时 otomads 的界面指纹
   不再是构建期那个 `contentHash`（**数据集本身逐字不变**，只有哈希口径换了一套）。
2. **不算 `revision`**：它标识的是**那一个源上**那份文件（助手给内容哈希、CDN 给自己的那份），
   算进去会让"同一份曲目表、不同部署"被判成两套数据（"助手 vs CDN"握不上手）。音频身份仍由 URL 上的 `?v=` 保证
   （同一个源必然同一版）。**代价明说**：曲目表相同、而两边音频字节不同（各自曲库里的同名文件不一样）
   **不会**被握手拦住 —— 今天也拦不住（D143 之前更拦不住）。

**原曲那份哈希没变**（还是构建期那个 sha256）：原曲没有"源给的数据"这回事。
**当时协议版本没动**（D145 落地时是 4；**现为 v7**）：线上形状没变，变的是 otomads 哈希的**取值**——那本身就是"数据不同"的判据，
不一致照样在握手期被拒。

### 5. 兜底与中间态

- 快照缺失 / 校验失败 / 源 error ⇒ **完全走今天那条路**：自带数据集 + 自带那份的 counts
  （只有 otomads 的指纹按上面第 4 条换成应用侧算的）。
- **首个可玩帧不等源**（用户裁定：先按兜底渲染、拿到源再重建）。源慢/源挂 = 今天的样子
  （设置页「源状态」那一行显示 loading / error）；源回来之后整棵子树跟着新数据重渲染，
  `window.__TMC_DATA_HASH__` 在同一次重渲染里改写 —— 建/加入房间是用户动作、必然更晚
  ⇒ **握手期拿到的一定是生效后的哈希**。

### 6. 生效条件

**源侧的 manifest 必须换成带这两个键的那一版**：

- **本机助手**：改了代码即是 ✓（每次请求现读 `packs/`）；
- **Release 归档 / 自托管**：归档已重打（`manifest.json` 带这两个键），自托管的人重取一次即可；
- **项目 CDN**（默认源）：**要铺一次** —— **D150 起由数据仓库的 `.github/workflows/publish.yml`**（GH Actions：`build_cdn_site.py` → `wrangler deploy`）构建部署
  （连的是数据仓库，构建命令 `python3 tools/build_cdn_site.py`：取它 Release 里的归档 → 自检 →
  解到 `dist/`；详见 `deploy/README.md` §A.3），不再手抄那几十 KB。老清单只会走兜底 ——
  **不会坏，但等于没改**；构建里的 `stage_media review` 不过就**不铺**（构建失败、线上保持原样），
  所以"铺没铺上"不靠人肉核对。（早先的 CF Git 集成与数据仓库那条 `deploy-cdn` 都已退场，不再是回滚手段。）

### 7. 要接受的代价（用户已认）

> ⚠️ 本节是 **D145 落地当时**的记录：里面的 `public/data/**` 路径与 `data:check` 命令都是那时的样子
> （S3 起产物在 gitignored 的 `data/public/**`、`data:check` 已删）；结论（fail-closed 的握手语义）仍成立，
> 现状数字见 `docs/README.md` 的现状表。

1. **兜底那份快照从此冻结**：`public/data/otomads/*.json` 停在某个时间点。影响有限 —— 源不可达时音频
   本来就一首也放不出来（源表全 error），旧曲目表只是个"能显示、点不动"的壳。
2. **仓库里的守卫不再覆盖线上**：`data:check` / `data:validate` 比的是"陈旧 pin 生成的东西"，
   自洽所以不会红，但它守的不是线上那份。
3. **联机握手语义变了**：hash 来自**生效的数据集** ⇒ 两端曲目表不同就在握手期被拒。注意这改变了今天的
   体验：今天"一人用本机助手、一人用 CDN"能一起玩是**因为曲目表同一份**；改完之后这一点仍然成立
   （哈希不含 URL 与版本），但**一端用的是新数据、另一端还是旧数据**时会连不上 —— 这是 fail-closed，
   不是回归。
