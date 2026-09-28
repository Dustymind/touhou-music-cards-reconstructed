# M1 数据体检报告

> **历史快照**（M1，2026-09-16）：下面的数字与待办都是**当时**的；数据后来涨过（音MAD 曲包 86 条等），
> 待办也已在 M2a/M2b 闭环。现状见 [`../README.md`](../README.md)，本报告保留原样不再更新。

生成方式：`tools/` 的 Python 管线（`uv run python -m tmc.migrate` → `tmc.validate --report` → `tmc.build`）。
所有数字都由脚本实测，可复现；原始清单见 `.ref/notes/C-data-inventory.md`。

---

## 1. 交付了什么

| 文件 | 内容 |
|---|---|
| `data/characters/*.toml` | **121** 个角色，一角色一文件（`key` / `name` / `order` / `card` / `searchNames` / `music`） |
| `data/originals.toml` | **39** 个专辑（`key` / `name` / `kind` / `pack` / `order` / `work`） |
| `data/sources/*.json` | 三份源表，数组形式 `[[专辑, 曲目, URL], …]` |
| `data/meta/` | 预留：`roles.tsv` 与 `unowned-tracks.tsv`（M2 产出）—— `roles.tsv` **后未采用**，实际落成 `stage-cast.tsv` + `extra-overrides.tsv` |
| `public/data/*.json` | 运行时产物：`characters.json` / `albums.json` / `index.json`（含 `contentHash` 供联机握手） |
| `reports/` | 本报告 + `migration-report.md` + `validation-report.md` + `extra-pending.tsv` + `stage-check.tsv` |
| `tools/src/tmc/` | `repo` / `roles` / `fetch_roles` / `migrate` / `validate` / `build` 六个模块 + 24 个测试 |

命令（在 `tools/` 下）：

```bash
UV_CACHE_DIR=.uv/cache uv run python -m tmc.fetch_roles   # 抓 THBWiki Music Room（21 部作品）
UV_CACHE_DIR=.uv/cache uv run python -m tmc.migrate       # 重新生成 data/
UV_CACHE_DIR=.uv/cache uv run python -m tmc.validate --report
UV_CACHE_DIR=.uv/cache uv run python -m tmc.build         # 生成 public/data/；--check 做漂移守卫
UV_CACHE_DIR=.uv/cache uv run pytest
```

## 2. 验收数字（与上游盘点逐项对齐）

| 指标 | 上游盘点 | 本次迁移 | 说明 |
|---|---:|---:|---|
| 角色 | 121 | **121** | ✅ |
| 曲目条目（含重复） | 358 | **357 → 378** | 去重后 357；M2b 按复核结论补配 21 条（见 `data/meta/character-tracks.tsv`） |
| 去重曲目 `(专辑,曲目)` | 347 | **347 → 368** | ✅ 补配 21 条后 |
| 专辑（拆碟后） | 39 | **39** | ✅ 秘封 12 + CD 10 + 官作 16 + 其它 1 |
| 跨角色共用曲目 | 10（真共用） | **10** | ✅ 自重复那条已去重 |
| 秘封曲条目 | —— | **39** | 全部走 R0，机械判定 |
| 源表 | 652 / 651 / 651 | **651 / 651 / 651** | 163 的 1 条改名残留已删除并统一到角色数据拼写 |
| 被引用曲目在每张源表的覆盖率 | 有 1 条悬空 | **3/3 全覆盖** | ✅ 上游"八雲紫 `Necro-Fantasia` 缺 `.mp3`"问题在 `(专辑,曲目)` 模型下不复存在 |
| `extra-pending` | —— | **0**（M2a 已清空） | 见 §4 与 M2a-proposal |
| 角色 `order` | 隐式 JSON 键序 | **1…121 显式** | 保留上游人工排序 |

## 3. `附加信息` 判定分布（357 条）

| 规则 | 条数 | 含义 |
|---|---:|---|
| R0 | 39 | 秘封倶楽部 CD → `秘封曲`（机械） |
| R1 / R5 | 209 | THBWiki 标签含角色（含格斗作场景曲）→ `角色曲` |
| R2 | 83 | 首发作品的面主题曲 → `道中曲` |
| R3 | 7 | 非首发作品的面主题曲 → `更多道中曲` |
| R4 | 4 | 系统曲标签（Ending / Staff 等）→ 预备归入"未归属" |
| R? | 15 | 无法判定，占位并登记（见 §4） |
| 去重 | 1 | 角色内重复条目 |

每条判定都能追溯到 THBWiki 的具体标签（`migrate` 会把依据写进 `extra-pending.tsv` 的"原因"列；
`tools/tests/test_rules_and_data.py` 用黄金样例锁住 8 条易错向量，含你更正的 `クリスタライズシルバー`）。

## 4. 待处理：19 条 → **已全部解决**（M2a）

| 组 | 条数 | 结果（详见 [`M2a-proposal.md`](M2a-proposal.md)） |
|---|---:|---|
| `東方錦上京 ～ Fossilized Wonders`（TH20） | 14 | 用线上 Music Room 页判定：6 条 `道中曲` + 8 条 `角色曲` |
| `東方三月精 ～ Eastern and Little Nature Deity` | 3 | THBWiki CD 解说页证实是三位妖精的主题曲 → `角色曲` |
| 系统曲标签（`17. 砕月`、`ヴォヤージュ1970`） | 2 | 按用户裁定保留在角色档案里（`角色曲`），理由与来源进覆盖表 |

## 5. 需要你复核的第二批：道中曲面次对拍（`reports/stage-check.tsv`）

R2/R3 当前口径是"标签为面主题曲 + 作品 == 首发作品"，**没有**校验该面次是否真的属于这个角色
（中 BOSS 没有主题曲标签，需要角色×面次参照表）。我把 90 条道中曲/更多道中曲逐条对拍：

- **match 50**：面次与该角色本人主题曲的面次一致；
- **no-own-theme 26**：该角色没有主题曲标签（正是 E1 的中 BOSS 情形）；
- **MISMATCH 14**（**已全部撤销**，见 M2a）：改用 THBWiki 作品页的 BOSS 表后全部通过。典型：

| 角色 | 专辑 | 曲目 | 该曲面次 | 该角色本人曲面次 |
|---|---|---|---:|---:|
| 橙 | 東方妖々夢 | 妖々跋扈 | Extra | 2 |
| 魂魄妖夢 | 東方妖々夢 | アルティメットトゥルース | 6 | 5 |
| 八雲藍 | 東方妖々夢 | 妖々跋扈 ～ Who done it! | Phantasm | Extra |
| 封獣ぬえ | 東方星蓮船 | 法界の火 | 6 | Extra |
| ナズーリン | 東方星蓮船 | 魔界地方都市エソテリア | 5 | 1 |
| 鬼人正邪 | 東方輝針城 | 針小棒大の天守閣 | 6 | 5 |
| 杖刀偶磨弓 | 東方鬼形獣 | エレクトリックヘリテージ | 6 | 5 |
| 十六夜咲夜 | 東方紅魔郷 | ツェペシュの幼き末裔 | 最终 | 5 |
| パチュリー・ノーレッジ | 東方紅魔郷 | 魔法少女達の百年祭 | Extra | 4 |

这些多半是**上游把"该作品里别的面/Extra 的面主题曲"挂到了这个角色名下**。M2 会逐条给 THBWiki 证据，
按你的裁定（只改类别不删曲目）给出处置建议。

## 6. 已知的源表问题（M1 未动，M2 处理）

- `thbwiki` 有 1 组 URL 被两条曲目共用：`b/bf/th18_18.mp3` 同时服务
  `東方虹龍洞 / プレイヤーズスコア` 与 `東方獣王園 / 獣の知性` —— 至少一条错，需重取 hash。
- 8 条"曲名自带尾句号"的曲目（如 `紅楼 ～ Eastern Dream...`）在 R2 上文件名被截短；
  现在 `(专辑,曲目)` 不再参与 URL 拼接，**不影响播放**，但报告里保留登记。
- 2 条非 NFC 的曲目键（`虹色のセプトリント`）已按 NFC 规范化写出。

## 7. 结论

M1 的机械部分已完成且全部自检通过：**数据迁移 121/39/357/347、三源全覆盖、无重复、无越界**。
剩余 19 条占位 + 14 条面次待判 + 1 组 URL 复用，是 M2"提案 → 你复核 → 落库"的输入。
