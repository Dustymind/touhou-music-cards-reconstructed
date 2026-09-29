# 开发

面向**改这个仓库的人**。用户向的内容（怎么跑起来、怎么玩、联机）在主 [`README.md`](../README.md)。

## 日常命令

| 命令 | 作用 |
|---|---|
| `pnpm typecheck` | 类型检查（`tsc --noEmit`） |
| `pnpm test` | 单测：chromium + firefox 两个引擎，真实浏览器里跑 |
| `pnpm test:chromium` / `pnpm test:firefox` | 只跑其中一个引擎（调试用） |
| `pnpm e2e` | 浏览器端到端：chromium + firefox + 移动端（Pixel 7） |
| `pnpm e2e:chromium` / `pnpm e2e:firefox` / `pnpm e2e:mobile` | 只跑其中一端（调试用） |
| `pnpm e2e:perf` | 单独跑「点击长任务」性能守卫（对机器负载敏感，不进全量） |
| `pnpm audio:fetch` | 抓取并裁剪曲包音频（见主 README 部署指南 §4） |
| `pnpm gate` / `pnpm data:validate` | 数据门禁（先跑 `pnpm data:datasets`，再 build + validate + 署名检查）/ 只跑不变量校验（`tools/` 是 Python，用 `uv` 管环境） |
| `pnpm data:datasets` | 只让两个数据仓库各自生成自己的数据集（env `OTOMADS_DATA_DIR` / `CUSTOM_DATA_DIR`，默认 `data/<mode>`） |
| `pnpm data:test` | 数据管线测试（音频/本地源那些在数据仓库里，各有自己的 uv 工程） |

> **各套测试的实测条数只在 [`README.md`](README.md) 的现状表里维护一份**，别在别处再抄。
> 这里原先抄过一份（写 856 passed），而当时实际已经是 1258 —— 数字一旦有两份就必然有一份是错的。

**e2e 的前置条件**（音MAD 用例要先起本地曲库助手、浏览器要装在仓库内）见主 README 部署指南 §6。

## 迭代时怎么快跑（全量很慢，别每次都全量）

全量那两条是**提交前**的闸门，不是写代码时的循环：`pnpm test` 约 **110 秒**、`pnpm e2e` 约
**9 分钟**（三个 project 串行）。改一处就想看一眼时，按"范围从小到大"来：

| 想确认什么 | 命令 | 实测耗时 |
|---|---|---|
| 某个单测文件 | `npx vitest run src/content/about.test.ts src/ui/components/AboutDialog.test.tsx` | **~3.5 秒** |
| 全部单测但只一个引擎 | `pnpm test:chromium` | **~35 秒**（全量的一半） |
| 出第一条红就停 | `npx vitest run --bail=1` | 视情况 |
| 某个 e2e 用例（两端） | `npx playwright test e2e/smoke.spec.ts --project=chromium --project=firefox -g "关于弹窗"` | **~12 秒** |
| 某个 e2e 用例（只手机） | `npx playwright test --project=mobile -g "关于弹窗"` | **~7 秒** |
| 某个 e2e 文件（只一端） | `npx playwright test e2e/smoke.spec.ts --project=chromium` | **~40 秒** |
| 提交前 | `pnpm typecheck && pnpm test && pnpm e2e` | **~12 分钟**（含 e2e 前置的 `pnpm local`） |

两个省时间的细节：① e2e 的 dev server 配了 `reuseExistingServer`，**先自己起 `pnpm dev`**（或
`pnpm local` 起助手）就不会每次重开；② `-g` 是**按用例名过滤**，中文用例名也能匹配 —— 排错时先跑那一条。

## 技术栈

Vite 7 + React 19 + TypeScript + MUI 7（主题按 **Material Design 2** 写：4dp 圆角、8dp 栅格、
按钮 36dp、chip 32dp、深色基线），状态用 zustand，联机用 PeerJS。

## 改「关于」弹窗的内容

弹窗里的**每一个字**都在一个前端源码文件里：`src/content/about.ts`，改这一个文件就够了
（`pnpm dev` 存盘即热更新，不用碰组件，也不用跑数据管线）。

**字段规则以那个文件开头的注释为准** —— `src/content/about.test.ts` 会逐条把关，哪一行哪个字段
没守住，跑一次 `pnpm test` 就会指名道姓地报出来。本节只补注释里没展开的两块。

### 外置曲库曲目作者（自动行）

`{ auto: "pack-authors", label: … }` 这一行的**名单不在这里写** —— 它从已载入的音MAD 曲包数据里
自动收集、去重、排序（曲包现在是 **191 首**；其中 **14 条**用 `authors` 数组写多作者，其余是单个 `author`）：

- **排序**：按"英文 / 拼音首字母"混排（汉字用拼音，如 `鞍…`→a、`拔…`→b；英文名按字母，如 `Chyan_184`→c；
  假名排在最后）。同一个首字母内部仍按 ICU 的读音序（汉字在拉丁名之前）。
- **显示条件**：**本地曲库助手真的在跑**（本地源载入成功）时才出现；没在跑时**整行不显示**（连标签都没有）。
  由此有个可见性后果：本地源只属于音MAD 数据集 ⇒ **原曲模式下看不到这一段**，切到音MAD 才出现。
- **排版**：默认一段文字（用「、」连接）；想一行一个作者就写 `layout: "lines"`。
- **多作者**：曲包写 `authors = ["甲", "乙"]` 时**逐个署名**（分别进列表）；只写 `author = "甲 & 乙"`
  时那一整串算一个署名（不猜 `&`，见 D135）。播放页的作者行用**同一套排序**（`src/music/authorOrder.ts`）。
- 名字是**白色纯文字**（数据里只有曲目的来源地址、没有作者主页，所以不给空链接）。

**位置**由你在 `rows` 里放哪儿决定（现在放在「原作」上方）。想隐藏就整块删掉。

### License 行的标识符（自动，别手写）

`label.en === "License"` 那一行的内容**不在 `about.ts` 里写死**：`scripts/gen-notices.mjs`
（`pnpm notices`）按 npm 生产闭包 + 随包分发的素材（字体 `OFL-1.1`、Material Icons `Apache-2.0`，
后者不是任何包的 `license` 字段 ⇒ 只能手写在生成器的 `ASSET_LICENSES`）生成
`src/content/licenses.generated.ts`；`pnpm gate` 的 `--check` 与 `src/content/about.test.ts` 两处守着。
要加一个随产物分发的许可：改生成器的 `ASSET_LICENSES`（或升依赖，让闭包自己变）后跑 `pnpm notices`。

### 弹窗的视觉规格

MD2 规格（280/560 宽、4dp 圆角、elevation 24、32% 黑遮罩、150/75ms 动效、右下角「关闭」+
点遮罩 + Esc；「关闭」按用户要求取**白字**、不走主色）见 [`DECISIONS.md`](DECISIONS.md) D133。

## 文档在哪

| 想找什么 | 去哪 |
|---|---|
| 文档全景（哪份是契约、哪份是历史） | [`README.md`](README.md) |
| 决策与来龙去脉（**为什么**、实测数字、踩过的坑） | [`DECISIONS.md`](DECISIONS.md)（D1–D178） |
| 契约（改实现前先读，改了要同步） | [`README.md`](README.md) 的契约表 |
| 数据从哪来、许可边界在哪 | [`data-provenance.md`](data-provenance.md) |
| 阶段产物与历史快照 | `docs/reports/`（不进 git；里面只有 `pnpm data:validate` 现写的 `validation-report.md`，阶段报告已在 S5 删除） |
