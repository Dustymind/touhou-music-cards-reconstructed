数据管线与本地音乐源助手（Python + uv）。

```bash
UV_CACHE_DIR=.uv/cache uv sync          # 建立 tools/.venv
UV_CACHE_DIR=.uv/cache uv run pytest    # 跑数据/规则测试（当前 84 条）
```

当前模块：

| 模块 | 作用 |
|---|---|
| `tmc.repo` | 常量与文本处理（`split_track_path` / `lookup_key` / 专辑注册表种子） |
| `tmc.fetch_roles` | 抓取并解析 THBWiki Music Room（先 Markdown 镜像，缺失时回落线上页） |
| `tmc.stages` | 抓取并解析作品页 BOSS 表 → 面次 × 登场角色参照表 |
| `tmc.roles` | 标签索引、`附加信息` 判定（R-OVR/R0–R6）、人工裁定表 |
| `tmc.migrate` | 上游 v3 JSON → TOML / 专辑注册表 / 数组化源表 + 报告 |
| `tmc.packs` | 曲包的加载与校验：清单 `data/packs/<id>.toml` + 角色文件 `data/packs/<id>/<角色 key>.toml`（镜像表以外的曲目，如音MAD） |
| `tmc.ingest_pack` | 把 `parse_ingest_rows.py` 的行按角色追加进角色文件（幂等，`--dry-run`） |
| `tmc.validate` | 不变量校验、面次核对、覆盖表一致性 |
| `tmc.build` | 生成 `public/data/*.json`（`--check` 做漂移守卫；`contentHash` 含曲包音频口径） |
| `tmc.fetch_audio` | 抓取（yt-dlp）+ 裁剪（ffmpeg `-c copy`）曲包音频，顺带刷新响度表 |
| `tmc.loudness` | 逐曲响度 → `public/data/loudness.json`（入口仍是 `measure_loudness.py`） |
| `tmc.local_source` | 本地曲库助手：`/manifest.json` + `/media/...`（Range/CORS、端口回退） |
| `tmc.check_urls` | 远程音源实链抽查（Range 请求 + 音频嗅探） |

运行时依赖：`yt-dlp`（抓取，见 `pyproject.toml`）+ **系统 ffmpeg**（裁剪与量响度）。
`tmc.fetch_audio` 会在跑之前检查 yt-dlp 更新：有新版本就自动升级并继续，升级失败则中止（`--offline-ok` 可跳过检查）。



> 本机沙箱下 `$HOME/.cache` 只读，因此必须给 `uv` 指定仓库内的缓存目录（`UV_CACHE_DIR=.uv/cache`，已在 `.gitignore` 中忽略）。
