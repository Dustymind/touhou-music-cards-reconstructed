数据管线（Python + uv）。本地音乐源助手、抓取/裁剪、响度与录入工具自 D130 起在
**数据仓库**（`<OTOMADS_DATA_DIR>/tools/`，env 默认 `data/otomads/`，见那里的 `README.md`）；主仓库这里只留数据生成与校验。

```bash
pnpm data:sync                          # 建立 tools/.venv（已不再依赖 yt-dlp）
pnpm data:test                          # 数据不变量测试（当前 82 条）
pnpm data:datasets                      # 两个数据仓库各自生成 <data_dir>/dataset/（主仓库只取用，§7.2）
git clone https://github.com/Dustymind/touhou-music-cards-otomads-data.git data/otomads  # 音MAD 数据（可选；或设 OTOMADS_DATA_DIR；不在场时曲包相关用例会 skip）
git clone https://github.com/Dustymind/touhou-music-cards-custom-data.git data/custom     # 自定义数据（可选；或设 CUSTOM_DATA_DIR；自带数据集恒为空，不影响产物）
```

当前模块：

| 模块 | 作用 |
|---|---|
| `tmc.repo` | 常量与文本处理（`split_track_path` / `lookup_key` / 专辑注册表种子） |
| `tmc.packs` | 曲包的**只读**加载与校验：清单 `<根>/<id>.toml` + 角色文件 `<根>/<id>/<角色 key>.toml`（根 = 主仓库 `data/packs/` + 数据仓库 `<OTOMADS_DATA_DIR>/packs/`，默认 `data/otomads/packs/`；写入侧已搬去数据仓库） |
| `tmc.roster` | 从 `data/characters/*.toml` 生成数据仓库的角色清单 `characters.toml`（`pnpm data:roster`）。S5 起 `--scaffold` 也在这里：为「真源里有、曲包里还没有」的角色预置骨架文件 `packs/otomads/<角色 key>.toml`（`pnpm data:scaffold`）—— 幂等、**不覆盖**已有文件、不含 `[[track]]` 所以对生成物与 `contentHash` 完全惰性（D137） |
| `tmc.validate` | 不变量校验（角色/专辑/曲目引用、同名曲、图集、按源注册与引用指纹）、`--report` 写出报告、`--urls` 抽查远程实链 |
| `tmc.build` | 生成 `data/public/data/*.json`（可复现性由 `pnpm gate` 的两次构建比对承担；`contentHash` 含曲包音频口径；按源注册表的 `loudness` 把响度表拷进数据集目录 —— 源还可以在**自己的 manifest** 里声明表，前端优先按它取 ⇒ 表跟着源走，D139） |
| （`--urls`） | `tmc.validate --urls` 附带远程音源实链抽查（Range 请求 + 音频嗅探，S5 起并入 validate） |

**不在这里**（数据仓库 `<OTOMADS_DATA_DIR>/tools/`，默认 `data/otomads/tools/`，自带 uv 工程、与主仓库零 import / 零 path 依赖）：
`otomads.local_source`（本地曲库助手）、`otomads.fetch_audio`（抓取与裁剪）、`otomads.loudness`（逐曲响度，含量响度的 CLI）、
`otomads.fetch_covers`（封面链接）、`otomads.packformat`（格式层）、`otomads.stage_media`（归档 / 铺盘 / 自检）。
主仓库的 `pnpm local` / `pnpm audio:fetch` / `pnpm audio:measure` 只是**纯路径包装**（先经 `scripts/require-data.mjs` 确认数据仓库在场，D130）。

> 直接敲 `uv` 时若 `$HOME` 只读（沙箱）会失败 —— 把缓存指到仓库内即可（`UV_CACHE_DIR` 指 `.uv/cache`）。
> 上面的 `pnpm data:*` 脚本由 `scripts/run.mjs` 代设，不用自己管，且跨平台。
