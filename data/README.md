数据目录（真相源）。`public/data/*.json` 是它的**生成物**：由 `tmc.build` 生成，`pnpm data:check` 守漂移
（生成物进仓库 ⇒ 只跑前端不需要 Python）。

- `characters/` 一角色一 TOML（**121** 个；`music` 条目的第三项 `附加信息` 由 THBWiki 标签判定）
- `albums.toml` 专辑注册表（显示名 / 类别 / pack / 顺序 / 是否秘封；**40** 张）
- `card-sets.toml` 卡面图集登记（图集 → 多个远程 origin，启动时逐个健康检查）
- `meta/character-tracks.tsv` 角色 × 专辑 × 曲目覆盖表（人工补配，每行带依据与来源）
- `meta/character-aliases.tsv` 人工补充的搜索别名（`key → 别名…`）
- `meta/composite-characters.tsv` 合并（composite）角色条目表
- `meta/extra-overrides.tsv` 人工裁定表：`(专辑, 曲目) → (附加信息, 依据, 来源)`
- `meta/unowned-tracks.tsv` 显式"不归属任何角色"清单 + 理由
- `meta/stage-cast.tsv` 作品 × 面次 × 登场角色参照表（`tmc.validate` 导出，供离线复核）
- `packs/` 附加曲包；当前是 `otomads.toml`（清单）+ `otomads/*.toml`（一角色一份，35 份；音MAD：本地专辑，**86 首 / 35 个角色**，见 `packs/README.md`）
- `sources/*.json` 音乐源表，数组形式 `[[专辑, 曲目, URL], …]`（三份镜像：netease163 / cloudflare_r2 / thbwiki）
- `sources/sources.toml` 源注册表（顺序 / 开关 / 本地源的同源路径 `/manifest.json`）

规则见 `docs/rules-classification-v1.md`。曲目归属的标签来源是 THBWiki 抓取快照
`.ref/thbwiki/rows.json`（`tmc.fetch_roles` 产出，`tmc.roles` 读取），人工例外只写在 `extra-overrides.tsv`。
