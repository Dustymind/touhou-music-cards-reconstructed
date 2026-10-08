# 开发

面向**改这个仓库的人**。用户向的内容（怎么跑起来、怎么玩、联机）在主 [`README.md`](../README.md)。

## 日常命令

| 命令 | 作用 |
|---|---|
| `pnpm typecheck` | 类型检查（`tsc --noEmit`） |
| `pnpm test` | 单测：chromium + firefox 两个引擎，真实浏览器里跑 |
| `pnpm test:chromium` / `pnpm test:firefox` | 只跑其中一个引擎（调试用） |
| `pnpm test:file <文件>` | 只跑**指定**的单测文件（见下「迭代时怎么快跑」） |
| `pnpm test:related <文件>` | 按 import 图跑**会被这个文件影响**的单测 —— 改完一个模块、不确定牵动谁时用这条 |
| `pnpm e2e` | 浏览器端到端：chromium + firefox + 移动端（Pixel 7），**三端串行、约 40 分钟** |
| `pnpm e2e:quick` | **只跑 chromium**（≈ 1/3 时间）—— 日常默认用这条，全量留给推送前 |
| `pnpm e2e:chromium` / `pnpm e2e:firefox` / `pnpm e2e:mobile` | 只跑其中一端（调试用） |
| `pnpm e2e:file <spec>` | 只跑**指定**的 e2e 文件（默认只 chromium） |
| `pnpm e2e:perf` | 单独跑「点击长任务」性能守卫（对机器负载敏感，不进全量） |
| `pnpm audio:fetch` | 抓取并裁剪曲包音频（见主 README 部署指南 §4） |
| `pnpm gate` / `pnpm data:validate` | 数据门禁（先跑 `pnpm data:datasets`，再 build + validate + 署名检查）/ 只跑不变量校验（`tools/` 是 Python，用 `uv` 管环境） |
| `pnpm data:datasets` | 只让两个数据仓库各自生成自己的数据集（env `OTOMADS_DATA_DIR` / `CUSTOM_DATA_DIR`，默认 `data/<mode>`） |
| `pnpm data:test` | 数据管线测试（音频/本地源那些在数据仓库里，各有自己的 uv 工程） |

> **各套测试的实测条数只在 [`README.md`](README.md) 的现状表里维护一份**，别在别处再抄。
> 这里原先抄过一份（写 856 passed），而当时实际已经是 1258 —— 数字一旦有两份就必然有一份是错的。

**e2e 的前置条件**（音MAD 用例要先起本地曲库助手、浏览器要装在仓库内）见主 README 部署指南 §6。

## 迭代时怎么快跑（全量很慢，别每次都全量）

全量那两条是**提交前**的闸门，不是写代码时的循环：`pnpm test` 约 **4.5 分钟**（两个引擎、真实浏览器，
本机实测 271 秒）、`pnpm e2e` 约 **40 分钟**（三个 project **串行** —— `workers: 1` 是刻意的，
原因见 `playwright.config.ts` 里的注释：公告存储 / `addInitScript` 夹具 / `:5190` 端口都只有一份，
**并发会得到假红假绿而不是更快**）。改一处就想看一眼时，按"范围从小到大"来：

| 想确认什么 | 命令 | 实测耗时 |
|---|---|---|
| 某个单测文件 | `pnpm test:file src/content/notices.test.ts` | **~15 秒** |
| **某个模块改了、不知道会牵动谁** | `pnpm test:related src/content/notices.ts` | **~42 秒** |
| 全部单测但只一个引擎 | `pnpm test:chromium` | **~2.5 分钟**（实测 154 秒；全量的一半） |
| 出第一条红就停 | `pnpm test:file <文件> --bail=1` | 视情况 |
| 某个 e2e 文件（只一端） | `pnpm e2e:file e2e/smoke.spec.ts` | **~40 秒** |
| 某个 e2e 用例（只一端） | `pnpm e2e:file e2e/smoke.spec.ts -g "关于弹窗"` | **~12 秒** |
| 某个 e2e 用例（只手机） | `pnpm e2e:mobile -g "关于弹窗"` | **~7 秒** |
| 全部 e2e 但只一端 | `pnpm e2e:quick` | **~14 分钟** |
| 提交前 | `pnpm typecheck && pnpm test && pnpm e2e` | **~45 分钟**（含 e2e 前置的 `pnpm local`） |

三个省时间的细节：① e2e 的 dev server 配了 `reuseExistingServer`，**先自己起 `pnpm dev`**（或
`pnpm local` 起助手）就不会每次重开；② `-g` 是**按用例名过滤**，中文用例名也能匹配 —— 排错时先跑那一条；
③ e2e **一次只跑一个实例**（几个 project 共享 `:5190` 那个 dev server，两个实例会互相抢），
且跑之前先把上一轮的 `test-results/` 移走（Playwright 会 `rm -rf` 它，撞上本机沙箱的删除守卫会整轮失败）。

> 上面那几个 `*:file` / `*:related` 脚本的额外参数是**追加到命令末尾**的 —— pnpm 就是这么传参的。
> 所以 `pnpm test:file src/x.test.ts` 展开成 `… vitest run --project=chromium src/x.test.ts`
> （`--project` 在前、文件在后，vitest 认这个顺序）。
>
> ⚠️ **末尾再写一个 `--project=firefox` 是"再加上"、不是"换成"** —— 脚本里那个 `chromium` 还在，
> 实测**两个引擎都会跑**（同一文件 9 条 → 18 条）。只想跑 firefox 就别用这几个脚本，走
> `node scripts/run.mjs vitest run --project=firefox src/x.test.ts`。

### 改哪个模块 → 跑哪些测试

单测**和被测代码同目录、同名**（`src/foo/bar.ts` ↔ `src/foo/bar.test.ts`），所以"改哪个模块"基本就等于
"跑同目录那一批"。**不确定牵动谁时优先 `pnpm test:related <你改的那个文件>`** —— 它按 import 图反查，
比人记得全（实测改 `src/content/notices.ts` 会带上 `content` / `store` / `ui/components` / `ui/shell`
和 App 冒烟共 **6** 个文件；改 `src/store/notices.ts` 是 **4** 个）。

| 改了这儿 | 单测 | e2e（**按覆盖的功能**判断，不是自动推导的） |
|---|---|---|
| `src/content/**`（公告/关于的文案与 `.md` 正文） | `src/content/*.test.ts` | `smoke`、`mobile` |
| `src/store/**`（zustand 状态） | `src/store/*.test.ts` | `smoke`、`mode-separation`、`pack-snapshot` |
| `src/ui/**`（组件与排版） | 同目录 `*.test.tsx` | `smoke`、`mobile` |
| `src/game/**`（规则、CPU、回合循环） | `src/game/*.test.ts*` | `smoke` |
| `src/music/**`（曲目、筛选、作者序） | `src/music/*.test.ts` | `custom-mode`、`pack-snapshot` |
| `src/data/**`（数据集载入、卡面、快照） | `src/data/*.test.ts` | `pack-snapshot` |
| `src/net/**`（联机协议与意图） | `src/net/*.test.ts*` | `multiplayer`（只 chromium） |
| `src/audio/**`（播放、铃声、淡入淡出） | `src/audio/*.test.ts*` | `smoke` |
| `src/rng/**`（随机权威与种子） | `src/rng/*.test.ts` | — |
| `src/theme/**`（主题、画幅比） | `src/theme/*.test.ts` | — |
| `src/i18n/**`（语言开关） | `src/i18n/*.test.ts` | `smoke` |
| `src/persist.ts`（本地存储） | `src/persist.test.ts` | — |
| `src/App.tsx`（装配） | `src/App.test.tsx` | **全部** |
| `tools/**`（数据管线，Python） | **不走 vitest**：`pnpm data:test` | `pack-snapshot` |
| `scripts/**`、`deploy/**`、`.github/**` | — | 靠 `pnpm gate` + 一次全量 `pnpm e2e` |

**为什么 e2e 没有"按依赖图选"**：Playwright 的 `--only-changed` 只看**改过的 spec 文件本身**，
它**不建** `spec → src` 的依赖图 —— 改了 `src/store/notices.ts` 而没碰 spec，`--only-changed` 会
**一条都不跑**（假绿）。反过来，e2e spec 本身也几乎不 import `src`（实测只 import
`src/content/*` 与 `src/music/manifestUrl`，其余全靠**驱动真实界面**），所以"改了哪个 src 模块 ⇒ 该跑哪个 spec"
这层关系**推不出来**、只能靠上表人工维护。单测那边 vitest 有 `related`（真依赖图），所以不用这张表。

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

## 改站内公告（进站自动弹的那批 / 入口打开的那份列表）

**一条公告 = 一个 `.md` 文件**，放在 `src/content/notices/` 下（如 `welcome-2026-10.md`）；
**元数据与正文都在这个文件里**（D187 起）：文件开头的 `---` frontmatter 是唯一真源，
`---` 以下是正文。`src/content/notices.ts` 用 Vite 的 `?raw` 把整个文件原文读成字符串，
交给 `buildNoticeContent` 解析拼装 —— 所以它就是个普通 Markdown 文件（**不是** TS 里的模板字符串，
不用转义、不用管反引号，追加内容就在后面接着写）。改完存盘即热更新（`pnpm dev`）。

```md
---
id: welcome-2026-10              # 必填，稳定不变
title: { en: Welcome, zh: 欢迎 }  # 必填，双语（界面的 en/zh 开关切的就是它）
date: "2026-10-01"               # 可省，只影响"谁排前面"
# pinned: true                  # 可省，置顶
# from: "2026-10-01"            # 可省，不写 = 立即生效
# until: "2026-12-31"           # 可省，不写 = 不过期
# close: { en: Close, zh: 关闭 } # 可省，不写 = Close / 关闭
# draft: true                   # 可省，起草中 ⇒ **构建期就摘掉**（界面上根本没有这条）
---

正文从这里开始。
```

**TS 侧只剩"要加载哪些文件"**：`src/content/noticeMeta.ts` 的 `NOTICE_FILES` 是一张文件名清单，
**不再保存任何公告字段**。加一条公告 = ① 写 `notices/<新id>.md` ② 把它挂进 `notices.ts` 的 `bodies`
③ 在 `NOTICE_FILES` 里加一行（漏了第①/②处会"直接抛"、漏了第③处就"永远不出现"）。

**字段规则以 `src/content/noticeMeta.ts` 开头的注释为准**，`src/content/notices.test.ts` 逐条把关
（id 唯一且 `^[a-z0-9-]+$`、标题与「关闭」文案要么双语要么不写、
`from` / `until` / `date` 是真实存在的日期且 `from <= until`、`.md` 里不残留 `\r`、
`NOTICE_FILES` 里列了但取不到原文会**直接抛**）。**字段名写错 / 多写不认识的字段 ⇒ 构建时直接报错并指到行号**
（静默忽略最难点，所以宁可炸）。

### 起草中、还不想让人看到 ⇒ `draft: true`

`draft: true` 让这条**在构建期就被摘掉**（`buildNoticeContent` 里滤掉），所以
**界面、存储、e2e 夹具全都拿不到它** —— 不是"藏起来"，是"根本不存在"。

| 手段 | 语义 | 在哪一层生效 | 下游能不能拿到 |
|---|---|---|---|
| **`draft: true`** | 这篇**还没写好** | **构建期** | **拿不到**（条目被摘掉） |
| `from: 未来` | **写好了、排期上线** | 运行时 | 拿得到，只是在窗口外 |

⇒ **起草中用 `draft`**（连 e2e 都不会被它影响）；**定稿了、只是不想立刻发**的用 `from`。

- **`draft` 只认布尔**：`true` / `True` / `TRUE` 算草稿（YAML 1.2 布尔大小写不敏感）；
  `yes` / `1` / `"true"` 在 YAML 1.2 里**不是布尔** ⇒ 不算草稿，且会**报错**。
  （故意不宽容：写歪的 `draft` 若被认成草稿，就会**静默把公告藏起来**，那比报错危险得多。）
- **草稿跳过字段校验，但结构错误照报**：草稿可以"写一半先存着"（缺 `title`、字段名拼错、
  类型不对都不拦），但 `---` 未闭合 / YAML 语法错 / frontmatter 不是映射**照样当场抛**
  —— 那类错的后果是"连正文都取不出来"，没有"先凑合"的余地。
  ⚠️ **代价**：草稿里的字段错会在你把 `draft` 去掉的**那一刻一起爆**（通常正是你想发公告的时候）。
- 定稿 = **把 `draft: true` 删掉**（或改 `false`），它立刻就和别的公告一样了。

> **日期带引号最稳**：`yaml` 走 YAML 1.2 核心 schema，`date: 2026-10-01` 也是**字符串**（不会变成 `Date`，
> 所以没有时区脆性）；但 `date: 12345` 会被认成数字、`pinned: yes` 会被认成**字符串** ⇒ 一律按字符串/布尔校验。

**本地测试用的空壳**：`src/content/notices/draft.md` 是一份**整份只有注释**的空壳（⇒ 渲染出来是空的），
它的 frontmatter 里带着 **`draft: true`** ⇒ **构建期就被摘掉，界面与 e2e 都拿不到它**。
想在本机看效果，把那一行 `draft: true` 删掉即可（就这一处）—— 顺便也会把藏着的字段错一起暴露出来。
另有一份 `notices/example.md`：把**全部受支持的 Markdown 语法**（含任务列表 / 引用块 / 代码块 /
GFM 表格 / 删除线 / 图片 / 水平线）**逐条演示**一遍，它的 `date` 比 `welcome` 早
⇒ 排在后面（既在列表里、又不会顶掉进站自动弹的那条）。

> ⚠️ **注释正文里不要连着写出 HTML 注释的结束标记那三个字符** —— 渲染器剥离注释是**非贪婪**的，
> 会被提前截断、后半段当场漏到界面上（`.md` 里看着完全正常，只有**渲染出来**才看得见）。
> `draft.md` 真踩过这个坑，`src/content/notices.test.ts` 有一条回归守卫盯着。

### 展示顺序（谁排前面）—— **只在 content 层定义一次**

| 字段 | 管什么 | 不写时 |
|---|---|---|
| `pinned` | 是否**置顶**（置顶的排在最前） | 不置顶 |
| `date` | **排序用的发布日期**（`YYYY-MM-DD`），只决定先后 | 视为最旧（排在所有写了日期的之后） |
| `from` / `until` | **能不能看**（生效时间窗，含当天） | 不写 = 一直有效 |
| `draft` | **压根不发布**（构建期摘掉，比上面几个都彻底） | 不写 = 正式公告 |

规则：**置顶优先 → `date` 由新到旧 → 同档保持 `NOTICE_FILES` 里的书写顺序**（稳定排序）。
实现在 `src/content/noticeMeta.ts` 的 `sortNotices`，**在 `buildNoticeContent` 里就调好了** ⇒
`noticeContent.notices` 本身已经是展示顺序，下游直接按数组顺序读。

`date` 与 `from` / `until` **刻意分开**：调排序不动可见性、调窗口不动排序。`date` 也**不进内容指纹**
⇒ 改它不会让**关过**这条公告的人重新被打扰。

### 两个入口，同一批、同一序

| 入口 | 显示哪些 | 版式 |
|---|---|---|
| **进站自动弹** | `pickAutoNotices`：在窗口内、且**没关过**（或内容变过）的**全部** | 1 条 = 方案 B 三段式；**2 条以上** = 列表版式 |
| **入口按钮打开** | `noticesInWindow`：**全部在窗口内的**（**不受"关过"限制**，用户主动要看） | 恒为列表版式 |

- **开屏会一次弹多条**（D185 修正；D182 的"只弹第一条"已作废）。版式的分水岭是**几条**，不是哪种入口。
- **弹窗上只有一个动作：关闭**（D186）。**关闭 = 不再自动弹**（不是"只关这次"），而且**没有**勾选框。
- 关闭作用于**整批**：开屏弹几条就一起记下，不会"关掉后另外几条下次还跳出来"。
- 想看回来走**右上角的「公告」入口**（永远在、关过也照样列）；弹窗底部那行告知（`ShellNoticeHint`）
  就是把这条路告诉用户。**没有**"让它重新自动弹"的开关 —— 这是有意的一扇**单向门**。

**加一条新公告**（三处，漏了第一处就"直接抛"、漏了第三处就"永远不出现"）：

1. 复制 `notices/draft.md` 成 `notices/<新id>.md`，改 frontmatter（`id` / `title` 必填）并写正文；
2. `src/content/notices.ts` 顶上的 `bodies` 里挂上 `"<新id>.md": <那份 import>`；
3. `src/content/noticeMeta.ts` 的 `NOTICE_FILES` 里加一行 `"<新id>.md"`。

`id` 起个短的英文小写串，**别改已有的** —— 那是它的存档键。`from` / `until` 可选，用来限定显示窗口
（不写就是一直有效）。**想让某条排到最前**：调它的 `date`（越新越靠前），或直接加 `pinned: true`。

**内容用 Markdown 写** —— 解析交给**固化进仓库的 `marked`**（`src/vendor/marked/`，只取它的 `Lexer`
拿 token AST），渲染仍是**我们自己写的**（`src/ui/markdown.tsx`，纯 React 节点、
**绝不走 `dangerouslySetInnerHTML`**）。支持：`#`~`######` 标题、段落、无序 / 有序列表、任务列表
（`- [ ]` / `- [x]`，只读复选框）、`**粗体**` / `*斜体*` / `~~删除线~~` / `` `行内代码` ``、
`[文字](https://…)` 链接、`![替代](https://…)` 图片、`> 引用块`（内部可再放块级语法）、
```` ``` ```` 围栏代码块（可带语言，空白原样保留）、GFM 表格（`:--:` 控制对齐）、
`---` / `***` / `___` 水平线、行尾两个空格 = 硬换行、`<!-- 注释 -->`（整段丢掉）。

**不支持**：原始 HTML（`<script>` 等，**绝不会变成元素**，只会显示成一串字）、脚注、定义列表、
自动链接、行内标记的嵌套 —— 写了**原样显示**、不报错。
**链接与图片都只认 `http` / `https`**，其余协议（`javascript:` / `data:` / 相对地址）当普通文字渲染。
⚠️ **`marked` 自己不做这个过滤**（实测它照给 `javascript:` 的 href）⇒ 白名单在**我们**这边
（`safeProtocol`）。**图片别漏** —— `src` 同样是远程请求、同样能当隐私信标。

**两条不能破的铁律**（想动 `markdown.tsx` 先读它开头的文件注释）：

1. **绝不 `dangerouslySetInnerHTML`、绝不产 HTML 字符串** —— 别给 `html` token 加"当元素渲染"的
   分支，一加 XSS 面就从零变成非零。
2. **链接 `href` 与图片 `src` 都过 `safeProtocol`。**

**升级 `marked`**：过程写在 `src/vendor/marked/PROVENANCE.md`（版本 / 完整性 / 只留哪两个文件 /
删哪一行 / 许可口径 / sha256 核对）。⚠️ 固化的代价是**上游的安全修复不会再自动送来**，
所以要主动盯上游 release。为什么不用 `marked.parse()` + `DOMPurify`、为什么固化而不是加 npm 依赖，
见 `DECISIONS.md` **D189**（那条也推翻了 D182 关于"手写渲染器"的部分结论）。

> ⚠️ 正文**只有一份、不按语言分**：中英混排时 en / zh 两种界面显示的是同一段字。
> 要写两份的是 `title` / `close`（它们走界面右上角的语言开关）。
> 弹窗底部那行告知（`ShellNoticeHint`）与入口按钮（`ShellNoticeOpen`）也在 `src/i18n/localization.ts` 里，
> 但那是**全站共用**的一份，不随某条公告走。

### ⚠️ 正文要"两个环境各取一次"（动这块之前必读）

`notices.ts` 用了 **Vite 专有语法**（`?raw`）⇒ **只有 Vite 能加载它**。而 **e2e 的 spec 是被
Playwright 自己转译的**（不经过 Vite）：spec 只要（直接或间接）import 到 `?raw`，Playwright 就会把
`.md` 当 **JS 模块**解析 —— 而 `.md` 开头是 `---` 或汉字 ⇒ `SyntaxError: Unexpected token (1:0)` ⇒
**一个用例都收不上来**（`Error: No tests found`）。vitest 走 Vite，所以**单测毫无症状**：
典型的"本地全绿、`pnpm e2e` 全红"。

所以拆成两条路（**解析与拼装共用一份**，只有"读文件"各写一遍）：

| 谁 import | 从哪儿拿公告内容 | 原文怎么来 |
|---|---|---|
| 应用 / 单测（Vite） | `src/content/notices.ts` | `?raw`（构建期内联，整个文件含 frontmatter） |
| e2e（Playwright / Node） | `e2e/noticeContent.ts` | `node:fs` 读**同一批** `.md`（清单 = `NOTICE_FILES`） |

两边都调**同一个** `buildNoticeContent`（在 `src/content/noticeMeta.ts`，纯 TS）⇒ frontmatter 解析、
文件名清单、排序、指纹算法、规整口径都只有一份，不会漂移。**往 e2e 加 import 时别指向
`src/content/notices.ts`**；纯逻辑与类型（含 `noticeFingerprint`）从 `src/content/noticeMeta.ts` 取。

> 这不是理论风险：D183 落地时就是这么炸的（7 个 spec 全红）。**想看 e2e 加载正不正常，最快的一条：
> `node scripts/run.mjs playwright test --list`** —— 只收集不执行，几秒钟出结果。

**"关过"是按内容指纹记的**（`src/content/noticeMeta.ts` 的 `noticeFingerprint`，取 `id + 标题 + 正文` 的哈希）：

- 使用者关掉之后，**再改这条公告的标题或正文** ⇒ 指纹变了 ⇒ **会再弹一次**（改了东西就该让人知道）。
  这是 D186 那扇单向门**唯一**的例外，也是它唯一该有的例外；
- 只改 `from` / `until` / `date` / `pinned` / `draft`（没动标题正文）⇒ 指纹不变 ⇒ 不打扰。
  ⚠️ **frontmatter 里的字段改动同样按这条判** —— 指纹只算 `id + 标题 + 正文`，所以调排序/窗口/草稿开关都不进指纹。

存档按**每条公告一个键**（`tmc.v1.notice.<id>`，各自 `closed` / `dismissed` / `fingerprint` / `at`），
互不干扰。行为出处见 `DECISIONS.md` D182（原始设计）、**D186**（关闭语义那次改动）、
**D187**（frontmatter 化，加 `yaml` 依赖）与 **D188**（`draft` 草稿字段）。

## 文档在哪

| 想找什么 | 去哪 |
|---|---|
| 文档全景（哪份是契约、哪份是历史） | [`README.md`](README.md) |
| 决策与来龙去脉（**为什么**、实测数字、踩过的坑） | [`DECISIONS.md`](DECISIONS.md)（D1–D188） |
| 契约（改实现前先读，改了要同步） | [`README.md`](README.md) 的契约表 |
| 数据从哪来、许可边界在哪 | [`data-provenance.md`](data-provenance.md) |
| 阶段产物与历史快照 | `docs/reports/`（不进 git；里面只有 `pnpm data:validate` 现写的 `validation-report.md`，阶段报告已在 S5 删除） |
