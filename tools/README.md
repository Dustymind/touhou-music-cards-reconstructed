数据管线与本地音乐源助手（Python + uv）。

```bash
uv sync          # 建立 tools/.venv
uv run pytest    # 跑数据/规则测试
```

M1 起加入：`tmc.migrate`（上游 → TOML）、`tmc.validate`（不变量校验）、`tmc.build`（生成 public/data）、
`tmc.fetch_roles`（抓取并解析 THBWiki Music Room 标签）、`tmc.local_source`（本地音乐源服务器）。

> 本机沙箱下 `$HOME/.cache` 只读，因此必须给 `uv` 指定仓库内的缓存目录（`UV_CACHE_DIR=.uv/cache`，已在 `.gitignore` 中忽略）。
