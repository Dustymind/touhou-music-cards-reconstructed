# 阶段产物与报告

这个目录放**过程产物**，不是现状入口 —— 现状看 [`../README.md`](../README.md)。

## 脚本生成（别手改；重跑命令在表里）

| 文件 | 生成者 | 重跑 |
|---|---|---|
| `validation-report.md` | `tmc.validate --report` | `pnpm data:validate`（只读数据，安全） |
| `stage-check.tsv` | 同上：面次 × 登场角色核对表 | 同上 |
| `migration-report.md` | `tmc.migrate` | ⚠️ 会把 `data/` 与生成物一起重写，**不要**为刷新报告而重跑 |
| `extra-pending.tsv` | `tmc.migrate` | 同上；它同时是 `tmc.validate` 的**输入**（缺了会直接报错） |

## 历史快照（写于当时的阶段，数字不再更新）

| 文件 | 阶段 | 内容 |
|---|---|---|
| `M1-data-health.md` | M1 | 数据体检：迁移 / 校验 / 生成的交付与健康度 |
| `M2a-proposal.md` | M2a | 19 条待判定 + 90 条面次核对的处置建议（当时**待用户确认**，未确认前不改数据） |
| `M2b-th20-review.md` | M2b | TH20 逐条复核（14/14 命中，用户整表认可） |
| `M9-acceptance.md` | M9 | M0–M9 验收报告（当时实测，命令与结果一并记录） |
| `upstream-diff.md` | 数据对账 | 原版 ↔ 本项目 曲目差异 |
| `upstream-character-tracks.md` | 数据研究 | 原版每个角色的曲目清单（逐角色对照原版数据） |

> 这些报告里的数字是**当时**的（例如 `migration-report.md` 的"曲目条目 378"、`validation-report.md` 未重跑前的 368）。
> 看现在的数字用：`pnpm data:check`（生成物计数）、`pnpm data:validate`（校验）、
> [`../README.md`](../README.md)（现状表）。

## 归类依据

- "生成物"= 仓库里的脚本确实会写出它（`tmc.validate` / `tmc.migrate` 的 `write_reports`）；
- "历史快照"= 会话里手写、用于当时验收与对账的文档，结论仍然可查，但**不再随数据更新**。
