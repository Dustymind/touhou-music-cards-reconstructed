数据管线（Python + uv）。本地音乐源助手、抓取/裁剪、响度与录入工具自 D130 起在
**数据仓库**（`data/otomads/tools/`，见那里的 `README.md`）；主仓库这里只留数据生成与校验。

```bash
pnpm data:sync                          # 建立 tools/.venv（已不再依赖 yt-dlp）
pnpm data:test                          # 数据/规则测试（当前 83 条）
git -C .. submodule update --init data/otomads   # 音MAD 数据（可选；没有它曲包相关用例会 skip）
```

当前模块：

| 模块 | 作用 |
|---|---|
| `tmc.repo` | 常量与文本处理（`split_track_path` / `lookup_key` / 专辑注册表种子） |
| `tmc.fetch_roles` | 抓取并解析 THBWiki Music Room（先 Markdown 镜像，缺失时回落线上页） |
| `tmc.stages` | 抓取并解析作品页 BOSS 表 → 面次 × 登场角色参照表 |
| `tmc.roles` | 标签索引、`附加信息` 判定（R-OVR/R0–R6）、人工裁定表 |
| `tmc.packs` | 曲包的**只读**加载与校验：清单 `<根>/<id>.toml` + 角色文件 `<根>/<id>/<角色 key>.toml`（根 = 主仓库 `data/packs/` + submodule `data/otomads/packs/`；写入侧已搬去数据仓库） |
| `tmc.roster` | 从 `data/characters/*.toml` 生成数据仓库的角色清单 `characters.toml`（`pnpm data:roster`） |
| `tmc.scaffold` | 为「真源里有、曲包里还没有」的角色预置骨架文件 `packs/otomads/<角色 key>.toml`（`pnpm data:scaffold`）：幂等、**不覆盖**已有文件、不含 `[[track]]` 所以对生成物与 `contentHash` 完全惰性（D137） |
| `tmc.validate` | 不变量校验、面次核对、覆盖表一致性、角色清单守卫 |
| `tmc.build` | 生成 `public/data/*.json`（`--check` 漂移守卫；`contentHash` 含曲包音频口径；按源注册表的 `loudness` 把响度表拷进数据集目录 —— 源还可以在**自己的 manifest** 里声明表，前端优先按它取 ⇒ 表跟着源走，D139） |
| `tmc.check_urls` | 远程音源实链抽查（Range 请求 + 音频嗅探） |

**不在这里**（数据仓库 `data/otomads/tools/`，自带 uv 工程、与主仓库零 import / 零 path 依赖）：
`otomads.local_source`（本地曲库助手）、`otomads.fetch_audio` / `loudness` / `measure_loudness`（抓取、裁剪、响度）、
`otomads.ingest_pack` / `parse_ingest_rows` / `ingest_otomads` / `ingest_local_audio`（录入）、`otomads.packformat`（格式层）。
主仓库的 `pnpm local` / `pnpm audio:fetch` / `pnpm audio:measure` 只是**纯路径包装**（D130）。

> 直接敲 `uv` 时若 `$HOME` 只读（沙箱）会失败 —— 把缓存指到仓库内即可（`UV_CACHE_DIR` 指 `.uv/cache`）。
> 上面的 `pnpm data:*` 脚本由 `scripts/run.mjs` 代设，不用自己管，且跨平台。
