# 文档全景

一句话：**现状看本页，规则看契约，来龙去脉看 DECISIONS，怎么改看 DEVELOPMENT，过程产物看 reports。**

用户向的内容（怎么跑起来 / 怎么玩 / 联机 / 许可）在主 [`README.md`](../README.md)，不在本目录。

## 现状（最近一次实测：2026-09-29，Linux）

> **各套测试的条数以本表为唯一维护点** —— 主 README 与 DEVELOPMENT 都只写"跑什么、怎么跑"，
> 不抄数字（抄过，然后就过期了）。

| 项 | 值 | 从哪来 / 怎么复现 |
|---|---|---|
| 角色 | 121 | `data/public/data/index.json`（构建期生成，gitignored） |
| 专辑 | 39 | 同上 |
| 角色曲目条目 / 去重曲目 | 569 / 559（**三份数据集**：原曲 121 角色 378 条 + 音MAD 80 角色 191 条 + 自定义 0，前两份互斥） | 同上（各份 `index.json` 的 `counts`） |
| 卡面集 / 注册音源 | 8 / 4（含 1 套音MAD **本地图集**：素材用户自己放进仓库根 `cards-otomads/`；1 套音MAD 封面集 `source_only`；自定义模式用代码里的合成图集 + 用户在「卡面设置」里选的**常规 / 16:9 / 4:3** 档位 —— D167 起画幅纯前端裁、数据侧只有一条链接，都不进这张表） | 同上 |
| 音MAD 曲包 | 1 包：191 首 / 80 个角色；**191 条带 `source`**（可自动抓取）、**36 条带裁剪区间**（前导静音已裁） | 真源在数据仓库（`OTOMADS_DATA_DIR`，默认 `data/otomads/`）：清单 `<OTOMADS_DATA_DIR>/packs/otomads.toml` + 一角色一份 `<OTOMADS_DATA_DIR>/packs/otomads/*.toml`（D128；不再是 submodule）；`pnpm audio:fetch --dry-run`（数据仓库的 `otomads.fetch_audio`，D130） |
| 前端单测 | **1270 passed**（chromium 与 firefox **各 635**；真实浏览器，vitest 浏览器模式；双引擎同跑偶发一条 flaky，稳跑法见 `DEVELOPMENT.md`） | `pnpm test:chromium` / `pnpm test:firefox` |
| 数据管线测试 | **83 passed**（主仓库）+ **239 passed**（音MAD 数据仓库 `tools/`）+ **386 passed**（自定义数据仓库 `tools/`） | `cd tools && uv run pytest` / `uv run --project tools pytest`（在各自的数据仓库）。音MAD 那套 222 → 211 是随录入链删除的 13 条；211 → 239 与主仓库 71 → 83 是收尾用例（D175 的共享向量 / 内容哈希 / 响度表只从数据集取 + 两侧各一条 bitrate 范围向量） |
| 端到端 | **115 passed + 1 skipped**（chromium 52 + firefox 51，mobile 12；含模式 3 的 **8** 条 × 两个桌面引擎；skip 的那条是联机用例只在 chromium 跑）。整跑负载下 firefox 偶发一条超时（`pack-snapshot`，单跑 ✓）。**前置：先 `pnpm local` 起本地曲库助手** | `pnpm e2e` |
| 数据漂移 | 无（S3 起生成物不进仓库） | `pnpm gate`（先跑 `pnpm data:datasets`，再 build + validate + notices；可复现性由 CI 的两次构建比对承担） |
| 数据校验 | 通过 | `pnpm data:validate` |
| 联机协议版本 | **7** | `src/net/protocol.ts`（D168 起 `GameState` 带 `perTrackFaces` / `currentCardIndex` —— "这一回合放哪一首"由答案卡决定；`SessionConfigWire` = 音乐模式 + 会话种子 + 自定义源链接；`dataHash` = 三个模式各一个；**7** = 曲id 身份 + 生成物 schema 2，硬切，见 `protocol-v1.md` / D173） |
| 决策日志 | 编号 D1–D178 中**实有 177 条**（**D165 未使用**，是编号空洞，见该处的编号说明）；D177 是删掉角色文件里只写不读的 `card`（六套图集 id），D178 是命令行输出的 emoji 清理与 systemd 单元状态行（`[  OK  ]` / `[FAILED]` / `[ WARN ]` / `[ SKIP ]` / `[  ..  ]`）。带 `⚠️` 的 19 条是「已被取代」/「前提已变」标记，**不是待办** | [`DECISIONS.md`](DECISIONS.md) |

> **e2e 的前置条件**：音MAD 相关用例会取同源的 `/manifest.json`（开发服务器代理到本地曲库助手），
> 必须先起助手再跑，否则那几条会红 —— 这是环境问题，不是代码问题（D105 记过这个坑）。

## 契约（改实现前先读，改了要同步）

| 文档 | 管什么 | 破坏了会怎样 |
|---|---|---|
| [`rng-v1.md`](rng-v1.md) | 随机数实现、`draw` / `derive` 两条口径、种子由谁生成 | 联机两端分叉、存档与回放不可复现 |
| [`protocol-v1.md`](protocol-v1.md) | 握手、消息表、顺序、会话配置下发、版本演进 | 两端状态分叉，或旧对端被静默接受 |
| ~~`rules-classification-v1.md`~~ | （S5 已随分类派生链删除；`extra` 四值口径见 `data-provenance.md`） | 分类漂移、`tmc.validate` 报错 |
| [`packs-audio-v1.md`](packs-audio-v1.md) | 曲包音频的 `source` / `start_time` / `stop_time`、抓取与裁剪流程 | 两端听到的音频不同却仍能握手 |
| [`custom-mode-v1.md`](custom-mode-v1.md) | 自定义模式（`custom`）的源清单形状、卡面/音频地址、三元与逐卡禁用、哈希与联机采用 | "看得见点不响"、两端卡表不同却仍能握手 |
| [`data-provenance.md`](data-provenance.md) | 数据从哪来、THBWiki 依赖落在哪两处、许可分层与重推导现状 | 把 THBWiki 的译文/正文再引进仓库，或把许可标错 |

另有 [`otomads-separation-v1.md`](otomads-separation-v1.md)（音MAD 与原曲的数据/运行时分离）与
[`sources-separation-v1.md`](sources-separation-v1.md)（音源层按模式拆），两者都已实现，改动同源时一并读。

## 开发

[`DEVELOPMENT.md`](DEVELOPMENT.md)：日常命令、迭代时怎么快跑、改「关于」弹窗、技术栈。
环境搭建与部署在主 [`README.md`](../README.md)。
**Windows 上跑**（迁移清单、长路径、行尾；脚本已跨平台）见 [`WINDOWS.md`](WINDOWS.md)。

## 决策日志

[`DECISIONS.md`](DECISIONS.md)：一个决定一条（D1–D178），写**为什么**、实测数字与踩过的坑。
同一轮工作的最新条目会就地补全，更早的条目不再改 —— 要查"这个功能怎么来的、这个数字怎么量的"，grep 它。

## 阶段产物与历史快照

见 [`reports/README.md`](reports/README.md)（**2026-09-28 从根目录 `reports/` 移进本目录**）：
M1 / M2a / M2b / M9 是阶段报告（历史），`validation-report.md` 由脚本生成（可重跑）。
S5 起 `docs/reports/` 移出 git（工作记录不随仓库分发）；写入路径由 `tmc.repo.REPORTS` 定义，只此一处。

## 工作区笔记（不进版本库）

`.ref/` 整体 gitignore：**S5 起只剩 `notes/`**（开工前的规格与盘点，332 KB）——
`scripts/`、`thbwiki/`、`upstream-v3/` 已随 §13.5/§13.6 删除（上游要重克隆，快照要重抓）。
**只有吃进本仓库文档的结论才算数**，`notes/` 里的内容随时可能过期。

## 其他入口

根 [`README.md`](../README.md)（快速开始 / 本地部署 / 怎么玩 / 联机 / 许可）、
[`permissions/upstream-authorization.md`](permissions/upstream-authorization.md)（上游授权凭据）、
[`../tools/README.md`](../tools/README.md)（数据管线模块）、
[`../data/README.md`](../data/README.md)（真相源目录）、
[`../data/packs/README.md`](../data/packs/README.md)（曲包形状）、
[`touhou-music-cards-otomads-data`](https://github.com/Dustymind/touhou-music-cards-otomads-data) 的 `README.ai.MD`（音MAD 数据仓库的 AI 维护说明；默认 clone 在 `data/otomads/`，未 clone 时本地链接不存在）、
[`../deploy/README.md`](../deploy/README.md)（单端口部署）、
[`../THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md)（随产物分发的第三方署名）、
[`../REUSE.toml`](../REUSE.toml)（逐路径许可映射，`uvx --from reuse reuse lint` 校验）。
