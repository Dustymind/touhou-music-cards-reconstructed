# 附加曲包

一个曲包 = **一份清单 + 一角色一份曲目文件**（曲目文件与 `data/characters/*.toml` 同一风格：
一角色一份、顶层 `key`）：

```
data/packs/otomads.toml                  # 清单：只放 [pack] 与 [[album]]
data/packs/otomads/kirisame-marisa.toml  # 角色文件：`key` 加若干 [[track]]
```

曲目带上 `pack` 归属后，界面按曲包过滤，"当前音乐模式可用"的判定也只算上它们里的曲目。
曲包曲目**不进** `data/sources/*.json`（地址由曲包的 `kind` 决定），所以 `tmc.validate` 会跳过
"必须在镜像表里"这一条，其余检查照旧（专辑注册、角色存在、重复、`附加信息` 合法）。

两条硬规矩（写了直接报错，不猜）：清单里**不许**写 `[[track]]`；`[[track]]` 里**不许**写 `character`
—— 角色由文件的 `key` 决定，且**文件名必须等于 `key`**。加载与校验在 `tools/src/tmc/packs.py`。

当前只有 `otomads`（音MAD，`kind = "local"`）：**86 首 / 35 个角色**，音频地址来自本地曲库助手
（`tmc.local_source` 的 `/manifest.json`，起法见根 `README.md`）。

## 录一条新曲目

```bash
python3 tools/parse_ingest_rows.py rows.txt      # ① 解析 + 校验 → tools/ingest_rows_<日期>.json
python3 tools/ingest_otomads.py                  # ② yt-dlp 最高音质下载（已存在会跳过）
cd tools && UV_CACHE_DIR=.uv/cache uv run python -m tmc.ingest_pack \
    --pack otomads --rows ../tools/ingest_rows_<日期>.json       # ③ 按角色追加进角色文件
cd .. && pnpm data:build && pnpm data:validate   # ④ 生成 + 校验
```

③ 按行的 `character` 分组落文件（文件不存在就新建，带 `key = "…"` 与两行说明），
**只追加、不改写已有内容**（人工注释与顺序都保住），同 `(专辑, 曲名)` **幂等跳过**，
`--dry-run` 只打印不落盘；角色 key 不在 `data/characters/*.toml` 里直接报错
（写错一个 key 会让曲目被静默错挂）。


## `[[track]]` 的三个音频键（可选）

| 键 | 作用 | 语义 |
|---|---|---|
| `source` | 抓取来源（任意的 yt-dlp 支持的站点；当前 84/86 条是 B 站） | 缺省 ⇒ 音频由人工放进曲库，抓取命令跳过 |
| `start_time` | 裁剪开始，`HH:MM:SS.mmm` | 缺省 = 文件开头（只给 `stop_time` 时按开头算） |
| `stop_time` | 裁剪结束，格式同上 | 缺省 = 文件结尾（只给 `start_time` 时按结尾算，等于不裁） |

两个时间键**都只在抓取/裁剪期被读**，运行时不进 `characters.json`、前端看不到；产出的音频用
`ffmpeg -c copy` 裁剪（不重编码，误差 ≤ 一帧）。**注意**：`source` / `start_time` / `stop_time` 会进
`public/data/index.json` 的 `contentHash` —— 两端音频口径不同会在联机握手期就被拒。

```bash
cd tools && UV_CACHE_DIR=.uv/cache uv run python -m tmc.fetch_audio [--track 子串] [--dry-run] [--force]
```

命令会下载原件到 `<曲库>/.raw/`、按区间裁到 `<曲库>/<专辑>/<作者> - <标题>.mp3`，并顺带刷新
`public/data/loudness.json`（裁剪过的曲目会先失效缓存）。完整语义、依赖与失败模式见
[`docs/packs-audio-v1.md`](../../docs/packs-audio-v1.md)。

形状与来龙去脉见 `docs/DECISIONS.md`（D52 定曲包形状，D96–D100 分批导入，D107 加音频键与抓取命令）。
