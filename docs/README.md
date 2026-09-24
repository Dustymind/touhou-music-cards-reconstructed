# 文档全景

一句话：**现状看本页，规则看契约，来龙去脉看 DECISIONS，阶段产物看 reports。**

## 现状（最近一次实测）

| 项 | 值 | 从哪来 / 怎么复现 |
|---|---|---|
| 角色 | 121 | `public/data/index.json` |
| 专辑 | 40 | 同上 |
| 角色曲目条目 / 去重曲目 | 464 / 454（**两份数据集**：原曲 121 角色 378 条 + 音MAD 35 角色 86 条，互斥） | 同上（各份 `index.json` 的 `counts`） |
| 卡面集 / 注册音源 | 7 / 4（含 1 套音MAD **本地图集**：素材用户自己放进 `public/cards-otomads/`） | 同上 |
| 音MAD 曲包 | 1 包：86 首 / 35 个角色；**84 条带 `source`**（可自动抓取）、**16 条带裁剪区间**（前导静音已裁） | 真源在数据 submodule：清单 `data/otomads/packs/otomads.toml` + 一角色一份 `data/otomads/packs/otomads/*.toml`（D128）；`pnpm audio:fetch --dry-run`（数据仓库的 `otomads.fetch_audio`，D130） |
| 前端单测 | **628 passed**（314 条 × chromium + firefox；真实浏览器，vitest 浏览器模式） | `pnpm test` |
| 数据管线测试 | **34 passed**（主仓库）+ **59 passed**（数据仓库 `tools/`） | `cd tools && uv run pytest` / `uv run --project tools pytest`（在数据仓库） |
| 端到端 | 预期 **84 passed + 1 skipped**（chromium 38 / firefox 37+1 / mobile 9；比 D124 多 4 = PeerJS 开关守卫 + 对局音频淡入淡出守卫，各 × 两个桌面引擎）；本机实测 `smoke.spec.ts` 两引擎 **60 passed**（含两条新守卫）、`multiplayer.spec.ts` 两引擎 9 passed + 1 skipped ✓；更早的全量跑出过 78 + 2 failed + 1 skipped —— 联机那条是负载抖动（单跑 ✓），`mobile.spec.ts` 播放页居中那条 **HEAD 上就先红**（偏 9px > 8px 容差，见 D124） | `pnpm e2e` |
| 数据漂移 | 无 | `pnpm data:check` |
| 数据校验 | 通过 | `pnpm data:validate` |
| 联机协议版本 | 4 | `src/net/protocol.ts`（`SessionConfigWire` = 音乐模式 + 会话种子；`dataHash` = 两个模式各一个） |
| 决策日志 | D1–D130 | [`DECISIONS.md`](DECISIONS.md) |

> **e2e 的前置条件**：音MAD 相关用例会取同源的 `/manifest.json`（开发服务器代理到本地曲库助手），
> 必须先起助手再跑，否则那几条会红 —— 这是环境问题，不是代码问题（D105 记过这个坑）。

## 契约（改实现前先读，改了要同步）

| 文档 | 管什么 | 破坏了会怎样 |
|---|---|---|
| [`rng-v1.md`](rng-v1.md) | 随机数实现、`draw` / `derive` 两条口径、种子由谁生成 | 联机两端分叉、存档与回放不可复现 |
| [`protocol-v1.md`](protocol-v1.md) | 握手、消息表、顺序、会话配置下发、版本演进 | 两端状态分叉，或旧对端被静默接受 |
| [`rules-classification-v1.md`](rules-classification-v1.md) | `music[].附加信息` 的判定规则（THBWiki 标签 → 四类） | 分类漂移、`tmc.validate` 报错 |
| [`packs-audio-v1.md`](packs-audio-v1.md) | 曲包音频的 `source` / `start_time` / `stop_time`、抓取与裁剪流程 | 两端听到的音频不同却仍能握手 |

## 决策日志

[`DECISIONS.md`](DECISIONS.md)：一个决定一条（D1…D130），写**为什么**、实测数字与踩过的坑。
同一轮工作的最新条目会就地补全，更早的条目不再改 —— 要查"这个功能怎么来的、这个数字怎么量的"，grep 它。

## 阶段产物与历史快照

见 [`../reports/README.md`](../reports/README.md)：M1 / M2a / M2b / M9 是阶段报告（历史），
`validation-report.md` 与 `stage-check.tsv` 由脚本生成（可重跑），`extra-pending.tsv` 是校验器的输入。

## 工作区笔记（不进版本库）

`.ref/` 整体 gitignore：`notes/`（开工前的规格与盘点）、`upstream-v3/`（上游只读副本）、
`thbwiki/`（Music Room 抓取快照）、`scripts/`（一次性脚本）。
**只有吃进本仓库文档的结论才算数**，`notes/` 里的内容随时可能过期。

## 其他入口

根 [`README.md`](../README.md)（怎么跑 / 怎么玩 / 联机 / 部署）、
[`otomads-separation-v1.md`](otomads-separation-v1.md)（音MAD 与原曲的数据/运行时分离契约，已实现）、
[`sources-separation-v1.md`](sources-separation-v1.md)（音源层按模式拆的契约，已实现）、
[`../tools/README.md`](../tools/README.md)（数据管线模块）、
[`../data/README.md`](../data/README.md)（真相源目录）、
[`../data/packs/README.md`](../data/packs/README.md)（曲包形状）、
[`../data/otomads/README.ai.MD`](../data/otomads/README.ai.MD)（音MAD 数据 submodule；AI 维护的说明）、
[`../deploy/README.md`](../deploy/README.md)（单端口部署）。
