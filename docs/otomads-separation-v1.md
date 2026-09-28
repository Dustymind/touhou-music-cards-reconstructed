# 音MAD 与原曲分离契约 v1（生成物与运行时两套数据集）

**状态：已实现**（D112，分支 `enhanced-otomad-mode`）。§10 的 6 条按推荐全部采纳（用户裁定）；实现结果见 §11。

对象：`public/data/*.json` 的**布局**、`tools/src/tmc/build.py` 的产出、前端 `DataBundle` 的加载，
以及联机握手用的 `contentHash` 口径。
目的：两个模式不再共用"一份合并数据 + 一个 `mode` 参数过滤"，而是**各自一份数据集**；
运行时删掉那层过滤，把"模式"变成"当前数据集的名字"。

前置：D109（曲包一角色一份文件）、D110（运行状态按模式分键）、D111（单测跑真实浏览器）。
计划与执行记录在仓库外 `B-C-PLAN.md`（§4 是本体，§8/§9 是已完成的两步）。

---

## 1. 现状与不可破坏的不变量

**现状**：`build.py` 用 `apply_tracks()` 把 86 条曲包曲目**追加进** 121 个角色的 `music` 末尾，
生成**一份** `characters.json` / `albums.json` / `index.json`；运行时靠 `album.pack` 反推每条曲目的模式
（`src/music/mode.ts` 的 6 个判定 + 17 处 `albums + mode` 传参）。

**本契约不能破坏的四条**：

| # | 不变量 | 由谁守 |
|---|---|---|
| 1 | 生成物可复现：`pnpm data:check` 无漂移 | `tmc.build --check` |
| 2 | 两端同数据 → 联机一致：哈希不同的两端**在握手期**就被拒（D107 §6） | `contentHash` + `hello.dataHash` |
| 3 | MD2 与间隔不变：不改任何间距 / 内边距 / 字号 / 尺寸常量 | e2e 的 8 条桌面布局守卫 + 3 条移动端用例 |
| 4 | `main` 不受影响：全部改动在 `enhanced-otomad-mode` 分支上完成，未确认不合并 | 分支 + 推送规矩（B-C-PLAN §头部） |

---

## 2. 生成物布局（推荐 D2）

> **注（现状，别再照抄下面的清单）**：这一段是 D2 的**提案**。实际落地见 §11（D112：**每模式一份数据集**、
> 源表随数据集走）与 D130（**响度表按源声明**，落在 `public/data/<模式>/loudness/…`，不是共享的 `loudness.json`）；
> D139 又往前一步：源可以在自己的 manifest 里声明表（`loudness` 键，相对 manifest 解析），前端优先按它取
> ⇒ **表跟着源部署**。

```
public/data/
  cardsets.json        共享：卡面图集（6 套）
  loudness.json        共享：逐曲响度增益（键是音频文件名）
  sources.json         共享：音源注册表（顺序 / 开关 / 本地源）
  packs.json           共享：曲包注册表（id / label / kind / order）
  index.json           原曲：counts + contentHash
  characters.json      原曲：121 个角色（**只有原曲曲目**）
  albums.json          原曲：40 张专辑
  otomads/
    index.json         音MAD：counts + contentHash
    characters.json    音MAD：有音MAD 曲目的 35 个角色（只有音MAD 曲目）
    albums.json        音MAD：曲包专辑
```

**为什么共享项单独放**：`cardsets` / `loudness` / `sources` / `packs` 与模式无关；
`loudness` 的键是**音频文件名**，两份会让"哪个才是真的"变成问题。相比 D1（每模式一个完整目录）
少重复约 15 KB 且只有一处真源。

**每模式的 `index.json`**：`counts` 只数自己那份（`characters` / `albums` / `trackEntries` / `distinctTracks`），
`contentHash` 只覆盖自己那份（见 §6）。`packTracks` 字段退场（它存在只是因为当时两份数据合并在一处）。

**体积**（今天实测）：`characters.json` 86.7 KB / `albums.json` 6.5 KB / `index.json` 0.3 KB；
121 个角色的**身份字段**（`name`/`order`/`card`/`searchNames`）合计约 18 KB —— 见 §5 决定它在两份里
是重复还是引用。

---

## 3. 构建与校验（tools）

| 位置 | 改成 |
|---|---|
| `build.py` | 去掉 `apply_tracks()`；`build_characters(mode)` / `build_albums(mode)` 各出一份；每模式一份 `index`（各自的 `contentHash`）；共享项只出一次 |
| `validate.py` | 按模式跑现有检查（角色存在、专辑注册、重复、`附加信息` 合法）；新增**跨模式**一致性检查：同一个角色 key 在两份里的身份字段必须一致（`name`/`order`/`card`/`searchNames`），否则界面会出现"同一个角色两个名字" |
| `packages/packs.py` | **不改**（D109 的读法照旧：清单 + 一角色一份曲目文件） |
| `pnpm data:check` | 按模式逐份比对（含 `index.json` 的哈希） |
| `docs/reports/validation-report.md` | 统计分两段（每模式一段 + 共享项） |

---

## 4. 前端加载与 `DataBundle`

新形状（示意）：

```ts
interface ModeDataset {
  index: DataIndex;                       // 自己的 counts / contentHash
  characters: CharacterRecord[];          // 只有本模式的曲目
  albums: AlbumRecord[];
  characterByKey: Map<string, CharacterRecord>;
  albumByName: Map<string, AlbumRecord>;
}

interface DataBundle {
  shared: { sources: SourceRecord[]; cardSets: CardSetRecord[] };
  datasets: Record<MusicMode, ModeDataset>;
}
```

组件取"当前数据集"用 `src/store/modeScope.ts` 已有的一对钩子（B 引入）：
`useMusicMode()`（组件）/ `currentMusicMode()`（非组件）→ `useDataset()` / `datasetFor(mode)`。

**加载策略（待裁定，§10 Q2）**：

| 策略 | 做法 | 代价 |
|---|---|---|
| **A：启动全取**（推荐） | 启动取两份数据集（今天是 98 KB → 约 115 KB）+ 共享项 | 无新失败路径；启动多约 17 KB（gzip 后更少） |
| B：切模式懒加载 | 启动只取当前模式那份，切模式时再取 | 启动不变，但引入**今天不存在**的"会话中途取数据失败"状态，要接 `useData` 的 `DataLoadError` 并给它一个界面 |

策略 A 下 `useData` 仍是"一次 Promise"；策略 B 需要一个按模式的懒加载器 + 失败重试 UI（MD2 的
告警条），这是一次界面改动的额外成本 —— 收益只是省 17 KB。

---

## 5. 角色身份（待裁定，§10 Q3）

| 方案 | 做法 | 代价 |
|---|---|---|
| **S1：共享真源，数据集投影**（推荐） | 真源仍只有 `data/characters/*.toml`；两份 `characters.json` 各自带身份字段（构建期从同一处投影） | 同一份身份在两份生成物里重复（18 KB）；但**只有一处要编辑**，跨模式一致性由 §3 的检查守住 |
| S2：各自真源 | `data/packs/otomads/characters/<key>.toml` 自带 `name`/`order`/`card`/`searchNames` | 音MAD 能有自己的顺序 / 别名 / 卡面；代价是第二份名单要人维护，且"同一个角色两个名字"要靠人盯 |

**今天的实际约束**：曲包角色必须是 `data/characters/*.toml` 里已有的 key（`check_packs` 会拦），
所以 S2 目前**只能带来"顺序/别名不同"**，不能引入新角色。
⇒ 建议 S1，并且把 S2 挂到触发条件上：**音MAD 要引入原曲里没有的角色或卡面时**再做。

**后续（D114，已实现）**：卡面那半条触发条件先落地了 —— 曲包角色文件可以用可选的 `card = [...]`
覆盖卡面（写法同 `data/characters/*.toml`，缺省沿用共享身份），并新增一套 `local_only` 的
`id = "otomads"` 图集；**角色身份**（`name`/`order`/`searchNames`）仍是单一真源。

**后续（D128）**：真源已拆到独立数据仓库（主仓库 submodule `data/otomads/`），S2 若要做，第二份名单有了自己的落脚点；
但"与原曲同名 key 的身份一致"仍由主仓库 `tmc.validate.check_datasets` 守，跨库后要先约定角色 key 的来源。

**后续（D137）**：手工补全"其余角色"的曲目时，**不能**把还没有曲目的角色提前写进 `characters.toml`
（那是**派生**清单：`check_roster` 会判「不再被曲包引用」、`pnpm data:roster` 还会删掉它）。落地的办法是主仓库
`pnpm data:scaffold` —— 给「真源里有、曲包里还没有文件」的角色生成**骨架文件**（顶层只有 `key`，
`name`/`order` 以注释带在文件头，另附注释掉的 `[[track]]` 示例）。骨架不含 `[[track]]` ⇒ 对生成物与
`contentHash` 完全惰性；命令**幂等**且**不覆盖**已填过的文件。**S2 仍按上面的触发条件预留**：
真要"音MAD 自有身份 / 自有顺序 / 自有别名"时再开，届时改的是 `tmc.roster` 的清单语义 + `check_roster` + 本契约。

**后续（D153）**：音MAD 侧多了一层**源封面** —— 数据仓库的每条 `[[track]]` 里的 `cover = "https://…"`
（B 站图床直链；**写在曲目里**，见 D153 的修订）→ 快照 `characters[].covers`（**数组，顺序 = 曲目顺序**）
→ 运行时 `CharacterRecord.covers`。三处后果：
**① 卡池从"角色 × 立绘"变成"角色 × 曲目"** —— 但**只在选中的是自定义卡面**（`sourceOnly`，
源按曲目给素材的那套）时：`cardCount(character, cardSet) = sourceOnly ? covers.length : card.length`。
选原版/本地图集时回到"一个角色 `card.length` 张卡"（否则会看到同一个角色的 N 张一样的立绘各占一张卡）。
`buildSongConflicts` 的自链接改按 **`maxCardCount`（两种口径取最大，与当前图集无关）** 判 ——
不变式不变：**一个角色在整张桌子上仍然只有一张卡**（按当前图集算的话，两端选了不同图集就会算出两张不同的表）；
**② 新增一套图集** `otomads-cover`（`source_only = true` + `mode = "otomads"`，`dir`/`origins` 都为空：
每张卡面本身就是绝对 URL），只在**音MAD 模式**、且生效数据集里**真的有 covers** 时列出（源不提供则整套不显示，
选中但不可用时只回落渲染、不动用户偏好）；
**③ `card` 与身份字段一个字没动** —— 音MAD 模式下选上游图集照旧显示原版立绘（多张卡按原版卡面轮转），
`covers` 只在音MAD 那份生成物里出现，所以"跨模式身份一致"的比对不受影响（`check_datasets` 另加了
"真源的 cover 真的进了生成物"一条）。`packHash`（§6）把 `covers` 一起算进去：
它决定**能抽到哪些牌**，两端不一致会出现"一边抽得到、另一边没有"。

**D153 的修订（同一天，用户要求）**：`cover` 从**角色文件顶层的数组**改成**每条 `[[track]]` 里的键**：

| | 旧（顶层数组） | 新（`[[track]].cover`） |
|---|---|---|
| 绑定方式 | **位置**：第 i 条 ↔ 第 i 首 | **跟着曲目本身**（增删/重排天然不错位） |
| 手改一条 | 要数第几条 | 改那一行 |
| 工具补缺 | 整个角色只能"全跳过"或 `--force` 全重建（**会盖手改**） | **逐条只补没有的**，已有的一个字不动 |
| 校验口径 | 数组长度必须等于曲目数 | **每个角色全有或全无**；半有半无 ⇒ 报错点名哪一首 |

**线上形状一个字没改**：`load_packs()` 仍给 `covers: dict[key, list[str]]`，快照仍发 `characters[].covers`
（数组、顺序 = 曲目顺序）⇒ 客户端（`cardFaces.ts` / `packSnapshot.ts` / `packHash`）与联机口径完全不受影响。
旧形状不是"悄悄不认"：两边的读法都会**报一句指路的话**，数据仓库的 `fetch_covers` 默认还会**按顺序自动迁移**它
（不联网、不动已有内容）。

---

## 6. 哈希与协议（待裁定，§10 Q4 —— C 最尖锐的取舍）

| 方案 | 做法 | 代价 |
|---|---|---|
| C1 | 保留一个总哈希（两模式一起算） | 握手不变；但"分离"在联机口径上只是名义上的：任一模式改动都让另一模式失效 |
| C2 | 每模式一个哈希，握手只比**当前模式** | 当前模式仍能在握手期拒绝；但"一方缺 otomads 数据"要拖到**切模式时**才炸 —— 违背 D107 §6 |
| **C3：两个都交换**（推荐） | `hello` / `SessionConfig` 带上两个哈希，任一不符即拒 | 保住"握手期拒绝"的初衷；代价是**协议 v3 → v4**（`PROTOCOL_VERSION`，`src/net/protocol.ts`），且要求两端都部署了两个模式的数据 |

C3 的形状（示意）：

```ts
// hello / welcome / snapshot 里由 dataHash: string 变成：
dataHash: { originals: string; otomads: string };
```

**"要求两端都部署两份数据"是不是问题**：是 —— otomads 数据在**主仓库里**（生成物 `public/data/otomads/*`；真源自 D128 起在独立数据仓库的 submodule `data/otomads/`），
不是"只有本机才有"（只有**音频**是本机的：本地曲库助手）。所以两端都部署两份数据是正常状态，
C3 不会把"单机模式"变成联机障碍。

### 6.1 D145 追加：otomads 那份哈希改成**运行期**算（C 路线）

C3 的形状没变（还是两个哈希、还是握手期任一不符即拒），但 **otomads 那个值的来源变了**：
自 D145 起**源可以在自己的清单里提供曲目表**（`albums` / `characters`），应用拿它 + 自己那份身份表
在运行时拼出 otomads 数据集 ⇒ 那个哈希由应用按**生效的数据集**算（`src/data/packSnapshot.ts` 的
`packHash`），**没有快照时也用它**。原曲那份不变（仍是构建期 `tmc.build.content_hash` 的 sha256）。

- **协议版本不动**（还是 4）：线上形状没变，变的是 otomads 哈希的**取值** —— 而那正是"数据不同"的判据；
- **口径**（覆盖专辑表 + 曲目条目，**不含** URL / 媒体版本 / 身份字段）与两条取舍写在
  `docs/packs-audio-v1.md` §16 —— 改动它等于改握手，两端必须一起更新；
- **代价**：一端用新数据、另一端还停在兜底那份时会被拒（fail-closed）；两端曲目表一样（哪怕一个用本机
  助手、一个用 CDN）仍能一起玩。

---

## 7. 运行时收尾

**删**：`apply_tracks()`；`src/music/mode.ts` 的 `packOfAlbum` / `modeOfEntry` / `isEntryAllowedInMode` /
`filterByMode` / `hasTracksInMode` / `firstAllowedInMode`（6 个判定）；17 处 `albums + mode` 传参
（`allowedTracks` / `countEnabled` / `presetStats` / `singleModeRows` / `effectivePin` / `usePlayer` /
`ListPanel` / `AppShell` / `GamePanel`）。

**留**：`MusicMode` 类型与 `MUSIC_MODES`（它仍是"当前数据集"的名字）、`useSession.musicMode`（那个开关）。
（当时留着的 `effectiveSourceOverrides()` —— 音MAD 下临时打开本地源 —— 已在 **D113** 删掉：
音源层也按模式拆之后，音MAD 的注册表里本来就只有本地源且默认开，不需要运行期补丁。）

**列表页 / 配置页 / 对局**：不再接收 `musicMode` 参数，直接用当前数据集（`useDataset()`）。

**放弃**：多曲包扩展性（第三个曲包要再加一套数据集）。**缓解**：契约里把"数据集"写成**按模式 id 的表**
（`Record<MusicMode, ModeDataset>` 而不是两个字段），将来加包 = 加一个 key + 一份生成物 + 一次协议字段扩展，
而不是重写形状。

---

## 8. 验证清单（实现完成后逐条跑）

```bash
cd ~/touhou-music-cards-reconstructed/touhou-music-cards-reconstructed
pnpm typecheck
pnpm test                                     # 275 条 × chromium + firefox
pnpm data:check                               # 按模式逐份比对
pnpm data:validate
cd tools && UV_CACHE_DIR=.uv/cache uv run pytest && cd ..
# e2e 前置：pnpm local（数据仓库的 otomads.local_source，D130）
pnpm e2e                                      # chromium + firefox + mobile
pnpm e2e:perf                                 # 单独跑
```

**新增 e2e**（chromium + firefox 都跑）：

1. **握手期拒绝**：起一个"另一份数据哈希"的页面（`?datahash=` 之类的调试覆盖，或改一个字节后重取），
   断言进房被拒并显示原因 —— 证明 C3 的"握手期拒绝"真的还在。
2. **切模式**：切到音MAD 再切回，列表 / 播放 / 对局都跟着换数据集（B 已有的 `mode-separation.spec.ts` 扩展）。

**验收口径**：原曲模式的生成物应与 C 之前**逐字节一致**（`characters.json` / `albums.json` / `index.json`
的字段集合可能变——`packTracks` 退场、`contentHash` 改口径——但角色与曲目内容必须一致）。

---

## 9. 回滚

C 同时动了**生成物**与**协议版本**，回滚要两件一起退：`git checkout main -- public/data src tools docs` +
`PROTOCOL_VERSION` 回 3。全程在 `enhanced-otomad-mode` 分支上，未确认不合并 `main`；
分支上每步完成即推送（B-C-PLAN 头部的推送规矩）。

---

## 10. 待裁定（逐条）

| # | 问题 | 推荐 | 另一选项的代价 |
|---|---|---|---|
| **Q1** | 生成物布局：D2（共享项 + 每模式一份）/ D1（每模式一个完整目录） | **D2 ✅ 已采纳** | D1 重复约 15 KB 且 `loudness` 有两份真源 |
| **Q2** | 加载策略：A 启动全取 / B 切模式懒加载 | **A ✅ 已采纳** | B 省 17 KB，但要新增"切模式取数据失败"的界面与重试 |
| **Q3** | 角色身份：S1 共享真源 / S2 各自真源 | **S1 ✅ 已采纳** | S2 多一份要人维护的名单，且今天只能带来"顺序/别名不同" |
| **Q4** | 哈希口径：C1 总哈希 / C2 只比当前模式 / C3 两个都交换 | **C3 ✅ 已采纳**（协议升到 **v4**） | C1 名义化；C2 把失败拖到切模式；C3 需要协议 v4 |
| **Q5** | 协议 v4 的兼容策略：直接拒绝 v3 客户端 / 允许 v3 只打原曲 | **直接拒绝 ✅ 已采纳**（与现有 `PROTOCOL_VERSION` 行为一致） | 兼容层要维护两条握手路径，收益低 |
| **Q6** | 音MAD 数据集里要不要保留"没有音MAD 曲目的角色"（今天 121 − 35 = 86 个） | **不保留 ✅ 已采纳**（数据集只含能用上的 35 个） | 保留的话列表页要再过滤一次，等于把今天的问题搬过去 |

---

## 11. 实现记录（D112）

**生成物**（`pnpm data:build` 写出 12 个文件）：

| 文件 | 内容 |
|---|---|
| `public/data/{index,characters,albums}.json` | 原曲：**121** 角色 / 378 条 / 去重 368 / 39 专辑 |
| `public/data/otomads/{index,characters,albums}.json` | 音MAD：**35** 角色 / 86 条 / 去重 86 / 1 专辑 |
| `public/data/{sources,cardsets,packs}.json`、`sources/*.json` | 共享（与模式无关） |

- 每份 `index.json` 带 `mode` 与自己的 `contentHash`；并集 **464 条 / 454 首去重**与分离前一致。
- `build.py`：删 `apply_tracks()`，改 `build_characters(mode)` / `build_albums(mode)` / `build_index(mode)`。
- `validate.py`：新增 `check_datasets()` —— 每份只含本模式曲目、各自的 `(角色,专辑,曲目)` 不重复、
  **跨模式身份一致**（`name`/`order`/`card`/`searchNames`）；原曲那套检查跑在真源上（曲包曲目不再混进去）。

**前端**：

| 位置 | 改动 |
|---|---|
| `src/data/{types,load}.ts` | `DataBundle` → `{ shared, datasets: Record<MusicMode, ModeDataset> }`；两个数据集启动时都取（策略 A） |
| `src/data/useDataset.ts`（新） | `useCurrentDataset(bundle)` / `datasetFor(bundle, mode)` |
| `src/music/mode.ts` | 删 6 个判定（`packOfAlbum` / `modeOfEntry` / `isEntryAllowedInMode` / `filterByMode` / `hasTracksInMode` / `firstAllowedInMode`）；留 `MusicMode`（`effectiveSourceOverrides` 在 D113 也删了） |
| `selection.ts` / `presetView.ts` | `allowedTracks` / `countEnabled` / `presetStats` / `singleModeRows` / `effectivePin` 去掉 `albums + mode` 参数（17 处传参消失） |
| `songConflicts.ts` | `buildSongConflicts(characters)`：传进来的就是当前数据集 |
| 面板 | `ListPanel` / `ConfigPanel` / `PresetSection` / `SingleTrackSection` / `GamePanel` / `PlayerPanel` / `UpcomingFan` 收 `bundle` 后自取当前数据集；`musicMode` 传参全部消失 |
| `src/net/*` | **协议 v4**：`DataHashes {originals, otomads}`，`hello` 与 `PeerInfo` 都带两个哈希，`dataHashMismatch` 两个都比 |

**验证**：`pnpm data:check` 无漂移 ✓、`uv run pytest` **84 passed** ✓、`pnpm typecheck` ✓、
`pnpm test` **548 passed**（274 条 × chromium + firefox）✓、
`pnpm e2e` **74 passed + 1 skipped**（chromium 33 / firefox 32+1 / mobile 9）✓ ——
其中新增 `e2e/multiplayer.spec.ts` 的**握手期拒绝**用例（访客页被注入"另一份"哈希 → 主机拒、
大厅显示原因、主机不把它算进参与者），两个桌面引擎都跑 ✓。

**与草案的偏差**：无。`apply_tracks()` 与 6 个判定确实删掉了；`packs.json` 因为"只描述有哪些包"
留在共享项（草案 §2 就是这么写的）。
