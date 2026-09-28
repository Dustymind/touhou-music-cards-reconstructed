数据目录（真相源）。`data/public/data/*.json` 是它的**生成物**（gitignored，别手改）：由 `tmc.build` 生成，
`pnpm dev` / `pnpm build` 会自动跑（dev 走 `gen-data.mjs` 的哈希缓存，真源没变就不重跑）。

- `characters/` 一角色一 TOML（**121** 个；`[[track]]` 带 `id` / `album_key` / `title` / `extra` / `sources`，`extra` 的取值由 THBWiki 标签判定）
- `originals.toml` 专辑注册表（显示名 / 类别 / pack / 顺序 / 是否秘封；**39** 张）
- `card-sets.toml` 卡面图集登记（**8 套**：6 套上游走远程 origin、1 套音MAD 为 `local_only`（素材自己放进
  `cards-otomads/`（仓库根，gitignored））、1 套 `source_only` 的 B 站封面集（素材 = 源快照里的 `covers`，只在音MAD 模式列出，
  源没给就不显示 —— D153））

- `packs/` 附加曲包的**通用根目录**（当前只剩 `README.md`：未来的第二个包放这里，契约见它）；音MAD 的真源在
  **submodule** `otomads/` —— 清单 `otomads/packs/otomads.toml` + 一角色一份 `otomads/packs/otomads/*.toml`（**80** 份有曲目；
  本地专辑，**191 首 / 80 个角色**，见 `otomads/README.md`）。submodule **pin 在 commit 上**（tag 只是那个
  commit 的名字）：换数据 = `git -C data/otomads fetch` → `checkout <commit>` → `pnpm data:build`。另有角色清单 `otomads/characters.toml`
  （`pnpm data:roster` 生成）、本源响度表 `otomads/loudness/otomads.json` 与自带工具 `otomads/tools/`（D130）。
  submodule 未初始化时它整个不存在，构建会跳过音MAD 数据集
- `sources/netease163.toml` / `sources/thbwiki.toml` **原曲**的两个镜像源（**每源一个自包含文件**：
  头部 = 注册信息，`[[track]]` = `id / album / title / url` 各 651 条；构建把它重排成
  `data/public/data/sources/*.json` 的 `{entries: {曲id: {url}}}`）；音MAD 那份在 submodule 里
  （`otomads/sources/otomads.toml` = 本地曲库助手，其同源路径 `/manifest.json`）
- `sources/custom.toml` **自定义模式**的源注册表：只有一条 `kind = "custom"` 的源，**`table_url` 是空串**
  （合法形态，见 `tmc.build.source_table_url_problem`）—— 地址由使用者在应用里填。
  这个模式的数据**不在本仓库**：契约见 `docs/custom-mode-v1.md`，工具在独立仓库
  `touhou-music-cards-custom-data`（submodule `custom/`；本仓库的构建**不依赖**它 ——
  `data/custom` 初始化与否，`data:build` 的 custom 产物都逐字相同（实测））

`extra` 四值词汇（角色曲/道中曲/更多道中曲/秘封曲）的口径与来源见 `docs/data-provenance.md`；
S5 起分类派生链（.ref/thbwiki 快照、data/meta 参照表）已删除，`extra` 只剩"四选一"校验。
