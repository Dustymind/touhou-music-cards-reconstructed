# 附加曲包

一个曲包 = **一份清单 + 一角色一份曲目文件**（曲目文件与 `data/characters/*.toml` 同一风格：
一角色一份、顶层 `key`）：

```
<根>/otomads.toml                  # 清单：只放 [pack] 与 [[album]]
<根>/otomads/kirisame-marisa.toml  # 角色文件：`key` 加若干 [[track]]
```

**根目录**（`tmc.repo.pack_roots`）：主仓库 `data/packs/`（未来的曲包放这里）+ 音MAD 数据
submodule `data/otomads/packs/`（真源在独立仓库，见 D128）。submodule 在开发时**可选**：
没初始化时 `data/packs/` 里没有包，构建会跳过音MAD 数据集、用已提交的
`public/data/otomads/*.json`。

曲目带上 `pack` 归属后，界面按曲包过滤，"当前音乐模式可用"的判定也只算上它们里的曲目。
曲包曲目**不进** `data/sources/*.json`（地址由曲包的 `kind` 决定），所以 `tmc.validate` 会跳过
"必须在镜像表里"这一条，其余检查照旧（专辑注册、角色存在、重复、附加信息合法）。

两条硬规矩（写了直接报错，不猜）：清单里**不许**写 `[[track]]`；`[[track]]` 里**不许**写 `character`
—— 角色由文件的 `key` 决定，且**文件名必须等于 `key`**。加载与校验在 `tools/src/tmc/packs.py`。

### 角色文件的 `card`（可选）：音MAD 侧自己的卡面

写法与 `data/characters/*.toml` 一致，**缺省沿用共享身份的卡面**：

```toml
key = "cirno"
card = ["チルノ-mad.png"]        # 可选：这套图集目录里的文件名
```

- 文件名要在**用户选中的卡面图集**里存在 —— 音MAD 专用卡面请配套用 `id = "otomads"` 那套
  （`data/card-sets.toml`，`local_only`：素材自己放进 `public/cards-otomads/`）。
- 卡面是"跨模式身份一致"的**唯一例外**（`tmc.validate` 的 `check_datasets` 只管
  `name`/`order`/`searchNames`；没写 `card` 的角色仍要求与共享身份一致）。
- 之后若要让音MAD 有**原曲没有的角色**，得先决定角色 key 从哪来（主仓库加同名 key，或另立一份
  "音MAD 自己的身份"契约）—— 见 `docs/otomads-separation-v1.md` §5。

当前唯一的曲包是 `otomads`（音MAD，`kind = "local"`）：**86 首 / 35 个角色**，真源在数据 submodule
`data/otomads/packs/`（独立仓库，见 D128），音频地址来自本地曲库助手（数据仓库的 `otomads.local_source`
提供 `/manifest.json`，主仓库用 `pnpm local` 起）。音MAD 的**录入/抓取/量响度全在数据仓库的工具里**
（`data/otomads/tools/`，见它的 `README.md`；主仓库只留 `pnpm` 路径包装，D130）。

## 录一条新曲目

```bash
cd data/otomads
uv run --project tools python -m otomads.parse_ingest_rows rows.txt   # ① 解析 → tools/ingest_rows_<日期>.json
uv run --project tools python -m otomads.ingest_pack \
    --pack otomads --rows tools/ingest_rows_<日期>.json               # ② 按角色追加（校验 characters.toml）
uv run --project tools python -m otomads.fetch_audio                  # ③ 抓取/裁剪 + 刷新 loudness/otomads.json
cd ../.. && pnpm data:build && pnpm data:validate                     # ④ 拷响度表 + 生成 + 校验
```

③ 按行的 `character` 分组落文件（文件不存在就新建，带 `key = "…"` 与两行说明），
**只追加、不改写已有内容**（人工注释与顺序都保住），同 `(专辑, 曲名)` **幂等跳过**，
`--dry-run` 只打印不落盘；角色 key 不在 `data/characters/*.toml` 里直接报错
（写错一个 key 会让曲目被静默错挂）。

> ②③ 写进的是 submodule 的工作区：要在**数据仓库**里提交、打新 tag，主仓库切到该 tag 后再跑 ④
> （见 `data/otomads/README.ai.MD`）。

## `[[track]]` 的三个音频键（可选）

| 键 | 作用 | 语义 |
|---|---|---|
| `source` | 抓取来源（任意的 yt-dlp 支持的站点；当前 84/86 条是 B 站）。**一条 `source` = 一首曲目** | 缺省 ⇒ 音频由人工放进曲库，抓取命令跳过 |
| `start_time` | 裁剪开始，`HH:MM:SS.mmm` | 缺省 = 文件开头（只给 `stop_time` 时按开头算） |
| `stop_time` | 裁剪结束，格式同上 | 缺省 = 文件结尾（只给 `start_time` 时按结尾算，等于不裁） |

`source` 指向 **bilibili 多 P 视频**时（D143）：**默认取 p1**；要别的 P 就把 `?p=N` 写进链接
（`source = "https://www.bilibili.com/video/BV…/?p=3"`）—— 由 yt-dlp 自己按参数解析，本工具不改写 URL。
解析出多个条目会**直接报错**（一条 `source` 只能对应一首曲目）。

两个时间键**都只在抓取/裁剪期被读**，运行时不进 `characters.json`、前端看不到；产出的音频用
**解码后精确切 + 重编码**裁剪（D142；`-c copy` 只能切在 mp3 帧边界、且冷启动会让头一帧解不出来，
理由与实测见 `docs/packs-audio-v1.md` §5）—— 起点与时长因此是采样点级精确的。**注意**：
`source` / `start_time` / `stop_time` 会进 `public/data/index.json` 的 `contentHash` ——
两端音频口径不同会在联机握手期就被拒。

```bash
pnpm audio:fetch --track 子串 --dry-run        # = 数据仓库的 otomads.fetch_audio（D130）
```

命令会下载原件到 `<曲库>/.raw/`、按区间裁到 `<曲库>/<专辑>/<作者> - <标题>.mp3`，并顺带刷新
本源的响度表 `loudness/otomads.json`（数据仓库；裁剪过的曲目会先失效缓存）。完整语义、依赖与失败模式见
[`docs/packs-audio-v1.md`](../../docs/packs-audio-v1.md)。

形状与来龙去脉见 `docs/DECISIONS.md`（D52 定曲包形状，D96–D100 分批导入，D107 加音频键与抓取命令，
D128 把真源拆到独立数据仓库）。
