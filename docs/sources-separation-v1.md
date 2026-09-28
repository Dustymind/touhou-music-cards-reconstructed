# 音源层分离契约 v1（音源注册表按模式拆）

**状态：已实现**（D113）。§8 的 6 条按推荐全部采纳（用户裁定）；实现结果见 §9。

对象：`data/sources/sources.toml`（音源注册表）、`public/data/sources.json`（它的生成物）、
`tmc.v1.sources`（用户的开关/顺序存档），以及 `effectiveSourceOverrides()` 这个运行期补丁。
目的：**音源层也跟数据层一个口径** —— 每个模式用自己那份源表，不需要"切模式时偷偷把某个源打开"。

**用户已裁定**（2026-09）：
1. 注册表拆成 `data/sources/originals.toml` + `data/otomads/sources/otomads.toml`（后者自 D128 起在数据 submodule 里）；
2. 用户的开关/顺序存档 `tmc.v1.sources` **按模式分键**（要迁移）；
3. `effectiveSourceOverrides()` 的解释已给出 ⇒ 建议**删掉**，用构建期校验替代（见 §5）。

前置：D109（曲包一角色一份文件）、D110（运行状态按模式分键）、D112（两份数据集 + 协议 v4）。

---

## 1. 现状与它的问题

| 项 | 现状 |
|---|---|
| 注册表 | 一份 `sources.toml`：2 个 `kind = "remote"`（netease163 / thbwiki，服务原曲）+ 1 个 `kind = "local"`（`tableUrl = /manifest.json`，服务音MAD，**默认 `enabled = false`**） |
| 镜像表内容 | 三份各 **651 条 / 39 张专辑**，**全部是原曲曲目**；曲包曲目不进镜像表（D52） |
| 运行期 | `loadSourceTables()` 把**当前启用的源全部并行取**（`src/music/sources.ts:158`）⇒ 音MAD 下那 **334 KB** 镜像表照样下载，一条也用不上 |
| 用户存档 | `tmc.v1.sources` **一份共享**（B 时明确没拆） |
| 运行期补丁 | `effectiveSourceOverrides()`（音MAD 下强制打开 local）+ `SourceSection` 的 `forced`（界面显示为开且不可点）—— **同一条规则写了两遍** |

**为什么会有那个补丁**：local 源默认关（多数机器没起 8011 助手），而音MAD 的地址只能从本地 manifest 解析 ⇒
不打开就**静音**。补丁在不改写用户设置的前提下临时打开它（D52 的口径）。

---

## 1.5 源清单（manifest）的行形状

`[专辑, 曲目, 地址]`，第 4 位可选：**该曲目的媒体版本号**（D144）。前端把版本拼成 `?v=` 追加到地址上
（行里有就用行里的，没有才用顶层 `revision` 兜底；两者都没有 ⇒ 不拼，与改前逐字一致）。

为什么要有它：媒体地址在"音频变了但**链接没变**"时不会变，而 CDN 给 `.mp3` 发 `max-age=14400` ⇒
浏览器与边缘节点最多 4 小时都拿旧的（重裁、换 P、换编码口径都会中）。版本号来自**源自己的清单**
（数据仓库 `packformat.media_revision`：文件名 + 大小 + mtime），逐曲一位 ⇒ 只有真变过的那几首换 URL。
完整口径与实测见 `docs/packs-audio-v1.md` §15。

**D145 起，清单里还可能有"包数据"**（顶层两个键 `albums` / `characters`）：源在运行时提供
"这个包有哪些曲目"，应用拿它代替随前端部署的那份自带数据 ⇒ 加曲目只动数据仓库 + 铺源。
它是**可选**的（老清单没有这两个键就忽略、走兜底）；形状与哈希口径见 `docs/packs-audio-v1.md` §16。

---

## 2. 真源与生成物

```
data/sources/originals.toml        # 两个镜像（netease163 / thbwiki）
data/otomads/sources/otomads.toml  # 只有 local 源，且 enabled = true（D128：在 submodule 里）
data/sources/netease163.json       # 两份镜像表：**不拆**（内容是纯原曲，音MAD 一条都没有）
data/sources/thbwiki.json

public/data/sources.json           # 原曲注册表（生成物）
public/data/otomads/sources.json   # 音MAD 注册表（生成物）
public/data/sources/*.json         # 两份镜像表原样复制（它们本来就在原曲数据集根下）
```

- **镜像表不拆**：它们的内容已经只属于原曲，位置 `public/data/sources/` 就在原曲数据集根下；
  给音MAD 造三份空表不是分离，是仪式。
- 每份注册表的 `order` 从 1 起（各自独立的回退顺序）；`table_url` 的相对路径不变。
  > D131 追补：这里说的"相对路径"必须是**真相对路径**（`data/sources/x.json`，**不带前导 `/`**）。
  > 带前导 `/` 的根绝对路径只在域名根部署时看着正常，子目录部署（GitHub Pages 项目页）会 404。
  > 形态由 `tmc.build.table_url_problem()` 守（build 报错 + validate 查生成物）。

## 3. 数据集形状

`ModeDataset` 增加 `sources: SourceRecord[]`（每份数据集**自带**自己的源表）；
`SharedData` 只剩 `cardSets`（以及将来其它真正全站共享的东西）。

- `loadDataset()` 顺带取该模式目录下的 `sources.json`（与 `characters/albums` 同一批）。
- 消费侧：`useSources(dataset.sources, …)`、`SourceSection` 用 `dataset.sources`；
  `AppShell` 不再把"源"从共享项传下去。

## 4. 存档分键与迁移

| 键 | 内容 |
|---|---|
| `tmc.v1.sources.originals` | 原曲那三个镜像的开关/顺序（**老键 `tmc.v1.sources` 迁到这里**，沿用 B 的 `legacyName` 机制） |
| `tmc.v1.sources.otomads` | 音MAD 那份：**默认不写覆盖**（注册表里 local 已 `enabled = true`，无需覆盖） |

迁移只发生在"新键不存在、老键存在"时；老键不删（回退旧版本还读得到）。

## 5. 删补丁，换构建期不变量

- 删 `effectiveSourceOverrides()`（连同 `mode.test.ts` 里那两条用例）；
- 删 `SourceSection` 里的 `forced`（音MAD 下显示的就是本模式唯一的源，状态由它自己的 `enabled` 决定）；
- 新增校验（`tmc.validate`，构建期/CI 就红）：

| # | 不变量 | 为什么 |
|---|---|---|
| 1 | 每个模式的注册表**至少有一个** `enabled = true` 的源 | 否则那个模式一个地址都解析不出来（今天靠运行期补丁兜着） |
| 2 | `otomads.toml` **必须含恰好一个** `kind = "local"` 的源，且默认启用 | 音MAD 只有这一个源。地址是什么由数据说了算（D141 起默认是 CDN 的绝对地址；`kind = "local"` 的用处是**允许被「本地曲库地址」/`?localmusic=` 覆盖**） |
| 3 | `originals.toml` **不得**含 `kind = "local"` | 本地曲库只服务音MAD；混进来会让原曲莫名其妙依赖本机助手 |
| 4 | 两份注册表的 `id` 不得冲突 | 同名不同表会让人看不懂"这个开关到底在关哪个" |

**保留** `applyManifestOverrides()`（`?localmusic=` 部署覆盖）与单端口部署的 `/manifest.json` 代理 ——
那是部署参数，不是模式补丁。D141 起它的用途更明确：默认源在 CDN 上，本机开发/自建素材靠这个覆盖指回去。
（这个函数后来**改过名与签名**：当时叫 `applyLocalManifestUrl()`，现在收 `sources` 与
`{ local, custom }` 两个覆盖 —— `src/music/sources.ts:59`，调用点 `src/music/useSources.ts:36`。）

## 6. 不进哈希（明确的约定）

`contentHash` / `dataHash` 只覆盖**曲目表本身**（`characters + albums`；音MAD 那份自 D145 起由应用按
生效的数据集算，见 `docs/packs-audio-v1.md` §16），**音源注册表与表 URL 不进哈希**。理由：本地 manifest
的地址是**每台机器不同**的（`?localmusic=` / 助手端口），进哈希会让两台各自起助手的机器**无法联机**。
今天本来就没进；本条把它写成白纸黑字的约定，避免以后"顺手加进去"。

**D145 补两条**：

- **媒体版本号（D144 的 `revision`）也不进哈希** —— 同上，它是"这台机器上那份文件"的 mtime 指纹；
- **但清单里那段"包数据"（`albums` / `characters`）是要进哈希的**：它就是音MAD 的曲目表，
  两端曲目表不同必须在**握手期**被拒（D107 §6 的初衷）。形状见 `packs-audio-v1.md` §16。

## 7. 验证与回滚

**验证**：`pnpm data:check`（两份注册表都按模式比）/ `pnpm data:validate`（§5 的 4 条不变量）/
`uv run pytest` / `pnpm typecheck` / `pnpm test`（真实浏览器，chromium + firefox）/
`pnpm e2e`（三端）+ `pnpm e2e:perf`；另加一条 e2e：**音MAD 模式下不请求那两份镜像表**
（用 `page.on("request")` 抓 `/data/sources/*.json`，断言 0 次）—— 这就是这次拆分最直接的可观测收益。

**回滚**：只动数据与前端（**不动协议**），回滚 = 回退一个提交；`tmc.v1.sources.*` 两个新键退回老键即可。

## 8. 待裁定

| # | 问题 | 推荐 | 另一选项的代价 |
|---|---|---|---|
| **Q1** | 注册表生成物放哪：`public/data/sources.json` + `public/data/otomads/sources.json` / 都塞进模式目录（`originals/…`，会动原曲那套既定路径） | **根 + otomads/ ✅** | 后者要与 C 的"原曲在根"约定打一架 |
| **Q2** | 源表归属：`dataset.sources`（随数据集）/ 留在 `shared` 加 mode 字段 | **随数据集 ✅** | 留 shared 等于"数据分离了、源没分离" |
| **Q3** | 两份镜像表是否跟着挪到某个模式目录下 | **不挪 ✅** | 挪了要改 `table_url` 与部署代理，收益为零 |
| **Q4** | 音MAD 下本地源**可不可以被用户关掉**（关了那个模式就没源） | **可以，但给一行提示 ✅**（`source-none-enabled`） | 强制不可点会与"存档分键、用户说了算"的口径打架；完全不管则用户可能自己把自己弄哑 |
| **Q5** | 老存档 `tmc.v1.sources` 归哪个模式 | **归原曲 ✅**（同 B/D110） | 归音MAD 会让原曲的镜像顺序丢 |
| **Q6** | `SourceSection` 在音MAD 下是否保留"曲目只存在于本机"的提示行 | **保留 ✅**（`music-mode-local-hint`） | 去掉会让"为什么这里只有一个源"没人解释 |

---

## 9. 实现记录（D113）

**真源与生成物**：

| 文件 | 内容 |
|---|---|
| `data/sources/originals.toml` | 两个远程镜像（netease163 / thbwiki），**不含**本地源 |
| `data/otomads/sources/otomads.toml` | 只有本地曲库源，`order = 1`、`enabled = true`（本模式唯一来源；D128 起在 submodule 里；**默认 `table_url` 是 CDN 的绝对地址**，D141） |
| `public/data/sources.json` / `public/data/otomads/sources.json` | 各自的生成物（`build_sources(mode)`） |
| `public/data/sources/{netease163,thbwiki}.json` | **不挪**（契约 §2） |

- `tmc.validate` 的 `check_source_registry()` 按模式跑，并加了契约 §5 的四条不变量
  （每模式至少一个默认启用的源 / otomads 恰好一个 local 且默认开 / originals 不得含 local / 两表 id 不冲突）。
- 生成物从 12 个文件变 **14 个**（多出原曲与音MAD 各自的 `sources.json`）。
  **后续**：加了自定义模式与音MAD 响度表之后，现在是 **17 个**（`tools/src/tmc/build.py:318-344`）——
  本条按"落地当时"读。

**前端**：

| 位置 | 改动 |
|---|---|
| `src/data/types.ts` / `load.ts` | `ModeDataset.sources`（随数据集取 `sources.json`）；`SharedData` 只剩 `cardSets` |
| `src/store/sources.ts`（新） | 音源开关/顺序按模式分键：`tmc.v1.sources.originals`（老键迁入）/ `.otomads`；`effectiveOrder` 一并搬来 |
| `src/store/session.ts` | 不再持有音源开关/顺序（搬去上面那把） |
| `src/music/mode.ts` | **删掉 `effectiveSourceOverrides()`** —— 音源层按模式拆之后没有"临时强制打开"这回事了 |
| `src/ui/shell/AppShell.tsx` | `useSources(dataset.sources, 当前模式那把覆盖, …)` |
| `src/ui/panels/config/SourceSection.tsx` | 用 `dataset.sources`；删 `forced`（不再有"强制"标记）；本地地址栏只在**本数据集有本地源**（= 音MAD）时出现；一个启用的源都没有时给一行提示 |

**验证**（下面是**落地当时**的实测数字，不是现状 —— 现状条数见 [`README.md`](README.md) 的现状表）：
`pnpm data:check` 无漂移 ✓、`pnpm data:validate` 通过 ✓、`uv run pytest` **84 passed** ✓、
`pnpm typecheck` ✓、`pnpm test` **550 passed**（275 条 × chromium + firefox）✓、
`pnpm e2e` **76 passed + 1 skipped**（chromium 34 / firefox 33+1 / mobile 9）✓ ——
新增 `e2e/mode-separation.spec.ts` 的"音MAD 模式下不再下载原曲镜像表"（原曲侧有请求、切到音MAD 后**一次都没有**）。

**与草案的偏差**：一处 —— 本地曲库地址输入框在**原曲模式下不再显示**（原曲注册表里根本没有本地源），
草案没写到这一条；这是"配置页永远只列本数据集的源"的自然结果。
