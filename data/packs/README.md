# 附加曲包

一个曲包 = 一份 TOML（`[pack]` + `[[album]]` + `[[track]]`）；曲目带上 `pack` 归属后，界面按曲包过滤，
"当前音乐模式可用"的判定也只算上它们里的曲目。曲包曲目**不进** `data/sources/*.json`（地址由曲包的
`kind` 决定），所以 `tmc.validate` 会跳过"必须在镜像表里"这一条，其余检查照旧（专辑注册、角色存在、
重复、`附加信息` 合法）。

当前只有 `otomads.toml`（音MAD，`kind = "local"`）：**86 首 / 35 个角色**，音频地址来自本地曲库助手
（`tmc.local_source` 的 `/manifest.json`，起法见根 `README.md`）。加载与校验在 `tools/src/tmc/packs.py`。

形状与来龙去脉见 `docs/DECISIONS.md`（D52 定曲包形状，D96–D100 是分批导入与录入格式变更）。
