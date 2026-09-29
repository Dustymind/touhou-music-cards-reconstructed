数据目录（真相源）。`data/public/data/*.json` 是它的**生成物**（gitignored，别手改）：由 `tmc.build` 生成，
`pnpm dev` / `pnpm build` 会自动跑（dev 走 `gen-data.mjs` 的哈希缓存，真源没变就不重跑）。

- `characters/` 一角色一 TOML（**121** 个；`[[track]]` 带 `id` / `album_key` / `title` / `extra` / `sources`，`extra` 的取值由 THBWiki 标签判定）
- `originals.toml` 专辑注册表（显示名 / 类别 / pack / 顺序 / 是否秘封；**39** 张）
- `card-sets.toml` 卡面图集登记（**8 套**：6 套上游走远程 origin、1 套音MAD 为 `local_only`（素材自己放进
  `cards-otomads/`（仓库根，gitignored））、1 套 `source_only` 的 B 站封面集（素材 = 源快照里的 `covers`，只在音MAD 模式列出，
  源没给就不显示 —— D153））

- `packs/` 附加曲包的**通用根目录**（当前只剩 `README.md`：未来的第二个包放这里，契约见它）；音MAD 的真源在
  **独立数据仓库**（**不再是 submodule**）：位置 = env `OTOMADS_DATA_DIR`，默认 `otomads/`（gitignored，自行 clone 或由 CI 快照解开）——
  清单 `otomads/packs/otomads.toml` + 一角色一份 `otomads/packs/otomads/*.toml`（**80** 份有曲目；
  本地专辑，**191 首 / 80 个角色**，见 `otomads/README.md`）。**没有 commit pin**：换数据 = 在数据仓库改完 →
  `pnpm data:datasets`（或 `pnpm data:build`）重新生成 `<data_dir>/dataset/`。另有角色清单 `otomads/characters.toml`
  （`pnpm data:roster` 生成）、本源响度表 `otomads/loudness/otomads.json` 与自带工具 `otomads/tools/`（D130）。
  数据仓库不在场、也没设数据集快照 URL 时，构建**不失败**：写空数据集 + 默认源记录，运行时回退远程清单（REFACTOR-PLAN v2 §7.2 ③）
- `sources/netease163.toml` / `sources/thbwiki.toml` **原曲**的两个镜像源（**每源一个自包含文件**：
  头部 = 注册信息，`[[track]]` = `id / album / title / url` 各 651 条；构建把它重排成
  `data/public/data/sources/*.json` 的 `{entries: {曲id: {url}}}`）；音MAD 那份在数据仓库里
  （`<OTOMADS_DATA_DIR>/sources/otomads.toml` = 本地曲库助手，其同源路径 `/manifest.json`）
- **自定义模式**的源注册表已搬去 custom 数据仓库：`<CUSTOM_DATA_DIR>/sources/custom.toml`（env `CUSTOM_DATA_DIR`，默认 `custom/`）。
  只有一条 `kind = "custom"` 的源，**`table_url` 是空串**（合法形态，见 `tmc.build.source_table_url_problem`）—— 地址由使用者在应用里填。
  它自己的数据集（`python -m custom.dataset` → `<data_dir>/dataset/`，恒为空兜底）也由那个仓库生成，主仓库只取用；
  契约见 `docs/custom-mode-v1.md`

`extra` 四值词汇（角色曲/道中曲/更多道中曲/秘封曲）的口径与来源见 `docs/data-provenance.md`；
S5 起分类派生链（.ref/thbwiki 快照、data/meta 参照表）已删除，`extra` 只剩"四选一"校验。
