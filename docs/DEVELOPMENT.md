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

## 改站内公告（进站自动弹的那条）

**正文是真正的 `.md` 文件**，一条一稿，放在 `src/content/notices/` 下（如 `welcome-2026-10.md`）；
**元数据**（`id` / 标题 / 时间窗 / 正文文件名）在 `src/content/noticeMeta.ts`。
`src/content/notices.ts` 用 Vite 的 `?raw` 把 `.md` 原文读成字符串（所以它就是个普通 Markdown 文件，
**不是** TS 里的模板字符串 —— 不用转义、不用管反引号，追加内容就在后面接着写）。改完存盘即热更新（`pnpm dev`）。

**字段规则以 `src/content/notices.ts` 开头的注释为准**，`src/content/notices.test.ts` 逐条把关
（id 唯一且 `^[a-z0-9-]+$`、标题/关闭键/勾选框文案要么双语要么不写、`from`/`until` 是真实存在的日期且 `from <= until`、
`.md` 里不残留 `\r`、某条取不到正文会**直接抛**）。

**本地测试用的空壳**：`src/content/notices/draft.md` 是一份**整份只有注释**的空壳（⇒ 渲染出来是空的），
在 `noticeMeta` 里带着 `from: "2099-01-01"` ⇒ **默认不生效、不会出现在线上**。想在本机看效果，
把那个 `from` 删掉或改成今天即可（就这一处）。

**加一条新公告**（三处，漏了第一处就"直接抛"、漏了第三处就"永远不出现"）：

1. 复制 `notices/draft.md` 成 `notices/<新id>.md`，写正文；
2. `src/content/notices.ts` 顶上的 `bodies` 里挂上 `"<新id>.md": <那份 import>`；
3. `src/content/noticeMeta.ts` 的 `noticeMeta` 里加一条（`bodyFile: "<新id>.md"`，`title` 写双语）。

`id` 起个短的英文小写串，**别改已有的** —— 那是它的存档键。`from` / `until` 可选，用来限定显示窗口
（不写就是一直有效）。

**内容用 Markdown 写**，支持一个小到够用的子集：`##` / `###` 标题、段落、`-` / `*` 无序列表、
`1.` 有序列表、`**粗体**` / `*斜体*` / `` `行内代码` ``、`[文字](https://…)` 链接、
行尾两个空格 = 硬换行、`<!-- 注释 -->`（整段丢掉）。**不支持**图片、表格、引用块、原始 HTML ——
写了会**原样显示**。**渲染器是自己手写的**（`src/ui/markdown.tsx`，零依赖、
纯 React 节点、**不走 `dangerouslySetInnerHTML`**）—— 为什么不用 `marked` + 消毒库见 `DECISIONS.md` D182。
链接只认 `http` / `https`，其余协议（`javascript:` 等）当普通文字渲染。

> ⚠️ 正文**只有一份、不按语言分**：中英混排时 en / zh 两种界面显示的是同一段字。
> 要写两份的是 `title` / `close` / `dismiss`（它们走界面右上角的语言开关）。

### ⚠️ 正文要"两个环境各取一次"（动这块之前必读）

`notices.ts` 用了 **Vite 专有语法**（`?raw`）⇒ **只有 Vite 能加载它**。而 **e2e 的 spec 是被
Playwright 自己转译的**（不经过 Vite）：spec 只要（直接或间接）import 到 `?raw`，Playwright 就会把
`.md` 当 **JS 模块**解析 —— 而 `.md` 开头是 `<!--` 或汉字 ⇒ `SyntaxError: Unexpected token (1:0)` ⇒
**一个用例都收不上来**（`Error: No tests found`）。vitest 走 Vite，所以**单测毫无症状**：
典型的"本地全绿、`pnpm e2e` 全红"。

所以拆成两条路：

| 谁 import | 从哪儿拿公告内容 | 正文怎么来 |
|---|---|---|
| 应用 / 单测（Vite） | `src/content/notices.ts` | `?raw`（构建期内联） |
| e2e（Playwright / Node） | `e2e/noticeContent.ts` | `node:fs` 读**同一批** `.md` |

两边都调**同一个** `buildNoticeContent`（在 `src/content/noticeMeta.ts`，纯 TS）⇒ 元数据、正文文件、
指纹算法、规整口径都只有一份，不会漂移。**往 e2e 加 import 时别指向 `src/content/notices.ts`**；
纯逻辑与类型（含 `noticeFingerprint`）从 `src/content/noticeMeta.ts` 取。

> 这不是理论风险：D183 落地时就是这么炸的（7 个 spec 全红）。**想看 e2e 加载正不正常，最快的一条：
> `node scripts/run.mjs playwright test --list`** —— 只收集不执行，几秒钟出结果。

**"不再显示"是按内容指纹记的**（`src/content/noticeMeta.ts` 的 `noticeFingerprint`，取 `id + 标题 + 正文` 的哈希）：

- 使用者点过「不再显示」后，**再改这条公告的标题或正文** ⇒ 指纹变了 ⇒ **会再弹一次**（改了东西就该让人知道）；
- 只改 `from` / `until`（没动标题正文）⇒ 指纹不变 ⇒ 不打扰。

存档按**每条公告一个键**（`tmc.v1.notice.<id>`，各自 `closed` / `dismissed` / `fingerprint` / `at`），
互不干扰。行为出处见 `DECISIONS.md` D182。

## 文档在哪

| 想找什么 | 去哪 |
|---|---|
| 文档全景（哪份是契约、哪份是历史） | [`README.md`](README.md) |
| 决策与来龙去脉（**为什么**、实测数字、踩过的坑） | [`DECISIONS.md`](DECISIONS.md)（D1–D178） |
| 契约（改实现前先读，改了要同步） | [`README.md`](README.md) 的契约表 |
| 数据从哪来、许可边界在哪 | [`data-provenance.md`](data-provenance.md) |
| 阶段产物与历史快照 | `docs/reports/`（不进 git；里面只有 `pnpm data:validate` 现写的 `validation-report.md`，阶段报告已在 S5 删除） |
