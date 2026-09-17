数据目录（真相源）。

- `characters/` 一角色一 TOML（M1 由上游数据迁移生成）
- `albums.toml` 专辑注册表（显示名 / 类别 / pack / 顺序 / 是否秘封）
- `meta/roles.tsv` 作品 × 曲目 × THBWiki 类别标签 × 归属角色
- `meta/unowned-tracks.tsv` 显式"不归属任何角色"清单 + 理由
- `packs/` 附加曲包（`otomads.toml` = 音MAD 曲目：本地专辑，24 首 / 13 角色）
- `sources/*.json` 音乐源表，数组形式 `[[专辑, 曲目, URL], …]`

规则见 `docs/rules-classification-v1.md`。
