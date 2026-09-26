数据目录（真相源）。`public/data/*.json` 是它的**生成物**：由 `tmc.build` 生成，`pnpm data:check` 守漂移
（生成物进仓库 ⇒ 只跑前端不需要 Python）。

- `characters/` 一角色一 TOML（**121** 个；`music` 条目的第三项 `附加信息` 由 THBWiki 标签判定）
- `albums.toml` 专辑注册表（显示名 / 类别 / pack / 顺序 / 是否秘封；**40** 张）
- `card-sets.toml` 卡面图集登记（**8 套**：6 套上游走远程 origin、1 套音MAD 为 `local_only`（素材自己放进
  `public/cards-otomads/`）、1 套 `source_only` 的 B 站封面集（素材 = 源快照里的 `covers`，只在音MAD 模式列出，
  源没给就不显示 —— D153））
- `meta/character-tracks.tsv` 角色 × 专辑 × 曲目覆盖表（人工补配，每行带依据与来源）
- `meta/character-aliases.tsv` 人工补充的搜索别名（`key → 别名…`）
- `meta/composite-characters.tsv` 合并（composite）角色条目表
- `meta/extra-overrides.tsv` 人工裁定表：`(专辑, 曲目) → (附加信息, 依据, 来源)`
- `meta/unowned-tracks.tsv` 显式"不归属任何角色"清单 + 理由
- `meta/stage-cast.tsv` 作品 × 面次 × 登场角色参照表（`tmc.validate` 导出，供离线复核）
- `packs/` 附加曲包的**通用根目录**（当前只剩 `README.md`：未来的第二个包放这里，契约见它）；音MAD 的真源在
  **submodule** `otomads/` —— 清单 `otomads/packs/otomads.toml` + 一角色一份 `otomads/packs/otomads/*.toml`（43 份有曲目；
  本地专辑，**106 首 / 43 个角色**，见 `otomads/README.md`）。submodule **pin 在 commit 上**（tag 只是那个
  commit 的名字）：换数据 = `git -C data/otomads fetch` → `checkout <commit>` → `pnpm data:build`。另有角色清单 `otomads/characters.toml`
  （`pnpm data:roster` 生成）、本源响度表 `otomads/loudness/otomads.json` 与自带工具 `otomads/tools/`（D130）。
  submodule 未初始化时它整个不存在，构建会跳过音MAD 数据集
- `sources/*.json` 音乐源表，数组形式 `[[专辑, 曲目, URL], …]`（三份镜像：netease163 / cloudflare_r2 / thbwiki）
- `sources/originals.toml` **原曲**的源注册表（三个远程镜像）；音MAD 那份在 submodule 里
  （`otomads/sources/otomads.toml` = 本地曲库助手，其同源路径 `/manifest.json`）
- `sources/custom.toml` **自定义模式**的源注册表：只有一条 `kind = "custom"` 的源，**`table_url` 是空串**
  （合法形态，见 `tmc.build.source_table_url_problem`）—— 地址由使用者在应用里填。
  这个模式的卡数据**不在本仓库**：契约见 `docs/custom-mode-v1.md`，工具在独立仓库
  `touhou-music-cards-custom-data`（本仓库的构建**不依赖**它，`data/custom` 没初始化也逐字相同）

规则见 `docs/rules-classification-v1.md`。曲目归属的标签来源是 THBWiki 抓取快照
`.ref/thbwiki/rows.json`（`tmc.fetch_roles` 产出，`tmc.roles` 读取），人工例外只写在 `extra-overrides.tsv`。
