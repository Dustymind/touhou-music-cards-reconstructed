# 决策记录（DECISIONS）

本文件是**定稿的决策依据**。每条记录：结论 → 理由 → 影响面。文档全景见 [`README.md`](README.md)，随机数契约见 [`rng-v1.md`](rng-v1.md)，数据分类规则见 [`rules-classification-v1.md`](rules-classification-v1.md)。（开工时的 `PLAN.md` 已删，方案正文并入本文件。）

裁定日期：2026-09-16（用户两轮答复）。

> **读旧条目时请注意**：按约定「同一轮工作的最新条目会就地补全，**更早的条目不再改**」，
> 所以旧条目里会提到**当时存在、现在已删或改名**的文件与路径 —— 例如
> `.github/workflows/` 下的 `deploy-cdn.yml` / `deploy-otomads-cdn.yml` / `trigger-cdn.yml`
> （D150 起并入数据仓库的 `publish.yml`）、`repack-media.yml`（同上）、
> `docs/PLAN.md`、`data/meta/roles.tsv`、`reports/`（2026-09-28 已移到 `docs/reports/`）。
> **那些路径是历史事实，不是待修的错** —— 它们记录了当时真实的做法。
> 要查现状请走 [`README.md`](README.md) 的现状表与契约表，不要顺着旧条目里的路径找文件。

---

## D1 形态：纯前端 SPA + 独立本地音乐助手（单仓库）

**结论**：应用是纯前端静态站；本地音乐库由 `tools/` 里的独立助手服务提供；联机采用主机权威的 WebRTC 模型。

**理由**

- 音频必须在玩家浏览器里播放，服务端无法代播；服务端能做的只有转发状态。
- 上游的主机权威 + 全量快照模型已被实践证明可用；本作面向朋友间小规模对局，不需要匹配/排位/持久化战绩。
- 静态站可本机运行或放 GitHub Pages，无运维成本；本地音乐库天然在玩家机器上，远程后端够不着。

**影响**

- 传输层必须抽象（`Transport` 接口），未来接权威服务端时游戏规则层零改动。
- 助手服务兼任"本地音乐源"，未来可扩展到信令/中继（接口预留，暂不实现）。

---

## D2 前端框架：Vite + React 19 + TS + MUI 7（去掉 Next.js / Tailwind）

**结论**：Vite + React 19 + TypeScript + MUI 7 + Emotion；不引入 Next.js、Tailwind、路由器。

**理由**

- 上游 Next 只在 5 处产生框架耦合（`next/image`、`next/link`、`next/font/local`、`layout` metadata），组件几乎可原样移植。
- 应用 100% 客户端；Next 的 SSR/导出只带来额外机制与 hydration 风险（v2 工作区已踩过"`useState` 初值读 `window` 导致首屏不一致"）。
- 上游引入了 Tailwind 但**零工具类使用**，去掉可缩小构建面而不改变视觉。
- 单路由 + 查询参数即可，不需要路由器。

**影响**：字体沿用上游三个本地 TTF；主题与色板照搬；`CharacterCard` 的 `<Image fill>` 改用普通 `<img>`。

---

## D3 工具链：前端 pnpm/fnm；数据与助手 Python/uv

**结论**：前端只用 Node/TS 工具链；数据迁移、校验、生成、分类、本地音乐源服务器用 Python（uv 管理虚拟环境）。生成物提交进仓库。

**理由**

- 数据侧要读写 TOML（标准库 `tomllib`）、跑跨表比对、生成报告、起带 Range + CORS 的静态服务，Python 最省事。
- v2 工作区的 `serve_local_music.py` 已被实测验证（端口回退、动态源表、Range、CORS），在其基础上改造优于重写。
- 生成物提交 ⇒ 构建前端不需要 Python；只有"改数据"才需要。

---

## D4 仓库：单仓库，`git init`，无上游 remote
> ⚠️ **已被 D54 取代**：提交约定已反转：D54 起建了 `origin`，常态推送。

**结论**：仓库根即本工作区；`git init` 后不设任何远端；`.ref/`（上游只读副本 + 调研笔记）不进版本库。

**提交约定**：`<type>: <英文小写短句>`，`type ∈ feat|fix|data|docs|test|chore|refactor`；一个逻辑改动一个提交；正文折行 ≤ 75 列；**不 push**。

---

## D5 角色存储：一角色一 TOML + 稳定 ASCII `key`

```toml
key = "kirisame-marisa"   # 稳定 ID：存档 / 联机 / 预设 / 卡面索引都用它
name = "霧雨魔理沙"        # 显示名，可改，不影响存档
order = 1                 # 默认播放顺序（把上游"JSON 插入序"显式化）
card = ["魔理沙.png"]
searchNames = ["霧雨魔理沙", "Kirisame Marisa", "雾雨魔理沙", "wuyu molisha"]
music = [
  ["東方永夜抄 ～ Imperishable Night", "恋色マスタースパーク", "角色曲"],
]
```

**理由**

- 一角色一文件：diff 可读、并行编辑不冲突；代价是需要显式 `order`（反而消除了"顺序即协议"的隐式耦合）。
- `key` 与 `name` 分离：直接修掉上游"角色改名 = 静默丢档"的真实事故（`绵月丰姬` → `綿月丰姬`）。
- 文件名 = `key`：含 `/` 的角色名（`ルナサ/メルラン/リリカ・プリズムリバー`）不再破坏路径。
- 一律用 TOML **基本字符串** `"…"`：数据里有 11 条曲名含 ASCII 单引号（`Dr.Latency's`），字面量字符串会被截断。

---

## D6 曲目身份：`(专辑, 曲目)`；`曲目` 保留曲目序号；子碟拆成独立专辑

**结论**

1. 曲目身份 = `(专辑, 曲目)`；内部 `trackId = 专辑 + "\u0001" + 曲目`。
2. `曲目` = "专辑内标识串"：去掉 `<艺术家> - ` 前缀与 `.mp3`，**保留 `NN. ` 序号**；界面显示时再派生去序号的显示名。
3. 子目录碟拆成独立专辑名（尊重原名）：
   - `幻想曲抜萃 ～ 東方萃夢想 Day Disc` / `… Night Disc`
   - `全人類ノ天楽録 ～ 東方绯想天 Arrange Disc` / `… Original Disc`
   - `東方神霊廟 ～ Ten Desires Trance Disc`（算独立专辑）
4. 格斗碟**不**按 thbwiki 的 `TFM-0xxa/b/c` 再拆（数据里没有碟信息）。
5. 专辑总数：拆分前 36 → 拆分后 **39**。

**理由（两条都是数据逼出来的）**

- 不拆碟：`全人類ノ天楽録` 内有 4 组"同专辑同名曲目指向不同 URL"的歧义。
- 拆碟后若丢掉 `NN. `：`核熱造神ヒソウテンソク` 的 `08. アンノウンＸ` 与 `18. アンノウンＸ` **音频不同**却同名，必然播错。
- 拆碟 + 保留序号后，652 条源表条目得到 **652 个互异键、0 冲突**（脚本已验证）。

---

## D7 音乐源：开关 + 可调 fallback 顺序 + 运行时回退 + 本地源

```ts
type SourceDef = {
  id: "netease163" | "cloudflare_r2" | "thbwiki" | "local";
  label: { en: string; zh: string };
  tableUrl: string;
  enabled: boolean;              // 开关（取代上游的单选）
  order: number;                 // 可调 fallback 顺序
  kind: "remote" | "local";
  proxyable?: boolean;           // 预留：混合内容/跨域时由助手代理
};
```

**理由**：上游单选 + "替换语义"导致切源失败时静默失去全部音乐；三源键集几乎相同但覆盖度不同，用开关 + 顺序 + 逐曲回退能同时获得冗余与可用性。

**影响**：`<audio>` 的 `error` 事件触发换源重试；失败组合写入会话级缓存并在配置页给出诊断。数据侧新增一致性校验（覆盖率、孤儿、URL 形态、已知例外白名单）。

---

## D8 选择系统：专辑勾选 + 秘封多层 + 三态开关 + 仅单曲模式

**结论**：选择状态由预设派生，**不再持久化数组下标**；持久化的是 `key` / `(key, 专辑, 曲目)`。

- 秘封曲：父复选框 = 批量控制（不存值，显示态由 12 个子项派生 all / none / mixed），子项可独立勾选。
- 其它专辑：有序复选框（先 CD、再官作）。
- 角色曲 / 道中曲 / 更多道中曲：三个无子项**三态开关**（不配置 / 已启用 / 已禁用）。
- **已启用压过专辑勾选**（强制启用该类别）；**已禁用压过专辑勾选**（一票否决）；**不配置**下沉到专辑勾选。
- 仅单曲模式：逐角色指定唯一曲目（只列预设启用的曲目），或禁用该角色。

**理由**：上游 12 个预设是"角色 → 下标"的人工枚举，既有错碟/漏项，又因下标语义脆弱；改由 `附加信息` + 专辑勾选派生后，秘封覆盖率从 29/38 升到 100%，且插曲不再改变任何预设的含义。

---

## D9 多人同步：主机权威 + 回合令牌 + 传输抽象

**结论**：保留上游正确骨架（主机转发、全量快照、只传 key/曲目/种子），并修掉导致失步的部分：

1. 主机在倒计时结束时决议 `{turnSeq, characterKey, trackId, rngSeed, startedAtEpoch}` 并广播；客户端不再各自推进回合（视觉上仍各自走 3-2-1）。
2. 快照补全 `turnSeq / state / givesLeft / confirmations / settingsDigest`。
3. 事件带自增 `seq`，回合结束互发状态摘要，不一致自动请求全量快照。
4. `applySyncData` 全字段边界校验。
5. `give` 幂等（`(turnSeq, from, to, cardId)` 唯一键）。
6. 观察者开放同步请求；修连接 close 定位 bug。
7. 连接后交换数据内容哈希，不一致**拒绝开局**（上游是静默错位）。

**理由**：需求明确要求"必须保证多人模式同步"；上游的本地计时器 + 不完整快照正是死锁与幽灵卡的根因（见方案 §1.3）。**回合令牌是必需的**：需求 6 的"每角色多选随机取一首"只有在主机决议并广播曲目时才能跨端一致。

**有意的行为变更**：真正进入 `GameFinished` 并计算胜者（上游从不进入该状态，只能手动 Stop）。会在 CHANGELOG 与测试中显式标注。

**后被取代的部分**（D104 落地时）：第 1 条没有照原样实现 —— 回合令牌只留 `(turnSeq, currentKey)`，
**不广播** `rngSeed` / `startedAtEpoch`；选曲种子改成两端从 `gameSeed` 纯派生（`deriveSeed("turn", …)`），
曲目名单改成 `playedTracks`（`src/game/types.ts`），音乐模式与会话种子合成 `SessionConfig`
（协议 v3，见 [`protocol-v1.md`](protocol-v1.md)）。本条的骨架（主机权威 + 全量快照 + `seq` + 数据哈希）仍然成立。

---

## D10 素材：卡面全部走远程，仓库不放 PNG

**结论**：`data/card-sets.toml` 登记"图集 → 多个远程 origin"，启动健康检查选第一个可用 origin；本地放好 `public/cards*/` 可离线（代码支持，仓库不含素材）。

已实测可用 origin（同一文件 222 749 B、`image/png`）：

| origin | 备注 |
|---|---|
| `https://r2bucket-touhou.hgjertkljw.org/` | 上游默认 R2 桶 |
| `https://lightbulb128.github.io/touhou-card-player-v3/` | 上游 GitHub Pages |
| `https://cdn.jsdelivr.net/gh/lightbulb128/touhou-card-player-v3@main/public/` | CDN 兜底 |
| `https://raw.githubusercontent.com/lightbulb128/touhou-card-player-v3/main/public/` | 最后兜底 |

**理由**：6 套卡面共 178 MB；用户选择不入库。**代价**：离线不可用、依赖第三方托管 —— 已记入 README 的"外部依赖"。

**影响**：图集选择**持久化**（修上游 `cardCollection` 刷新即丢）；`?r2=` / `?cards=` 查询参数保留且优先于存储值；卡面加载失败必须有可见提示（不允许静默空白）。

---

## D11 数据补全：THBWiki 标签驱动 + 提案复核 + 不归属清单

**结论**：`附加信息` 由 THBWiki Music Room 的**类别标签**映射得到（规则见 [`rules-classification-v1.md`](rules-classification-v1.md)），不是手写规则链的逐条推断。无法归属任何角色的曲目写进 `data/meta/unowned-tracks.tsv`（含理由），源表照旧保留。

**理由**：见 §Q6/Q4 与 E2 更正（下一节）。工作量估计因此从 18–24 人日降到 **8–12 人日**。

---

## D12 字体：只分发 Inconsolata，商业字体走 `local()`

**结论**：`public/fonts/` 只放 **Inconsolata-Medium.ttf**（OFL 授权，计时器用）；上游另外两个字体
（`WHITNEY-MEDIUM.ttf` 26 KB、`YuGothic-Bold-01.ttf` 14 MB）**不随仓库分发**，改为 `@font-face` 的
`local(...)` 声明 —— 本机装了就用，没装就退回系统栈。

**理由**：Whitney 与 YuGothic 是商业字体，仓库里再分发有授权风险；而上游的视觉效果主要来自
MUI 主题、卡片状态底色与等宽计时器，字体差异只影响"很像"的程度。

**代价 / 还原办法**：把两个 TTF 放进 `public/fonts/` 并给 `src/theme/fonts.css` 的对应 `@font-face`
补上 `url(...)`，即可完全复刻上游排版（`.ref/upstream-v3/app/fonts/` 里有原文件）。

---

## D13 端到端验证：Playwright 双引擎 + 本地 PeerJS 信令

**结论**：加 `e2e/`（Playwright，chromium / firefox 两个 project）与 `e2e/peer-server.mjs`（本地 PeerJS 信令，
127.0.0.1:9100）。用例分两层：冒烟（加载/搜索/预设/单曲/对战/播放，双引擎各 6 条）与**联机**
（同浏览器双标签走 BroadcastChannel；跨浏览器由 chromium project 自己拉起 chromium 主机 + firefox 客户端）。
浏览器装在仓库内 `.playwright-browsers/`（964 MB，gitignore）——沙箱里 `$HOME` 只读。

**理由**：jsdom 验证不了三类东西，而它们恰好是"必须保证多人同步"的硬要求所在：

| 真浏览器才暴露的缺陷 | 后果 | 修法 |
|---|---|---|
| 抢拍语义把"点牌的人"和"牌的位置"混成一个参数（`pick(side, slot)`） | 客户端抢的是**主机**的牌，主机侧记成对手出手 | `pick(player, side, slot)`：`player` = 点牌人（联机时主机以发送方为准），`side/slot` = 牌实际所在（对齐上游 `PickEvent`） |
| `GamePanel` 自己那一行写死 `act.pick(0, slot)` | 客户端（index 1）点自己的牌 → 主机去玩家 0 的牌库找牌 | 传 `myIndex`/`oppIndex` |
| PeerJS 两端用同一个 peer id（`tmc-cards-<room>`） | 信令服务器回 `ID ... is taken`，客户端静默连不上 | 客户端 id 加随机后缀，主机才占用房间名 |
| 连接打开前的消息直接丢弃（hello 比 WebRTC 通道早） | 跨浏览器永远握不上手（首次 `peer.connect` 还没执行，`connections` 里没有 0 号连接） | `PeerTransport` 排队 + `open` 后按序补发 |
| 大厅的"cross-machine"开关默认关 | 带 `?peerhost=` 的链接打开后仍走 BroadcastChannel，跨浏览器测试假通过 | `peerModeFromSearch()`：链接里带信令参数时默认打开 |
| 状态摘要只显示前 24 字符，E2E 断言看不出抢拍变化 | 测试读不到变化 | `net-digest` 上挂完整 `data-digest` 供断言 |

**本机回环联调的两个开关**：chromium `--disable-features=WebRtcHideLocalIpsWithMdns` + firefox
`media.peerconnection.ice.obfuscate_host_addresses=false`。容器里没有 mDNS 解析，`.local` 候选永远连不通；
关掉混淆后 ICE 用真实内网地址建连。**真实跨机器联机不需要这两个开关**（已用独立探针确认
chromium↔firefox / firefox↔chromium / chromium↔chromium 三种组合都能建起 DataChannel）。

**代价**：E2E 约 2 分钟；跨浏览器用例只在 chromium project 跑一次。

---

## D14 倒计时铃：现场合成，不搬运上游二进制

**结论**：上游用仓库里的 `Bell3.mp3`；重建版**不复制任何上游二进制素材**（上游仓库没有 LICENSE，
默认保留所有权利），改为 `src/audio/bell.ts` 用 Web Audio 合成一个音色接近的"叮"（
基频 E6 + 3 个非谐泛音、指数衰减、总长 1100 ms）。不支持 Web Audio 的环境（jsdom、无音频设备）
退化为**等长静音等待**，所以"先响铃、再放正曲"的时序在任何环境都成立，且铃响期间按暂停不会让正曲偷偷起播。

**理由**：与 D12（字体只分发 OFL 的 Inconsolata）、D10（卡面全部走远程、仓库不放 PNG）同一条原则：
**仓库里不放授权不明的上游素材**。E2E 抓到了原实现的 `Bell3.mp3` 404（文件从来没进过仓库），
顺手按这条原则修掉，而不是把上游的 mp3 拷进来。

**代价**：铃声与上游不是同一个音色（长度近似）。想完全复刻可把上游 `Bell3.mp3` 放进 `public/` 并改回
`new Audio("./Bell3.mp3")`。

---

## D15 主题：照搬上游深色色板 + 指定的字体 fallback 顺序
> ⚠️ **已被 D38 取代**：**色板部分**已作废：D38 起改用 MD2 基准（`#121212` / `#BB86FC`），`theme.test.ts` 锁的也是新值。字体 fallback 顺序仍有效。

**结论**（用户裁定）：

1. **背景色改成上游的**：主题切成上游的**深色**色板，逐值照抄 `app/components/Theme.ts` ——
   `background.default #141414`、`background.paper #262626`、`text.primary #ffffff`、
   `text.secondary #babcc1`、`divider #7b7979`、`primary #5090ff`、`secondary #9c83ff`、
   `success #ffff83`、`info #00cb36`，以及 `theme.custom` 的 `mainTabBackground #242222`、
   `listBackground1 #161616`、`listBackground2 #302E2E`、`alice #ffff83`。
2. **字体 fallback 优先级**：`TMC Whitney`（本机装了才生效）→ **苹果默认 `-apple-system` /
   `BlinkMacSystemFont`** → **鸿蒙默认 `HarmonyOS Sans SC` / `HarmonyOS Sans`** →
   **微软雅黑 `Microsoft YaHei`** → **`Noto Sans CJK SC` / `Noto Sans SC`** → `sans-serif`。

**理由**：背景/文字/纸面是一整套调色，只改页面底色而不改 `mode` 会得到"白字压深底"和一堆浅色控件
（Switch、Chip、Alert、outlined 边框都是按 light 算的），所以整份色板一起照搬；字体则按用户给的四级顺序
落到 CJK 回退上，避免再出现 `Segoe UI → Yu Gothic` 这种"Windows 上先撞到日文字体"的顺序。

**顺带对齐**：列表页从"Paper + 浅灰 hover"改成上游 `ListTab` 的**整行底色**（隔行 `#161616`/`#302E2E`、
临时停用 `#737373`、当前播放 `#c14848`），点击行 = 设为当前（停用中的行点一下会重新启用）。

**有意保留的差异**：上游把每个页签包在一层 `mainTabBackground` 的 Paper 里；我们的四个面板各自已有
Paper 容器，再加一层只是重复描边，因此只取色不改结构。等宽计时器仍是 Inconsolata（随仓库分发）。

**怎么回退**：`src/theme/theme.ts` 里把 `palette.mode` 改回 `"light"` 并去掉 palette 覆盖即可；
`src/theme/theme.test.ts` 锁住了当前值（含字体顺序），改回去会先红。

---

## D16 游戏页本地化：文案全部走 `t()`，`en` 保留上游原始枚举名

**问题**（用户指出）：界面切成中文后，**游戏页仍然整页英文**（`Solo` / `Random Fill` / `Next Turn` /
`turn #1 · turnStart` / 大厅的 `Online` / `Host` / 未本地化的大厅与玩家面板）。原因是这些字符串当初是
**硬编码英文**写进 JSX 的，没走 `src/i18n/localization.ts`。

**结论**：游戏页（`GamePanel`）、联机大厅（`LobbyPanel`）、播放页的队列统计，全部改成
`t(Localization.X)`，新增 46 个键（`GameModeSolo` … `PlayerTabRotation`）。判定状态额外加一层
`STATE_LABEL: Record<JudgeState, keyof typeof Localization>`：

| 状态 | en（保持原样） | zh |
|---|---|---|
| `selecting` | selecting | 选牌中 |
| `countdown` | countdown | 倒计时 |
| `turnStart` | turnStart | 抢拍中 |
| `turnWinner` | turnWinner | 结算中 |
| `finished` | finished | 已结束 |

**为什么 `en` 不翻译状态名**：上游枚举名就是这些字符串，Playwright（en-US）与单测都对
`turn #0 · countdown` / `turn #1 · turnStart` 做了断言；把英文侧也"美化"会平白打碎一批测试，
而英文读者看 `turnStart` 与看 `picking` 的收益一样。

**回归锁**：`GamePanel.test.tsx` 新增两个中文用例（逐条检查中文标签存在 + 英文标签不存在 + 结算提示），
`e2e/smoke.spec.ts` 新增"中文界面：游戏页全部中文"用例（真浏览器 `?locale=zh`，同样检查英文残留为零）。

**还没本地化的（有意留下，见下）**：`src/net/engines.ts`（拒绝加入/断线）、`src/audio/usePlayer.ts`
（取不到音源）、`src/data/load.ts` 与 `src/persist.ts`（数据校验与存档迁移的诊断信息）目前都只有中文，
是历史遗留。它们**只在异常路径上出现**，且上游同样只本地化 UI 文案、不本地化数据错误
（上游 `Localization.ts` 里没有对应键）。要补齐说一声，改动量约 8 条文案 + 4 个测试文件。

---

## D17 对局里要有声：音乐由**对局**驱动 + 切歌续播 + 单曲种子两端一致

**问题**（用户指出）：**实际游戏无声**。`usePlayer` 一直挂在 `AppShell` 上、只跟着**轮播队列**的
`currentKey` 走，对局页从来没碰过播放器 —— 所以开局后除了页面上计时器在跑，一点声音都没有。
顺带发现第二个毛病：播放页按"下一首"会**停住**（我的 `next()` 先 `pause()` 再换 `currentKey`，
换完没人再起播；上游靠 `loadeddata` 自动续播）。

**结论**：

1. **播放意愿（autoplay intent）**：`usePlayer` 增加 `pendingPlayRef`。`play()` / `playImmediate()` 置位，
   `pause()` 清除；曲目解析完挂上 `audio` 时如果还置位就自动起播。这既是上游
   `handleAudioLoadedData` 的语义，也顺手修掉"按下一首就停"。切歌（`next`/`previous`）保留意愿：
   正在播 → 接着播，暂停中 → 保持暂停（上游同样只对 Playing / TimeoutPause 续播）。
2. **对局驱动播放**：`AppShell` 订阅对局状态，按阶段驱动同一个播放器 ——
   `countdown`：停掉上一首 + 响一声合成铃；`turnStart`：`playImmediate()` 播这一回合角色的曲子；
   停局/终局：停。曲目来源在对局中是 `game.currentKey`，平时是 `queue.currentKey`。
3. **两侧听同一首**：对局里选曲种子改为 `turnSeed(turnSeq, currentKey)`（FNV-1a，纯函数）。
   上游是主机每回合随机一个种子再随事件下发；用已同步的字段派生，省掉一个同步字段，效果一样，
   而且重连、回放都不会变。E2E 里直接断言两端 `audio.src` 的 pathname 相同。
4. **对局期间锁页签**：上游在对局中禁用播放/列表/设置页签，音乐归对局管；这里照做（含 Alice 彩蛋按钮），
   想离开对局就按"中止游戏"。

**与上游的有意差异**：上游倒计时是"响铃 → 铃结束（`onEnded`）就 `play()` 当前 src"，而那一刻
`currentCharacterId` 还是**上一回合**的角色，于是会先把上一首放出来、3 秒倒计时结束再换成本回合的；
这里改成倒计时期间只响铃（正曲保持停），回合开始的那一刻起播**本回合**的曲子 —— 不会串味。
另外上游把暂停/续播当事件同步（`pauseMusic` / `resumeMusic`）；这里两端的播放时机都由同一份快照派生，
不需要额外消息。

**回归锁**：`usePlayer` 三个用例（`playImmediate` 不响铃、`ringBell` 只响铃、切歌保留意愿）、
`rules.turnSeed` 三个用例、`App.test.tsx` 一个端到端用例（开局 → 倒计时正曲必须停 → 3 秒后真的在播）、
E2E：对局页在 chromium/firefox 上断言 `audio.currentTime > 0` 且正在播，联机两端断言同曲且都在播。

---

## D18 自定义卡组 + 电脑卡组也补上打乱/清空（参照上游 UI）

**需求**（用户）：游戏界面要有"打乱卡组""清空卡组"（原文写的是"情况卡组"），**电脑卡组也要这两个按键**；
并且**参照原版 UI，允许自定义卡组**。

**结论**：

1. **电脑/对手卡组也有了三个按键**：`补满电脑` / `打乱电脑卡组` / `清空电脑卡组`（上游 `GameTab.tsx` 里同样有
   "shuffle deck for opponent"、"clear deck for opponent"、"random fill opponent deck"，只是散在牌桌两侧）。
   自己那一侧的三个按键补了 `data-testid`（`shuffle-deck` / `clear-deck`），电脑侧是
   `fill-cpu-deck` / `shuffle-cpu-deck` / `clear-cpu-deck`。**只有主机显示电脑侧按键**（上游的对手按键也只在
   CPU 模式出现，且客户端永远看不到），客户端只能改自己那一份。
2. **自定义卡组**（上游 `GameUnusedCards` + `addToDeck` / `removeFromDeck`）：
   - 新增"未使用卡牌（N）"区，列出卡池里既不在任何牌库、也不在任何收集区的卡（横向滚动，卡片与卡槽同尺寸，见 D20）；
   - **点未使用的卡 → 放进自己牌库的第一个空位**；**点自己牌库里的卡 → 拿回未使用区**；
     主机在选牌阶段点**电脑牌库**里的卡同样可以拿出来；
   - 规则层加 `holderOf` / `unusedCards`，并给 `addCard` 加"同一张卡面全盘只能存在一份"的守卫（上游
     `addToDeck` 的同一个判断）；新加 `removeCard`；
   - 三个按键（补满/打乱/清空）与卡池都只在 `selecting`（选牌阶段）可用，开局后禁用（上游也是
     `state !== SelectingCards` 就隐藏）。
3. **联机下也能改卡组**：`fillDeck` / `shuffleDeck` 两个意图补进协议，`addCard` / `removeCard` / `clearDeck`
   之前只在协议里占位、`applyIntentLocally` 直接忽略，现在全部真正落地。权限边界：**只有主机能改别人的牌库**，
   客户端发来的意图一律以发送方下标为准（`from !== 0 && intent.player !== from` 直接丢弃），
   避免客户端把牌塞进主机牌库。打乱的随机数在主机上抽，快照同步下去，两端仍然一致。

**与上游的差异**：上游是**拖拽**（拖到指定牌位，点一下则落到第一个空位）。本项目自 M9 起就是点击式交互
（不做拖拽），所以这里沿用上游"点击"分支的语义：点未使用卡落第一个空位、点牌库卡拿回来 —— 想拖到指定牌位
上游才支持。这条差异记在 `docs/reports/M9-acceptance.md` 的已知限制里。

**回归锁**：`rules` 三个用例（加/取/未使用区含收集区）、`GamePanel` 四个用例（电脑侧打乱清空、自己侧只动自己、
点进点出、主机拿电脑牌 + 开局后禁用）、`net/intents` 四个用例（客户端只能动自己那一份、主机可替电脑改、
重复加卡被拒、指定槽位）、E2E 一条（真浏览器里点进点出 + 电脑卡组打乱清空）+ 中英文案断言。

---

## D19 开局洗牌：每局的第一首不再固定

**问题**（用户指出）：**不筛选音乐开始游戏时，每次播放的第一首都是一样的**。

**原因**：`startGame` 把"当前角色"设为轮播顺序的**最后一个**，而首次 `nextTurn` 环形推进到**第 0 个** ——
顺序本身从没洗过（一直是无过滤时 `data/characters` 的自然顺序），所以每局都从同一个角色开始；
再加上选曲种子只由 `(turnSeq, currentKey)` 派生，同一个角色永远选到同一首。两项叠起来就是"第一首固定"。

**结论**（回到上游语义）：

1. `startGame` **洗牌**轮播顺序，并记下本局种子 `gameSeed`（`shuffleWithSeed(order, gameSeed)`）。
   上游 `handleGameStart` 本来就是 `createPlayingOrder(..., true)`（洗牌）再把 `currentCharacterId`
   设为洗好顺序的最后一个。
2. 选曲种子改为 `turnSeed(gameSeed, turnSeq, currentKey)`：同一局内两端一致（`gameSeed` 随快照同步），
   不同局之间同一个角色也会换曲子。
3. `GameState` 增加 `gameSeed`（主机开局时抽、随快照下发），`PROTOCOL_VERSION` 1 → 2；
   `stateDigest` 也带上 `seed=`，两端种子不一致会在同步断言里露出来。

**实测**：连开四局，四个不同的开局角色、四首不同的第一曲（`himemushi-momoyo` / `yamashiro-takane` /
`kamishirasawa-keine` / `medicine-melancholy`，种子的确都不同）。

**测试影响**：单测里凡是"开局后当前角色一定是 order[0]"的假设都不再成立，改成从
`game.order[0]` 读第一个回合的角色（`GamePanel.test` 的 CPU 用例、`useGameLoop.test` 的开局断言），
`startGame` 用例改成给定 rng 断言"洗过但仍是同一批角色 + 同种子可复现 + 不同种子首个角色不同"。

---

## D20 拖动放置卡牌 + 卡片尺寸照抄上游

**需求**（用户）：参照原版**用拖动放置卡牌**；默认**卡片太小**，也照原版改。

**结论**：

1. **卡片尺寸改成上游的公式**：`卡片宽度 = 容器宽度 × cardWidthPercentage`，默认 **0.08**、
   范围 **0.04 ~ 0.40**、步进 **0.01**（上游 `GameTab.tsx` 的 `cardWidthPercentage` 与
   `cardWidthPercentageMin/Max`；此前这里是写死的 56px，所以"默认偏小"）。
   `卡牌缩小/放大` 两个按钮改成百分比步进并在上下限禁用；容器宽度用 `ResizeObserver` 量。
   卡片放大到牌库比容器宽时，牌库区域**横向滚动**而不是缩卡片。
   **未使用卡牌区与卡槽同尺寸**（上游所有卡共用同一个 `cardWidth`；一开始这里按 60% 渲染，用户指出没跟着变大，
   现在两边的外层容器都用同一个宽度、内层卡面填满，实测卡槽 80px / 选择区 80px）。
   设置与牌库行列一起写进 localStorage 的 `gameSetting`（上游同名键），全默认时不写（同样是上游行为）。
   牌库尺寸只在"用户自己改过"时才在挂载时套用，避免盖掉调用方或联机同步过来的尺寸。
2. **拖动放置**（上游拖拽语义，DOM 版）：
   - 未使用卡 → 拖到**任意槽位**（点击只能落到第一个空位；目标有卡则先清掉那张，上游同样不换回）；
   - 牌库内的卡 → 拖到别的槽位：空位是移动、有卡是**交换**（对齐上游 `removeFromDeck` + `addToDeck` 的换位逻辑）；
   - 牌库里的卡 → 拖回"未使用卡牌"区 = 拿出来；
   - 主机可以把未使用卡/自己的卡拖进**电脑（对手）牌库**的指定槽位（上游只在 CPU 模式给对手牌库开这个口子）；
   - 交牌阶段（`turnWinner`）把手里那张拖到对手空位 = **指定交牌**；点击的旧路径保留（上游也是"点一下=当作点击"）。
   - 拖拽状态放 `src/game/drag.ts`（`dragover` 读不到 `dataTransfer` 的内容，`dataTransfer` 只用来启动拖拽 ——
     Firefox 必须 `setData` 才会开始拖）。
3. **顺带修掉一个罚牌 bug**：手动交牌过去只调 `moveCard`，`givesLeft` 不减，界面会一直提示"还要交 N 张"。
   新增原子操作 `giveCard`（移动 + 把 `givesLeft` 往 0 推一格），点击与拖动两条路径都走它；
   客户端从"发 `give`（随机交）"改为发 `giveCard`（交**选中的那一张**），与上游 `EventGiveCard` 语义一致。
4. **协议新增**：`moveDeckCard` / `giveCard` 两个意图，主机侧校验"客户端只能动自己那一份 / 只有欠牌方交得动"。

**与上游的差异**：上游是 canvas + 指针事件自绘，这里是 DOM 网格 + HTML5 DnD；交互语义一致，但没有上游的
"拖拽过程中卡牌跟随光标"那种渲染效果（浏览器原生拖影代替）。

**回归锁**：`rules` 三条（移动/交换/跨牌库交换、`giveCard` 方向与计数）、`GamePanel` 两条（拖动放置四条路径、
卡片尺寸百分比与上下限与落盘）、`gameSetting` 四条（默认值/夹取/落盘/脏数据）、
E2E 两条（真浏览器拖动：指定槽位、拖回、互换、拖进电脑卡组；卡片尺寸按钮步进与禁用 + 落盘）。

---

## D21 播放页与游戏页的动效（照抄上游的过渡值）

**需求**（用户）：播放器界面参考原版优化、带动效；游戏界面同样参考原版优化、带动效。

**做法**：先把上游的过渡值找出来（`CharacterCard.tsx` / `PlayerTab.tsx` / `GameTab.tsx`），逐条落到本项目：

| 元素 | 动效 | 来源 |
|---|---|---|
| 角色卡（处处） | `transition: transform 0.3s ease, background-color 0.3s ease, filter 0.3s ease`；hover → `translateY(-10%)`（`raised`） | 上游 `CharacterCard` 原值 |
| 牌桌的卡 | 卡牌层改成**绝对定位的常驻元素**（`key = 角色-卡序`）+ `transition: left 0.4s ease, top 0.4s ease`：补满、换位、交换、拖动、改行列时牌会**滑过去** | 上游 canvas 每张卡常驻 + `left/top` 过渡；DOM 版把 0.3s 放成 0.4s |
| 未使用卡牌区 | hover 抬起（与牌桌同一套 `raised`） | 上游语义 |
| 播放页"接下来" | **重叠牌堆**：同角色叠 80%、角色之间叠 20%、卡宽 `min(20vw, 150)`；`transition: left 0.5s ease-in-out, transform/background-color/filter 0.3s ease`；hover 抬起；点击＝临时跳过（变灰 + 整条带子重排） | 上游 `PlayerTab` 原值 |
| 当前角色卡面 | 该角色**多张卡面叠放**（上游 `CharacterCardStacked`），切歌时整块滑入 0.3s | 叠放照上游；滑入是替代品（见下） |
| 提示条（结算/交牌/播放错误） | 出现时淡入 0.3s | 上游对显隐元素用 `opacity 0.3s ease` |
| 拖放落点 | 虚线描边 0.2s + 卡牌 0.2s 底色过渡 | 新增（拖动需要落点反馈） |

**三处有意差异**（都写进 `docs/reports/M9-acceptance.md`）：

1. 上游切歌是一整条 `translateX((index - currentIndex) * 100%)` 的轮播，**121 个角色的大卡面全部渲染**；
   这里改成给当前卡面做 0.3s 滑入动画 —— 同样的时长与缓动，省掉 160 张大图的常驻渲染。
2. 上游把牌堆起点再往左推 2 张卡宽（当前角色在可视区外，只能靠上方大卡面看当前曲目）；
   这里从**当前角色**开始排，并把当前角色的卡标成 `selected` 底色，看得见自己在放哪首。
3. 上游拖拽时卡牌跟随光标；这里是浏览器原生拖影（D20 已记）。

**回归锁**：`UpcomingFan` 三个用例（叠放步长、窄窗口缩放、真实数据张数）、`GamePanel` 一条
（换格子时是同一个 DOM 节点 —— 这是"滑过去"动效的前提）、E2E 一条（真浏览器读 `getComputedStyle`：
牌桌卡 `position: absolute` + `left/top 0.4s`、hover 后 transform 的 y 为负、牌堆 `left 0.5s ease-in-out`
且点击后底色变化）。

---

## D22 去掉卡片纸框、卡槽不做悬浮动效、选卡区加滚动条

**需求**（用户，一轮四条）：

1. 游戏界面选卡**不要边框、不要卡片底下的背景**；
2. 主界面播放器与游戏界面的"选卡边框"**挡住了卡牌动效**，而且去掉边框后别压到文字；
3. **游戏盘的卡槽不需要光标悬浮动效**；
4. 播放器与游戏界面的选卡卡槽**都要滚动条**（参考原版）。

**做法**：

1. `CharacterCard` 增加 `bare` 模式：**不铺底色、不投影**，卡面直接浮在页面上；状态反馈改成**描边圈**
   （`boxShadow: 0 0 0 3px <状态色>`），禁用态仍是灰度（作用在 `img` 上）。
   牌桌、未使用卡牌区、播放页牌堆都改用 `bare` —— 卡片之间不再互相糊住，抬起/滑位看得清。
   播放页上方那张大卡面保持原样（单张、不重叠）。
2. 牌桌的"格子"层不再给有卡的位置描边铺底（`Paper variant="outlined"` → 透明 `Box`），
   空位只留一个细虚线框当落点提示。
3. 播放页牌堆容器去掉裁切边界：改成 `overflow-x: auto`（有滚动条）并在顶部留 18px，
   抬起 10% 不会被裁掉、也不会压到上面的"接下来"标题与按钮（浏览器实测 `clippedTop: false`）。
4. 游戏盘的卡不再有 hover 抬起（`raised` 去掉），空位也没有指针光标/悬浮过渡 —— 只有**真在拖拽时**
   才出现虚线落点提示（那是拖放反馈，不是悬浮动效）。滚轮/滚动条照旧。

**实测**（真浏览器读 `getComputedStyle`）：牌堆 `overflow-x: auto`、`scrollWidth 14730 > clientWidth 866`（确实有滚动条）、
卡面 `background-color: rgba(0,0,0,0)`、当前卡是 3px 描边圈；牌桌卡 `background-color: rgba(0,0,0,0)`、
hover 后 `transform` 仍是 `none`（无悬浮动效）；空卡槽 `border: 1px dashed` + `cursor: auto`。

**代价**：抢对/抢错的反馈从"整卡染色"变成"描边圈"（底色会挡住相邻卡牌的动效，用户明确不要底色）。
需要回到上游那种整卡染色时，把牌桌那处 `bare` 去掉即可。

---

## D23 一层白底、牌堆不重合、深色滚动条、牌桌居中

**需求**（用户，一轮四条）：卡牌**只保留一层白色背景**；主界面（播放页）**卡牌区块重合要修**；
滚动条样式**参照原版**；游戏界面卡槽区域**居中**而不是靠边。

**做法**：

1. **一层白底**：`bare` 的含义从"完全透明"改成"**不要外层纸框与投影，只留卡面自己那一层白底**"，
   状态色仍按上游铺在这一层上（抢对=绿、抢错=红、禁用=灰、当前=蓝）。槽位本身仍然不铺底、不描边 ——
   所以牌桌上一张卡只有**一层**背景（实测 `background-color: rgb(255,255,255)`、`box-shadow: none`）。
2. **不重合**：播放页"接下来"的牌堆改成**等距排开**（卡宽 150 + 间距 6，相邻卡片间隙实测 `-6` 即 6px 空隙），
   配合横向滚动条，每张卡都完整可见；播放页上方那张大卡面也恢复成单张（不再叠放多张卡面）。
   上游是 20%/80% 重叠的扇形 —— 用户要求修掉重合，这里按用户的来。
3. **滚动条**：上游没有自定义滚动条样式，它靠 MUI 深色主题带来的 `color-scheme: dark`。
   本项目之前 `color-scheme` 是 `normal`（深色页面配浅色滚动条），现在在 CssBaseline 里显式给
   `html`/`body` 设 `color-scheme: dark`（实测 `getComputedStyle(documentElement).colorScheme === "dark"`），
   原生滚动条随主题变深，与上游一致。
4. **牌桌居中**：牌桌外面那层横向滚动容器改成 `display: flex; justify-content: center`：
   比容器窄时居中（实测左右各留 149px），比容器宽时照旧可滚动。

**代价**：播放页不再有上游那种"叠起来的扇形"，而且深色主题下的原生滚动条在部分浏览器是 overlay 样式
（悬停/滚动时才明显）——这与上游行为相同。

---

## D24 游戏卡槽改用上游那条可拖动的滑块（Card Selection Slider）

**需求**（用户）：上游游戏界面有个类似滚动条的物件，可拖动用来滚动卡槽；用上游实现替代卡槽的滚动，
**并且不能挡住卡槽**。

**上游实现**（`GameTab.tsx`）：

- 未使用卡牌（selectable cards）排成一条**互相叠 30%** 的长条（`cardSelectionOverlap = cardWidth * 0.3`），
  `x = deckLeft + index * (cardWidth - overlap) + offset`、`zIndex = 总数 - 序号`（左边的压在上面）；
- `offset = -sliderValue * (totalWidth - deckWidth)`，可见窗口与滑块宽度都取 `deckWidth`；
- 滑块是 MUI `Slider`（`min 0 / max 1 / step 0.001`，`aria-label="Card Selection Slider"`），
  位置 `top = 卡条底部 + 16`、只在选牌阶段出现 —— 也就是**在卡条下方**，不覆盖卡片。

**做法**：未使用卡牌区整块照上游重做 —— 卡条 `position: relative` + `overflow: hidden`、宽 = 牌桌宽、
居中；卡片绝对定位叠 30%、`transition: left 0.3s ease`；下方渲染 MUI `Slider`（同宽、居中），
拖动即平移整条卡槽。原生横向滚动条在这块**被滑块替代**（播放页牌堆仍保留原生滚动条）。
滑块给了 `data-testid="card-selection-slider"`、卡条给了 `unused-cards-strip`，
容器上挂 `data-pan` / `data-pan-offset` 便于测试读数。

**实测**：卡条 668px（与牌桌同宽、左边缘与牌桌对齐 386）、滑块 y 1309 > 卡条底 1305（**不重叠**）、
把滑块从 50% 拖到 90% 后 `data-pan=0.900`、首张卡的 x 从 386 → **-5435**（整条被平移）。

**与播放页的区别**：播放页那条"接下来"牌堆仍是不重叠 + 原生滚动条（用户上一轮的要求），
游戏卡槽按本轮要求用上游的叠放 + 滑块。

---

## D25 播放页也用滑块；卡片不重叠；去掉选卡的悬浮位移动效

**需求**（用户）：把滑块条也部署到主界面播放器；部署后**卡牌不重叠**；去掉主界面播放器与游戏界面选卡的
**光标悬浮动效**，只保留背景变色（游戏选卡与播放器一致）。

**做法**：把"卡条 + 下方滑块"抽成共享组件 `src/ui/components/CardStrip.tsx`，两处共用：

| | 游戏卡槽（未使用卡牌） | 播放页"接下来" |
|---|---|---|
| 卡片 | 等距、间距 6px，**不重叠**（原来叠 30%） | 等距、间距 6px，不重叠 |
| 可视宽度 | 牌桌宽度 | 容器实测宽度（`ResizeObserver`） |
| 滑块 | `card-selection-slider`（卡条下方，与卡条同宽） | `upcoming-fan-slider`（同规则） |
| 点击 | 放进自己的卡组 | 临时跳过（灰度） |
| hover | **只变底色**（白 → `#b3f9ff`），无位移 | 同左（禁用项 → `disabledHover`） |

`CardStrip` 里卡片只剩 `left` 过渡（`left 0.3s ease`）；`raised`（`translateY(-10%)`）不再用于这两处 ——
用户明确要"仅保留背景变色"。滚动统一由滑块完成（两处都不再依赖原生横向滚动条）。

**实测**（真浏览器）：

- 播放页：卡条底部 626 / 滑块顶部 630（不遮挡）；相邻卡间隙 `[6, 6]`（不重叠）；拖滑块到 85% 后
  首张卡 x 从 287 → **-15812**；hover 底色 `#71d7ff → #b3f9ff` 且 `transform: none`；点击一张后转灰度。
- 游戏卡槽：相邻卡间隙 `[6, 6]`；hover 底色 `#ffffff → #b3f9ff` 且 `transform: none`。

**注意**：`CardStrip` 的 `testId` 会派生 `-strip` / `-slider`，也支持 `stripTestId` / `sliderTestId`
显式指定，以保持既有 E2E 选择器（`unused-cards-strip` / `card-selection-slider` 等）不变。

---

## D26 选卡区加外框并居中；滑动改成整行一个 transform

**需求**（用户）：两个界面的选卡区域加外框、居中；优化滑块条性能。

**做法**：

1. **外框 + 居中**：`CardStrip` 里加一层带 `border: 1px solid divider`、圆角、内边距的框，
   把"卡条 + 滑块"一起框住，外层用 `display: flex; justifyContent: center` 居中。
   实测：牌桌宽 668 → 框 678（左右各留 144px，居中），播放页同理。
2. **性能**：原来卡片是 `left = 序号 × step + offset`，每动一格滑块就要重算并改写上百个卡片节点的
   `left`（React 还要重渲染 127 个卡片组件）。现在：
   - 卡片位置**静态**（`left = 序号 × step`，永不变化），平移只用**一个** `translateX` 加在整行容器上；
   - 拖动过程中把 transform **直接写进 DOM**（`ref`），React 状态只在拖动结束（`onChangeCommitted`）落一次，
     `data-pan` 等读数照旧；
   - 拖动时关掉 `transition`（跟手），松手后恢复 `0.3s` 缓动；
   - 单卡片抽成 `memo` 组件，回调放进 `ref`（父组件每次渲染换新函数会把 memo 全部打回重渲染），
     所以拖滑块时 127 个卡片组件一个都不重渲染；
   - 行容器加 `will-change: transform`。

**实测**（真浏览器，MutationObserver 盯卡条子树）：拖动滑块 30 步 ——
**卡片节点 0 次 style 变更**、整行 31 次（每步一次 transform），耗时 522ms（其中大部分是 Playwright
每次鼠标移动的往返开销）。E2E 里就把这条锁住：`mutations.cards === 0 && mutations.row > 0`。

**回归锁**：`GamePanel` 用例补上前置断言（外框存在且同时包含卡条与滑块、平移写在整行 transform 上、
卡片自身没有内联 `left`）；E2E 补上外框 `solid 1px` + 左右留白差 ≤2px（居中）+ 拖动时卡片零变更。

---

## D27 滑块两端不越界；显示区边界用卡牌同款圆角

**需求**（用户）：滑块推到两端时**超出外框**了；选卡显示区的边界要加**卡牌同种的圆角**，
滚动时被裁掉的部分卡片不至于露出直角。

**做法**：

1. **滑块不越界**：MUI `Slider` 的拇指直径 20px（半径 10px），而外框原来左右只留 4px 内边距，
   推到 0 / 1 时拇指有一半在框外。外框内边距改成**上下 4px、左右 12px**（>10px），
   实测两端时拇指边缘距框 3px，`overflowLeft/Right` 均为 `false`。
2. **同款圆角**：把卡面圆角抽成 `CARD_BORDER_RADIUS = "6px"`（`CharacterCard` 导出），
   选卡显示区那层 `overflow: hidden` 的窗口用同一个值 —— 卡片被裁掉时边界呈现圆角而不是直角。
   实测卡条窗口与卡面的 `border-radius` 都是 `6px`（E2E 断言两者**相等**且不为 `0px`）。

**回归锁**：E2E 里补两条 —— 外框内的显示区 `border-radius` 与被裁卡片的 `border-radius` 相等；
滑块推到最右端后拇指的左右边缘都在外框内。

---

## D28 滑轨、滑块拇指与卡片边缘三者对齐

**需求**（用户）：滑块边缘能否与卡牌边缘**完美对齐**。

**问题**：上一版把 MUI 滑块整体两端各内缩一个拇指半径，拇指外缘确实与显示区边界齐平了，
但 **MUI 自带的滑轨（rail）与进度条（track）也跟着缩了 10px**（实测 rail `[396, 1044]`，
而卡片显示区是 `[386, 1054]`）—— 看上去就是"条短了一截"。

**做法**：不再用 MUI 自带的轨，改成"**自绘滑轨 + MUI 滑块**"（就是原生滚动条那种"轨 + 钮"）：

- 自绘滑轨：`position: absolute; left: 0; right: 0`，**与卡片显示区同宽**（`visibleWidth`），
  4px 高、圆角、主色 35% 透明；
- MUI 滑块本体：宽度 `visibleWidth - 2 × 10px`（`SLIDER_THUMB_RADIUS`），居中，
  并把 `.MuiSlider-rail` / `.MuiSlider-track` 藏掉。

于是三者落在同一条竖线上：**滑轨端点 = 拇指外缘（推到两端时）= 卡片外缘**。

**实测**（真浏览器，像素取整）：

```
滑块 0: 显示区 [386,1054]  滑轨 [386,1054]  拇指 [386,406]   第一张卡左缘 386
滑块 1: 显示区 [386,1054]  滑轨 [386,1054]  拇指 [1034,1054] 最后一张卡右缘 1054
```

**回归锁**：E2E 在两端各断言三条（滑轨、拇指、卡片；误差 ≤1px）+ 拇指不顶出外框；
播放页断言滑轨两端与显示区齐平（同一个组件，两处共用）。

---

## D29 交换动画不再"一张滑一张瞬移"；滑块不留常驻光圈

**需求**（用户）：卡牌位置互换的动画有点怪；单击滑块后不应让光圈常驻。

**问题 1（交换动画）**：逐帧采样发现交换时**只有一张卡在动**：从槽位 1 → 0 的那张滑过去，
从 0 → 1 的那张**直接瞬移**。原因是**渲染顺序跟着槽位走** —— 两张卡交换时 React 会重排 DOM
（`insertBefore` 对被移动的节点等价于"移出再插入"），被移动的节点因此**丢掉了 CSS 过渡**。

修法两条：

1. 卡牌层的**渲染顺序按卡面 key 排**（位置本来就由 `left/top` 决定，DOM 顺序不影响布局），
   交换时不再有节点被移动 → 两张卡都从原位平滑滑过去。实测帧采样：
   `[470,386] → [454,399] → [432,420] → [409,443] → [384,468]`（两张卡同时移动）。
2. 正在换位的卡给一个 `zIndex: 20` + `scale(1.05)` + 投影，持续 `MOVE_MS = 400ms`
   （与过渡时长一致）—— 看起来像"被拿起来挪过去"，而不是两张卡互相穿插。

**问题 2（滑块光圈）**：MUI 的 ripple 画在拇指自己的 `box-shadow` 上：按下（`Mui-active`）时是
`rgba(80,144,255,0.16) 0 0 0 14px` 的一圈；鼠标操作后如果焦点/按压态常驻就会一直亮着。
现在只覆盖 `:hover` / `.Mui-active` 两种鼠标态为 `boxShadow: none`，**保留** MUI 的
`Mui-focusVisible`（纯键盘操作时才会出现）—— 实测：单击后（鼠标仍在上方）`box-shadow: none`，
拖动后 `none`，而键盘按 `ArrowRight` 时仍有 `rgba(80,144,255,0.16) 0 0 0 8px` 的焦点提示。

**回归锁**：E2E 在交换用例里逐帧采样两张卡的位置，断言"存在一帧两张卡都还在各自起点附近"
（瞬移时不可能同时满足）；滑块用例断言单击后拇指 `box-shadow === "none"`。

---

## D30 两处选卡滑块共用同一实现（并加断言锁死）

**需求**（用户）：把主界面播放器的滑块样式"回滚"成游戏界面选卡的版本。

**现状核对**：两处的滑块本来就来自同一个组件 `CardStrip`（D25 抽出、D28 改成"自绘滑轨 + MUI 滑块"、
D29 去掉鼠标态光圈），真浏览器逐项比对 computed style 只有**区域宽度**不同（播放页 840px vs 游戏页 648px，
因为播放页容器比 8 列牌桌宽），拇指/滑轨的尺寸、颜色、圆角、阴影、透明度**完全一致**：

```
thumb: 20×20, rgb(80,144,255), 50%, box-shadow none      （两处相同）
rail:  4px, rgb(80,144,255), opacity 0.35, 圆角 8px        （两处相同）
```

**结论（补记）**：用户澄清要统一的是**对齐方式**，复查后确实有一处不一致并已修 ——

播放页的卡条宽度会**被 `max-width: 100%` 压窄**（容器 866px、外框内边距/边框占 26px），
但滑块的内缩量是按**未被压窄的** `visibleWidth`（860）算的 → 滑块宽 840 = 卡条宽 840，
于是拇指在 0/1 两端**探出卡片边缘 10px**（实测 `stripToThumbL = -10`）；游戏页的卡条宽度（668）
本来就小于容器，没有压窄，所以看起来是对的。

修法：`CardStrip` 用 `ResizeObserver` 量出卡条的**实际渲染宽度** `stripWidth`，
滑轨容器宽度、滑块宽度（`stripWidth - 2 × 10px`）和可平移量 `maxOffset` 全部基于它 ——
现在两页的对齐关系完全一致：

```
播放页: 滑轨 [300,1140] = 卡条；拇指 [300,320] → 外缘偏移 0
游戏页: 滑轨 [386,1054] = 卡条；拇指 [386,406] → 外缘偏移 0
两页 gap 指标相同：frameToStrip 13 / stripToRail 0,0 / stripToThumbL 0 / 拇指中线距卡条底 19
```

E2E 把两页的样式与对齐关系（滑轨左右端、拇指外缘相对卡条的偏移，以及垂直距离）**逐项比对相等**。

---

## D31 游戏页按钮按用途重排成三块（参考上游"成组摆放"的风格）

**需求**（用户）：把游戏界面的各个按钮整理重排，参考原版的格式和风格。

**上游的按钮风格**（`GameTabControls.tsx` 的 `GameButton`）：一个**图标按钮 + 文字标签**并排，
按钮可 `contained` / `bordered`（描边），并且**按用途成组、成列**摆在牌桌两侧
（开始/中止一组、补满/打乱/清空一组、卡组行列一组、对手卡组一组）。

**重排结果**（本项目是 DOM/MUI，用 `Paper` + `Stack` + `Button`/`ToggleButtonGroup`/`ButtonGroup`
表达同样的"成组"结构，`Button` 的 `startIcon` 等价于上游的"图标 + 文字"）：

| 面板 | 内容 |
|---|---|
| **对局设置**（`game-setup`） | `模式 [单人\|电脑]`、`规则 [经典\|休闲]`，右侧 `▶ 开始游戏`（contained、success 色）、`■ 中止游戏`（error 色）；CPU 模式时下面一行是电脑反应参数 |
| **卡组设置**（`deck-setup`） | 第一行：`卡组 [3×8]`、`行 [− \| +]`、`列 [− \| +]`、`卡牌大小 [←\|→]`（成对按钮用 `ButtonGroup` 连体，上游同样是"减/加"成对）；第二行：`你 [随机补满\|打乱卡组\|清空卡组]`、`对手 [补满电脑\|打乱电脑卡组\|清空电脑卡组]`（客户端不显示对手那组） |
| **牌桌** | 计时器 + 正在播放 + 回合状态、双方牌库、未使用卡牌与滑块；底部：`回合 [⏭ 下一回合\|🎁 随机交出\|▽ 按卡组筛选音乐]` + `牌堆 / 轮播` 两个 chip |

**风格统一**：所有动作按钮 `size="small"`、带同风格图标（Casino/Shuffle/Clear/PlayArrow/Stop/West/East
等，与上游用的图标同款），危险动作（中止）用 `error` 色、主流程（开始）用 `contained + success`；
卡牌大小与卡组行列的成对按钮改用 `ButtonGroup` 连体，视觉上不再是一排同等权重的散按钮。
`testid` 与全部中英文案保持不变（新增 `row-minus` / `row-plus` / `col-minus` / `col-plus`）。

**回归锁**：既有的中文案断言（游戏页 28 条标签）与所有 `testid` 全绿；新增 `game-setup` / `deck-setup`
两个面板 testid 便于以后定位。

**补记（用户要求）**："卡牌缩小 / 卡牌放大" 的文案改成 **"缩小 / 放大"**（英文 `Smaller` / `Larger`），
图标也从左右箭头（West/East）换成与"行/列"同款的**减号 / 加号**（Remove/Add）——
现在 `卡牌大小 [− 缩小 | ＋ 放大]` 与 `行 [− 减行 | ＋ 加行]`、`列 [− 减列 | ＋ 加列]` 三种成对按钮完全同款。

---

## D32 游戏页按钮尺寸与图标间距统一

**需求**（用户）：统一按键与文字之间的间隔宽度，统一按键大小。

**改前实测**（真浏览器量的 computed style）——同一个页面里混着三种来源的按钮：

| 项 | ToggleButton（模式/规则） | 普通小按钮 | ButtonGroup 里的小按钮 | contained |
|---|---|---|---|---|
| 高度 | **39** | 31 | 31 | 31 |
| 左右内边距 | 7 | **5** | **9** | **10** |
| 图标 | 无 | 18 | 18 | 18 |
| 图标↔文字 | — | 8 | 8 | 8 |

**做法**：新增 `src/ui/game/GameButton.tsx`，把尺寸/间距定成常量并全页共用：

```ts
GAME_ICON_SIZE = 18      // 图标框：所有图标都放进同样大的方框，视觉间距才一致
GAME_ICON_GAP  = 6       // 图标与文字之间的间距
GAME_BUTTON_HEIGHT = 30  // 按钮高度
```

- `GameButton`（MUI `Button` 的薄封装）：`size="small"` + 统一 `height/minHeight 30`、`px 10`、`fontSize 13`，
  并把 `.MuiButton-startIcon` 改成**固定 18×18 的居中方框 + margin 6px**（MUI 默认只给 margin，
  图标本身宽度不同，所以看着间距不一）；
- `gameToggleSx` 给 ToggleButton 用同一套尺寸；
- GamePanel 的 17 个按钮 + LobbyPanel 的 4 个按钮全部改用 `GameButton`（`testid` 与文案不变）。

**改后实测**：20 个按钮全部 `高度 30 / 内边距 10|10 / 字号 13px / 图标 18px / 图标↔文字 6px`。

**回归锁**：E2E「游戏页按钮尺寸、内边距与图标间距统一」把 22 个 `testid` 的这五项指标读出来，
断言各自**只有一个取值**（`[30]` / `["10px|10px"]` / `["13px"]` / `[6]`）。

**补记（用户要求）**：**模式 / 规则那一排也一起改** —— 四个 ToggleButton 加上图标
（上游同款：`PersonOffRounded` 无对手 / `SmartToyRounded` 电脑 / `ClassRounded` 经典 / `StarRounded` 休闲），
图标尺寸与间距并入同一套常量，于是这一排与其它按钮**完全同款**：

```
模式 [🙅 单人 | 🤖 电脑]   规则 [📖 经典 | ⭐ 休闲]
```

一个实现细节：`Stack` 的 `spacing` 靠 `margin` 选择器作用于**元素**，原始文本节点吃不到，
所以图标与标签之间显式用 `gap: 6px` 并把标签包一层 `span`（否则量出来是 0）。

---

## D33 分组标题与按钮的间距、垂直对齐统一

**需求**（用户）："模式""规则"与按键太近；"随机补满"等 6 个按键与"你""对手"间距过大；
所有按键与文字高度未对齐 —— 调到适中并统一。

**改前实测**（标题右边缘 → 它后面第一个按钮左边缘）：

| 位置 | 间距 | 问题 |
|---|---|---|
| 模式 / 规则 | **4px** | 太近 |
| 你 / 对手 | 4px，但标题带 `minWidth: 3.5em/5em` | 标签框比文字宽得多，"你"后面看着有 ~34px 空隙 |
| 行 / 列 / 卡牌大小 | **16px** | 与别处不一致 |
| 回合 | 8px | —— |

**做法**：在 `GameButton.tsx` 里定三个常量与三个布局样式，页面各处只引用它们：

```ts
GAME_LABEL_GAP  = 8    // 分组标题 → 它后面那组控件
GAME_BUTTON_GAP = 6    // 同组按钮之间
GAME_GROUP_GAP  = 24   // 组与组之间
gameLabelSx   = { height: 30, display: inline-flex, alignItems: center, fontSize: 13px, color: text.secondary }
gameGroupSx   = { display: inline-flex, flexDirection: row, alignItems: center, gap: 8px }
gameButtonsSx = { display: inline-flex, flexDirection: row, alignItems: center, gap: 6px }
gameRowSx     = { display: flex, flexDirection: row, alignItems: center, flexWrap: wrap, columnGap: 24, rowGap: 8 }
```

每个"标题 + 控件"都包成 `gameGroupSx`（所以标题与控件的间距恒为 8px），同组按钮再包一层
`gameButtonsSx`（恒为 6px），标题本身与按钮**同高 30px + 垂直居中**；`卡组 3×8` / `牌堆` / `轮播`
三个 chip 也设成 `height: 30`，不再比按钮矮一截；另外把"你/对手"标题上的 `minWidth` 去掉
（那才是看着间距过大的元凶）。

**改后实测**：九个标题的"标题→按钮"间距**全是 8px**、垂直中心差**全是 0**、按钮高度**全是 30**、
同组按钮间距**全是 6px**、`deck-size` chip 高度 30。

**一个坑**：`Stack` 默认 `flex-direction: column`，直接套 `gameRowSx`（只写 `display: flex`）会把标题和
按钮竖着叠起来（实测垂直中心差 38px）—— 常量里显式写了 `flexDirection: "row"`。

**回归锁**：E2E「游戏页分组标题与按钮的间距、垂直对齐统一」断言这四组数字各自**只有一个取值**
（`[8]` / `[0]` / `[30]` / `[6]`）+ chip 高度 30。

---

## D34 顶部菜单按钮的对齐与间距

**需求**（用户）：修正顶部菜单按键的对齐与间距。

**改前实测**：

| 项 | 情况 |
|---|---|
| 按钮高度 | 31px |
| 内边距 | 选中（contained）**10px**、未选中（text）**5px** —— 切标签时文字会横向跳动 |
| 最小宽度 | `4em` = 52px |
| 相邻按钮间距 | **13px**（每个标签外面套了一层 `Box` + 分隔线 `mx: 0.5` + 外层 `spacing={0.5}`，三段间距叠在一起） |
| 分隔线 | `flexItem` 拉伸到整行高 31px |

**做法**：去掉每个标签外面的 `Box` 与分隔线的 `mx`，整行只用一个 `Stack spacing={1}`；按钮样式抽成常量：

```ts
NAV_BUTTON_SX  = { height: 30, px: 1.5, py: 0, minWidth: "5em", fontSize: "0.8125rem", textTransform: "none" }
NAV_DIVIDER_SX = { height: 18, alignSelf: "center" }   // 固定高度、垂直居中，不再被拉满整行
```

**改后实测**：五个按钮 `高度 30 / 内边距 12|12（选中与未选中一致）/ 最小宽度 65px / 垂直中心同为 31`，
相邻按钮间距**一律 17px**（8 + 分隔线 1 + 8），分隔线高度**一律 18px** 且与按钮同一水平线。

**补记（用户要求"边距过宽，参考原版"）**：翻回上游 `page.tsx` 的 `tabButton` —— 它是
`size="small"` + `sx={{ padding: 0.5, minWidth: "4em" }}`，分隔线用 `flexItem`（与按钮同高），
行间距 `Stack spacing={0.5}`。于是照抄：

```ts
NAV_BUTTON_SX = { height: 30, p: 0.5 /* 4px */, minWidth: "4em", fontSize: "0.8125rem" }
<Stack direction="row" spacing={0.5}>  +  <Divider orientation="vertical" flexItem />
```

**改后实测**：按钮 `内边距 4|4 / 最小宽度 52px / 宽 52px（Alice 那个按内容 83px）`，
相邻间距**一律 9px**（4 + 分隔线 1 + 4），分隔线 **30px 高**（与按钮同高）且居中 —— 比上一版的 12px 内边距
紧致很多，和上游一致。

**回归锁**：E2E「顶部菜单按钮尺寸、间距与分隔线统一」断言按钮高度、内边距、最小宽度、垂直中心
各自只有一个取值，间距恒为 17，分隔线高度恒为 18 且居中。

---

## D35 三种对局模式：单人 / 电脑 / 多人（棋盘与联机栏按模式显隐，带动画）

**需求**（用户）："单人""电脑"改成"单人""电脑""多人"三选并调整图标；仅在"多人""电脑"模式显示对方棋盘；
仅在"电脑"模式显示调整电脑卡组的按键，"多人"模式下**不可调整对方棋盘**（包括拖动）；
仅在"多人"模式显示联机栏；棋盘显隐与联机栏显隐要有动画。

**做法**：

1. `MatchMode` 从 `"solo" \| "cpu" \| "host" \| "client" \| "observer"` 收敛成
   **`"solo" \| "cpu" \| "multi"`**（`host/client/observer` 从来没被游戏状态用过 —— 联机身份走 `useNet` 的 `role`）。
2. 三个 ToggleButton：单人 `PersonRounded`、电脑 `SmartToyRounded`、多人 `GroupsRounded`
   （后两个是上游 `GameTab` 对 CPU / PvP 用的同一套图标），文案 `GameModeMulti = Multiplayer / 多人`。
3. 三个派生开关：
   - `showOpponentBoard = mode !== "solo"` → 对方棋盘（标签 + 棋盘）包在 `Reveal` 里；
   - `canEditOpponentDeck = mode === "cpu" && !isClient` → 电脑卡组的补满/打乱/清空三个按钮、
     点对方牌拿回卡池、把牌拖进对方牌库，**全部**受它控制（多人模式下拖动也不生效）；
     交牌阶段（`turnWinner`）的空位点击/拖放仍然保留 —— 那是规则动作，不是"调整对方棋盘"；
   - `showLobby = mode === "multi"` → 联机栏包在 `Reveal` 里。
4. `src/ui/game/Reveal.tsx`：`Collapse`（高度，300ms）+ `Fade`（透明度）组合，`unmountOnExit`
   —— 隐藏时**真的从 DOM 移除**，所以"单人模式没有对方棋盘"可以直接断言元素不存在。

**实测**（真浏览器）：单人有 3 个模式按钮、无 `deck-opponent` / `lobby-reveal` / `fill-cpu-deck`；
电脑模式有棋盘 + 三个电脑卡组按钮、无联机栏；多人模式有棋盘 + 联机栏、无电脑卡组按钮，
且点对方牌不会改动对方牌库。`opponent-board` / `lobby-reveal` 的 computed `transition-property`
含 `height`（动画确实是高度过渡）。

**连带改动**：联机 E2E 改成"先选多人 → 出现联机栏 → 开房/加入"，并且**各端自己补自己的牌库**
（多人模式下主机不能再替对方补牌，客户端补牌走 `fillDeck` 意图）。另外英语里 `Multiplayer` 含有
`Player`，所有 `getByRole("button", { name: "Player" })` 改成 `exact: true`（Firefox 严格模式会报歧义）。

**回归锁**：`GamePanel` 新增"三种模式各显示什么"用例（含多人模式下点对方牌不改动牌库）；
E2E 新增"模式切换：棋盘与联机栏按模式显隐，并带动画"。

---

## D36 界面宽度自适应（照上游：整页 100% + 16px 页边距）

**需求**（用户）：参考原版，使界面宽度可变，注意保留适当页边距。

**上游的做法**：整页 `<Box sx={{ width: "100%", paddingLeft: 2, paddingRight: 2 }}>` 包一层
`<Paper sx={{ padding: 2, width: "100%" }}>` —— **占满窗口、左右各 16px 页边距、不设最大宽度**；
游戏页的卡片宽度按容器宽度百分比算（`canvasWidth * cardWidthPercentage`），所以窗口越宽棋盘越大。

**改法**：去掉本项目里几处固定最大宽度（外壳 1000 / 游戏 1000 / 播放 900 / 列表 900 / 设置 860），
只保留 `width: "100%"` 与外壳的 `p: 2`（上下左右各 16px）✓ 其余布局本身已经是弹性的。

**实测**：

| 视口 | 内容宽度 | 左右页边距 | 牌桌宽（8 列） | 卡片宽 |
|---|---|---|---|---|
| 1920 | 1888 | 16 / 16 | 1236 | 151 |
| 1280 | 1248 | 16 / 16 | 约 800 | 约 100 |
| 1100 | 1068 | 16 / 16 | 708 | 85 |
| 1024 | 992 | 16 / 16 | —— | —— |

即：页边距恒定 16px，内容宽度＝视口 − 32，棋盘按容器宽度 8% 缩放（与上游一致）。

**回归锁**：E2E「界面宽度自适应：随视口变宽，页边距保持 16px」在 1920 与 1100 两个视口下断言
左右边距都是 16px、面板宽度差 > 700px、牌桌宽度相差 1.5 倍以上。

---

## D37 Material Design 2 重写（风格 + 布局）

**需求**（用户）：把**全部界面**的风格与布局重写成 Material Design 2，参考 <https://m2.material.io/>。

**可行性结论**：MUI 本身就是 **MD2 的实现**（`node_modules/@mui/material/styles/createTypography.js` 里
直接 `@see https://m2.material.io/design/typography/the-type-system.html`，类型比例、`shadows[0..24]` 的
umbra/penumbra/ambient、深色主题的 elevation overlay 都是 MD2 规格；按钮 contained 默认 `shadows[2]`、
hover `4`、active `8` 也与 MD2 一致）。所以这次不是"换框架"，而是**把项目里偏离 MD2 的地方改回去 +
把布局换成 MD2 的骨架**。

**改前与 MD2 的差距**（都是本项目历次"参考上游/按需调整"留下的）：按钮 30px 高、6px 图标间距、
`textTransform: none`、圆角 6px（卡面）、导航是自定义按钮行 + 竖分隔线、面板是 `Paper variant="outlined"`、
列表页是自绘的隔行底色行、输入框 `size="small"` outlined。

**这次落地**：

| 维度 | MD2 规格 | 落地 |
|---|---|---|
| 形状 | 4dp 圆角 | `shape.borderRadius = 4`；卡面圆角 6px → **4px** |
| 类型比例 | h1…overline（含 button 14/500/1.25px 大写、overline 10/1.5px 大写） | `MD2_TYPE_SCALE` 显式写入（本项目的字体不是 Roboto，MUI 不会自动加字距） |
| 按钮 | small 32 / medium 36 / large 44、minWidth 64、contained elevation 2→4→8 | 主题里按尺寸设高度；游戏页按钮统一 **36px 高 / 16px 内边距 / 8px 图标间距**、大写 |
| 卡片 | 圆角 4、elevation 1、内边距 16 | 四个页面 + 五个设置分区全部 `Paper variant="outlined"` → **`Card` + `CardContent`** |
| Chips | 高 32、圆角 16 | 主题统一（牌堆/轮播 chip 跟按钮同高 36 的例外见下） |
| 页签 | 高 48、大写、2dp 指示条 | 外壳换成 **`AppBar` + `Toolbar`(64dp) + `Tabs`**（原来是一排自定义按钮 + 竖分隔线） |
| 列表 | 单行 56dp、头像 + 主/次文本 + 尾部动作 | 列表页换成 **`List`/`ListItem`/`ListItemButton`/`ListItemAvatar`/`ListItemText`**（当前项 `selected`，不再用自绘隔行底色） |
| 文本输入 | filled 变体 | 主题 `MuiTextField/MuiSelect` 默认 **filled** |
| 布局栅格 | 响应式页边距 16/24 | `Container maxWidth={false}` + `px: { xs: 2, md: 3 }`、`py: 3`、区块间距 24 |

**保留的两处**：① 深色色板仍是上游那套（D15 是用户明确要求的；MD2 深色主题本身成立）；
② 选卡区那条"滑轨 + 滑块"是用户点名要的类滚动条控件，未改成 MD2 Slider。

**实测**（真浏览器）：AppBar 64、Tab 48 + `text-transform: uppercase` + `letter-spacing: 1.25px` +
指示条 2px、Card 圆角 4px + elevation 阴影、Chip 高 32/圆角 16、容器内边距桌面 24 / 移动 16；
游戏页按钮 36/16/8。

**测试改动**：导航从 button 改成 role=tab（约 20 处选择器）；游戏页按钮度量 30/10/6 → 36/16/8；
顶部菜单用例重写成"MD2 应用栏 + Tabs"（高度/大写/字距/指示条）；宽度用例改成 MD2 响应式页边距（16/24）。

---

## D38 MD2 细节深化：基准紫、单选组、下拉框、CardHeader、媒体控制

**用户裁定**（在 D37 之后）：色板用**深色 + MD2 基准紫**；继续深挖 MD2 细节。

**1. 色板换成 MD2 基准配色**（`MD2_PALETTE`，浅/深两套都写进去）：

| 角色 | MD2 浅色 | MD2 深色（当前） |
|---|---|---|
| primary | `#6200EE` | **`#BB86FC`** |
| primary variant | `#3700B3` | `#3700B3` |
| secondary | `#03DAC6` | **`#03DAC6`** |
| background / surface | `#FFFFFF` | **`#121212`** |
| error | `#B00020` | **`#CF6679`** |

深色主题取 MD2 深色基准（浅色的 `#6200EE` 在深色底上对比度不足，MD2 自己的深色主题就是用 200 号紫）；
文字/次要文字/分隔线按 MD2 的 onSurface 100% / 70% / 12%。主流程按钮用 primary、中止用 error、
Alice 彩蛋按钮从 success 改成 secondary（青绿）；卡面"抢对/抢错"改成 MD2 语义的浅绿/浅红。
同时删掉了为上游式页签准备的 `theme.custom`（mainTabBackground / listBackground1/2）与 `ListRowColors`。

**2. 对局模式/规则 → MD2 单选组**：`ToggleButtonGroup` → `RadioGroup` + `FormControlLabel`（图标+文本保留）。
踩到 MUI 的坑：`FormControlLabel` 默认 `margin-left: -11px`（把涟漪对齐到文字），会让单选组压到"模式/规则"
标题上（实测间隙 **-3px**）→ 统一设 `ml: 0` ✓ 现在是 8dp。

**3. 牌库行列 → MD2 下拉框**：`−/+` 按钮换成两个 filled `Select`（行 1–5 / 列 1–15，范围取 `DECK_LIMITS`）。

**4. 设置页各区标题 → `CardHeader`**：数据 / 卡面图集 / 音乐源 / 音乐选择预设 / 仅单曲模式，
标题统一 `h6`，动作（重置按钮、仅单曲开关）放 `action` 槽位。

**5. 播放控制条 → MD2 媒体控制**：上一首/播放暂停/下一首都用 48dp 图标按钮（`MD2.iconButton`），
音量改成 MD2 惯用的**图标按钮切换滑杆**（点音量图标才出现音量滑杆）。

**实测**：page 背景 `#121212`、卡片圆角 4px、单选组间隙 8dp、两个 Select 同高、
音量滑杆默认隐藏点击后出现；`theme.test.ts` 断言 MD2 浅/深基准色与规格常量（形状 4 / 栅格 8 / 按钮 32-36-44 / 页签 48）。

---

## D39 MD2 细节修正：下拉标签、搜索框居中、边框加深

**用户反馈**三个问题，逐个查到根因：

1. **卡组"行""列"二字出框** —— `variant` 写在了 `Select` 上（主题默认 filled），而 `FormControl` 仍是默认的
   `outlined`，于是 `InputLabel` 用描边样式（浮在框外）、输入框用 filled 样式 ✗。
   修法：`variant="filled"` 挪到 **`FormControl`** 上（MUI 的变体要由 FormControl 统一下发）。
   实测：标签 top 320 / 框 top 316 → 现在**在框内**。
2. **列表页"搜索角色"未居中** —— 用了 filled 变体但**没有 `label`**，filled 输入框仍为浮动标签预留了上方空间，
   占位文字因此整体偏下 ✗。修法：改成 `variant="outlined"`（无标签占位）+ 前置 `SearchRounded` 图标
   （MD2 搜索框惯例）。实测：框高 40、上下内边距各 8.5px、占位文字垂直居中。
3. **选卡区外框与卡槽虚线框过浅** —— 用的是 `divider`（MD2 深色下 12% 白），在 `#121212` 上几乎看不见 ✗。
   修法：新增 `MD2_BORDER = rgba(255, 255, 255, 0.28)`，选卡区外框（`CardStrip` 的 frame）
   与卡槽虚线框（`DeckGrid` 的空位）都改用它。实测两者 computed `border-color` 均为
   `rgba(255, 255, 255, 0.28)`。

---

## D40 音乐源编号改成圆形

**需求**（用户）：设置页面音乐源编号改成圆形。

原来顺序编号是 `<Chip size="small" label={n} />`（MD2 16dp 圆角的胶囊，24dp 高 → 看着是圆角矩形）。
改成 MD2 的**圆形头像**（`Avatar`，24×24、`borderRadius: 50%`）：

- 启用的源：主色填充（MD2 深色下 `#BB86FC`）+ 深色数字（`primary.contrastText`）；
- 停用的源（如"本地曲库"）：`action.disabledBackground` + `text.disabled`，一眼能看出没开。

**实测**：四个编号都是 `24×24 / border-radius 50%`、数字顺序 1→2→3→4（按 fallback 顺序）。
E2E 在"MD2 细节"用例里追加断言（圆形 + 等宽高 + 24dp + 顺序），并加了 `data-testid="source-order-<id>"`。

---

## D41 音乐源回退顺序：两个 bug + 显示重写

**需求**（用户）："音乐源回退顺序调整时有问题；音乐源回退顺序显示重写。"

### 查到三个问题

1. **开关某个源会把排好的顺序冲掉** —— `toggleSource(id, enabled, fallbackOrder)` 拿的是**注册表里的 order**
   （`source.order`）写回覆盖表 ✗，一旦用户排过序，再开关一下就会把自己的位置重置回注册顺序，
   还会和别的源撞号。修法：`toggleSource(id, enabled, allIds)` 按**当前实际顺序**
   （`effectiveOrder(...)`）算位置，只改 `enabled`。
2. **重排会悄悄打开"默认关闭"的源** —— `moveSource` 对没有覆盖过的源写 `enabled: ?? true` ✗，
   而"本地曲库"注册时就是关的 → 一按上移就被打开。修法：`moveSource(..., defaultEnabled)`
   传入注册表的默认开关表，未覆盖的源沿用注册表默认值。
3. **开关没有无障碍名字** —— `inputProps={{ "aria-label": ... }}` 在 MUI v7 的 `Switch` 上不再落到 input
   （`Checkbox`/`TextField` 上还有效，所以之前没发现）→ 4 个源开关的 aria-label 都是 `null`。
   改用 `slotProps={{ input: { "aria-label": ... } }}` 修好（E2E 才能按名字点到它们）。

### 显示重写

原来是 `{顺序文案} · {order.join(" → ")}`，直接把内部 id 拼成字符串
（`netease163 → cloudflare_r2 → thbwiki → local`）✗，既不可读也不随语言变、也看不出哪些源是关的。
重写成一行"编号圆点 + 源名称 + 箭头"：

```
回退顺序  ① 网易云音乐 → ② THBWiki → ③ Cloudflare R2 → ④ 本地曲库
```

编号圆点按开关状态上色（启用=主色、停用=灰，名称也变灰）；顺带把两端的箭头按钮禁用
（第一个不能再上移、最后一个不能再下移），并加了 `data-testid="source-fallback-order"`。
**踩坑**：一开始叫 `source-order-display`/`source-order-summary`，都会被"每行编号"的
`[data-testid^="source-order-"]` 前缀匹配到（和之前 `unused-card-strip` 那次同一类问题），
改成不带该前缀的名字才干净。

### 回归锁

- 单测（`session.test.ts`）：开关不打乱顺序、位置不重复；重排不会打开默认关闭的源；开关不改 `order`。
- E2E（新增"音乐源回退顺序"用例）：显示的是名称而不是内部 id、上移两次后 THBWiki 在第一位、
  "本地曲库"仍是关的、两端箭头禁用、关掉 THBWiki 后顺序文本不变且状态变 `off`。

---

## D42 回退顺序移动的是"源"，不是"序号"

**需求**（用户）：音乐回退应移动源而不是移动序号，序号用来表示顺序。

**问题**：列表原来是按**注册表顺序**（`bundle.sources.map(...)`）渲染的，只有编号徽标在变 —— 按"上移"
只是把那一行的编号从 3 改成 2，行本身不动 ✗，看起来像在"移动序号"。

**改法**：行改成按**回退顺序**渲染（`order.map(...)` 查回源对象），于是：
- 上移/下移让**整行**在列表里换位（连描述、状态、按钮一起走）；
- 编号始终是 1..N 自上而下，只表示"它在回退顺序里排第几"；
- 首行的"上移"、末行的"下移"自动禁用。

**实测**（真浏览器，行顺序 / 编号）：

```
初始            ① 网易云音乐  ② Cloudflare R2  ③ THBWiki  ④ 本地曲库
THBWiki 上移两次 ① THBWiki    ② 网易云音乐    ③ Cloudflare R2  ④ 本地曲库
本地曲库上移一次 ① THBWiki    ② 网易云音乐    ③ 本地曲库(off)  ④ Cloudflare R2
```

E2E 在"音乐源回退顺序"用例里断言**行的顺序与编号**（而不再只看那行汇总文本）。

**顺带加固**：双标签页联机用例（`multiplayer.spec.ts`）排在整轮 E2E 末尾，默认 5s 的断言在机器忙时
偶发超时（两次全量跑各挂一次、单独重跑都过）——把握手与聊天的等待统一放宽到 20s，断言强度不变。

---

## D43 游戏页的卡面图集跟随设置

**需求**（用户）：游戏界面的选卡菜单不受设置中的卡面图集选项控制。

**根因**：`GamePanel` 里写死了 `const cardSet = bundle.cardSets[0]!` ✗ —— 播放页是从会话里取
（`bundle.cardSets.find((set) => set.id === props.cardCollection) ?? cardSets[0]`），游戏页漏了这一步，
所以在设置页换图集（Q 版 / 全身 / 幻想人形演舞 / 人偶 / THBWiki / ZUN 原画）对游戏页完全无效。

**改法**：游戏页也订阅 `useSession((slice) => slice.cardCollection)`，按它选 `cardSet`；
`cardFiles`（角色 → 文件名）不用动，因为路径前缀来自 `cardSet.dir` ✓。
顺带修了设置页"卡面图集"卡片下面那行说明：原来固定显示**第一套**的 origin，现在显示当前选中那套的。

**实测**（真浏览器，换"ZUN 原画"前后）：

```
默认(dairi-sd)  选卡菜单 …/cards/魔理沙.png        牌桌 …/cards/驯子.png
换成 ZUN 原画   选卡菜单 …/cards-zun/魔理沙.png    牌桌 …/cards-zun/驯子.png
```

**回归锁**：单测断言默认 `…/cards/`、切到 `zun` 后选卡菜单与牌桌都是 `…/cards-zun/`；
E2E 新增"卡面图集设置对游戏页生效"（在设置页点 `cardset-zun` → 回游戏页断言两处 src）。
另外给图集 chip 加了 `data-testid="cardset-<id>"`。

---

## D44 电脑参数输入框的"多余空位"

**需求**（用户）：电脑模式下"电脑反应"等三个输入栏上方有多余空位。

**根因**：MD2 的 **filled** 输入框会为浮动标签固定留出上方空间，而这几个框当时**没有 `label`**
（标签是用旁边的 `<Typography variant="caption">` 写的）→ 框内上方那块标签位空着 ✗。

**改法**：把原来写在框外的三行 caption 直接作为 `label` 交给 `TextField`，删掉旁边的 Typography：
标签浮动在框内左上角，空位自然被用上。宽度从 `6em` 调到 `10em`（标签比数字长），行间距用
MD2 的 16dp。

**实测**：三个框 `fieldHeight = formHeight = 48`（框=表单项，上方没有额外高度），标签 top 在框内
（`labelTopGap = 4`），文案就是原来的"电脑反应（秒）/ 标准差（秒）/ 失误率（%）"。

**回归锁**：E2E 在"MD2 细节"用例里断言三个框的标签都在框内、高度都是 48、且都有非空 label。

---

## D45 代码清理：合并重复、删除冗余

**需求**（用户）：清理、合并重复、冗余代码，完成后说明清了哪些。

### 删除的死代码（导出后从未被引用）

| 位置 | 内容 |
|---|---|
| `src/game/cpu.ts` | `cpuHasCards()`（连带着 `filledSlots` 的导入） |
| `src/net/protocol.ts` | `isHostMessage()` |
| `src/net/engines.ts` | `roleToIndex()`（连同 `Role` 类型导入） |
| `src/ui/game/GameButton.tsx` | `gameToggleSx`（与 `gameButtonSx` **逐字段完全相同**）与三个尺寸别名 |

### 合并的重复

1. **同一套尺寸写了两遍**：`GAME_ICON_SIZE/GAP`、`GAME_BUTTON_HEIGHT` 与 `theme.ts` 里的
   `MD2.button.iconSize/iconGap/medium` 是同一批数字 → 现在只有 `MD2` 一份，`GameButton.tsx`
   与 `GamePanel.tsx` 都引用它；`CARD_BORDER_RADIUS = "4px"` 也改成从 `MD2.shape` 派生。
2. **`gameButtonSx` / `gameToggleSx`**：两份 100% 相同的样式对象 → 只留一份。
3. **`GameButton.tsx` 的图标槽**：`startIcon` / `endIcon` 两段规则八行重复 → 合并成共用的属性块 + 两行方向差异。
4. **`GamePanel` 的五段单选 JSX**（模式三项 + 规则两项，每段 11 行几乎一样）→ 抽成
   `GameControls.tsx` 的 `GameGroupLabel` / `GameRadioOption` + 两张选项表（`MODE_OPTIONS` /
   `RULE_OPTIONS`），一处定义渲染方式。
5. **`GamePanel` 的两段下拉 JSX**（行列各 14 行）→ 抽成 `NumberSelect`。
6. **设置页六个分区的卡片外壳**（`<Card><CardHeader titleTypographyProps={{variant:"h6"}}/><CardContent>`）
   → 抽成 `SectionCard`（标题层级与内边距只有一处定义）。
7. **`locale === "zh" ? x.zh : x.en`** 在数据字段上重复三处 → `i18n/localization.ts` 新增
   `localized(value, locale)`，`t()` 内部也改用它。
8. **`SourceSection` 里对 `bundle.sources` 的线性查找**（`labelOf` / `isEnabled` / 渲染各查一次）
   → 一次建 `Map`，行顺序也只算一次（`rows`）。

### 结果

`12 files changed, 139 insertions(+), 227 deletions(-)`（新增两个小组件文件共 95 行在内）——
净减约 90 行，且重复的"数字/样式/结构"都收敛到单一定义。

**验证**：清理前后 `pnpm typecheck` 干净、`pnpm test` 189 通过、`pnpm e2e` 45 通过 / 1 跳过（双引擎）。
过程中被 E2E 抓到一次回归：抽单选组时我把分组标题放进了 `RadioGroup` 内部，标题与单选之间变成 0px
（应为 8px）——已改回"标题 + 控件"的 8dp 分组容器。

---

## D46 按原版实现"卡面图集"菜单

**需求**（用户）：把原版的卡面图集菜单实现出来，遵循 MD2 风格，中文模式保留原版文案。

**原版结构**（`ConfigTab.tsx` 的 `ConfigDrawer title={ConfigTabCardCollection}`）：每套图集一段，
用 `Divider` 分隔；段内是两行 Grid ——

1. 左 8 列：图集**内部 id**（`dairi-sd` / `dairi` / `enbu` / `enbu-dolls` / `thbwiki-sd` / `zun`），
   右 4 列：一个按钮，当前图集为 `contained` + disabled + 文案「正在使用」，否则 `outlined` + 「使用」；
2. 左 6 列：图集**说明**（`Consts.tsx` 里硬编码的英文，含 @dairi155 / 幻想人形演舞 / THBWiki 链接），
   右 6 列：**三张示例卡**（真实卡面，按所选图集渲染）。

原来这边只是一排 Chip，既没有说明也没有示例卡。现在按原版信息结构重写：

- `src/ui/panels/config/CardSetSection.tsx`：每套一行（id + 使用/正在使用按钮 + 说明 + 三张示例卡），
  `Divider` 分隔；示例卡复用现成的 `CharacterCard`（取前三名角色的第一张卡面，目录由图集决定）。
- `src/ui/panels/config/cardSetDescriptions.tsx`：原版六段说明**逐字**保留（上游是硬编码、不随语言变的，
  所以中文模式下同样是原版文案）；未知 id 回退到该图集的第一个 origin。
- 中文文案沿用原版 `Localization.ts`：`ConfigTabCardCollection = 卡面图集`、
  `ConfigTabSelect = 使用`、`ConfigTabSelected = 正在使用`（这几条在 D15 时就照抄上游了，本次核对一致）。
- 外观走 MD2：`SectionCard`（卡片 + `CardHeader` h6）、`Divider`、按钮的 contained/outlined 语义、
  主题里的 36dp 高度与大写。

**实测**（真浏览器，zh / en 各一遍）：6 行、每行 3 张示例卡；当前图集按钮 `contained + disabled`、
文案 `正在使用` / `Selected`，其它图集 `outlined`、文案 `使用` / `Select`；说明文案与原版一致；
点「使用」后游戏页选卡菜单与牌桌同步换目录（`cards/…` → `cards-zun/…`）。

**回归锁**：单测断言 6 行、每行 3 张图、当前项 disabled + contained + `Selected`、其它项可点；
E2E 在"卡面图集设置对游戏页生效"里加了整套菜单结构断言（行数 / 示例卡数 / 说明 / 按钮态）。
保留了 `data-testid="cardset-<id>"`（在按钮上）与新增 `cardset-row-<id>`。

---

## D47 设置分区改 MD2 可折叠面板 + 修掉单曲模式的重复开关

**需求**（用户）：仅单曲模式菜单多了个开关，修正并优化布局；设置项菜单改成可折叠的，
遵循 MD2 制作动效并优化性能，默认折叠。

### 1. 重复开关

D38 把设置分区标题换成 `CardHeader` 时，把开关同时放进了 `action` 槽，而正文里原本就有一个 →
**同一个开关出现两次**（`single-mode` 与 `single-mode-enabled`）。现在只留正文那一个
（`aria-label="single-mode"`），测试里的旧标签统一成新标签。

### 2. 布局优化

- 原来正文的开关行是 `[占位 spacer][开关]`（开关被推到最右、左边空着）→ 改成
  **「开关 + 标题」在左，说明文字在右**（MD2 的开关行）；
- 搜索框原来只是 `placeholder`，改成带 `label` 的 filled 输入框（与其它输入框一致，标签在框内）；
- 模式关闭时把选曲列表置灰（`opacity 0.5` + 禁点），避免"看着能改其实没生效"。

### 3. 可折叠设置分区（MD2 扩展面板）

`SectionCard` → **`SectionPanel`**（`Accordion` + `AccordionSummary` + `AccordionDetails`）：

| 维度 | 做法 |
|---|---|
| MD2 规格 | 主题里加 `MuiAccordion` / `MuiAccordionSummary` / `MuiAccordionDetails`：4dp 圆角、elevation 1、去掉头部上方的分隔线、头部 **56dp**、左右 16dp 内边距、展开图标用次要文字色；折叠时上下不留 margin |
| 动效 | MD2 标准缓动 `cubic-bezier(0.4, 0, 0.2, 1)`，展开 250ms / 收起 200ms（`MD2.accordion`）；`ExpandMoreRounded` 图标随展开旋转（MUI 自带） |
| 性能 | **折叠时不挂载内容**（`slotProps.transition.unmountOnExit`）：首屏只有五个标题，实测 DOM 从 616 个节点（全折叠）到展开一个分区后 2467 —— 预设区那几百个复选框、音乐源/单曲列表默认都不渲染 |
| 默认 | 全部折叠（用户要求），标题始终可见 |

`data-testid`：`section-<id>` / `section-<id>-summary` / `section-<id>-content`（内容是内层 `Box`，
因为 MUI v7 的 `AccordionDetails` 不转发任意 props）。

### 测试改动

分区默认折叠 → 内容不挂载，凡是要操作分区内容的用例都先展开：
单测加了 `expand(container, id)` 辅助（点击 summary + 等 320ms），并新增"默认折叠 / 展开才挂载 /
单曲分区只有一个开关"的回归用例；E2E 加了 `expandSection(page, id)`，卡面图集、音乐源回退顺序、
MD2 细节、中文界面、秘封父项、仅单曲模式各处用例相应更新；`App.test.tsx` 的配置页冒烟也先展开预设区。

**实测**：5 个分区默认 0 个内容挂载；展开后 `仅单曲模式` 只有一个 checkbox；圆角 4px、头部 56px。

---

## D48 单曲模式选曲栏文本居中

**需求**（用户）：单曲模式的选曲栏文本未居中。

**根因**：这一栏是 `Select` 放在主题默认的 **filled** 变体下，而它**没有浮动标签** —— filled 会为标签
固定留出上方空间，实测 `MuiSelect-select` 的内边距是 **21px 上 / 4px 下**（48px 高、行高 23px），
文字因此整体下移 ✗。（与 D44 的电脑参数输入框、D39 的下拉标签是同一类问题。）

**改法**：

1. `FormControl` 与 `Select` 都显式用 `variant="outlined"` —— 注意**主题里 `MuiSelect.defaultProps.variant`
   会压过 FormControl 的 context**，只改 FormControl 不生效，必须在 `Select` 上也写（踩过一次）。
2. 于是内边距变成对称的 `8.5 | 8.5`、控件高 40（比原来 48 更紧凑），文字中心与控件中心重合。

**实测**：`padding 8.5|8.5`、`boxCy == textCy`、`offset 0`、同行内角色名/下拉/chip 三者垂直中心一致。

**回归锁**：E2E 在"仅单曲模式下拉只列预设启用的曲目"里断言上下内边距相等、文字中心偏移为 0、高度 40；
单测断言该栏是 `MuiOutlinedInput-root`（不是 filled）。

---

## D49 展开时头部不移动 + 按 MD2 重绘扩展面板

**需求**（用户）：展开设置栏时不要让头部移动；同时按 MD2 重绘这几个栏。

### 1. "头部移动"的根因

MUI 的 **`Stack spacing` 是用子元素 `margin` 实现的**（`.MuiStack-root > :not(style) ~ :not(style) { margin-top: 16px }`），
而我在 D47 的主题里为了消掉 MUI 自带的 `&.Mui-expanded { margin: 16px 0 }` 写了
`"&.Mui-expanded": { margin: 0 }` —— 这条的优先级（0,2,0）**高于** Stack 的（0,1,2），
于是**展开的那一栏自己把 Stack 给的 16px 上边距动画掉了**，头部在 150ms 内往上滑 16px ✗
（实测：折叠 `margin 16px|0`，展开过程 `8.67 → 0.5 → 0`）。

改法两条一起：

- 容器改用 **flex + `gap`**（`display:flex; flexDirection:column; gap:2`），不再让 Stack 用 margin 撑间距；
- 主题里面板**只留一条 `margin: 0`**，不再写 expanded 的覆盖（并在注释里写明原因，避免以后又加回去）。

**实测**（点击"音乐选择预设"，采样 0/60/150/300/500ms）：该栏头部始终 `top = 304`，**位移 0**；
只有它下面的栏正常下移（自然回流）。

### 2. 按 MD2 扩展面板规格重绘

| 规格（m2.material.io Expansion panels） | 落地 |
|---|---|
| 容器：surface、4dp 圆角、elevation 1 | `MuiAccordion` 默认 `elevation: 1 / square: false`，圆角取 `MD2.shape` |
| 头部高度 48（dense）/ 56–64 | **56dp**，且展开前后**同高**（覆盖 MUI 默认的 64） |
| 头部文字 subtitle1（16sp/400）+ 水平 16dp | 标题改 `subtitle1`（`fontWeight: 500`）、左右各 16dp |
| 展开图标 24dp、onSurface 60% | `MD2.accordion.icon = rgba(255,255,255,0.6)`（原来是 70%） |
| **头部与内容之间 1px 分隔线** | `MuiAccordionDetails` 加 `borderTop: 1px solid rgba(255,255,255,0.12)`（原来没有） |
| 动效：标准缓动 | `cubic-bezier(0.4, 0, 0.2, 1)`，展开 250ms / 收起 200ms |
| 折叠时不渲染内容 | `slotProps.transition.unmountOnExit`（D47 已有：首屏 DOM 616 vs 展开后 2467） |
| 面板之间的间距 | 容器 `gap: 16px`（8dp 栅格） |

**回归锁**：E2E 新增"设置分区展开时头部不移动，且符合 MD2 扩展面板规格"——断言圆角 4px、有 elevation、
头部 56dp、默认折叠，点击后头部位置在 0/120/520ms 三个时刻**都与展开前相同**，
展开后头部仍 56dp 且头部与内容之间有 1px 分隔线。

---

## D50 卡面图集菜单的 MD2 合规检查与调整

**需求**（用户）：检查卡面图集设置菜单是否符合 MD2，不符合则调整。

### 检查结论：信息结构可以，选择控件不合规

| 项 | 检查结果 |
|---|---|
| 每套图集的 id / 原版说明 / 三张示例卡 | ✓ 保留（D46 照上游结构） |
| 1px 分隔线、位于 MD2 扩展面板内 | ✓ D49 已合规 |
| **"多选一"用「使用 / 正在使用」按钮** | ✗ **不符合**：MD2 里按钮用于触发动作，"多选一"应当用 **radio**；按钮的禁用态也不适合表达当前选中 |
| 单选按钮与首行文字的对齐 | ✗ 原来 `FormControlLabel` 默认 `alignItems: center`，单选会落在整块内容（id+说明+示例卡）的垂直中间 |
| 示例卡在行内的对齐 | ✗ 原来与说明"垂直居中"，说明换行行数不同 → 每行示例卡高低不齐 |
| 文字层级 | ✗ id 用 `subtitle2`（14sp），说明也是 14sp，主次不分 |
| 选中项的可读性 | ✗ 只有按钮文案变化，扫一眼看不出选了哪套 |

### 调整

1. **控件换成 `RadioGroup` + `FormControlLabel`**（MD2 的选择控件）：6 套图集 6 个单选按钮，
   当前图集选中；组有 `aria-label`（无障碍）；不再有"使用/正在使用"按钮。
2. **对齐**：`alignItems: flex-start` 让单选与**首行文字**顶对齐（实测单选 top 235 / 标题 top 233）；
   说明与示例卡那一行也改 `flex-start`，三张示例卡 top 一致。
3. **层级按 MD2 两行列表**：id 用 `body1`（16sp，主文本）、说明用 `body2` + `text.secondary`
   （14sp，中强调 70%）、说明里的链接用主色。
4. `data-testid` 拆分避免前缀互撞：`cardset-row-<id>`（整行）、`cardset-radio-<id>`（单选）、
   `cardset-title-<id>`、`cardset-description-<id>`——上一版 `cardset-<id>` 会被 `cardset-row-*` 的前缀匹配到。

**实测**：6 个 radio、单选与标题顶对齐、id 16sp、说明 `rgba(255,255,255,0.7)`、三张示例卡 top 一致、
分隔线全宽 1200px；点另一套能切换并同步到游戏页。

**回归锁**：单测改断言"6 个 radio、当前项 checked、点 label 能切换、每行 3 张图"；
E2E 断言行数 / 每行 3 张图 / 6 个 radio / 当前项 checked / id 顺序，并按 `cardset-radio-zun` 点击。
**跨浏览器坑**：`row.querySelector(".MuiTypography-body1")` 在 Firefox 会先命中 `FormControlLabel`
自己的 label `<span>`（它也带 `MuiTypography-body1`）→ 改成按独立 testid 取文本。

---

## D51 卡面图集：示例卡强制右对齐

**需求**（用户）：卡面图集设置中的图片强制右对齐，文字位置不变。

**根因**：行内那层 Stack（说明 + 三张示例卡）是 `alignItems: flex-start` 的**收缩宽度**容器
（label 的 `<span>` 默认不 `flex: 1`），宽度 = 内容宽度 → 说明不换行、示例卡紧跟在说明后面，
于是每行示例卡的 x 位置都不一样 ✗（实测：说明宽 934 / 580 / 864 / 911 / 583 / 938，
示例卡右边缘 1236 / 882 / 1166 / 1213 / 885 / 1240）。

**改法**：

- `RadioGroup` 里给 `.MuiFormControlLabel-label` 加 `flex: 1; minWidth: 0`（标签内容撑满整行）；
- 行内 Stack 加 `width: "100%"`，说明保持 `flex: 1`（位置不变、该换行就换行）；
- 示例卡那一组加 `flexShrink: 0`（固定 3×64，不参与伸缩），并改 `alignItems: flex-start`。

**实测**（六行完全一致）：说明 `left = 78`（与改前相同）、宽 938；三张示例卡 `left = 1032`、
**右边缘 = 1240 = 整行右边缘** ✓。

**回归锁**：E2E 断言六行示例卡的右边缘只有一个取值、且与整行右边缘差值 ≤ 1px，
同时六行的说明左边缘只有一个取值（"文字位置不变"）。

---

## D52 音MAD（otomads）模式：把改版仓库的 otomads 模式搬过来
> ⚠️ **已被 D113 取代**：音MAD 模式下**不再**临时强制打开本地曲库；用户可以自己关掉。

**需求**（用户）：用最早插桩的"自定义模式"接口，把上级目录 v2 工作区改版仓库里的 otomads 模式搬过来；
设置页添加入口；遵循原版行为；遵循 MD2。

**原版（改版仓库 `touhou-otomad-cards-workspace-v2`）的提交脉络**：

| 提交 | 内容 |
|---|---|
| `b0e850d` | originals / otomads 模式 + 本地专辑服务器（`getMusicUrl` 远端优先、三态判定、`createPlayingOrder` 按模式过滤、读档归一化） |
| `3d0c472` / `6b4880c` / `112ce1f` | 音MAD 曲目标题与 23 首曲目数据（12 角色） |
| `f9305f5` | 开局重建队列时要带当前模式（否则 otomads 下队列被过滤成空） |
| `f598204` / `d7f4ad4` | 角色曲池逐回合轮换 + 把音乐模式同步给对手 |

**本项目"预留接口"的现状**（用户指的插桩）：`data/packs/`（预埋、暂空）、专辑的 `pack` 字段、
`tools/src/tmc/local_source.py`（本地曲库助手，manifest 里带 `pack` 与 `[pack]` 配置，默认 id 就是
`otomads`）、`public/data/sources.json` 里默认关闭的 `local` 源 ✓ 这次就是把它们填满。

### 数据侧

* 新增 `data/packs/otomads.toml`：`[pack]` + `[[album]]`（`pack = "otomads"`）+ 24 条 `[[track]]`
  （角色 key 对齐本项目；曲目名沿用改版仓库的写法，如「川先僧 - 普通肥猫魔法使」）。
* `tools/src/tmc/packs.py`：曲包加载（`load_packs`）与并入角色表（`apply_tracks`）。
* `build.py`：曲包专辑并进 `albums.json`、曲包曲目并进 `characters.json`、新增 `packs.json`
  （运行时曲包注册表），index 增计 `packs` / `packTracks`。
* `validate.py`：曲包专辑并进注册表；曲包曲目的"必须出现在三个镜像表里"检查**跳过**（它们只存在于本机），
  但补齐曲包自身的检查（id 唯一、kind 合法、专辑归属一致、角色存在、附加信息合法、无重复）。
* 结果：`402 条目 / 392 去重曲目 / 40 专辑 / 1 曲包（24 曲）`，`tmc.build --check` 无漂移，校验通过。

### 应用侧（口径比 v2 更确定）

v2 用"曲目键在不在本地表里"推断模式（启发式）；本项目按**专辑的 `pack` 字段**判定：

* `src/music/mode.ts`：`MusicMode`、`packOfAlbum`、`modeOfEntry`、`isEntryAllowedInMode`、
  `hasTracksInMode`、`filterByMode`、`firstAllowedInMode`、`effectiveSourceOverrides`。
* 会话：`useSession.musicMode`（持久化，老存档缺字段回退原曲，不丢整份偏好）。
* 过滤：`allowedTracks` / `presetStats` / `singleModeRows` / `effectivePin` / `player`（含对局）
  以及播放页的可用角色集合都带上模式 → **音MAD 模式下对局只会抽到音MAD 曲目**（对应 v2 的 `f9305f5`）。
* 行为对齐 v2：模式只影响"接下来能选哪些曲目"，**不打断正在播放的这一首**；手选若是另一模式的曲目，
  按当前模式回退到第一首（不在会话中途改写存档）；音MAD 模式**临时**打开本地曲库（不改写用户的开关）。
* 联机：快照 / welcome 携带 `musicMode`，客户端采用主机的模式（缺字段保持本地不动）——对应 v2 的 `d7f4ad4`。
* 设置页入口（MD2）：**音乐源**分区顶部加"音乐模式"单选组（原曲 / 音MAD），说明文案与 v2 一字不差，
  选中音MAD 时多一行"曲目只存在于本机、自动使用本地曲库"的提示。

**实测**（真浏览器）：默认原曲、统计 `378 / 378`、不请求本地曲库；切到音MAD → 统计 `24 / 24`、
出现本地提示、自动请求 `http://127.0.0.1:8011/manifest.json`（本机未起助手时优雅失败）、
刷新后仍是音MAD；切回原曲统计回到 `378 / 378`。本机助手未运行时只有音MAD 曲目无声，其余不受影响。

**测试**：单测 +8（`src/music/mode.test.ts` 7 条 + 会话持久化 1 条，含"曲包数据真的进了角色表"），
E2E +1（模式切换 / 统计 / 本地请求 / 落盘 / 切回）。

---

## D53 音MAD 音频落位 + 本地助手常驻 + 完整 README

**需求**（用户）：把 v2 工作区的音MAD 音频复制过来并启动服务器；给本仓库编写完整的 README。

**音频与助手**：

* 从 `/home/molten-core/touhou-otomad-cards-workspace-v2/.music/otomads/` 复制 **24 个 mp3（82 MB）**
  到本仓库 `.music/otomads/`；`.gitignore` 补上 `.music/`（音频不进仓库，与"不搬运上游二进制素材"一致）。
* 仓库根写 `local-source.toml`（已 gitignore）：`root = ".music"`、`pack.id = "otomads"`。
* `cd tools && uv run python -m tmc.local_source` 起服务（127.0.0.1:8011），实测：
  `GET /manifest.json` → 200（`pack: otomads`，24 条）、`GET /media/…` → **206**（1 KB Range 请求，
  `audio/mpeg`，验证了 Range/CORS 都对）。
* 应用侧实测：设置页切到**音MAD** → 播放页自动拉 `manifest.json` → 音频从本地服务流式播放
  （响应 `206 川先僧 - 普通肥猫魔法使.mp3`），卡条显示 **13** 个有音MAD 曲目的角色。

**README**：整篇重写（116 → 314 行），覆盖：项目定位与与上游的差异、M0–M46 / D1–D52 与数据指纹、
功能一览（四个页面 + 联机 + i18n）、快速开始（含数据管线命令与端口）、**音MAD 模式与本地曲库四步操作**、
测试三层（199 单测 / 49 E2E / 33 数据测试）、数据管线与目录结构、架构速览（状态、选曲派生、模式、播放、联机、可测性）、
MD2 设计规范表、外部依赖、约定、已知限制、文档索引。README 内所有相对链接与目录锚点都做过校验（无失效）。

---

## D54 建立远端并首次推送
> ⚠️ **前提已变**（无对应决定条目）：主仓库已于 **`e572332`（2026-09-28）转为 public**。
> 下面"主仓库是私有仓库 ⇒ 匿名 404 / 要带令牌"的前提因此不再成立。

**需求**（用户）：主分支设为 `main`，远端设为 <https://github.com/Dustymind/touhou-music-cards-reconstructed>，
用 git CLI 推上去，注意 `.gitignore`。

**推送前审计**（关键：push 会带上**全部历史**，不只是工作树）：

| 检查 | 结果 |
|---|---|
| 分支 | 本来就叫 `main`（无需改名） |
| 工作树 | 干净（`git status --porcelain` 为空） |
| 跟踪文件 | **284 个 / 1.9 MB**，无单文件 > 200 KB |
| 历史最大 blob | `data/sources/cloudflare_r2.json` 149 KB（数据源表，必要） |
| 本地 git 对象 | 10.56 MiB（1472 个对象，未打包） |
| 被 `.gitignore` 挡住的大目录 | `.ref/` 358 MB、`.playwright-browsers/` 964 MB、`.music/` 82 MB、`node_modules/` 297 MB ✓ 远端 `git ls-tree -r` 里一个都没有 |
| 凭据 | `gh auth status` → 账号 `Dustymind`（`repo` scope），credential helper = `gh auth git-credential` |

**执行**：

```bash
git remote add origin https://github.com/Dustymind/touhou-music-cards-reconstructed.git
git branch -M main
git push -u origin main        # [new branch] main -> main，并设置上游跟踪
```

**结果**：远端 `main` = 本地 `HEAD` = `cfbc279`，远端默认分支已是 `main`，远端 284 个文件、
顶层只有源码/数据/文档/配置（无 `.ref`、无浏览器、无音频）。仓库为 **private**。

**顺带更新**：README 的约定从"不 push"改成"远端 = origin（main），push 前先确认工作树干净 +
`data:check` 无漂移"。

---

## D55 单端口部署（方案 B）：应用 + 本地曲库 + 信令同一个端口

**需求**（用户）：从三个方案里选 B —— 反向代理把三样东西并到一个端口。

**改了三处代码 + 一处数据 + 一份部署配置**：

1. **本地助手认代理头**（`tools/src/tmc/local_source.py`）：manifest 里的音频地址按**请求**现拼，
   顺序是 `X-Forwarded-Proto` → `X-Forwarded-Host` → `Host` → 监听地址；scheme 缺省 `http`。
   于是：直连 8011 得到 `http://127.0.0.1:8011/media/…`（与改前一致），经代理得到
   `http://<对外域名>:<端口>/media/…`（**与页面同源**），https 代理得到 `https://…`（**不会混合内容拦截**）。
   另加 `[server].public_base_url` / `--public-base` 作为"代理不转发这些头"时的显式覆盖。
2. **顺手修一个真 bug**：`find_bindable_port` 探测端口时没设 `SO_REUSEADDR`，端口上残留的 `TIME_WAIT`
   会被误判为"被占用"，助手于是白白跳到 8012/8013（实测：`8011 可绑? 8013` → 修完 `8011`）。
3. **前端：本地源地址可运行时覆盖**（`sources.ts` 的 `normalizeLocalManifestUrl` / `applyLocalManifestUrl`、
   `useSources` 多一个参数、会话新增持久化的 `localMusicUrl`）：`?localmusic=127.0.0.1:8011`
   （URL 参数**优先于**存档）或在设置页「本地曲库地址」填地址再点「应用」。接受完整 manifest 地址、
   基地址（自动补 `/manifest.json`）、`host:port`（自动补 `http://`）三种写法。
4. **数据**：`data/sources/sources.toml` 里 `local` 源的 `table_url` 由
   `http://127.0.0.1:8011/manifest.json` 改成 **`/manifest.json`**（同源）。同源 → 不需要 CORS；
   换域名/端口/协议都不必改数据。本机分开跑（5173 + 8011）用第 3 条的覆盖值。
5. **部署**：`deploy/Caddyfile`（分流 `/manifest.json`+`/media/*` → 8011、`/peerjs*` → 9100、其余 `dist/`，
   并显式 `header_up X-Forwarded-Proto/Host`）+ `deploy/README.md` + `deploy/single-port-proxy.mjs`
   （没装 Caddy 时的等价 Node 代理，逻辑同 Caddyfile）。

**实测**：

| 检查 | 结果 |
|---|---|
| 三条 URL 生成路径 | 直连 → `http://127.0.0.1:8011/media/…`；经代理 → `http://127.0.0.1:8090/media/…`；伪造 https 头 → `https://cards.example.com/media/…` ✓ |
| 代理分流（全在 :8090） | `/` 200、`/manifest.json` 200（24 条）、`/data/index.json` 200 ✓ |
| Range 透传 | `Range: bytes=0-1023` → **206** + `content-range: bytes 0-1023/4604401` ✓ |
| 真浏览器走单端口 | `?locale=zh` → 切音MAD → 请求 `200 127.0.0.1:8090/manifest.json`（**同源**）→ 音频 `206 127.0.0.1:8090/media/…`，页面 13 个音MAD 角色 ✓ |

**回归锁**：单测（`sources.test.ts`）覆盖地址归一化与"只改 local 源、不动镜像源、不改写入参"；
E2E 新增"本地曲库地址：默认同源，`?localmusic=` 可指向本机助手"（断言默认请求打在应用自己的 origin 上、
覆盖后打在 `http://127.0.0.1:8011/manifest.json`，并断言设置页回显存档值）。

**不改的**：WebRTC 的 P2P 媒体流（UDP）本来就不在端口里，跨 NAT 仍需 STUN/TURN —— 这条与单端口无关。

**补记（用户反馈":8090 不可用"）**：查下来端口本身没问题（沙箱内 `curl 8090` = 200），
真正的原因是**只绑了回环** —— `deploy/single-port-proxy.mjs` 原来 `listen(PORT, "127.0.0.1")`，
应用（5173）与助手（8011）也是 `127.0.0.1`，所以从外部浏览器根本连不上（只有信令 9100 是 `*` 可达）。
改成**代理默认 `0.0.0.0:8080`**（与 Caddyfile 一致，`PORT=`/`HOST=` 可覆盖），应用与助手继续留在回环后面
（只暴露一个端口）。实测：`ss` 显示 `0.0.0.0:8080`；`127.0.0.1:8080` 与 `10.21.218.160:8080` 均 200；
用外部地址打开 → 切音MAD → `200 http://10.21.218.160:8080/manifest.json` +
`206 http://10.21.218.160:8080/media/…`（**同源同端口**）、13 个音MAD 角色 ✓。

---

## D56 https 透传下的“连接不完全安全”

**需求**（用户）：透传正常，但用 https 透传时浏览器报“连接不完全安全”。

**排查**（先把范围压到最小）：

| 可能来源 | 结论 |
|---|---|
| 数据里的镜像/卡面 URL | **0 个 `http://`**（三份镜像表 + 卡面 origins 全是 https）→ 不是数据问题 |
| 应用自身资源 | 生产构建 `base: "./"`、数据走相对路径 → 全是同源 https |
| **本地曲库的音频地址** | 找到了：`deploy/single-port-proxy.mjs` 转发时**写死** `x-forwarded-proto: "http"`，把最外层 https 隧道传来的 `https` 覆盖掉了 → 助手拼出 `http://…/media/…` → 混合内容 |
| 联机信令 | 也有一处：`peersecure` 省略时 `secure` 为 `false`（PeerJS 默认）→ https 页面上用 `ws://`，同样被拦 |

**改法**：

1. 代理**不再谎报协议**：`X-Forwarded-Proto` / `X-Forwarded-Host` 一律**原样传下去**（拿不到才按连接自身判断），
   可用 `PROTO=https` 兜底；`X-Forwarded-Host` 优先于 `Host`，保证音频地址与**页面的对外 origin** 一致。
2. `?peersecure=` 省略时**跟页面协议走**（https → `wss://`）；显式写 `peersecure=0/1` 仍然优先。
3. `deploy/README.md` 增加“https 与连接不完全安全”小节：来源表 + 自查方法（DevTools Console 会点名被拦的
   `http://…`）+ 提醒 https 页面上不要把“本地曲库地址”填成 `http://127.0.0.1:8011`。

**实测**（模拟最外层 https 隧道）：

```
带 X-Forwarded-Proto: https + X-Forwarded-Host: cards.example.com
   → https://cards.example.com/media/otomads/…        不再混合内容
只带 X-Forwarded-Proto: https
   → https://10.21.218.160:8080/media/otomads/…       与页面同源
什么都不带（本机）
   → http://127.0.0.1:8080/media/otomads/…            本机形态不变
```

**回归锁**：单测 3 条（`peerServerOptions`：省略时跟协议走 / 显式优先 / host·port·path 照旧解析）。

---

## D57 移动端适配（分支 `feat/mobile-adaptation`）

**需求**（用户）：做移动端适配，新开分支编写，新开实例测试（在 `0.0.0.0` 上监听），遵循 MD2。

**做法**：新分支 `feat/mobile-adaptation`；另起一个实例 `pnpm dev --host 0.0.0.0 --port 5174`
（原 5173 不动，两个实例并存对比）；用 Playwright 的 **Pixel 7**（412×915、触摸、DPR 2.625）先做审计，
再按实测问题改，最后把移动端断言固化成 `mobile` project。

**审计发现的真问题（都在真机尺寸下测出来）**：

| 问题 | 现象 | 修法 |
|---|---|---|
| **应用栏挤爆** | 412px 宽时标题 + 指纹 + 彩蛋 + 四个页签抢一行，页签被压住**点不到**（Playwright 报 "`MuiTypography-overline` intercepts pointer events"） | 应用栏 `flexWrap`，页签 `order/width` 在窄屏**折到第二行并占满整行**；指纹窄屏隐藏（设置页"数据"里仍有）；彩蛋用短文案 `Alice!`（MUI `useMediaQuery`，与上游小屏一致） |
| **进度条消失** | 播放控制一行里放不下，进度条被 flex 压成 **0 宽**，手机上看不见也点不到 | 窄屏改两行：`上一首/播放/下一首` + 时间 + 音量一行，**进度条整行独占**（`flex: 1 0 100%`）；音量按钮 ≥40dp |
| **按钮文字折行** | 游戏页窄屏把「随机补满」挤成两行（`随机\n补满`） | 按钮 `whiteSpace: nowrap`，改成**整组换行**（`gameButtonsSx` 加 `flexWrap`），窄屏行距放宽到 12dp |
| 触摸目标 | 图标按钮/页签/单选需要 ≥40dp | 实测全部达标（审计脚本从 0 条不合格）；文字按钮按 MD2 small = 32dp 合规 |

**新增的回归锁**（`e2e/mobile.spec.ts`，跑在 `mobile` project；桌面的 chromium/firefox 用 `testIgnore` 排除）：

1. 四个页面**都没有横向溢出**（`scrollWidth ≤ clientWidth + 1`）；
2. 应用栏窄屏**折成两行**（页签 top ≥ 标题 bottom、页签占满 >90% 宽）、彩蛋是 `Alice!`、指纹隐藏；
3. 播放控制：进度条 >180px、音量按钮 ≥40×40 可见可点；
4. 触摸目标：图标按钮/页签/单选 ≥40，文字按钮 ≥32；
5. 游戏页**触摸可玩**：`tap()` 未使用卡进牌库、再 `tap()` 拿回来。

**实测**（Pixel 7）：5/5 通过；四个页面 `scrollWidth == clientWidth == 412`；
进度条整行可见；游戏页 8 列卡面在 412px 下约 44px 宽，仍可点。

**测试实例**：`0.0.0.0:5174`（原本机实例仍在 `127.0.0.1:5173`），手机/外部浏览器可用
`http://10.21.218.160:5174/?locale=zh` 打开。

---

## D58 移动端选卡改成多行面板（去掉突兀的模态抽屉）

**需求**（用户）：移动端选卡改成多行抽屉（与当前卡槽相同）；移动端选卡菜单过于突兀，可能不符合 MD2。

**两处改动**：

1. **内容：单行滑块 → 多行网格**。`UnusedCards` 加 `layout: "strip" | "grid"`：宽屏仍是单行 + 滑块（不动），
   窄屏用 `grid` —— `flex-wrap` 铺开，**卡面尺寸与间距和牌桌卡槽完全一致**（同 `width`、同 `DECK_GAP`）。
   实测：面板里 103 张卡排 **10 行**，卡片 `30×43` == 牌桌卡槽 `30×43` ✓。
2. **容器：模态抽屉 → 非模态底部面板**。原来的 `SwipeableDrawer` 会给整个牌桌盖一层**遮罩** ✗
   —— 操作被打断、观感突兀，正是用户指出的问题。MD2 的 bottom sheet 本来就有非模态的
   "persistent / expanded" 形态：面板升起、后面内容仍可交互、**没有遮罩** ✓。现在用
   `Fade` + `Slide` + `Paper(elevation 16)` 实现：4dp 上圆角、顶部 **32×4 拖拽把手**（点它收起）、
   16dp 内边距、底部 `env(safe-area-inset-bottom)`、**高度上限 30vh**（只占下半屏的一小条，
   上面留出牌桌，能边挑卡边看牌库填进去）。

**为什么要限制到 30vh**：实测 45vh 时面板顶在 461px，而牌桌在 471–607px —— **整块被盖住** ✗；
改 30vh 后面板顶在 587px，牌桌有 2–3 行露在上面 ✓，配合页面滚动，"面板开着也能点牌桌"成立：

```
面板高 252px | 可点到的牌桌卡 deck-you-card-11 | 牌库 24 → 23 ✓
```

**回归锁**（替换掉原来那条抽屉用例）：断言收起来只有底部栏 → 展开是**多行**（>2 行）且卡宽 == 卡槽宽 →
面板 4dp 圆角 / ≤35vh / 把手 32×4 / **遮罩数 0** → 面板开着时点牌桌的卡牌库真的少一张 →
点把手收起回到只有底部栏；"触摸也能玩"那条改成先展开面板取卡、收起后再点牌桌。

---

## D59 移动端选卡面板与顶栏的四个问题

**需求**（用户）：① 移动端选卡无法收回；② 移动端选卡列数应与卡槽对齐；③ 选卡时缺失阴影；④ PC 端顶栏错位。

四个都复现并定位到了具体原因：

| # | 现象（实测） | 原因 | 修法 |
|---|---|---|---|
| ① | 面板升起后底部栏 `top 619` 落在面板 `top 587` **下面**（`covered: true`）→ 屏幕上的「收起」按钮被盖住，用户没有别的入口 | 面板是 `position: fixed` 的底部面板，会盖住 sticky 的底部栏 | 面板**自带标题行 + 「收起」按钮**（`unused-cards-close`）；面板打开时底部栏直接不渲染（避免"看不见的按钮"）；拖拽把手仍可点 |
| ② | 面板里 **11 列**、牌桌 **8 列** ✗ | 网格用 `flex-wrap` + `auto-fill`，列数由宽度决定 | 改成 `display: grid` + `gridTemplateColumns: repeat(deckColumns, width)`，列数/卡宽/间距全部与牌桌一致（实测 `columns 8 == deckColumns 8`、卡宽 `30 == 30`、间距 4） |
| ③ | 面板背景 `rgb(18,18,18)` 与页面**完全相同**，深色下黑色阴影几乎不可见 → 看着"没有阴影" | 深色主题里 elevation 不能只靠阴影，MD2 规定用 **surface 叠加**（16dp → 15% 白） | 面板加 `backgroundImage: linear-gradient(rgba(255,255,255,0.15) × 2)` + `boxShadow: theme.shadows[16]` + 1px 顶部分隔线 |
| ④ | PC 顶栏：标题 `16–97`，页签却从 **477** 开始（中间隔着指纹与彩蛋） | 窄屏适配时把 `Tabs` 写在了 JSX **最后**，只靠 `order` 调整；宽屏 `order` 全为 0 → 按 DOM 顺序排，页签被挤到最后 | 把 `Tabs` 移回标题之后（DOM 顺序 = 宽屏顺序），窄屏继续用 `order: { xs: 3 }` + `width: 100%` 折行；宽屏 `flexWrap: nowrap`。实测：标题 `16–97` → 页签 `113–1060` → 指纹 `1076–1249` → 彩蛋 `1265–1424`，同一行 ✓ |

**回归锁**：移动端用例加断言"列数 == 牌桌列数"、"面板内有收起按钮且底部栏让位"、"面板有 elevation 叠加"，
收起动作改用面板里的按钮；桌面两个 project 的既有顶栏用例（高度 64 / 页签 48 / 大写 / 字距 / 指示条）
继续约束顶栏规格。

---

## D60 选卡面板的把手改成真的能拖

**需求**（用户）：移动端选卡界面顶端横条无实际作用。

**原因**：那条 32×4 的横条是按 MD2 bottom sheet 的**拖拽把手**画的，但面板从 `SwipeableDrawer`
换成非模态 `Fade + Slide + Paper` 之后**拖拽能力丢了** —— 只剩"点一下收起"，看起来就是个装饰 ✗。

**改法**（要么拿掉，要么让它真有用；选了后者，顺带解决"面板太矮看不清 100+ 张卡"）：

* 把手用 pointer 事件实现拖拽：向下拖 → 面板变矮，向上拖 → 变高，范围 20–85vh；
* 松手时**吸附到三档**（30 / 60 / 85vh，MD2 的 bottom sheet detent 思路）；
* 往下拖过最小档 → 直接**收起**；没拖动（轻点）→ 收起（保留原来的快捷操作）；
* `touchAction: "none"` + `setPointerCapture`，触摸与鼠标都生效。

**实测**（Pixel 7）：初始 252px（30vh）→ 上拖吸附到 **503px（60vh）** → 下拖 320px 后**收起**
（面板高度 0、底部栏回来）✓。

**回归锁**：移动端用例加"上拖变高（>1.5 倍）"与"下拖到底收起"，之后再用面板里的「收起」按钮收一次。

---

## D61 选卡面板与"卡牌大小"联动，并合并回 main

**需求**（用户）：面板高度/列数跟随"卡牌大小"设置联动（原来只跟列数）；之后合并回 `main`。

**联动实现**：三档不再是写死的 `30/60/85vh`，而是按**行数**表达（3 / 6 / 10 行），
高度由卡面高度换算：

```
cardHeight = width / CardAspectRatio（703/1000，与卡槽同一比例）
rowHeight  = cardHeight + DECK_GAP(4)
detent     = clamp(CHROME_PX(96) + rows × rowHeight, 22%vh, 85%vh)
```

拖动仍然是"吸附到最近的档位、拖过最小档收起"，只是档位值随卡片尺寸变化；窗口尺寸变化时用
`resize` 监听重算。用户点「放大 / 缩小」时，当前档位按新尺寸重新换算（不会跳回最小档）。

**实测**（Pixel 7）：

| 卡牌大小 | 卡面 | 牌桌卡槽 | 列数 | 面板高度（3 行档） |
|---|---|---|---|---|
| 默认（8%） | 30×43 | 30×43 ✓ | 8 == 牌桌 8 ✓ | **237px** |
| 放大 3 档 | 42×60 | 42×60 ✓ | 8 == 牌桌 8 ✓ | **288px** |

**回归锁**：移动端用例加"放大两档后面板变高、卡面变大、仍与卡槽同尺寸同列数"。

**合并回 main**：`git checkout main && git merge --no-ff feat/mobile-adaptation`（保留分支历史），
`pnpm typecheck` / `pnpm test` / `pnpm e2e`（含 mobile project）全绿后推送。

---

## D62 收尾：一个实例同时服务桌面与移动端，清理分支

**需求**（用户）：删掉已合并的 `feat/mobile-adaptation` 远端分支；主实例同时跑桌面端移动端；
关闭 `:5174`；把改动推送到仓库。

**做法与结果**：

| 项 | 结果 |
|---|---|
| 远端分支 | `git push origin --delete feat/mobile-adaptation` → `- [deleted]` ✓（本地分支一并删除，`git branch -d` 确认已完全合并） |
| 移动端专用实例 | `:5174` 已关闭 ✓（它只是适配期的对照实例，适配已合入 main） |
| 主实例 | 由 `127.0.0.1:5173` 改为 **`0.0.0.0:5173`**，同一实例既服务桌面也服务移动端（响应式断点在客户端判断，不需要两个实例）✓ |
| 实测（同一实例 `10.21.218.160:5173`） | 移动端 Pixel 7：视口 412、**横向溢出 0**、页签在第二行、彩蛋短文案 `Alice!` ✓；桌面 1440：工具栏 64、标题 `16` → 页签 `113` → 指纹 `1076` → 彩蛋 `1265` 同一行、长文案 `Alice is right!` ✓ |

**当前在跑的实例**（都在本机）：

| 地址 | 用途 |
|---|---|
| `0.0.0.0:5173` | 应用（桌面 + 移动端同一个实例） |
| `127.0.0.1:8011` | 本地曲库助手（音MAD） |
| `*:9100` | PeerJS 信令 |
| `0.0.0.0:8080` | 单端口代理（应用 + 曲库 + 信令三合一，见 `deploy/`） |

---

## D63 移动端对齐修正 + 设置页展开卡顿（长任务）

**需求**（用户）：移动端多行 tag 时左侧没对齐；下方开关与选框没对齐；设置界面展开菜单卡顿，
控制台有 `[Violation] 'message' handler took 231ms`。

### 对齐

| 问题 | 实测 | 原因 | 修法 |
|---|---|---|---|
| 换行的 tag 左侧不齐 | 数据分区 chip 行：首行左边缘 `32`，换行后那一行 `40` ✗ | `Stack spacing` 是给子项加 **margin**，换行后新行第一项仍带着左边距 | 去掉 `spacing`，只用 `gap`（`gap` 对换行后的首项不加额外边距）→ 实测两行都是 **32** ✓ |
| 开关/选框没对齐 | 音乐源行两行标题时，状态 chip / 开关 / 箭头在整块里垂直居中 ✗ | `alignItems: center` 对多行标签就是"整块居中" | 行改 `alignItems: flex-start` + 各控件 `mt: 0.5` → 与**首行**对齐 ✓；预设的复选框同理（`alignItems: flex-start` + 复选框 `mt: -0.75`、标签 `mt: 1.25`），与卡面图集那排单选的做法一致 ✓ |

### 卡顿 / 长任务

用 `PerformanceObserver({ entryTypes: ["longtask"] })` 量了展开各分区的长任务：

| 分区 | 改前 | 改后 |
|---|---|---|
| 数据 | 无 | 无 |
| 预设（~200 个复选框） | **79ms** | **无** |
| 仅单曲模式（121 行 × 下拉框） | **1063ms**（并伴随 231ms 级 violation） | **无** |
| 音乐源 | 无 | 无 |

三次尝试与结论（都记下来，避免以后重走）：

1. **分片渲染**（先 12 行、其余 `setTimeout(0)` 补）—— 没用：`setTimeout(0)` 会连着跑，
   浏览器没有渲染机会；用 DOM 采样追踪看到节点数在一个任务里从 625 跳到 2858 ✗。
2. 改 `requestIdleCallback`、再改 `requestAnimationFrame + setTimeout` —— 分片确实生效了，
   但 dev 下**单行 Select ≈ 60ms**，2 行一片仍要 120–150ms ✗，且要 8 秒才铺满 ✗。
   顺带发现：把分片更新包进 `startTransition` 反而更糟 —— transition 会被合并成一次大渲染 ✗。
3. **行级懒挂载（最终方案）**：新增 `src/ui/components/LazyRow.tsx`，用 `IntersectionObserver`
   （提前 240px）决定这一行是否真正挂载，之前用等高占位避免跳动。仅单曲模式与预设专辑列表都套上。
   实测：展开单曲分区时 DOM 从 625 → **1091**（改前 3373），**长任务消失**；整页 DOM 也从 3593 降到 1804。
   `IntersectionObserver` 不存在时（jsdom 单测）直接挂载，单测不受影响 ✓。

**顺带**：懒挂载的行对外只暴露占位，测试要滚动到占位才能拿到内容 → `LazyRow` 增加 `testId`
（占位与内容共用），单曲行是 `single-row-<key>`；对应的 E2E 用例改成"滚到占位 → 断言真实控件"。

**回归锁**：`pnpm e2e` 全绿（chromium + firefox + mobile，57 passed）；对齐部分由既有的移动端布局用例
（无横向溢出、触摸目标）继续约束。

---

## D64 播放页换行 tag 的对齐（D63 的漏网）

**需求**（用户）：设置界面的多行 tag 对齐了，主界面播放页的没有（移动端）。

**原因**：D63 只修了设置页那几处 `Stack spacing`，**播放页/大厅/播放控制**里同样"会换行 + 用 spacing"
的行没动 ✗。实测播放页的专辑 chip 行左边缘 `188`，换行后的类别/音源 chip 行是 **`196`** ✗（差 8px）。

**修法**：把所有"会换行的行容器"统一改成 `gap`（不再用 `spacing` 的 margin 方案）：

| 文件 | 位置 |
|---|---|
| `PlayerPanel` | 曲目 chip 行、开关行、播放时长行 |
| `PlayerControl` | 控制条那一行 |
| `LobbyPanel` | 大厅的两行 |
| `SingleTrackSection` | 开关 + 说明那一行 |
| `PresetSection` | 秘封曲的按钮行 |

**实测**：播放页 chip 行 `188` / 换行后 `188, 249` ✓；顺带把时间文本 "0:00 / 3:27" 从 `196` 拉回
`188` ✓（它也受同一处 spacing 影响）。

**回归锁**：移动端用例新增"换行的 tag 行左边缘一致"——播放页取当前曲目那组 chip，设置页取
`data-chips`（那排统计 chip，**不含**"语言"那一行：它跟在标签后面，本来就该缩进），
断言各自"按行分组后只有一个左边缘取值"。

---

## D65 点击长任务：全部找出并优化

**需求**（用户）：不少控件会产生 `[Violation] 'click' handler 用时 <N> 毫秒`，全部找出并优化。

**方法**：写了一个"逐控件点击"的扫描脚本（Pixel 7 + `PerformanceObserver(longtask)`），把四个页面里
每个可点控件的点击都过一遍，按控件归因长任务（Chromium 的 `[Violation]` 报的就是 >50ms 的事件处理，
所以长任务就是这个问题的量化指标）。

**改前（dev）**：15 个控件有 50–188ms 的长任务，最重的三个：
列表切行 **188ms**、音乐模式切换 **198ms**、设置预设三态 **152ms**；展开"仅单曲模式"更是 **1063ms**（D63 已修）。

**优化（三类，都是"别让一次状态变化重算整棵子树"）**：

| 措施 | 说明 |
|---|---|
| `memo(CharacterCard)` | 卡面在一个页面里可能有上百张（牌桌 / 选卡面板 / 轮播），状态没变不该重画 |
| 列表行抽成 `memo(ListRow)` + **稳定回调** | 原来每行拿到的是新函数 → memo 失效 → 切一行重渲染 121 行（188ms）；现在只重渲染"旧的当前行 + 新的当前行" |
| 四个面板 `memo(...)` | 外壳状态（语言 / 音乐模式 / 分区展开）变化时不再重算整页 |
| 选卡面板按"行"懒挂载（`LazyRow`） | 打开面板本来一次挂载 ~40 张卡（105ms）→ 现在只挂可见的几行 |
| `useDeferredValue` 用于列表搜索 | 输入时先出字，重列表渲染让给下一帧 |

**改后**：

| | dev（最坏情况） | 生产构建 |
|---|---|---|
| 有长任务的控件 | 11 个（50–194ms，均为"挂载 N 个 MUI 组件"的固有成本） | **0 个**（50ms 阈值下一次都没有） |
| 已消失的 | 列表切行 188ms ✓、列表搜索 61ms ✓、选卡面板 105ms ✓、播放暂停 96+54ms ✓、重新抽选 85ms ✓、打乱卡组 58ms ✓ | — |

**dev 与生产的差别**是这次最重要的发现：dev 下 Vite 不压缩 + React StrictMode 双渲染，
同一批操作在生产构建里**完全没有** ≥50ms 的长任务（用 `deploy/single-port-proxy.mjs` 的 `APP=static`
跑 `dist/` 实测）。所以用户看到的 violation 主要来自 dev server；仍然做了上面的优化，因为
"展开单曲模式 1063ms""列表切行 188ms"这类在 dev 里也明显卡顿。

**回归锁**：新增 `e2e/perf.spec.ts`（chromium 跑一遍，firefox 用 `testIgnore` 跳过）：
在 dev server 上点一遍主要控件（播放/暂停、重新抽选、列表切行、展开三个重分区、切换音乐模式、
随机补满、卡牌放大），断言**任何一次点击都不产生 ≥200ms 的长任务**（阈值说明写在注释里：
dev 用 200ms 是为了抓住"上千毫秒/近两百毫秒"这类回归，生产标准另见上表）。

---

## D66 勾选框行高、单曲开关越界、倒计时三声、按卡组筛选

**需求**（用户）四条：① 音乐选择预设的勾选框高度与文字不一样（同时检测类似问题）；
② 仅单曲模式的开关超出下方搜索框，缩回；③ 游戏倒计时改成三声响；
④ 按卡组筛选音乐时，只剩最后一张卡时待播放列表可能混乱（轮播数 < 卡牌数）。

**① 勾选框行高**：D63 为了"多行标签与首行对齐"用了 `mt: -0.75 / 1.25` 微调 ✗，结果复选框盒子（38px）
比单行行高（32px）还高、跟文字也不在同一基线上。实测（改前）：行高 32 / 40 混杂、复选框盒子 38px。
改法：抽出 `PRESET_ROW_SX`（**统一 `minHeight: 40`、`alignItems: center`**、复选框 `p: 1`），
预设与秘封曲的每一行都用它 ✓ 实测：行高一律 40，复选框盒子 36–40 落在行内，图标与文字中心逐行重合 ✓。
同类问题一并处理：音乐源行也从"`flex-start` + `mt: 0.5` 微调"改成 `minHeight: 40 + center` ✓。

**② 单曲开关越界**：开关与说明挤在同一行 ✗，窄屏下说明折行会把开关挤得越过下方搜索框。
改成**开关独占一行、说明另起一行** ✓ 实测：开关行 748–788、说明 792–812、搜索框从 820 起 →
**32px 间隔，零重叠** ✓。

**③ 倒计时三声**：原来只在倒计时开始响一声 ✗。`createBell` 的 `ring()` 增加可选时长参数
（倒计时用 320ms 的短"滴答" ✓），`usePlayer` 暴露 `tick()`，倒计时阶段在 0/1/2 秒各响一次 ✓
（阶段切换时清理定时器 ✓）。单测覆盖"tick 不打断正曲、不进入 countingDown" ✓。

**④ 按卡组筛选**：`filterMusicByDeck` 只把"不在牌库/收集区"的角色标记为临时禁用，但**轮播 `order` 里可能
根本没有某个还有牌的角色**（`order` 来自播放页的可用角色，受预设 / 音乐模式 / 单曲停用影响 ✗）→
`order ∩ 未禁用` 会小于剩余卡牌数，只剩最后一张时甚至变空 ✓ 就是用户说的"混乱"。
改法：筛选时把"有牌但不在 `order` 里"的角色**补进 `order`** ✓，再统一标记禁用 ✓。
新增 3 条单测（有牌不在轮播 → 补进去；只剩一张 → 待播列表不为空；没牌的角色仍被禁用）✓。

**顺带**：性能守卫用例（D65）在负载高时会误报（同机还跑着 dev / 代理 / 曲库 / 信令）→ 改成
"重复三次取最轻的一次"，阈值 250ms（真正的回归三次都慢）✓。

**验证**：`pnpm test` **209 passed**（新增 4 条）；`pnpm e2e` 三 project 全绿（含更新后的守卫）。

---

## D67 播放页标题互换 + 列表页可展开曲目并点播

**需求**（用户）：① 播放页把角色名和曲名的位置互换（**曲名在上略大、角色名在下略小**）；
② 列表页加播放能力：**点角色展开曲目（默认折叠）**，曲目格式参照现在的列表显示，**点曲目即播放**；
注意对齐 / 优化 / 格式 / 移动端 / MD2。

**① 标题互换**：`PlayerPanel` 由「角色名 h5 → 曲名 body1」改成
**「曲名 h6（20sp，`lineHeight 1.3`）→ 角色名 body2（14sp，次要色）」** ✓ 实测（移动端 412px）：
曲名 20px 在上（top 124）、角色名 14px 在下（top 184）✓。加了 `now-title` / `now-character`
两个 testid 供用例与联机自检使用。

**② 列表页展开 + 点播**：

| 关注点 | 做法 |
|---|---|
| MD2 | 行本身是 `ListItemButton`（可点、有 state layer），`aria-expanded`；右侧**旋转 180° 的展开箭头**，250ms `cubic-bezier(0.4,0,0.2,1)`；内容用 `Collapse`（进 250 / 出 200，`unmountOnExit`）——与设置页分区同一套规格 |
| 格式 | 曲目行沿用列表的两行格式：**主文本 = 曲名（`displayTitle`）、次文本 = 专辑**；左侧 `PlayArrow`，正在播的那首换成 `GraphicEq` + 主题色 + `action.selected` 底色 |
| 对齐 | 曲目行缩进到头像列之后（桌面 `pl: 9` = 72dp，窄屏 `pl: 7` = 56dp），行高 `MD2.listItem`(56) |
| 移动端 | 整行 56dp 触摸目标 ✓、箭头/播放图标 20px ✓、标题 `noWrap` ✓、窄屏缩进收窄 ✓ |
| 优化 | 曲目**只在展开时挂载**（默认折叠 → 121 行不会一次性铺开 ✓）；`ListRow` 继续 memo ✓ 回调稳定 ✓（D65）；展开状态是 `Set<string>` 局部状态，只有被点的行与父级重渲染 |

**点播怎么接进播放器**（复用已有机制，不改协议）：`session` 增加**不落盘**的
`entryRequest: { key, entry } | null`；`AppShell` 把它并进传给 `usePlayer` 的 `pinned`
（播放器本来就有"角色 → 指定曲目"的机制，单曲模式用的就是它 ✓，点播优先 ✓）。
起播放在 effect 里：状态更新后 `entry` 才是新的一首，同一个 tick 里调 `playImmediate()` 会播到旧的 ✗。

**实测**（chromium，桌面 + Pixel 7）：默认折叠（曲目块 0）✓ → 点行展开（魔理沙 12 首）✓ →
点第三首 → **高亮 1 行** ✓ 播放页曲名 = 点的那一首 ✓ **时间 0:01 → 0:04 真的在走带** ✓。

**回归锁**：两条新用例——"播放页：曲名在上略大、角色名在下略小（含次要色）"、
"列表页：默认折叠 → 点角色展开 → 点曲目即播放并高亮 → 再点收起"。

---

## D68 音量滑杆常驻（不再折叠）

**需求**（用户）：播放页音量条不要折叠。

**原因**：D38 按"MD2 媒体控制惯例"做成了**图标按钮点开才显示滑杆** ✗（`volumeOpen` 状态 ✓）——
手机上要用音量得先点一下图标 ✗。

**改法**：

* 音量滑杆**常驻**（`data-testid="volume-slider"`），不再有显隐状态；
* 图标按钮改成**静音开关**（`volume_off`/`volume_up` 语义，`aria-label` 在 `mute`/`unmute` 间切换，
  点击在 0 与 1 之间切换）—— 图标仍有用，但不再"折叠"内容；
* 布局：把「时间 + 静音 + 音量滑杆」合成一组，宽屏与按钮同行（滑杆固定 120dp），
  窄屏整组换行、滑杆 `flex: 1 1 auto` 撑满剩下的宽度（`minWidth: 72` 兜底）——
  这样手机上是"一行时间/音量 + 一行进度条"，不会出现两条叠在一起的滑杆 ✗。

**实测**：

| 视口 | 时间 | 音量滑杆 | 同一行 | 进度条 | 横向溢出 |
|---|---|---|---|---|---|
| 桌面 1440 | @264 | 120×28 @260 | ✓ | @257（同行） | 0 |
| 移动 412 | @396 | 72×42 @395 | ✓ | @448（下一行） | 0 |

**回归锁**：移动端用例改为"进度条、音量按钮与**常驻**音量滑杆都可见可点"，并断言滑杆宽度 > 60px ✓。

**过程中踩到的坑**（记下来）：用脚本按"起止标记"替换 JSX 片段时，范围跨过了进度滑杆那一块 ✗，
一度把进度条删掉（typecheck 不会发现少了一个控件 ✗）——是靠浏览器里量 `seek-slider` 才发现的 ✓。
以后改这类结构要走「读文件 → 精确 edit」而不是整段替换。

---

## D69 控制条：时间挪到进度条左侧、音量不再越界、窄屏整卡宽

**需求**（用户）：① 音量滑块超出显示边界；② 播放进度条过长；③ 播放时间显示建议放进度条左侧。

**根因（②③ 是同一个结构问题）**：`PlayerPanel` 的播放卡片是「卡面 | 信息列」并排，
而**控制条被放在信息列里面** ✗ —— 窄屏下信息列只剩 ~176dp 宽，`PlayerControl` 需要 ~280dp ✗，
于是进度条被压、音量滑杆被挤到卡片外（实测：移动端音量滑杆 `400–468`，卡片右边缘只有 `396` ✗✓）。

**改法**：

1. **控制条移出信息列、独占一行整卡宽** ✓；
2. 卡片外层窄屏改**纵向堆叠**（`direction: { xs: "column", sm: "row" }`）—— 卡面在上、信息在下，
   这也是 MD2 移动端媒体卡片的常规形态；
3. `PlayerControl` 改成两行固定结构：
   * 第一行：**时间在左 + 进度条在右**（用户要求 ③；进度条只占这一行剩下的宽度，不再"过长" ✓）；
   * 第二行：传输键 + 静音开关 + 音量滑杆（**固定宽度** 72/120dp、**不参与 flex 拉伸**，
     所以不会再顶出边界 ✓）；
4. 加了 `playback-time` 这个 testid 方便用例断言。

**实测**（改后，量的是"元素是否越出卡片"）：

| 视口 | 卡片 | 时间 | 进度条 | 音量滑杆 | 越界元素 |
|---|---|---|---|---|---|
| 桌面 1440 | 24–1416 | 196–274（在进度条左侧 ✓） | 同行，宽 1270 | 固定 116 宽 | **无** ✓ |
| 移动 412 | 16–396 | 32–110（在进度条左侧 ✓） | 122–380（宽 258） | **308–376（宽 68，卡内 ✓）** | **无** ✓ |

两端的文档横向溢出都是 **0** ✓。

**回归锁**：移动端用例继续断言"进度条 >180px、音量滑杆 >60px、图标按钮 ≥40px"（现在分别是 258 / 68 / 48 ✓）；
`pnpm e2e` 三 project 全绿（63 passed）。

---

## D70 进度条长度上限照搬原版

**需求**（用户）：参考原版长度给进度条设置长度上限。

**原版是多少**（`.ref/upstream-v3/app/components/PlayerControl.tsx`）：

```tsx
<Stack direction="row" spacing={3} alignItems="center" width="100%" justifyContent="center">
  <Typography fontFamily={MonospaceFontFamily}>{formatTime(playback.currentTime)}</Typography>
  <Slider value={playback.currentTime} min={0} max={playback.duration}
    sx={{ width: "clamp(0px, 40%, 300px)" }} />
  <Typography fontFamily={MonospaceFontFamily}>{formatTime(playback.duration)}</Typography>
</Stack>
```

即：**`clamp(0px, 40%, 300px)`**（最多 300px、最多占容器 40%），而且**横排居中的结构是
「已播时间 · 滑杆 · 总时长」**；音量滑杆用的是同一条长度规则。

**改法**：`PlayerControl` 抽出常量 `SLIDER_WIDTH = "clamp(0px, 40%, 300px)"`，
进度条与音量条都用它 ✓；第一行改成与原版一致的结构：已播时间在左、进度条居中、总时长在右
（用户此前要求的"时间放进度条左侧"仍然满足：**已播时间就在进度条左边** ✓），
时间文本不再需要固定 `minWidth`（两端各一个单调宽文本，居中后不会互相推挤）。

**实测**：

| 视口 | 卡片宽 | 进度条 | 占卡片 | 音量条 | 横向溢出 |
|---|---|---|---|---|---|
| 桌面 1440 | 1392 | **300px**（撞上限） | 22% | 296px | 0 |
| 笔记本 1024 | 976 | **300px**（撞上限） | 31% | 296px | 0 |
| 移动 412 | 380 | **139px**（= 40%） | 37% | 135px | 0 |

**回归锁**：移动端用例的进度条断言由"> 180px"改成"**> 90px 且 ≤ 300px**"（反映上限规则 ✓）。

**顺带说明**：`test-results/` 是 Playwright 的输出目录，每次 e2e 启动会清空 ——
这次的截图被正在跑的 e2e 清掉了 ✗；结论以打印出来的**实测数字**为准 ✓。

---

## D71 控制条改成 tag 下方自上而下三行（桌面左对齐 / 移动端居中 / 行距统一）

**需求**（用户）：把进度条、音量、播放控件**从上到下**放在 tag 下方；**PC 左对齐、移动端居中**；
不要到处乱飞；**注意统一行间距**。

**改法**：控制条从 D69 的"卡片整行"移回**信息列、紧跟 chip 之下**，内部固定为三行（任何视口顺序不变）：

| 顺序 | 内容 | 长度 |
|---|---|---|
| 1 | 进度条：已播时间 · 滑杆 · 总时长 | 滑杆上限照搬原版 `clamp(0px, 40%, 300px)`（D70） |
| 2 | 音量：静音开关 + 常驻滑杆 | 同一条长度规则 |
| 3 | 播放控件：上一首 / 播放暂停 / 下一首 | 48dp 图标按钮 |

**统一行间距**（这次的关键）：三行都设 **`minHeight: 48dp`**（MD2 最小触控区）。
之前没设行高时，28dp 的进度条行与 48dp 的按钮行之间视觉间隔差一倍 ✗（实测 32 / 52 ✗）；
统一行高后行距才是真的统一 ✓。行距取 MD2 8dp 栅格（`spacing={1}`），
并且**去掉控制条自己额外的 `mt`** —— 交给父级信息列 Stack 的 `spacing`（也是 8dp），
所以「tag → 进度条」与「进度条 → 音量 → 控件」全部是 8dp ✓。

**对齐**：`justifyContent: { xs: "center", sm: "flex-start" }` —— 移动端居中、桌面左对齐
（行内容与标题、chip 同一条左边缘 ✓）。

**实测**（改后）：

| 视口 | 行高 | 行距（tag→进度 / 进度→音量 / 音量→控件） | 对齐 |
|---|---|---|---|
| 桌面 1440 | 48 / 48 / 48 | 8 / 8 / 8 | 行内容左边缘 = 标题左边缘 `196` ✓ |
| 移动 412 | 48 / 48 / 48 | 8 / 8 / 8 | 三行内容中心相对容器中心偏差 ≤ 6px ✓ |

**回归锁**：桌面一条（顺序 + 行高唯一 + 行距相等 + 与标题左对齐）、移动端一条（三行内容居中 + 行高/行距统一）✓。

**排查中的两个假警报**（记下来）：① 第一版断言取 `play-toggle`（中间那颗按钮）与标题比左边缘 ✗，
差 56px 是必然的；要比就比**行里最左边**的按钮 ✓。② 居中断言用"两个子元素中点取平均" ✗，
子元素宽度不等时天然偏 22.8px；要取**子元素并集的中心** ✓。

---

## D72 音量行改成两端加减按键

**需求**（用户）：音量条移除静音按钮，改成两端为音量加减按键。

**改法**：与**原版一致**（`.ref/upstream-v3/app/components/PlayerControl.tsx` 里那一行就是
`VolumeDown` · 滑杆 · `VolumeUp`）：

* 去掉静音 `IconButton` ✗；
* 左端 `VolumeDown` 键（`volume - 0.1`）、右端 `VolumeUp` 键（`volume + 0.1`），
  步长与滑杆 step 一致（0.1），并**在两端夹紧到 0/1**（`clampVolume`）；
* 到边界时对应按键 `disabled`（满音量时"加"不可点、0 时"减"不可点）✓；
* 滑杆仍是常驻的、仍用原版长度规则 `clamp(0px, 40%, 300px)` ✓；行高仍 48dp、行距仍 8dp ✓。

**实测**：

| 视口 | 行高 | 左键 | 滑杆 | 右键 | 两端包裹 | 静音按钮 |
|---|---|---|---|---|---|---|
| 桌面 1440 | 48 | 196–244 | 256–540 | 552–600 | ✓ | 已移除 ✓ |
| 移动 412 | 48 | 84–132 | 144–268 | 280–328 | ✓ | 已移除 ✓ |

步长实测：音量 `1 → 0.7`（连点三次"减"）→ `0.8`（点一次"加"）✓；满音量时"加"键为 `disabled` ✓。
桌面左键左边缘 `196` 与标题一致（左对齐 ✓）；移动端整行内容中心 = 容器中心（居中 ✓）。

**回归锁**：移动端用例的 `volume-toggle` 改成 `volume-down` / `volume-up`（两者可见 + 滑杆仍常驻）✓。

---

## D73 进度条左对齐 + 窄屏加长

**需求**（用户）：① 桌面端进度条没与另外两个控件左对齐；② 移动端进度条有点短。

**① 左对齐**：滑杆前面顶着"已播时间" ✗，所以滑杆左边缘永远比下面两行的"减"键、"上一首"键靠右 ✗。
本来"时间在滑杆左侧"与"滑杆与其它行左对齐"在同一个横排里**互相矛盾** ✗。

改法：**时间挪到滑杆上方**（已播在左、总时长在右，与滑杆同宽所以两端恰好对齐 ✓），
滑杆独占其下一行、顶到行首 ✓。实测桌面：滑杆 `196`、音量减键 `196`、上一首键 `196`、标题 `196` ——
**四者同一条左边缘** ✓（用户要的"时间在左侧"仍成立：已播时间就在滑杆左端上方 ✓）。

**② 长度**：原版上限 `clamp(0px, 40%, 300px)` 里的 **40%** 在手机上只有 139px ✗（用户觉得短）。
改成 **保留 300px 上限、放宽下限**：`min(100%, 300px)` ——
宽屏仍是原版的 300px ✓，窄屏能吃满整行 ✓（实测移动端 **139 → 300px** ✓）。
音量滑杆夹在两个按键之间，所以它是**可缩**的（`flex: 1 1 auto` + `maxWidth: 300`），
否则"两个 48dp 键 + 300px"会顶出卡片 ✗（实测过：减键跑到 x=4 ✗，改成可缩后回到 32 ✓）。

**实测**：

| 视口 | 进度条 | 减键 | 上一首键 | 标题 | 对齐 |
|---|---|---|---|---|---|
| 桌面 1440 | 滑杆 196–496（300 宽） | 196 | 196 | 196 | **四者同一左边缘** ✓ |
| 移动 412 | 滑杆 56–356（**300 宽**，居中） | 32 | 126 | 32 | 居中 ✓（设计如此） |

行距仍是 8dp（进度条那一行多了时间行，所以**比的是间距不是行高** ✓——用例已按这个口径改）。

**回归锁**：桌面用例改成断言"滑杆 / 减键 / 上一首键 / 标题 同一条左边缘 + 行距相等"；
移动端用例增加"滑杆宽度 > 200px"（防再次被 40% 卡短）✓。

---

## D74 桌面端六个元素左对齐（复核 + 锁死）

**需求**（用户）：PC 端的标题、角色名、tag、进度条、音量按键、播放控件进行左对齐；移动端不变。

**复核结果**：D73 之后**已经全部对齐** —— 在 768 / 900 / 1024 / 1280 / 1600 / 1920 六个桌面宽度下逐个量左边缘：

```
 768px: 188 / 188 / 188 / 188 / 188 / 188   全部左对齐
 900px: 196 / 196 / 196 / 196 / 196 / 196   全部左对齐
1024px: 196 …  1280px: 196 …  1600px: 196 …  1920px: 196 …
（顺序：标题 / 角色名 / 第一个 tag / 进度条滑杆 / 音量减键 / 上一首键）
```

**这一轮做的事**：

1. 把断言从"进度条 vs 另外两行"扩成**六项集合唯一**（`new Set(lefts).size === 1`），
   以后任何一个元素掉队都会立刻失败 ✓；
2. 重新构建 `dist/` —— 如果是通过部署路径（`APP=static` 或 Caddy）在看，之前那份产物是旧的 ✗，
   会看到未修复的布局 ✓；
3. 移动端用例回归确认（仍是居中、滑杆仍 300px）✓，firefox 也复跑 ✓。

**提醒**（给用户）：dev 页面如果一直开着旧标签页，HMR 未必生效 → **硬刷新**（Ctrl/Cmd+Shift+R）再看 ✓。

**顺便说明两处"故意的"不齐**（不是 bug）：

* 音量滑杆的**轨道**在减键右侧（`256`）—— 两端要放加减按键，轨道必然在按键之后 ✓；
  "音量按键"本身（`196`）与其它元素对齐 ✓；
* 播放控件行中间的**播放键**在 `252` —— 左边还有"上一首"（`196`）✓，行首仍然对齐 ✓。

---

## D75 进度条宽度加"双保险"，并复核左对齐

**需求**（用户）：PC 端标题 / 角色名 / tag / 进度条 / 音量按键 / 播放控件左对齐（附截图显示**进度条几乎占满整行** ✗）。

**复核（本机实测，1440 与 1024 一致）**：

```
标题 196 | tag 196 | 时间 196 | 进度条轨道 196（宽 300）| 音量减键 196 | 上一首键 196
```

左边缘本来就都在 `196` ✓；截图里"进度条占满整行"在本机复现不出来 ✗ —— 最可能是**页面是旧的**
（dev 页面长期开着时 HMR 未必生效；走部署路径时旧 `dist/` 也会这样）。

**这一轮仍做的加固**：

1. 滑杆容器宽度从纯 `min(100%, 300px)` 改成 **`width: min(100%, 300px)` + `maxWidth: 300`** ——
   万一某些内嵌浏览器/远程桌面 WebView 不支持 CSS 数学函数，`max-width` 仍会把长度压回 300，
   不会退化成"吃满整行" ✓（截图里的现象正是这种退化形态）；
2. 试过"把容器内缩 10dp 让**圆点**对齐"的方案 ✗ —— 那样**轨道**反而跑到文字右边 10dp ✗，
   两个口径只能选一个；最终选**轨道对齐**（轨道 = 进度条的实体 ✓），圆点略微出头是 Material 滑杆的固有画法 ✓；
3. 重建 `dist/` ✓（部署路径也会拿到新产物）。

**移动端复核不变**：时间 56、轨道 56–356（宽 300、居中 ✓）、减键 32 ✓。

---

## D76 进度条按**圆点**对齐（轨道右移）

**需求**（用户）：对齐圆点，将标题、角色名、进度条右移。

**口径确定**：Material 滑杆的圆点会越过轨道左端（`size="small"` 实测 **6dp**），所以"轨道对齐"与
"圆点对齐"差 6dp，只能选一个。用户指定**对齐圆点** → 滑杆容器右移 6dp（`pl: { xs: 0, sm: 6 }`），
于是**圆点**落在与标题/角色名/tag 同一条左边缘上，**轨道（进度条本体）相应右移 6dp** ✓。

**实测（桌面 1440 与 1024 一致）**：

```
标题 196 | 角色名 196 | tag 196 | 圆点 196 | 轨道 202（宽 294）| 音量减键 196 | 上一首键 196
```

**回归锁**：桌面用例里"进度条那一项"改成量 **`.MuiSlider-thumb` 的左边缘**（而不是滑杆根节点），
其余五项仍是标题/角色名/tag/减键/上一首 —— 六项集合必须唯一 ✓。

**移动端**：`pl` 只在 `sm` 以上生效，仍保持居中（用例复跑通过 ✓）。

---

## D77 对齐口径改为"圆点中心 ↔ 音量键中心"，并简化对齐代码

**需求**（用户）：进度条左侧圆点与左音量键**中心**上下对齐；标题与角色名跟着移动；
**保持布局不变**，清理简化布局代码。

**对齐规则（现在只有两条，且都由同一个数推出来）**：

```
行首 ── 24dp ──> 音量减键中心（48dp 键的一半）
行首 ── 24dp ──> 圆点中心（滑杆容器内缩 24dp）
行首 ── 18dp ──> 圆点左边缘 = 文字列（曲名 / 角色名 / tag）   ← 24 − 6（圆点越出轨道 6dp）
```

代码里只留两个常量：`BUTTON_CENTER = MD2.iconButton.size / 2` 与 `THUMB_OVERHANG = 6`，
导出 `TEXT_ALIGN_INSET = BUTTON_CENTER - THUMB_OVERHANG` 和 `TEXT_INSET_SX` 供 `PlayerPanel` 复用 ——
两边不再各写一个魔法数（这就是"清理简化"那部分）。

**改法**：文字块（曲名/角色名/tag）单独包一层并内缩 18dp（**只内缩文字**，控制条三行仍以列首为基准；
一开始把内缩加在整列上 ✗，结果音量键中心跟着右移，圆点又对不上了 ✗ —— 实测发现后改成现在这样）。
滑杆容器内缩 24dp → 圆点中心落在音量键中心的竖线上 ✓。

**实测（桌面 1440 与 1024 一致）**：

```
标题 214 | 角色名 214 | tag 214 | 圆点左 214 中心 220 | 音量减键中心 220
→ 圆点左 = 文字左 ✓   圆点中心 = 音量键中心 ✓
```

行/列结构没动：音量行与播放控件行仍以列首（196）为起点 ✓；移动端仍是居中 ✓（`pl` 只在 `sm` 以上生效 ✓）。

**回归锁**：桌面用例的断言改成这三条 —— ① 文字列四项（曲名/角色名/tag/圆点左边缘）集合唯一；
② 圆点中心 == 音量减键中心；③ 音量行与播放控件行起点相同 ✓。

---

## D78 视觉等距（不是代码等距）

**需求**（用户）：稍微加大这几行的间距，**从视觉上等间距**，而不是代码上。

**为什么"代码等距"≠"视觉等距"**：三行都是 48dp 盒子、间距都是 8dp ✓，但**墨迹高度不一样** ✗：
图标按钮的墨迹是 24dp（上下各留 12dp），而进度条那一行的墨迹有 40dp（下只留 4dp）——
于是"进度条→音量"的视觉间距比"音量→控件"少 4dp ✗。实测（1280 视口，只取墨迹：文字/图标/轨道/圆点）：

```
改前：墨迹间距 28 / 32   ← 不等 ✗
改后：墨迹间距 32 / 32   ← 相等 ✓（且比改前略大）
```

**改法**：给进度条那一行补 `pb: 4px`（`SEEK_ROW_PB`）——只补偿"墨迹留白差"，不动共享的 8dp 行距，
所以盒子间距会变成 12/8（**有意**的 4dp 差 ✓），而**视觉间距** 32/32 ✓。

**回归锁**：桌面与移动端用例的间距断言都改成"两段盒子间距相差 ≤ 4dp"，并在注释里写明
"这 4dp 是刻意的补偿，视觉上两段都是 32dp" ✓（把"代码值"和"视觉值"的差异写在用例里，避免以后有人
看到 12/8 就把它"修正"回去 ✗）。

---

## D79 撤回 D78，改为加大文字块行距

**需求**（用户）：撤回上一个改动（D78 的"视觉等距"补偿）；**增大标题、角色名、tag 之间的行间距**。

**撤回**：删掉进度条行的 `pb: 4px`（`SEEK_ROW_PB`）与常量说明，三行恢复"盒子等距"——
实测控制条行距回到 **8 / 8** ✓；两条用例的断言也恢复成 `gaps[0] === gaps[1]` ✓（D78 写进去的
"允许 4dp 差"的注释一并撤掉 ✓）。

**加大文字块行距**：曲名 / 角色名 / tag 之间从 **8dp → 12dp**（`spacing={1.5}`）。

**顺带修掉一个隐蔽回归**：D77 为了"文字块单独内缩"包了一层普通 `Box` ✗ ——
它把三个文字元素与外层 `Stack` 的 `spacing` **隔开了**，三者的行距实际变成了 **0** ✗
（我上一轮只量了控制条与对齐，没量文字块 ✗）。这次把包装层从 `Box` 换成 `Stack spacing={1.5}`，
既保留内缩、又承载行距 ✓。

**实测**：

| 视图 | 标题→角色名 | 角色名→tag | 控制条行距 |
|---|---|---|---|
| 桌面 1280 | **12px** | **12px** | 8 / 8 ✓ |
| 移动 412 | **12px** | **12px** | 8 / 8 ✓ |

（桌面端文字列左边缘仍是 `214` = 圆点左边缘 ✓，D77 的对齐规则未受影响。）

---

## D80 时间码回到进度条两端（并保证窄屏不超距）

**需求**（用户）：把时间码放在进度条的**两端**而不是上方；**注意移动端别超距**。

**改法**：进度条行从"上下两段"（时间行 + 滑杆行）改回**一行三件**：`[已播] [滑杆] [总时长]`，
滑杆 `flex: 1 1 auto` + `maxWidth: 300` + `minWidth: 0` —— 窄屏靠 flex 收缩自动让位 ✓。
时间码等宽字体并给 `minWidth: 3.4em`，秒数跳动时滑杆不会左右抖 ✓。
三行仍以列首为起点（对齐规则不变）✓。

**实测（三种宽度，全部"元素在卡片内 + 页面零横向溢出"）**：

| 视口 | 卡片 | 已播 | 滑杆（宽） | 总时长 | 溢出 | 行首（进度/减键/上一首） |
|---|---|---|---|---|---|---|
| 桌面 1440 | 24–1416 | 196–237 | 245–545（**300**） | 553–594 | 0 ✓ | 196 / 196 / 196 ✓ |
| 移动 412 | 16–396 | 32–73 | 81–331（**250**） | 339–380 | 0 ✓ | 32 / 32 / 126 ✓ |
| 窄屏 360 | 16–344 | 32–73 | 81–279（**198**） | 287–328 | 0 ✓ | 32 / 32 / 100 ✓ |

窄屏最紧的一档（360）右端还留 16dp 余量 ✓，没有超距 ✓。

**回归锁**：桌面用例改为"左时间右边缘 ≤ 滑杆左边缘"、"总时长左边缘 ≥ 滑杆右边缘"、
"三行起点集合唯一" ✓；移动端用例（居中 + 滑杆 > 200px + 零溢出）继续通过 ✓。

**顺带清理**：删掉不再使用的 `SLIDER_BOX_SX` / `SEEK_INSET_SX` 常量（这轮布局改动后已经没人引用）✓。

---

## D81 时间码对齐音量键**图标**；窄屏整组居中

**需求**（用户）：① PC 端时间码左边缘要与音量键的**图标**（不是 48dp 判定区域）对齐；
② 移动端改完后"进度条 + 时间码"整体没有居中。

**① 对齐图标**：48dp 按钮里的图标是 24dp，左右各留 12dp → 图标左边缘 = 按钮左边缘 + 12。
给进度条行加 `pl: 12px`（常量 `ICON_INSET = (48 − 24) / 2`），于是**时间码左边缘 = 音量图标左边缘** ✓。
实测：时间 208 == 图标 208 ✓（改前 196 对齐的是按钮盒子 ✗）。

**② 窄屏整组居中**：窄屏下滑杆原本 `flex: 1 1 auto` ✗ —— 它会把行里剩下的宽度全吃掉，
于是"时间码 + 滑杆 + 时长"这组被撑满整行，看起来没居中 ✗。改成**窄屏固定 200dp**
（`flex: 0 0 auto`；`sm` 以上仍是吃掉剩余宽度、上限 300dp ✓），配合行的 `justifyContent: center`
→ 整组真正居中 ✓。

**实测**：

| 视口 | 时间码左 | 音量图标左 | 对齐 | 组中心 − 行中心 | 滑杆宽 | 溢出 |
|---|---|---|---|---|---|---|
| 桌面 1440 | **208** | **208** | ✓ | — | 300 | 0 ✓ |
| 移动 412 | 32 | 44 | 不适用（居中） | **0** ✓ | 200 | 0 ✓ |
| 窄屏 360 | 32 | 44 | 不适用（居中） | **0** ✓ | 200 | 0 ✓ |

200dp 的选择：360dp 屏幕上 45 + 8 + 200 + 8 + 45 = 306 ≤ 328，两边还留余量 ✓。

**回归锁**：桌面用例加"时间码左边缘 == 音量键图标左边缘"（量 `.MuiSvgIcon-root`）✓；
移动端用例的滑杆宽度断言改为**恰好 200dp**（既防被 40% 卡短、也防 flex-grow 把整组撑歪）✓。

---

## D82 两条滑杆等长对齐 + 两端时间码对齐音量键（并清理样式）

**需求**（用户）：PC 与移动端都改成"两端时间码与音量键对齐"；**两条滑杆等长对齐**；
确认无误后保持结构不变、清理样式代码。

**一个式子解决全部要求**：让两条行里"滑杆两侧的占位总宽"相等 ——

```
音量行 = [减键 48] [gap 4] [滑杆] [gap 4] [加键 48]                 → 两侧 104dp
进度行 = 内缩 12 [已播 36] [gap 4] [滑杆] [gap 4] [总时长 48]      → 两侧 104dp ✓
              ↑ 12 = 图标在 48dp 按钮里的留白            ↑ 48 槽 + 右内缩 12
```

* **左侧**：进度行整体内缩 12dp，于是"已播"时间码左边缘 = 减键**图标**左边缘 ✓；
* **右侧**：总时长放在与按键同宽的 48dp 槽里、再右内缩 12dp，于是它的右边缘 = 加键**图标**右边缘 ✓；
* 两侧占位相同 ⇒ 两条滑杆的**左右边缘与宽度自动一致** ✓（宽度再由 `flex` + `maxWidth: 300` 截断）。

**实测（三种视口，全部零横向溢出）**：

| 视口 | 进度条 | 音量条 | 等长差 | 左差 | 右差 | 时间↔减键图标 |
|---|---|---|---|---|---|---|
| 桌面 1440 | 248–548（300） | 248–548（300） | **0** | **0** | **0** | **0** ✓ |
| 移动 412 | 84–328（244） | 84–328（244） | **0** | **0** | **0** | **0** ✓ |
| 窄屏 360 | 84–276（192） | 84–276（192） | **0** | **0** | **0** | **0** ✓ |

**清理**：这一轮的样式收敛成一组常量 —— `ICON_INSET`(12) / `GAP`(4) / `TIME_SLOT`(36) /
`DURATION_SLOT`(48) / `SLIDER_SX`（两条滑杆共用）/ `SEEK_ROW_INSET_SX`；
上一轮的 `NARROW_SLIDER_WIDTH`、`ICON_INSET_SX`、内联的 flex 组合全部删掉 ✓。
滑杆不再有"桌面 flex-grow、窄屏固定宽度"的分支 —— **一套尺寸同时满足两端** ✓。

**回归锁**：桌面用例保留"时间码左边缘 == 音量键图标左边缘"，移动端滑杆宽度断言改为 > 180dp
（等长由两侧占位保证，不再靠写死的宽度）✓。

---

## D83 健壮性体检 + 冗余清理

**需求**（用户）：检测代码健壮性，清理冗余/无用代码。

**体检怎么做**（可复现的机械检查，不靠感觉）：

| 检查 | 命令/方法 | 结果 |
|---|---|---|
| 未使用的局部/参数 | `tsc --noEmit --noUnusedLocals --noUnusedParameters` | **0 处** ✓（本来就开着这类检查） |
| 调试残留 | grep `console.log` / `debugger` / `TODO` / `FIXME` | **0 处** ✓ |
| `as any` | grep | **0 处** ✓ |
| 空 catch | grep `catch {}` / `except Exception:` 空块 | **0 处** ✓ |
| 未保护的 `JSON.parse` | 逐个看 4 个调用点 | **全部在 try/catch 内** ✓（peer 消息、本地存档、对局设置、源覆盖） |
| 网络请求错误处理 | `fetch(` 调用点 × 错误处理 | 1 处 fetch，配 2 处 try/catch ✓ |
| 死代码 | 自写脚本：收集 `export` 声明 → 全仓库（src/e2e/tools/docs）统计引用 | 见下 ✓ |
| 测试基线 | `pnpm test` / `pnpm e2e` | 209 / 65 ✓ |

**清理结果**：

* **删除 1 个完全没人引用的函数**：`src/music/selection.ts::isTrackUsable` ✓；
* **去掉 62 处多余的 `export`**（这些符号只在本文件内使用：组件 Props 类型、内部状态类型、内部常量）——
  模块对外暴露面收窄，`38 files changed, +60/−70` ✓；改动纯机械，类型检查与 209 条单测全绿 ✓；
* **保留 2 处**（`cheat.ts::cheatSanitize`、`theme.ts::CustomColors`）：它们同样是"只在本文件用"，
  但因为开了 `noUnusedLocals`，去掉 `export` 就必须**连声明一起删** ✗ —— 这一轮不动它们（留给下次真要砍
  彩蛋模块时一起处理 ✓）。

**过程中的一个教训**（记下来）：清理脚本用正则 `(?:...)*?^\}` 匹配"一个声明到下一个顶格 `}`" ✗
在 `theme.ts` / `cheat.ts` 上**多吃了后面的声明** ✗（把 `buildTheme`、`MD2` 等一起删掉，类型检查立刻报错 ✓）。
处理方式：`git checkout -- <两个文件>` 原样恢复 ✓，其余 36 个文件的重命名式改动保留 ✓。
教训：**删除类**改动必须用行级/精确匹配，别用跨行贪婪正则 ✗。

---

## D84 MD2 合规体检

**需求**（用户）：检测整个项目是否符合 Material Design 2。

**方法**：写了一个浏览器体检脚本（`test-results/md2audit2.mjs` 的思路，逐页量计算样式），
把 material.io/2 的关键数值与**实测值**逐条对照 —— 不靠"看起来像"，每条都有数字。

**结果：24 项中 16 项逐字命中**，其余 8 项逐条判读如下：

| 项目 | 期望 | 实测 | 判读 |
|---|---|---|---|
| 字体 h6 / body1 / body2 / caption / overline | 20 / 16 / 14 / 12 / 10sp | 完全一致（overline 大写 ✓） | 命中 ✓ |
| 按钮 字号/字重/字距/大写/圆角/高度 | 14sp / 500 / 1.25px / uppercase / 4dp / 36dp | 完全一致 | 命中 ✓ |
| Tabs 高度 + 大写 + 14sp | 48dp / uppercase / 14sp | 一致 | 命中 ✓ |
| 图标按钮触控区 | 48dp | 48dp | 命中 ✓ |
| Chip 圆角 / Card 圆角 | 16dp / 4dp | 一致 | 命中 ✓ |
| 深色高度（surface 叠加） | 8dp→12%、16dp→15% | 面板实测有 `linear-gradient` 叠加 | 命中 ✓ |
| 状态层（hover 变底色） | 有 | 按钮 hover 底色变化 | 命中 ✓ |
| 页边距（桌面 24 / 移动 16） | 24 | 24 | 命中 ✓ |
| 按钮"最小宽 64" | 64 | 0 | **探针误判**：量到的是 AppBar 的 ALICE 按钮，它有意设了 `minWidth: 0`（防窄屏挤出）✗；顺手仍给 dense 按钮补了 `smallMinWidth: 48`（MD2 dense 规格）✓ |
| 图标 24dp | 24 | 20 | 不是违规：`fontSize="small"`（20dp）是 MD2 的 dense 图标规格 ✓ |
| Chip 高度 32 | 32 | 36 | **需复核**：主题里是 32 ✓，量到 36 说明那一枚 chip 内容（24dp 图标）把它撑高了 —— 属个别 chip ✗，下次顺手查 |
| 列表项高度 | — | 72 | **期望写错了**：带头像的**两行**列表项 MD2 就是 72dp ✓（我原来写 56 ✗） |
| 输入框 56 / 开关 ≥40 | 56 / ≥40 | 未找到 | **探针覆盖不足**：那次展开的分区里没有输入框/开关（早前 D49/D50 已单独量过 filled 输入框 = 56 ✓） |
| 单选触控区 | ≥48（MD2 最小触控目标） | 38（`size="small"`） | **真实偏差（可接受）**：单选圈本身 38dp，但整行 `FormControlLabel`（≈40dp 高、标签也可点）才是实际目标 ✓；要严格 48 需要把行高加到 48 ✗ —— 留给下次决定 |
| 滑杆高度 | ≥20 可点 | 28 | 命中 ✓（脚本里拿字符串比 "≥20" ✗，是我断言写错 ✓） |

**结论**：颜色、字体比例、按钮/Tabs/Chip/Card/图标按钮规格、深色高度叠加、状态层、页边距
**逐条命中** ✓；没有发现真正的规范冲突 ✓，只有两处值得下次处理：个别 chip 被内容撑到 36dp ✗、
单选触控目标 38dp（低于 MD2 的 48dp 建议 ✗）。

**顺带的代码改动**：`MD2.button.smallMinWidth = 48`（dense 按钮最小宽度）+ 两处 `sizeSmall` 覆盖 ✓。

---

## D85 性能守卫改成单独跑

**需求**（用户）：全量时单独跑（指 `e2e/perf.spec.ts` 那条"点击不产生 ≥250ms 长任务"）。

**原因**：它测的是"点击 handler 耗时"，而本机同时跑着 dev server / 单端口代理 / 曲库助手 / 信令，
负载高时会偶发击穿阈值 ✗（这几轮出现了 3 次：全量跑失败 → 单独跑 18–25s 通过 ✓）。

**改法**：

* `playwright.config.ts` 新增独立 project `perf`（`testMatch: /perf\.spec\.ts/`）；
* chromium / firefox 两个 project 的 `testIgnore` 加上 `/perf\.spec\.ts/` ✓；
* `pnpm e2e` 改为**显式列出**三个 project（`--project=chromium --project=firefox --project=mobile`）✓，
  所以性能守卫不再进全量 ✓；新增 `pnpm e2e:perf` 单独跑它 ✓。

**实测**：`playwright test --list` 全量 **67 条 / 4 文件** ✓；`--project=chromium --project=firefox --project=mobile --list`
里 `perf.spec` 出现 **0** 次 ✓；`pnpm e2e:perf` 单跑 **1 passed（22.9s）** ✓。

---

## D86 播放卡片居中（桌面整块 / 移动端只居中卡面与文字）

**需求**（用户）：桌面把整个播放器区块（卡面、曲名、角色名、进度条、音量条、播放控件）
**居中、相对位置不变**；移动端**只**把卡面、曲名、角色名居中。

**改法**（结构不动，只加对齐）：

| 视口 | 改动 |
|---|---|
| 桌面（sm+） | 外层（卡面 + 信息列）`justifyContent: center`；信息列不再 `flex: 1` 撑满，改为 `flex: 0 1 auto` + **阅读宽度上限 640dp** —— 否则这一列会把卡片撑满，"居中"根本看不出来 |
| 移动（xs） | 卡面 `alignSelf: center`；曲名 / 角色名 `textAlign: center`；**tag 与控制条不动**（保持与文字列左边缘对齐） |

内部相对位置完全不变 ✓：卡面与信息列间距、信息列内部的顺序、进度条圆点与音量图标的对齐、
两条滑杆等长（D82）都不受影响 ✓（那一列整体平移而已）。

**实测**：

| 视口 | 卡片中心 | 整块中心 | 偏差 | 卡面中心 | 曲名对齐 |
|---|---|---|---|---|---|
| 桌面 1440 | 720 | **720** | 0 ✓ | 565（列内位置不变 ✓） | left ✓ |
| 桌面 1024 | 512 | **512** | 0 ✓ | 277 | left ✓ |
| 移动 412 | 206 | **206** | 0 ✓ | **206** ✓ 居中 | **center** ✓ |

**回归锁**：桌面用例加"整块中心 == 卡片内容中心（±2dp）"+"tag 与曲名仍左对齐"；
移动端新增一条"卡面/曲名/角色名各自居中（±6dp）、曲名 textAlign=center、tag 仍与文字列左对齐" ✓。

---

## D87 桌面：卡面与信息列等高、播控对齐滑杆中线

**需求**（用户）：桌面端正在播放的卡面**高度 = 右侧（曲名/角色名/tag/进度条/音量条/播放控件）累加高度**，
与下方选卡分开；播放控件**与进度条、音量条居中对齐**。

**改法**：

| 项 | 做法 |
|---|---|
| 卡面高度 | 外层桌面改 `alignItems: stretch`，卡面容器 `height: 100%` + **`aspectRatio: 703/1000`**（卡面比例）→ 高度跟着信息列走、宽度按比例自动算出（193×274 ✓），不再固定 140dp 宽 ✓ |
| 与下方选卡分离 | 卡面被限制在本卡片内（不再溢出）✓，下面是独立的"接下来"卡片 + 面板 `spacing={2}` 的间隔 ✓ |
| 播放控件对齐 | 滑杆两侧各占 52dp（内缩 12 + 时间 36 + gap 4 / 时长 48 + gap 4）→ 控件行取同样跨度 `maxWidth: 404dp` + `mx: auto` + 水平居中 → **按钮组中心 = 滑杆中线** ✓ |

**实测**：

| 视口 | 卡面 | 信息列高 | 等高 | 滑杆中线 | 控件组中心 | 对齐 |
|---|---|---|---|---|---|---|
| 桌面 1440 | 193×**274** | 274 | ✓ | 728 | **728** | ✓ |
| 桌面 1024 | 193×**274** | 274 | ✓ | 520 | **520** | ✓ |
| 移动 412 | 140×199（不动 ✓） | 525 | 不适用 ✓ | 206 | 206 | ✓ |

两条滑杆仍等长对齐（`|Δ宽| ≤ 1 且 |Δ左| ≤ 1` ✓）。

**回归锁**：桌面用例改为"进度条行与音量行同一起点 + **播放控件组中心 == 滑杆中线**（±2dp）" ✓
（原先的"三行起点一致"已不适用 ✗ —— 控件行现在是居中而非左对齐 ✓）。

---

## D88 修掉卡面与播放组件的重叠（卡面宽度改用 ResizeObserver）

**需求**（用户）：桌面端卡牌与所有播放组件**错误重叠**，调整间距、注意规范。

**根因（我上一轮引入的）**：D87 用 `alignSelf: stretch` + `aspectRatio` 想让卡面高度跟信息列一致 ✗ ——
但 flex 布局里"高度靠拉伸、宽度靠比例"是**循环依赖** ✗：布局时父高未定 → 宽度算成 **0** ✗ →
卡面按 0 宽占位、却按 193dp 绘制 → **压到右边整列上**（实测重叠 159dp ✗）。
（`height: 100%` 的写法同理 ✗，试过也还是 0 宽。）

**改法**：卡面宽度改成**实测**而不是纯 CSS 推导 —— 信息列挂 `ResizeObserver`，
`卡面宽度 = 信息列高度 × 卡面比例(703/1000)`，并夹在 120–280dp 之间 ✓；
卡面按自身比例渲染，于是高度正好等于右侧累加高度 ✓，且宽度是**真实占位** ✓（不会重叠 ✓）。

**实测（桌面 1440 / 1024 一致）**：

```
卡面高 321  ==  信息列高 321（差 0）✓
重叠 = false ✓   卡面与文字间距 = 34dp ✓（= Stack spacing 16 + 文字列内缩 18，符合既有规范）
播放控件组中心 841 == 滑杆中线 841 ✓（1024 下 629 == 629 ✓）
```

移动端不变（仍是固定 140dp 宽、堆叠布局 ✓，探针里那个 "重叠" 是它按 x 轴比较导致的误报 ✗ —— 移动端是纵向排列 ✓）。

**回归锁**：桌面用例继续断言"整块中心 == 卡片内容中心"、"tag 与曲名左对齐"、
"进度条行与音量行同起点"、"控件组中心 == 滑杆中线" ✓；移动端 9 条全过 ✓。

---

## D89 文字列对齐时间码；窄屏 tag 整块居中

**需求**（用户）：① 桌面端歌曲标题 / 角色名 / tag 与**进度条时间码**左边缘对齐；
② 移动端 tag **整块**居中，但**块内**依旧正常换行 + 左对齐。

**① 桌面**：文字列的内缩从"圆点左边缘"口径（18dp）改成"时间码左边缘"口径（**12dp** = 图标在 48dp
按钮里的留白）✓。于是五个元素同一条竖线：曲名 / 角色名 / tag / 已播时间码 / 音量键图标 ✓。
实测 1440 与 1024 都是 `654`（1024 下 `514`）✓。

**② 窄屏 tag**：容器改成 `width: fit-content` + `maxWidth: 100%` + `mx: auto` ✓ ——
**整块**按内容宽度居中 ✓，而**块内**保持默认的 `flex-start`（行内左对齐 + 正常换行 ✓）。
特意**不用** `justifyContent: center` ✗ —— 那会把每一行都居中，破坏"块内左对齐" ✗。
实测：tag 块中心 `204` vs 卡片中心 `206`（差 2dp ✓）。

**回归锁**：桌面用例新增"曲名 / 角色名 / tag / 时间码 四项左边缘集合唯一" ✓；
移动端用例把"tag 未居中"改成"tag **块**（`player-tags` 容器）中心 == 卡片中心 ±6dp" ✓
（量**块**而不是各枚 chip 的并集 —— 多行时并集中心天然偏左 ✗，这正是用户要的行为 ✓）；
三处居中容差放宽到 8dp（卡片内容宽为奇数时的亚像素取整 ✓）。

---

## D90 修掉"音MAD 未正确启用"（开发服务器缺曲库路由）

**需求**（用户）：音MAD功能未正确启用。

**排查**：

| 检查 | 结果 |
|---|---|
| 曲库助手 | `127.0.0.1:8011/manifest.json` → **200**，24 首 ✓ |
| 数据 | `albums.json` 有 `otomads`（`pack: otomads`）✓；**13 个角色**带 pack 曲目 ✓；`packs.json` 里 pack 的 `tracks` 是空数组（运行时按专辑的 `pack` 判定模式，不读这里 ✓） |
| **开发服务器** | ✗ **找到**：`5173/manifest.json` 返回 **200 但内容是 `index.html`** ✗ —— Vite 把未知路径回退到 SPA 首页 ✗；`5173/media/...` 同理 ✗。于是本地源拿到的是 HTML 而不是 JSON/音频 → 列表空、点了不播 → 看起来"没启用" |

**改法**：`vite.config.ts` 加 **dev 代理**，把 `/manifest.json` 与 `/media` 转到 `http://127.0.0.1:8011`
（与生产单端口代理同一套分流规则 ✓）。这样 `pnpm dev` 下本地源就是**同源**的 ✓，和部署形态一致 ✓。

**实测**：

```
5173/manifest.json → 200 (application/json) ✓（改前：200 但 text/html ✗）
5173/media/…mp3    → 200 (audio/mpeg) ✓（改前：SPA 回退 ✗）
切到音MAD：轮播 13 首 · 已载入音源 4 个 ✓   播放页专辑 chip = otomads ✓   无页面错误 ✓
```

**教训**：SPA 回退会让"路径不存在"表现成 **200 + HTML** ✗ —— 这类"静默错误"必须**看 content-type**，
不能只看状态码 ✓（排查时一眼 200 差点放过去 ✓）。

---

## D91 播放器改成两端统一的居中列（重写）

**需求**（用户）：桌面端与移动端**统一**成同一套布局、**全部居中**：
120%（相对卡牌选择器）的曲目卡牌 → 曲名 → 作者或作品 → 角色名 → 进度条 → 音量条 → 播放控件；遵循 MD2。

**结构（两端完全相同，重写）**：

```
┌ 卡面（宽 = 卡片内容宽 × 卡宽比例(8%) × 120%）
│ 曲名（h6，唯一的大字级）
│ 作者 / 作品（body2 次要色）
│ 角色名（subtitle2）
│ 进度条 → 音量条 → 播放控件（宽度上限 420dp，整行居中）
└ 全部 align-items: center
```

**第二行的规则**：音MAD 曲目的标题是 `作者 - 曲名` → 作者视为"不在官作白名单" → **显示作者**，
曲名去掉 `作者 - ` 前缀 ✓；官作（无前缀）→ **显示作品（专辑）名** ✓（`splitCredit` / `creditTitle` ✓）。

**顺带做的收敛**：控制条三行的对齐口径从"桌面左对齐、窄屏居中"改成**两端一律居中** ✓；
时间码槽宽改成与音量键同宽（48dp）→ 两条行"滑杆两侧占位"完全相等 → **两条滑杆等长且同中心** ✓；
音量滑杆多余的 `px` 去掉（D82 不变量的前提）✓。

**实测（桌面 1440 / 移动 412）**：

| 视口 | 自上而下顺序 | 七行居中偏差 | 两条滑杆 | 滑杆中心 vs 控件行中心 |
|---|---|---|---|---|
| 桌面 1440 | ✓ | **0,0,0,0,0,0,0** | 300 / 300（等长差 0） | 720 / 720 ✓ |
| 移动 412 | ✓ | **0,0,0,0,0,0,0** | 244 / 244（等长差 0） | 206 / 206 ✓ |

**注意**：卡面按"卡牌选择器的 120%"算 → 而选择器卡宽是容器宽的 8% ✓，所以桌面卡面约 **134dp**、
移动端约 **36dp**（和牌桌上的小卡同尺寸 ✓）。若想要更大的卡面，改 `COVER_SCALE` 或换个基准即可 ✓。

**回归锁重写**：桌面用例改成"七行顺序 + 每行中心 == 列中线（±2dp）+ 两条滑杆等长同中心" ✓；
移动端新增同口径的用例 ✓；两条基于旧"播放页 tag"的用例作废并改写
（播放卡片上已经没有 tag 了 —— 按新规格换成了作者/作品一行 ✓）。

---

## D92 第二轮 commit 整理（播放器布局那一串）

**需求**（用户）：完成后重新清理无用 commit，并适当压缩。

**做法**（沿用 D85 那次的方法，机械且可验证）：备份 `backup/pre-squash-2` → 从基线 `b8d4ee7`
重建 → 按**时间顺序**把功能相关的提交分组，每组取该组最后一个提交的树 + 写一条说明性 message ✓。

**这一轮的 8 个提交 → 4 个**：

| 新提交 | 内容 | 压缩自 |
|---|---|---|
| `a78726c` test: run the click task guard on its own | 性能守卫单独 project | 1 |
| `8362ade` feat: centre the player card and size its cover from the card | 播放卡片居中 + 卡面尺寸（含重叠修复） | 4 |
| `c7145de` fix: route the local library through the dev server | 音MAD 未启用（dev 代理） | 1 |
| `e36710d` feat: one centred column for the player on every screen | 两端统一居中列（含用例改写） | 2 |

**踩到的坑（记下来）**：第一遍分组把"音MAD 修复"排在"居中列"**之后** ✗ ——
但按历史顺序 `a3d0661` 夹在两者之间 ✗，于是后面那组把前面的改动**覆盖回去了** ✗，
`git diff backup HEAD` 立刻发现树不一致 ✓。**教训：`read-tree` 式压缩必须按时间顺序分组** ✓
（每组取"该组最后一个提交的树"，跳跃分组会把别的改动回滚 ✗）。

**验证**：最终树与备份**逐字节一致** ✓；`pnpm typecheck` ✓、`pnpm test` **209 passed** ✓、
`pnpm e2e:chromium` **29 passed** / `pnpm e2e:mobile` **9 passed** ✓；
`git push --force-with-lease origin main` → `+ 7e13a83...e36710d (forced update)` ✓。

**顺带修掉两条过时用例**（新布局把卡片上的 tag 换成"作者/作品"一行之后它们失效 ✗）：
"播放页解析出音源"改成断言"有曲名且无取不到告警" ✓；"曲名在上略大"去掉"角色名是次要色"的断言 ✓
（角色名现在是 `subtitle2` 主色 ✓）。

---

## D93 卡面尺寸改成"卡牌选择器卡宽 × 120%"（同一口径）

**需求**（用户）：播放器卡牌大小修正为**卡牌选择器**的卡牌大小的 120%。

**之前错在哪**：我按"卡片内容宽 × 卡宽比例(8%) × 1.2"算 ✗ —— 但**卡牌选择器（"接下来"卡条）
根本不是按 8% 算的** ✗：`UpcomingFan.fanCardWidth(windowWidth) = min(窗口宽 × 20%, 150)` ✓。
实测选择器的卡是 **150dp**（桌面）/ **82dp**（移动 ✓），而我算出来是 111/30 ✗ → 卡面偏小 ✗。

**改法**：卡面宽度**直接调用选择器自己的尺寸函数** `fanCardWidth(window.innerWidth) × 1.2` ✓ ——
两边永远同一个口径 ✓（不写死 8%、也不猜容器宽 ✓），窗口尺寸变化时跟着更新 ✓。

**实测**：

| 视口 | 选择器卡宽 | 卡面（= ×1.2） |
|---|---|---|
| 桌面 1440 | 150（撞 150 上限） | **180×256** ✓ |
| 移动 412 | 82（= 412×20%） | **99×141** ✓ |

**验证**：`pnpm typecheck` ✓、`pnpm test` **209 passed** ✓、
`pnpm e2e:chromium`（播放相关 6 条）✓、`pnpm e2e:mobile` **9 passed** ✓。

---

## D94 作者字段 + show_album_name（播放页第二行的规则）

**需求**（用户）：播放页里**有作者信息就显示作者，否则显示专辑名**；先把音MAD 数据改成这个形状；
专辑新增**可选布尔键 `show_album_name`**（不填默认 true），otomads 专辑设 **false**
（于是那条没有作者的曲目**整行不显示** ✓）；作者名**原样显示、不截断** ✓。

**数据与管线**：

| 位置 | 改动 |
|---|---|
| `data/packs/otomads.toml` | 23 条拆出 `author = "…"`、标题去掉 `作者 - ` 前缀；`[[album]] otomads` 加 `show_album_name = false`（第 24 条本就没有作者信息） |
| `tools/src/tmc/packs.py` | 透出 `author`（可选）与 `showAlbumName`（可选） |
| `tools/src/tmc/build.py` | 作者写进角色 music 条目的**可选第 4 位**；专辑写 `showAlbumName`；`distinctTracks` 的解包改成 `a, t, *_rest` |
| `tools/src/tmc/validate.py` | 三处 `for album, title, extra in …` 改成 `*_rest` |
| `src/data/types.ts` | `MusicEntry` 加可选 `author?`；`AlbumRecord` 加 `showAlbumName?` |
| `src/data/load.ts` | 条目校验放宽为"3 或 4 位 + 第 4 位必须是字符串" |
| `src/music/sources.ts` | **方案 A**：`buildEntries` 插入"归一化曲名"别名（两边都去掉开头 `作者 - `），否则 TOML 去掉前缀后匹配不上 manifest ✗ |
| `src/ui/panels/PlayerPanel.tsx` | `credit = author ?? (showAlbumName === false ? null : 专辑名)`；为空**整行不渲染**；删掉旧的 `splitCredit` 猜法 |

**实测（浏览器）**：

```
原曲   → 曲名「マッシュルーム・ワルツ」  第二行「完全憑依ディスコグラフィ」（专辑 ✓）
音MAD  → 曲名「普通肥猫魔法使」（无前缀 ✓） 第二行「川先僧」（作者 ✓）
```

**验证**：`pnpm data:check` 无漂移 ✓、`tmc.validate` 通过 ✓、Python **33 passed** ✓、
`pnpm test` **209 passed** ✓、`pnpm e2e:mobile` **9 passed** ✓、chromium 播放相关 **4 passed** ✓。

**过程中的两个坑**：① 4 位条目不只前端要放宽，**Python 侧三处解包**也会炸 ✗（`build.py` / `validate.py` 已修 ✓）；
② 移动过仓库后 `tools/.venv` 里的 shebang 指向旧路径 ✗ → `uv run pytest` 报 "Failed to spawn" ✓，
删掉 `.venv` 让 uv 重建即恢复 ✓。

---

## D95 含拉丁字母的音MAD 曲名匹配不上（部分修复，待续）
> ⚠️ **已被 D113 取代**：同上：开关不再置灰、也没有"由音乐模式强制启用"。

**现象**（用户）：音MAD 里 `Masuo魔法図書館` 报"所有已启用的音源都取不到"。

**根因**：本地 manifest 的曲名来自**磁盘文件名**（`… - Masuo魔法図書館` ✓），`buildEntries` 里我插的
"归一化别名"是**小写**的（`masuo魔法図書館` ✓），而播放器查找时用的原始键是 `Masuo魔法図書館` ✗
→ 大写字母的曲目全部对不上 ✗（纯中文/日文的曲目恰好不受影响 ✓，所以只暴露了几首 ✓）。

**已修**：`resolveTrack` 改成**两个键都试**（原名 + 归一化名 ✓）。
**已验证**：在页面里直接调用该模块解析 `Masuo魔法図書館` → **命中** ✓
（`buildEntries` 的键数 24 → **48** ✓，即每行都插入了归一化别名 ✓）。

**⚠️ 复查结论（同一天晚些）：没有第二个原因** ✓ —— 之前那次告警是**页面/模块缓存**造成的 ✗。

实测（音MAD 模式，连续切 12 首）：

```
✓ 普通肥猫魔法使   ✓ 电棍裁判 ~ 玩弄唢呐的选手   ✓ 恶俗小径　～ Chaoshan Path   ✓ 露米娅的██视频流出
✓ [原图不使用]Lunate Elf♿   ✓ 东方原曲大致最开始的音的おてんば恋娘   ✓ 明治十七年の上郡アリス
✓ Masuo魔法図書館（← 用户报的那首）   ✓ 【183／东方电气棍】Locked Girl ~ 室密棍哥
✓ 【音MAD】2020骑士之夜合作   ✓ 【音MAD】献给逝去公主的七重奏！   ✓ 最终鬼畜全明星•BILIBILI【东方新春宴'24单品】

网络：/manifest.json → 200 ✓；/media/otomads/… .mp3 → 206（真在流式读取 ✓）
```

**顺带修的 UI 不一致**（用户同意后已改 ✓）：音MAD 模式下"本地曲库"那一行原来仍显示 **off 未启用** ✗ ——
内部确实在用（模式强制 ✓，D52），但开关看着是关的 ✗，容易误解 ✓。
现在：**开关置灰 + 显示为"由音乐模式强制启用"** ✓，状态徽章也跟着变成真实条目数 ✓。

实测：

```
原曲模式: 4 本地曲库 | off 未启用 | 开关 off
音MAD  : 4 本地曲库 | 48（条目数）| 由音乐模式强制启用 | 开关 checked + disabled ✓
```

---

## D96 本地源条目数显示 48（应为 24）

**需求**（用户）：本地源音乐数量有误，显示 48 实为 24。

**根因**：D95 为了"去作者前缀"的匹配，在 `buildEntries` 里给每行**又插了一个归一化键** ✗ ——
24 行变成 48 个键 ✗，而设置页那一行显示的是 `table.entries.size` ✗ → 就成了 48 ✗。

**改法**：`entries` 只存**本来的键**（一行一条 ✓）；归一化匹配改到 `resolveTrack` 的**兜底扫描**里 ——
直接命中失败时，才按"归一化曲名"扫一遍该表（`normalizeTitle(键里的曲名) === normalizeTitle(查询曲名)` ✓），
两边都归一化 ✓。代价只在未命中时产生 ✓，`entries.size` 保持真实 ✓。

**实测**：

```
状态徽章：local=24 ✓ | netease163=651 | cloudflare_r2=651 | thbwiki=651
模块自检：entries.size=24 ✓ 且 resolveTrack("Masuo魔法図書館") 命中 ✓
连播 13 首音MAD：告警 0 首 ✓，/media 响应 27/29 成功（其余是 302 跳转，属正常）
```

**教训**：为了修匹配往**被计数的数据结构**里塞别名 ✗ —— 计数、遍历、展示都会跟着错 ✓。
别名要么单独放一张表 ✓，要么就在查找时算 ✓（这次选了后者 ✓）。

---

## D97 第二批音MAD（20 条）+ 测试期望值改成"跟着数据走"

**需求**（用户）：接收 20 条新音MAD（链接/标题/作者/角色，yt-dlp 最高音质），
**并提醒"标题可能含逗号，自行校验录入内容"**。

**批量处理**（`tools/ingest_otomads.py` ✓ 幂等 ✓）：

* **解析从两端取**：第一段=链接、**最后一段=角色**、**倒数第二段=作者**、**中间全部=标题** ✓ ——
  这样标题里的逗号不会把字段切错 ✓。实测 20 行 → 解析 20 成功、0 异常 ✓，
  其中两首标题真的含逗号（`【東方永夜抄】飘上月球，不死之喵` ✓ / `【东方】飘上月球，不死乒乓` ✓）
  —— 按固定列切会把作者写成"不死之喵" ✗。
* 下载 20/20 ✓；TOML +20 ✓，音MAD **24 → 60 条**、覆盖角色 **13 → 30** ✓；manifest 60 ✓；
  `data:check` 无漂移 ✓、`tmc.validate` 通过 ✓；应用内逐条解析 **60/60 命中** ✓。

**踩到的三个坑（都已修）**：

1. **角色 key 写错会静默丢数据** ✗：3 条铃仙用了 `reisen-udongein`，正确是 `reisen-udongein-inaba` ✓ ——
   `apply_tracks` 找不到角色就 `continue` ✗（TOML 60 / 角色表 57 ✗）。**已改**（用户同意）：`apply_tracks` 遇到角色表里没有的 key **直接报错并列出是哪几条** ✓，
不再静默跳过 ✓。反证：把一条 key 故意写成 `cirno-typo` → `build` 退出码 **1** ✓，
输出里能点名"角色表里没有的 key" ✓。
2. **文件名里的 `/` 会变成全角 `／`** ✗，而 manifest 的曲名取自文件名 ✓ → TOML 要按磁盘名对齐 ✓。
3. **作者名自带连字符**（`Rendering-Liu` ✓）会让"去掉 `作者 - ` 前缀"失手 ✗ →
   `resolveTrack` 的兜底匹配改成**后缀匹配**（磁盘名以 `作者 - 曲名` 结尾即命中 ✓），与作者形态无关 ✓。

**测试期望值**：4 个用例里写着上一批的固定数字 ✗（音MAD 角色数 13 / 条目 402 / 去重 392 / 曲包 24）。
`src/music/mode.test.ts` 的三条改成**从数据推导** ✓（覆盖角色 > 10 ✓、条目数 = 角色表里 otomads 条目总数 ✓、
两模式集合互不相交 ✓）；`tools/tests/test_rules_and_data.py` 的三个数字更新为当前快照
（438 / 428 / 60 ✓）并加注释说明"曲包增长时要一起更新" ✓。

**收尾**：`pnpm test` **209 passed** ✓、`uv run pytest` **33 passed** ✓。

---

## D98 录入格式变更：四个字段用反引号包起来

**需求**（用户）：后续录入格式改为 `` `链接` `标题` `作者` `角色` ``。

**为什么值得改**：旧格式用逗号分隔 ✗，而标题**真的会含逗号**（上一批就遇到两首 ✓），
只能靠"从两端取"兜着 ✓；反引号分隔既不用猜、也不会与标题里的标点冲突 ✓。

**新增 `tools/parse_ingest_rows.py`** ✓：

* **两种格式都认**：行内出现反引号 → 按反引号取四个字段 ✓；否则按逗号 + 两端取（旧格式兼容 ✓）；
* **角色名映射**：内置中文 → 项目 key 的别名表 ✓，也接受直接写 key ✓；
  映射不到就**逐条报错**（不会静默丢 ✓）；
* 输出 `tools/ingest_rows_<日期>.json` ✓（喂给 `ingest_otomads.py` ✓），并在终端打印一张核对表 ✓。

**自测**：把上一批 20 条**改写为新格式**再解析 → **20/20 成功、0 异常** ✓，
且与当时的结果**逐字段一致** ✓（BV / 标题 / 作者 / 角色 ✓）。

**新的录入三步**：

```bash
python3 tools/parse_ingest_rows.py rows.txt     # ① 解析 + 校验（角色映射不上会报错）
python3 tools/ingest_otomads.py                 # ② yt-dlp 最高音质下载（已存在会跳过）
# ③ 追加 TOML → uv run python -m tmc.build（key 写错现在会直接报错 ✓）
```

---

## D99 第三批音MAD（13 条，反引号格式）+ 解析器补名字

**需求**（用户）：接收 13 条新音MAD（新格式 `` `链接` `标题` `作者` `角色` ``，yt-dlp 最高音质）。

**流程**（这次按 D98 新工具走，两步到底 ✓）：

```bash
python3 tools/parse_ingest_rows.py rows.txt   # 解析 13 条、异常 0 ✓
python3 tools/ingest_otomads.py               # 下载 13/13 ✓（最高音质，文件名 = 作者 - 标题.mp3）
# 追加 TOML → build / validate / 逐条解析
```

**解析器补了 5 个中文别名** ✓：因幡天为 → `inaba-tewi` ✓、射命丸文 → `shameimaru-aya` ✓、
风见幽香 → `kazami-yuuka` ✓、小野塚小町 → `onozuka-komachi` ✓、
四季映姬·夜摩仙那度 → `shiki-eiki-yamazanadu` ✓（注意是 `yamazanadu` 不是 `yamaxanadu` ✗ —— 我第一遍写错，
靠核对 `characters.json` 才发现 ✓）。

**结果**：

```
音MAD 60 → 75 条 ✓ | 覆盖角色 30 → 35 ✓ | manifest 75 ✓ | 本地源徽章 75 ✓
应用内逐条解析 73/73 命中 ✓ | data:check 无漂移 ✓ | tmc.validate 通过 ✓
pnpm test 209 passed ✓ | uv run pytest 33 passed ✓（数据快照同步更新为 453 / 443 / 75 ✓）
```

**标题里带特殊符号的**（`**少女` ✓、`♿` ✓、`♂` ✓、`：` ✓）全部原样落下 ✓ ——
文件名里的 `/` 仍然是唯一会被替换成全角 `／` 的字符 ✓。

---

## D100 第四批音MAD（11 条，含 1 条本地 wav）

**需求**（用户）：10 条 bilibili + **1 条本地文件**（`C:\Users\…\…-converted.wav`，用户提醒"你是一台 WSL，
应该能拿到宿主机的这个文件" ✓ —— 对 ✓，WSL 的 Windows 盘挂在 `/mnt/c` ✓）。

**做法**：

* 10 条照常：`parse_ingest_rows.py` → `ingest_otomads.py` ✓（解析 10/10、下载 10/10 ✓）；
* **第 11 条**：直接从 `/mnt/c/Users/Yakumo_Koishi/Videos/JiJiDown/…converted.wav` **拷进**
  `.music/incoming/y的自然对数 - 对了 向北邮出发吧.wav` ✓ →
  `python3 tools/ingest_local_audio.py` → ffmpeg 转 **320k mp3** ✓ → 落进 `.music/otomads/` ✓
  （文件名规则「作者 - 标题」✓，转完自动删掉 incoming 里的源文件 ✓）。

**新增 `tools/ingest_local_audio.py`** ✓：本地音频 → 320k mp3 → `.music/otomads/`；
放错的（文件名不带 ` - `）会报错而不是瞎猜 ✓。

**结果**：

```
音MAD 75 → 86 条 ✓ | 覆盖角色 35 ✓ | manifest 86 ✓ | 本地源徽章 86 ✓
应用内逐条解析 86/86 命中 ✓（其中"对了 向北邮出发吧"命中 = true ✓）
data:check 无漂移 ✓ | tmc.validate 通过 ✓ | contentHash d5fd15d4e1ca ✓
pnpm test 209 passed ✓ | uv run pytest 33 passed ✓（快照 464 / 454 / 86 ✓）
```

---

## D101 卡池按音乐模式过滤 + 按卡组筛选只看卡槽

**需求**（用户）：
① 按卡组筛选音乐应按照**卡槽**里的卡组筛（单人为**单方**、多人为**双方**），而不是所有卡组；
② 音MAD（及其它模式下）**没有对应音乐的角色不能出现在可选卡组**里。

**① `filterMusicByDeck(state, viewpoint)`**（`src/game/rules.ts`）：

* **只看卡槽**（`player.deck`）✓ —— 之前把"已得"的 `collected` 也算进去了 ✗；
* `viewpoint` 传下标 → 只按那一方卡槽筛 ✓；传 `null` → 双方都算 ✓；
  `useGame.filterByDeck()` 按模式决定：`mode === "multi" ? null : myIndex` ✓。
* 单元测试重写为 5 条（只看卡槽 ✓ / 单人只看自己 ✓ / 多人双方 ✓ / 补进轮播 ✓ / 只剩一张不为空 ✓）；
  `useGame.test.ts` 里那条旧期望同步改成新口径 ✓。

**② 卡池过滤**（`src/ui/panels/GamePanel.tsx`）：卡池与对局轮播顺序都只取
`hasTracksInMode(bundle.albums, character, musicMode)` 为真的角色 ✓；
**兜底**：若过滤后一个不剩（例如联机测试用的精简数据 ✓），退回完整卡池，避免游戏开不起来 ✓。

**实测（浏览器里直接读 store）**：

```
原曲模式卡池: 121 个角色 / 127 张卡 ✓（全量）
音MAD 模式卡池: 35 个角色 / 38 张卡 ✓（正好是录过音MAD 的那 35 个 ✓）
```

**验证**：`pnpm typecheck` ✓、`pnpm test` **211 passed** ✓（新增 5 条规则用例 ✓）。

---

## D102 逐曲音量均衡（方案 A，只对本地音MAD 生效）

**需求**（用户）：游戏模式里部署音量均衡；选定**方案 A：逐曲响度对齐** ✓；**只对本地音MAD 生效** ✓。

**先量后做**（本机 86 首音MAD 抽样）：`mean_volume` 从 **−7.0 到 −13.2 dB** ✓ —— 相差约 6 dB ✓，
最响的听感约为最轻的两倍 ✗，抢答确实不公平 ✓（原来只有一句 `audio.volume = 音量` ✗，无逐曲处理 ✓）。

**实现**（三步）：

| 位置 | 做什么 |
|---|---|
| `tools/measure_loudness.py` | ffmpeg `volumedetect` 量每首的 mean → 目标取**中位数**（−11.2 dB ✓，抗离群 ✓）→ `gain = 10^((target−mean)/20)`，**只衰减不放大** ✓，夹在 **0.6–1.0** ✓；带 dB 缓存（只量新文件 ✓） |
| `public/data/loudness.json` | 生成物：`{ targetDb, measuredDb, gains: { "文件名词干": 系数 } }` ✓（86 首 ✓） |
| `src/audio/usePlayer.ts` | 启动拉一次该表 ✓；`gainOf(entry)`：**只有解析出来的 `sourceId === "local"` 才查系数** ✓（用户要求只对本地音MAD ✓），键 = `作者 - 曲名`（= 磁盘文件名 ✓）；换曲时按 `volume × gain` 重设 ✓（上限 1 ✓） |

**实测（浏览器里拦下 Audio 元素读 volume）**：

```
原曲模式（镜像源）：音量 = 1 ✓（不参与均衡 ✓）
音MAD 模式（本地源）：连续 6 首 → 0.8035 / 0.9333 / 0.8913 / 0.9226 … ✓ 逐曲不同 ✓
loudness.json 请求 → 200 ✓ | 表 86 首 / 目标 −11.2 dB ✓
```

**为什么不放大、为什么目标取中位数**（两处都踩过 ✗）：
`HTMLMediaElement.volume` 上限是 1 ✗，放大得挂 Web Audio 节点（会改音色 ✗）；
第一版用"最轻的一首"（−22.2 dB ✗ 被个别超轻片段带偏 ✓）当目标 → 绝大多数曲目被压到 0.25 地板 ✗，
整批反而更小声 ✗；改中位数 + 0.6 地板后系数落在 **0.610–1.000**（中位 1.000 ✓）✓。

**验证**：`pnpm typecheck` ✓、`pnpm test` **213 passed** ✓（新增 2 条：键的形状 / 表只含本地曲目且系数在 (0,1] ✓）。

---

## D103 对局选曲：全曲库 + 已播不重复 + 轮播兜底

**需求**（用户）：游戏模式下默认启用**全曲库**（每个角色随机一首 ✓）；轮播时**已播歌曲不重复** ✓；
若轮播走完却仍有剩余卡牌（bug）→ 把曲库设定成**剩余卡牌** ✓；**注意双端同步** ✓。

**实现**：

| 改动 | 位置 |
|---|---|
| `GameState.playedTracks: string[]`（本局已播 trackId ✓），`startGame` 清零 ✓ | `src/game/types.ts` / `rules.ts` |
| 对局中 `ignorePreset: true` → 候选 = 该角色在当前**音乐模式**下的**全部**曲目（预设只在播放页生效 ✓）；候选里排除 `playedTracks` ✓，某角色全播过则允许重复 ✓ | `src/audio/usePlayer.ts`（新增 `ignorePreset` / `played` 两个输入 ✓） |
| `markPlayed(trackId)`：曲目确定后追加一次 ✓（两端按**同一确定性结果**追加 → 天然同步 ✓） | `src/game/useGame.ts` + `src/ui/shell/AppShell.tsx` |
| `reshuffleIfWrapped()`：`turnSeq ≥ order.length` 且卡槽仍有牌 → 用 `filterMusicByDeck(state, mode === "multi" ? null : myIndex)` 把轮播重设成**剩余卡牌的角色** ✓（单方/双方语义与 D101 一致 ✓） | `src/game/useGame.ts`（挂在 `next()` 的出口 ✓） |

**实测（单人开局，连推 13 回合，读 store）**：

```
回合角色依次：tamatsukuri-misumaru → hong-meiling → tsukumo-benben-yatsuhashi → murasa-minamitsu
             → houjuu-nue → izayoi-sakuya → sukuna-shinmyoumaru → sekibanki → futatsuiwa-mamizou
             → cirno → toramaru-shou → wakasagihime → konpaku-youmu
playedTracks：3 → 53（单调增长 ✓）   自己牌数 24 → 23 ✓
13 个回合里出现的曲名：**无重复 ✓**
```

**验证**：`pnpm typecheck` ✓、`pnpm test` **213 passed** ✓。

**两点遗留已处理**（用户要求 ✓）：

1. **兜底触发收窄** ✓：`GameState` 新增 `reshuffledAtTurn` ✓ → 判据改成
   `turnSeq − reshuffledAtTurn ≥ order.length` ✓（"从上次重设到现在又转满一圈" ✓），
   重设时把 `reshuffledAtTurn` 设为当时的 `turnSeq` ✓ —— 不再每回合反复重设 ✓。
2. **补了双端同步的自动化验证** ✓：新增单测"同种子开局 + 同批 `nextTurn`"——
   两端各自从同一局面出发 ✓，逐回合断言 `order` / `currentKey` / `turnSeq` / `temporaryDisabled` 完全相等 ✓，
   并且用 `turnSeed(gameSeed, turnSeq, key)` 算出**选曲指纹**逐回合比对 ✓（两端必然同一首 ✓）；
   6 个回合的指纹互不相同 ✓（角色确实在推进 ✓）。

---

## D104 随机种子：主机生成、客户端采用，全局统一到一套权威随机数实现

**需求**（用户）：随机种子由服务端生成，客户端接收服务端配置；需要用到随机种子的场景**统一**成
稳定权威的随机数生成实现，而不是近似伪随机。

**先盘点**（`grep -rn "Math.random" src/`）：改动前有 **13 处**裸 `Math.random`、**3 种**互不相干的
"派生"写法，其中 4 处会直接导致两端分叉：

| 位置 | 旧写法 | 后果 |
|---|---|---|
| `game/rules.ts`（补满/打乱/开局/交牌） | `rng: Rng = Math.random` 默认参数 | 谁忘了传种子就各自随机一次；快照覆盖前两端已经显示/播过不同内容 |
| `audio/usePlayer.ts` | `seed + character.order * 7919` | 加法线性派生（实测 121 个角色分布最多 31 / 最少 12，理想 24.2） |
| `game/rules.ts` `turnSeed` | FNV-1a 整串哈希 → `% 2147483647` | 取模只用低位；相邻回合撞同一首 28/120（理想 20%） |
| `music/rng.ts` `randomStartPosition` | `(seed % 2147483647) / 2147483647` | **所有曲目同一个起播比例**（实测去重后只有 1 个值 ✗） |
| `game/cpu.ts` | `rng: () => number = Math.random` | CPU 出手不可复盘、两端不可能一致 |
| `store/queue.ts` | 客户端 `newSeed()` 自己换种子 | "重新抽选"两端各抽各的 |
| `net/useNet.ts` `peer.ts` `cheat.ts` `CheatRect.tsx` | 房间号/peer 后缀/装饰动效也用 `Math.random` | 与种子体系混在一起，看不出"哪里需要可复现" |

**实现**（一条链路，四个文件）：

| 文件 | 作用 |
|---|---|
| `src/rng/index.ts`（**唯一实现**） | `createRng`（mulberry32）、`deriveSeed`（murmur3 fmix32 混淆 + 有序标签 + 移位落位）、`newSeed`（crypto）、`randomToken` / `ephemeralRandom`（非种子场景）、`stableHash`（展示层也要一致的小选择） |
| `src/store/seeds.ts`（**种子权威**） | `authority`（单机本机 / 联机主机）能 `draw`（现抽，结果随快照同步）与 `roll`（换种子）；`replica`（联机客户端）只能 `adopt` 主机下发的种子，`draw/roll` 返回 `null` |
| `src/net/protocol.ts` + `engines.ts`（**下发**） | 协议 **v3**：`musicMode` 字段升级成 `SessionConfigWire { musicMode, sessionSeed }`，随 `welcome` / `snapshot` / `requestSync` 下发；新增 `rerollQueue` 意图 |
| `src/game/rules.ts` `cpu.ts` `useGame.ts` `store/queue.ts` `audio/usePlayer.ts`（**收口**） | 规则层随机函数**必须显式传 `rng`**（默认值全部删掉）；`useGame` 权威端 `draw`、副本端直接 no-op；`turnSeed` → `deriveSeed(gameSeed,"turn",turnSeq,key)`；曲目选择 → `deriveSeed(seed,"track",characterKey)`；起播位置 → `deriveSeed(seed,"start",trackId)` |

两条口径写进文档（`docs/rng-v1.md`）：**"主机决定的"用 `draw`，"两端各自算的"用 `derive`**；
用错就会出现"两端不同、随后被覆盖"的闪烁。

**实测**：

```
grep -rn "Math.random" src/ | grep -v "^src/rng/"            → 0 处（新增 authority.test.ts 扫源码守住）
createRng(12345).next()  → 4207900869, 1317490944, 2079646450    ← 冻结向量，改了就是破坏协议
deriveSeed(12345,"turn",3,"cirno") → 369832200
随机起播：旧 = 所有曲目同一个比例（去重 1 个）；新 = 每首各自不同（同一首稳定）
相邻回合撞同一首：旧 28/120（理想 20%）→ 新 20/120
副本端 fill/shuffle/start → 本地状态逐字段不变、nonce 不增加（结构性不可能再闪一下 ✗→✓）
D104 之前存在 queue 存档里的轮播种子 → 启动时迁移进 tmc.v1.seed（老用户顺序不变）
```

**顺带修掉的两条红灯**（都与本次重构无关，是数据漂移 / 时序，但会让"全绿"变成空话）：

| 用例 | 原因 | 修法 |
|---|---|---|
| 音乐模式：音MAD 统计写死 `24 / 24` | 本地曲库已经涨到 86 首（用户往 `.music/` 加曲子） | 改成**跟着数据走**：先数同源 `/manifest.json` 的条数，再和统计对齐（与 D97 的口径一致） |
| 播放控制：卡片"未居中" 13px | 卡片是 `translateX(12%) / 0.3s` 滑入的，量的时候动画还在跑（实测 transform 8.75px / 167ms） | 量之前等动画结束（`settledAnimations`）；稳定后三行 + 卡面 + 曲名全部误差 **0px**（chromium / firefox 实测一致） |

**验证**：`pnpm typecheck` ✓、`pnpm test` **251 passed**（+37：冻结向量 / 派生性质 / 源码守卫 /
种子权威 / 副本端不掷骰子 / 会话配置下发）；浏览器端按用户要求**两个引擎都跑**：

```
chromium 30 passed  |  firefox 29 passed + 1 skipped（"跨浏览器"用例自己开两个浏览器，只在 chromium 项目跑一次）
mobile (Pixel 7) 9 passed        ← 合计 68 passed / 1 skipped（= pnpm e2e 的全量）
```

新增联机用例（`e2e/multiplayer.spec.ts`）：主机 `authority` / 客户端 `replica` 且 `adoptedSeed = 主机 ownSeed`；
客户端按「重新抽选」→ 主机换种子 → 客户端采用新种子（自己的 `ownSeed` 不动）；
主机自己按「重新抽选」也会经同一条配置通道让客户端跟上。

**踩到的坑（值得记）**：同一个浏览器开两个标签页时，**两边共用 localStorage** →
客户端一进房的 `ownSeed` 恰好等于主机种子（`tmc.v1.seed` 是同一份）。
第一版 `adoptHostConfig` 用"种子没变就不 adopt"做优化 → 副本端 `adoptedSeed` 一直是 null（语义错了）。
改成**总是 adopt**、只在种子真的变了才重排轮播 ✓ —— e2e 正是这么抓出来的。

---

## D105 第三轮 commit 整理（压缩 D103 那一对，并落 D104）

**需求**（用户）：按之前的规则**压缩、提交**修改；随后**推送**（必要时 force）。

**做法**（沿用 D85 / D92 的方法，机械且可验证）：

1. 先记下**压缩前工作区**的树（`git add -A && git write-tree` → `034df55f`）当终局校验基准 ✓；
2. 建备份分支 `backup/pre-squash-3`（= `980eea7`）✓；
3. `git reset --soft d8fb1da` 把 D103 的 `f59a0fd` + `980eea7` 折回索引 → 一条 `039e431`
   （树 = `86cba9d3`，与 `980eea7` **逐字节一致** ✓）；
4. 再把工作区（D104：25 改 + 5 增）提成 `ca8b3d9`（树 = `034df55f`，与压缩前**逐字节一致** ✓）；
5. 顺带修根 `README.md` 的 `tmcd.` 笔误（实际模块是 `tmc.local_source` ✓）→ `eb1d14f` ✓。

**这一轮的 3 个提交 → 2 个**：

| 新提交 | 内容 | 压缩自 |
|---|---|---|
| `039e431` feat: draw from the whole library and never repeat a track | D103（全曲库不重复 + 轮播重设收窄 + 双端一致性用例） | 2 |
| `ca8b3d9` feat: let the host own the session seed and unify the rng | D104（种子权威 + 唯一 rng + 协议 v3 + 调用点收口 + 文档） | 1 |

**验证**：`pnpm typecheck` ✓、`pnpm test` **251 passed** ✓；e2e 按用户要求**两个引擎都跑**：
`chromium` **30 passed** / `firefox` **29 passed + 1 skipped** / `mobile` **9 passed** ✓（= `pnpm e2e` 全量）。

**推送**：`git push origin main` → `d8fb1da..eb1d14f` **快进** ✓ —— 被压缩的两个提交从未 push，
`d8fb1da` 一直是远端 tip，所以**不需要 force** ✓。备份分支确认后删除 ✓
（压缩前的 SHA 记在这里备查：`980eea7`）。

**踩到的坑（记下来）**：

| 坑 | 现象 | 记法 |
|---|---|---|
| e2e 的前置条件没写清 | 音MAD 统计那条用例改成"跟着数据走"后要从同源 `/manifest.json` 数条数，而 Vite 把该路径代理到**本地曲库助手**（`127.0.0.1:8011`）；助手没起时 `manifest.ok()` 是 false → 红灯 ✗（**环境**问题，不是代码） | 先起 `cd tools && UV_CACHE_DIR=.uv/cache uv run python -m tmc.local_source`（86 首 ✓）再跑就全绿 ✓ —— "全绿"必须连同前置条件一起说 |
| 仓库根在同名**嵌套**目录 | 会话工作目录是 `~/touhou-music-cards-reconstructed`，git 仓库根却是它下面同名的 `touhou-music-cards-reconstructed/`；在外层跑 `git` / `pnpm` 会全落空 ✗ | 命令一律显式 `cd` 到内层（先 `git rev-parse --show-toplevel` 确认 ✓） |

---

## D106 文档整理：一份索引 + 现状表，报告标成快照，补上协议契约

**需求**（用户）：整理仓库里的所有文档，同步工作区里更早的记录，更新到现状。

**做法**（先盘点、再改；盘点用两个只读子代理交叉核对，避免"凭印象整理"）：

1. 新增 [`docs/README.md`](README.md)：文档全景 + **现状表**（每一项都带复现命令）；
2. 各 README 与契约文档的过期点按**实测数字**更新（根 `README.md`、`data/README.md`、
   `data/packs/README.md`、`tools/README.md`、`rules-classification-v1.md`）；
3. `docs/reports/` 分清"脚本生成 / 校验器输入 / 历史快照"三类，快照各加阶段与日期横幅，并修掉两处自相矛盾；
4. `docs/reports/validation-report.md` **重跑生成器**而不是手改（4 行数字回到现状 ✓）；
5. 补上缺的**协议契约** [`protocol-v1.md`](protocol-v1.md)：工作区笔记 A 里的上游协议表从未被本仓库的
   文档吸收（此前只有代码），协议 v3 现在有据可查；
6. 把 D9 里"每回合广播 `rngSeed` / `startedAtEpoch`"标注为**已被 D104 取代**。

**这一轮查出来的问题**（都已在上面修掉）：

| 问题 | 事实 |
|---|---|
| `data/meta/roles.tsv` 被 3 份文档当成权威来源 | 该文件**从未存在**（`git log --all -- data/meta/roles.tsv` 为空）；真实是 `stage-cast.tsv` + `extra-overrides.tsv` |
| `docs/PLAN.md` 被 3 处引用（含 DECISIONS 抬头） | 文件已在 `2c81ffd` 删除；引用改指现存文档 |
| 根 `README.md` 写"单测 209 条" | 现 **251**（`pnpm test`） |
| 曲包写"24 首 / 13 角色"、`data/packs/README.md` 写"此目录为空" | 现 **86 首 / 35 角色**（`data/packs/otomads.toml`） |
| `M2a` 说 TH20"6 道中 + 8 角色" | 与 `M2b` 的 **7 + 7** 矛盾，后者与数据一致 |
| `upstream-diff.md` 一处写 40、一处写 1600 | 统一为"共 1600，下面只列前 40"，并注明上游解析错位的脏行 |
| `validation-report.md` 四行数字落后（368/378/39） | 生成物漂移；重跑 `tmc.validate --report` 即回现状 **454/464/40** |
| `src/game/rules.ts` 拿 gitignored 的 `.ref/notes` 当溯源 | 改成指向本仓库的 D9（`.ref/` 不进版本库，读者跟不到） |

**仍未吸收的工作区笔记结论**（要做得单独排期）：A 笔记的 B8–B18 上游查证项；
旧计划里 WP7–WP9 的报告产物（`url-audit.md` / `preset-regression.md` / `extra-coverage.md` /
`thbwiki-audit.md`）；"8 条曲名尾句号曲目的 R2 实链可达性"（`tmc.check_urls` 在，但从没出过报告）。

---

## D107 曲包音频：`source` / `start_time` / `stop_time` + 抓取裁剪命令
> ⚠️ **已被 D142 取代**：第 3 条答复（`-c copy` 保留原件）**已被推翻**：改成解码后精确切 + `libmp3lame` 重编码。

**需求**（用户）：给 `data/packs/otomads.toml` 的曲目加三个键 —— `source`（构建期自动抓取，yt-dlp 与 uv
一起管理）、`start_time` / `stop_time`（`HH:MM:SS.mmm`，抓取后用本机 ffmpeg 裁剪）；依赖写进主 README。
契约与流程落在 [`packs-audio-v1.md`](packs-audio-v1.md)（先写设计稿、定完 11 条答复再实现）。

**裁定**（用户 11 条，逐条见契约 §7）：独立命令（不塞进 `tmc.build`）/ 保留原件 `/` `-c copy` /
音频口径进 `contentHash` / yt-dlp **无新版或升级成功才继续、升级失败即中止** / 任意 yt-dlp 支持的站点
（能否抓到取决于构建时网络环境）/ 不支持一源多段 / 随机起播与裁剪**无关**（两个时间键只在抓取期存在，
运行时不读）/ 抓取顺带量响度 / 重复 `source` 用硬链接 / 不做 `--only`。

**实现**：

| 位置 | 做了什么 |
|---|---|
| `tmc/packs.py` | 解析三个键；**未知键直接报错**（此前只读认识的键，拼错的名字会被静默丢掉 ✗）；新增 `parse_time` / `trim_seconds` / `audio_filename` / `source_key` / `audio_descriptors` |
| `tmc/validate.py` | 时间格式、区间先后、`source` scheme、重复 `source` 告警；报告加"带 source / 带裁剪"计数 |
| `tmc/build.py` | `contentHash` 纳入 `[专辑, 曲名, start, stop, source]` —— 两端音频口径不同就在握手期被拒 |
| `tmc/local_source.py` | 扫描跳过点目录/点文件（`.raw/`、`.state/`；不跳过的话 manifest 会多出垃圾专辑、条目数变多 ✗） |
| `tmc/loudness.py` | 从 `measure_loudness.py` 抽出的可调用核心；顺手修掉"`reset` 的键没被删"与"已删文件的旧键不清"两个 bug |
| `tmc/fetch_audio.py` | 新增：依赖检查 → yt-dlp 更新 → 逐条下载 → 裁剪 → 硬链接去重 → 顺带量响度 → 汇总与退出码 |
| `pyproject.toml` + `uv.lock` | 加 `yt-dlp` 依赖（升级会改 lock，属预期） |
| `data/packs/otomads.toml` | 84/86 回填 `source`：**`ROWS` 61 条 + 两个 `ingest_rows_*.json` 30 条 + mp3 的 `purl` 标签 24 条**的并集（NFKC 归一化后按"标题 + 作者"匹配） |

**实测（真抓一首 `thwy - 岁月`，`BV18t411F71d`）**：

```
--dry-run        → dry 1（计划与来源）
抓取             → fetched 1；成品与原件同一 inode（硬链接 874494，链接数 2）；时长 63.338667 不变
临时 5s–15s 再抓  → trimmed 1；时长 10.008s（10s + 一帧）；mp3 235kbps ≈ 源 232kbps ⇒ 未重编码；
                   原子改名后成品换新 inode、原件不动 ✓；响度该曲重量（−16.6 → −16.3），表仍 86 条
再跑一次         → skip 1  |  去掉区间再跑 → fetched 1（回到整首并重新硬链接）
```

`public/data/index.json` 的 `contentHash` 由 `d5fd15d4…` 变 `93bdb1a9…`（预期：音频口径已进握手）。

**验证**：`uv run pytest` **71 passed**（+38 条）、`pnpm typecheck` ✓、`pnpm test` **251 passed** ✓、
`pnpm data:check` ✅ 无生成物漂移、`pnpm data:validate` ✅ 校验通过。

**仍未做**：2 条曲目没有 `source`（其中一条本来就是用户本地的 wav）；非 mp3 容器与运行时抓流
（浏览器直取 B 站）明确不做，理由见契约 §11。

---

## D108 曲目互斥：同一首歌只允许一张卡（随机补满与手动选卡都挡住）

**需求**（用户）：使用同一首曲子的多个角色，在游戏的随机选卡里**只被选中一次**，**手动重复选也不允许**；
未使用卡区里的冲突卡**保留但压暗**（明确要求：不是纯黑白灰）；同一角色的第二张卡面**也禁**。

**实测现状**（`public/data/characters.json`）：

| 情况 | 数字 | 例子 |
|---|---|---|
| 原曲模式下**两个角色共用一首** | **10 首 / 17 个角色** | 琪露诺·若鹭姬《ミストレイク》；咲夜·蕾米莉亚《ツェペシュの幼き末裔》；小伞·鵺《夜空のユーフォーロマンス》 |
| 音MAD 模式下的跨角色重复 | **0 首**（86 首里） | —— |
| 一个 key 多张卡面 | 5 个 key | 其中 4 个其实是**多个角色共用一个 key**（`prismriver-sisters` 三姐妹、`tsukumo-benben-yatsuhashi` 弁弁/八桥、`teireida-mai-nishida-satono` 舞/里乃、`yorigami-joon-shion` 女苑/紫苑），只有 `kamishirasawa-keine` 是同角色多形态 —— 用户裁定**两种都只允许一张** |

不处理的后果：默认 3×8 牌库随机补满时约 **1/3 的对局**会同时抽到某一对的两个角色 —— 那首歌响起时
两张卡都"听起来对"，但 `notifyPickEvent` 只认 `currentKey`，另一张必判错。

**实现**：

| 位置 | 做了什么 |
|---|---|
| `src/music/songConflicts.ts`（新） | `buildSongConflicts(albums, characters, mode)`：曲目 → 角色求交，把"共用同一首"的角色两两互链；给"多卡面"的角色加**自链接**（同角色第二张卡面）；只数**当前音乐模式**的曲目 —— 与对局里 `ignorePreset` 的真实选曲口径一致 |
| `src/game/types.ts` | 新增 `SongConflicts`（只读表）与 `cardKey()`（`角色-卡序` 统一写法） |
| `src/game/rules.ts` | `addCard` / `randomFill` 增加可选 `conflicts`；新增 `blockedCardKeys()` 供界面置灰。互斥**逐张**判定（每放一张就把角色记进 `inPlay`），所以一次补满也不会漏；卡不够时**宁缺毋滥**（不为填满而塞重复曲目） |
| `src/game/useGame.ts` | 新增 `conflicts` 字段，`init(pool, conflicts)` 灌入，`fill` / `addCard` 透传 |
| `src/ui/components/CharacterCard.tsx` | 新增 `blocked` / `blockedHover` 两个卡态：底色仍是普通白底，只给卡面图 `grayscale(35%) opacity(0.45)`（保留角色配色，与"真正禁用"的 `grayscale(100%)` 区分） |
| `src/ui/components/CardStrip.tsx` | `StripCard.disabled`：不响应点击/拖拽，光标 `not-allowed` |
| `src/ui/game/UnusedCards.tsx` | 压暗的卡**留在原位**（未使用区数量不变）、点不动也拖不动，另加一行"N 张已压暗：同一首曲子一局只能选一次" |
| `src/ui/panels/GamePanel.tsx` | 建卡池的 effect 里一并派生互斥表；选牌阶段算 `blockedKeys` 传给未使用区（长条与窄屏面板两种版式共用） |

**为什么不碰随机数与协议**：互斥表由两端各自从同一份 `bundle`（已有 `dataHash` 校验）派生，
**不进 `GameState`、不进快照**；`randomFill` 本来就是主机权威动作（客户端只发 intent 等快照），
随机消耗次数与改动前**完全一致**（仍是每个空槽一次 `intBelow`），所以 `docs/rng-v1.md` 与
`PROTOCOL_VERSION` 都不用动，也不需要存档迁移（`useGame` 不落盘）。

**互斥按"歌"而不是"连通分量"**：`tatara-kogasa` 分别与 `houjuu-nue`、`miyako-yoshika` 各共用一首，
但后两者之间没有共同曲目 → 只有 kogasa 进不来，另外两个可以同时在场上（单测守着这条）。
同名不同专辑仍算**不同**曲子（键是 `专辑\u0001曲名`，沿用附录"同名不等于同曲"的既有结论）。

**验证**：`pnpm typecheck` ✓、`pnpm test` **266 passed**（+15 条：`songConflicts.test.ts` 6、
`rules.test.ts` 6、`useGame.test.ts` 1、`GamePanel.test.tsx` 2，含真实数据的回归断言）✓、
`pnpm data:check` ✅ 无漂移、`pnpm build` ✓；
e2e chromium **29 passed / 1 红**（`音乐模式：原曲 / 音MAD` 取同源 `/manifest.json`，需要本地曲库助手 8011，**环境问题**）、
e2e mobile **9 passed** ✓；"压暗但保留配色"另用 Playwright 截图 + `getComputedStyle` 核对
（`grayscale(35%) opacity(0.45)`，粉/黄/绿/蓝仍可辨认）。

---

## D109 曲包改成一角色一份文件 + 录入自动化（音MAD 分离的第一步）

**需求**（用户）：把音MAD 那部分拆成 `character.toml` 风格的版本 —— 清单留在
`data/packs/otomads.toml`，曲目进 `data/packs/otomads/*.toml`；并且**要自动化**（录入不再手工追加 TOML）。
这一条是"音MAD 与原曲完全分离"三步里的**第一步**；B/C 的详细计划写在**仓库外**的工作区文档
`B-C-PLAN.md`（不进版本库，供跨会话执行）。

**为什么**：曲包此前是**单文件 708 行 / 86 条 `[[track]]`**，`character = "…"` 逐条重复；手工追加要在一份
共享文件里找位置，且 `character` 写错成**另一个存在的 key**（如 `yakumo-ran` ↔ `yakumo-yukari`）会
**静默错挂** —— `apply_tracks` 只拦"不存在的 key"。一角色一份之后，归属由文件名与 `key` 决定，
"写错"从静默变成构建期报错。

**形状**：

| 文件 | 内容 |
|---|---|
| `data/packs/otomads.toml` | 清单：只放 `[pack]` + `[[album]]`（原注释与 `show_album_name = false` 原样保留） |
| `data/packs/otomads/<角色 key>.toml` | **35 份**：顶层 `key`（**必须等于文件名**）+ 若干 `[[track]]`（每份 1…8 条） |

`[[track]]` 里不再写 `character`（角色由 `key` 决定）；清单里写 `[[track]]` 直接报错。
能照搬 `character.toml` 的是"一角色一文件 + 顶层 `key`"，**不照搬** `music = [[专辑, 曲名, 附加信息]]`
的位置数组 —— D107 的 `source` / `start_time` / `stop_time` 塞不进位置数组，而 D107 的教训正是
"位置写法拼错会被静默丢"。

**实现**：

| 位置 | 做了什么 |
|---|---|
| `tools/src/tmc/packs.py` | `load_packs()` 只读清单；新增 `_character_tracks()` 扫 `data/packs/<id>/`；`TRACK_KEYS` 去掉 `character`，新增 `CHARACTER_KEYS`；报错带**包内相对路径**（`otomads/cirno.toml`），否则 35 个 `cirno.toml` 分不清是哪个包 |
| `tools/tests/test_pack_audio.py` | `write_pack()` 改为写"清单 + 角色文件"；新增 4 条布局反例（清单写曲目 / 缺 `key` / 文件名≠`key` / 角色文件写 `[pack]`）与"`character` 不许再写" |
| `tools/src/tmc/ingest_pack.py`（新） | `track_block()`（键序固定、转义引号与反斜杠）与 `append_rows()`（按角色落文件、**只追加不改写**、同 `(专辑, 曲名)` 幂等跳过、`key` 必须存在于 `data/characters/*.toml`）；CLI `python -m tmc.ingest_pack --pack otomads --rows <json>`，`--dry-run` 只打印 |
| `tools/tests/test_ingest_pack.py`（新） | 键序与转义、新建与追加、幂等、按角色分组、保留人工注释、key/source 校验、`--dry-run` 不落盘 |
| 文档 | `data/packs/README.md`（形状 + 录入四步）、`data/README.md`、`tools/README.md`、`docs/packs-audio-v1.md` §1 示例、根 `README.md` |

**录入自动化**：此前 `[[track]]` 一直是**手工追加**的 —— `tools/ingest_otomads.py` 只下载音频、
`tools/parse_ingest_rows.py` 只产出 JSON，**全仓库没有任何脚本写这份 TOML**。
现在第 ③ 步按行的 `character` 分组落文件，新角色才新建文件（带 `key` 与两行说明），
已存在的文件只追加（人工注释与顺序都保住）。

**生成物逐字节不变**（本条的验收核心）：`apply_tracks()` 按 `tracks` 顺序把曲包曲目追加到每个角色
`music` 的末尾，拆分只改文件顺序、不改**同一角色内部**的相对顺序 ⇒ `characters.json` / `albums.json` /
`packs.json` / `index.json` 与 `contentHash` 全部不变。

**验证**：`pnpm data:check` **无漂移** ✓（= 与拆分前逐字节等价）、`uv run pytest` **84 passed**（+13 条）✓、
`pnpm data:validate` 通过（曲包 1 个 / 86 条、84 条带 source，聚合数字与拆分前一致）✓；
把 D99 那批真实录入行喂给新命令做只读核对：
`python -m tmc.ingest_pack --pack otomads --rows tools/ingest_rows_2026-09b.json --dry-run`
→ **20 条全部识别为已存在**（0 写入 / 20 跳过）✓ —— 拆分后的数据与录入器口径一致。

---

## D110 运行状态与列表页按音乐模式分开（B：切模式不再互相污染）
> ⚠️ **已被 D113 取代**：音源注册表**已按模式分键**（`sources.ts` 用 `makeModeStores`），`effectiveSourceOverrides` 那个运行期补丁已删。

**需求**（用户）：D109 把曲包真源拆开之后，接着做"两个模式不再互相干扰" ——
预设 / 单曲手选 / 禁用角色 / 队列顺序与当前角色**各记各的**，列表页也跟着模式走；
之后才是 C（生成物与运行时两套数据集）。计划与 C 的细节在**仓库外**的 `B-C-PLAN.md`（不进版本库）。

**为什么**：真源与曲目文件已经分开，但运行时仍是**一份合并数据 + 一个 `mode` 参数**，而状态是
"每角色一条"的：`pins: Record<角色 key, MusicEntry>`、`queue.order: 角色 key[]`、`temporaryDisabled`、
`preset.albums`（曲包专辑与原曲专辑挤在同一张表）—— 切一次模式就互相改写。最明显的一处是
**列表页根本不接模式**：121 个角色全列、行首取 `character.music[0]`（曲包曲目是**追加在末尾**的
⇒ 音MAD 模式下列表行显示的是**原曲**曲目），Chip 上的数字是两模式合计。

**做法：每个模式一把独立的持久化键**（内容形状不变 ⇒ **不需要 schema 迁移**）

| store | 之前 | 现在 |
|---|---|---|
| 选曲预设 | `tmc.v1.preset` | `tmc.v1.preset.originals` + `tmc.v1.preset.otomads` |
| 单曲模式 | `tmc.v1.single-track` | `tmc.v1.single-track.{originals,otomads}` |
| 轮播队列 | `tmc.v1.queue` | `tmc.v1.queue.{originals,otomads}` |

| 位置 | 做了什么 |
|---|---|
| `src/persist.ts` | 新增 `legacyName`：**新键不存在、老键存在**时把老键原样搬过来（老键**不删**，回退旧版本还读得到）；形状没变所以不动版本号 |
| `src/store/modeScope.ts`（新） | `useMusicMode()`（组件）与 `currentMusicMode()`（非组件），三把 store 共用 |
| `src/store/{preset,single,queue}.ts` | 各自拆成"按模式造 store"，导出 `xxxStoreFor(mode)` 与 `useXxx()`（**保留 zustand 选择器用法**，调用点几乎零改动）；老存档归**原曲** |
| `src/ui/shell/AppShell.tsx` | `preset.sync()` 的 effect 加 `musicMode` 依赖 —— 切模式要 sync **新那把**，否则切过去第一眼又是"全部未勾选"（这个坑记过一次）；`currentQueue()` 取当前那把 |
| `src/net/useNet.ts` | 采用主机配置时按 `config.musicMode` 那一把 `adoptSeed`；`rerollQueue` 落在当前那把 |
| `src/ui/panels/ListPanel.tsx` | 接 `musicMode`：行 = 该模式下有曲可播的角色，行内曲目 = `filterByMode(...)`，计数行的分母也换成该模式的可播角色数（音MAD 下不是 121） |

**故意不分键的三项**（代码注释里写了理由）：`seed`（D104 的"一条会话一个权威种子"，它随
`SessionConfig` 下发，按模式分只会让握手语义变复杂而收益为零）、`sources`（otomads 下本地源由
`effectiveSourceOverrides()` 临时强制打开）、`session.musicMode`（就是那个开关本身）。

**MD2 与间隔**：只改"哪些行 / 哪些曲目出现"，**没有动任何间距、内边距、字号、尺寸常量**。

**验证**：`pnpm typecheck` ✓、`pnpm test` **274 passed**（+8：`modeScope.test.ts` 5 条 —— 老键迁移×2、
两模式互不干扰×2、钩子换表×1；`ListPanel.test.tsx` 3 条）✓、`pnpm data:check` 无漂移 ✓、
`pnpm e2e` **72 passed + 1 skipped**（chromium 32 / firefox 31+1 / mobile 9）✓ —— 新增的
`e2e/mode-separation.spec.ts` 2 条在**两个桌面引擎**上都跑（列表页跟着模式、切模式不带走预设），
计划里列的 8 条桌面布局守卫与 3 条移动端布局用例全绿 ✓；`pnpm e2e:perf` 单独跑 **1 passed** ✓
（第一次与全量一起跑被同机负载击穿 —— 这正是它单独 project 的原因）。

---

## D111 单元测试整体搬到真实浏览器（vitest 浏览器模式 + Playwright，chromium / firefox 双引擎）

**需求**（用户）：单元测试也搬到 playwright 驱动上、两个浏览器都跑 —— 与 e2e 同一口径。
（先做迁移再开 C，因为 C 的验证要用这套基建。）

**为什么**：`vitest + jsdom` 看不见的恰恰是用户看得见的东西 —— 没有布局、没有真媒体、没有真事件，
折叠分区的退出动画**永远跑不完**。这次迁移当场就抓出三条"因为 jsdom 的缺陷而通过"的用例（见下）。

**做法**：`vite.config.ts` 的 `test.browser = { provider: "playwright", instances: [chromium, firefox] }`

| 决定 | 理由 |
|---|---|
| **两个实例都跑** | 用户要求两个浏览器：`pnpm test` 一次跑两个引擎（550 条），另有 `test:chromium` / `test:firefox` 单跑 |
| **视口钉 1280×800** | 浏览器模式默认视口是**移动端**尺寸，会让 `useMediaQuery("(max-width: 599.95px)")` 判定为窄屏（App 冒烟的彩蛋文案、按容器宽度算出的卡面尺寸都跟着变）；窄屏由 e2e 的 mobile project 负责 |
| **浏览器会话端口钉 18001**（`VITEST_BROWSER_PORT` 可覆盖） | 默认会从 63315 往上自动找端口，在受限环境里一路报到 65536 然后崩 |
| **单测文件串行**（`fileParallelism: false`） | 与 e2e 的 `workers: 1, fullyParallel: false` 同理：真浏览器里并行跑几个重文件会把会话拖垮（firefox 报 `Failed to connect to the browser session`，页面停在 Loading） |
| **`LazyRow` 测试模式直接挂载** | 该组件原本就有"`IntersectionObserver` 不存在时（jsdom 单测）直接挂载，保证单测里 DOM 照旧齐全"的约定；换到真浏览器（有 IO）后这条失效 ⇒ 补 `import.meta.env.MODE === "test"`（构建期常量，生产构建恒 false，懒挂载不受影响） |
| **去掉 `jsdom` 依赖**；命令与 e2e 对齐 | 不再有 jsdom 环境；`PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers"` 复用仓库里那套浏览器 |

**为"在浏览器里跑"改的 4 处**（换环境，不改行为）：

| 文件 | 之前 | 现在 |
|---|---|---|
| `src/test-utils.tsx` | `node:fs` 读 `public/data/*.json` 假装 fetch | 真 `fetch("/data/…")`（Vite 服务 `public/`），只拦远程音源表 |
| `src/App.test.tsx` | `node:path` 拼数据目录 | 去掉 Node 路径，直接用同源 `/data` |
| `src/audio/usePlayer.test.tsx` | `readFileSync("public/data/loudness.json")` | `fetch("/data/loudness.json")` |
| `src/rng/authority.test.ts` | `node:fs` 扫 `src/` | Vite `import.meta.glob("/src/**/*.{ts,tsx}", { query: "?raw" })`（构建期读成字符串，语义不变），并补一条"确实扫到了源码"的自检 |

另：`src/store/seeds.ts` 的"首次运行引导"抽成可调用的 `bootstrapSeed()` —— 浏览器模式下
`vi.resetModules()` **不会重跑 ESM 顶层副作用**，"重载模块"不再是可用的测法（两条用例改成直接调它）。

**迁移当场抓出的三类问题**（都是 jsdom 掩盖的）：

1. **折叠分区的退出动画在 jsdom 里永不结束** ⇒ "收起来的分区"内容一直挂在 DOM 上，于是 `ConfigPanel`
   的多条用例不展开也能断言到内容；真浏览器里会 `unmountOnExit`。用例改成**先展开**（本来就是该有的步骤）。
2. **默认视口是移动端尺寸** ⇒ `App` 冒烟的彩蛋文案断言按窄屏取值。视口钉成桌面。
3. **写死 jsdom 的兜底宽度**（`0.08 × 1000 = 80px`）⇒ 真浏览器里有真布局。`GamePanel` 那两条改成断言
   **行为**（按容器百分比、步进、上下限夹紧、未使用区与卡槽同尺寸、落盘与恢复），不写死像素。

**验证**：`pnpm test` **550 passed**（275 条 × chromium + firefox，约 80s）✓、`pnpm typecheck` ✓、
`pnpm e2e`（dev 构建，`MODE !== "test"` ⇒ 懒挂载照旧）**72 passed + 1 skipped** ✓、
`pnpm data:check` 无漂移 ✓。

---

## D112 音MAD 与原曲各一份数据集（C：生成物与运行时分离，协议升到 v4）
> ⚠️ **已被 D113 / D117 取代**：`effectiveSourceOverrides` 已删；共享生成物只剩 `cardsets.json` + 镜像表（`SharedData` 只有 `cardSets`），`packs.json` 停生成并已从库里删。

**需求**（用户）：把两个模式**彻底分开** —— 生成物、加载、运行时都不再共用"一份合并数据 + 一个 mode 参数"。
契约草案 `docs/otomads-separation-v1.md` 的 6 条待裁定项用户全部按推荐采纳（D2 / A / S1 / C3 / 拒绝 v3 / 数据集不带空角色）；
在分支 `enhanced-otomad-mode` 上实现。

**做法**：一个模式一份**完整数据集**，共享项各留一份

| 类别 | 文件 |
|---|---|
| 共享 | `sources.json` / `cardsets.json` / `packs.json` / `sources/*.json` |
| 原曲 | `public/data/{index,characters,albums}.json` —— **121** 角色 / 378 条 / 去重 368 / 39 专辑 |
| 音MAD | `public/data/otomads/{index,characters,albums}.json` —— **35** 角色 / 86 条 / 去重 86 / 1 专辑 |

每份 `index.json` 带 `mode` 与自己的 `contentHash`；并集 **464 条 / 454 首去重**与分离前一致。
角色身份仍只有**一处真源**（`data/characters/*.toml`，契约 S1），两份生成物各投影一份，
跨模式一致性由 `tmc.validate` 新增的 `check_datasets()` 守（`name`/`order`/`card`/`searchNames` 必须相同）。

| 位置 | 改动 |
|---|---|
| `tools/src/tmc/build.py` | 删 `apply_tracks()`；`build_characters(mode)` / `build_albums(mode)` / `build_index(mode)`；共享项只写一次 |
| `tools/src/tmc/validate.py` | 新增 `check_datasets()`（每份只含本模式曲目 / 各自不重复 / 跨模式身份一致）；原曲那套检查跑在真源上（曲包曲目不再混进来） |
| `src/data/{types,load}.ts` | `DataBundle` → `{ shared, datasets: Record<MusicMode, ModeDataset> }`；两个数据集**启动时都取**（策略 A，没有"切模式取数据失败"这条路） |
| `src/data/useDataset.ts`（新） | `useCurrentDataset(bundle)` / `datasetFor(bundle, mode)` |
| `src/music/mode.ts` | 删 6 个判定（`packOfAlbum` / `modeOfEntry` / `isEntryAllowedInMode` / `filterByMode` / `hasTracksInMode` / `firstAllowedInMode`）；留 `MusicMode` 与 `effectiveSourceOverrides` |
| `selection.ts` / `presetView.ts` / `songConflicts.ts` | 去掉 `albums + mode` 参数（17 处传参消失） |
| 面板 | `ListPanel` / `ConfigPanel` / `PresetSection` / `SingleTrackSection` / `GamePanel` / `PlayerPanel` / `UpcomingFan` 自取当前数据集，`musicMode` 传参全部消失 |
| `src/net/*` | **协议 v4**：`DataHashes {originals, otomads}`，`hello` / `PeerInfo` 带两个哈希，`dataHashMismatch` 两个都比 |

**为什么协议要动**：`docs/packs-audio-v1.md` §6 的保证是"两端数据不同 → **握手期**就拒"。数据分成两份之后，
只比一个哈希会让"一方缺 otomads 数据"拖到**切模式时**才炸（C2），而保留总哈希（C1）又让"分离"在联机口径上名义化。
所以两个哈希都交换、都校验（C3）；代价是 v3 客户端直接拒绝加入（无兼容层，收益不值那两条握手路径）。

**放弃与缓解**：多曲包扩展性（第三个曲包要再加一套数据集）。缓解：`datasets` 写成**按模式 id 的表**
而不是两个字段，将来加包 = 加一个 key + 一份生成物 +（若哈希仍要覆盖它）一次协议字段扩展。

**验证**：`pnpm data:check` 无漂移 ✓、`pnpm data:validate` 通过 ✓、`uv run pytest` **84 passed** ✓、
`pnpm typecheck` ✓、`pnpm test` **548 passed**（274 条 × chromium + firefox）✓、
`pnpm e2e` **74 passed + 1 skipped**（chromium 33 / firefox 32+1 / mobile 9）✓ ——
其中新增 `e2e/multiplayer.spec.ts` 的**握手期拒绝**用例（访客页被注入"另一份"哈希 → 主机拒、
大厅显示原因、主机不把它算进参与者），两个桌面引擎都跑 ✓。

**回滚**：C 同时动了生成物与协议版本，回滚要两件一起退（`public/data` + `PROTOCOL_VERSION`）；
全程在 `enhanced-otomad-mode` 分支，未确认不合并 `main`。

---

## D113 音源层按音乐模式拆（每个模式一份源注册表）

**需求**（用户）：把音源也拆开 —— 契约草案 `docs/sources-separation-v1.md` §8 的 6 条**全部按推荐采纳**
（生成物位置 / 源表随数据集 / 镜像表不挪 / 音MAD 下本地源可关但给提示 / 老存档归原曲 / 保留本地提示行）。

**为什么**：四个音源挤在一张注册表里 —— 三个远程镜像只服务原曲，本地曲库只服务音MAD。后果有两个：
① 音MAD 模式下**照样下载**那三份镜像表（149 KB + 97 KB + 87.7 KB ≈ **334 KB**，一条也用不上）；
② 因为本地源默认关、而音MAD 的地址只能从本地 manifest 解析，于是有了 `effectiveSourceOverrides()` 这个
**运行期补丁**（音MAD 下强制打开本地源）+ 设置页里同一条规则的**第二份副本**（`forced`：显示为开且不可点）。

**做法**：

| 位置 | 改动 |
|---|---|
| `data/sources/originals.toml` / `otomads.toml` | 注册表按模式拆（原曲 = 三个镜像；音MAD = 只有本地源，`order = 1`、`enabled = true`）；`sources.toml` 删除 |
| `build.py` | `build_sources(mode)`：生成物 `public/data/sources.json` + `public/data/otomads/sources.json`（**随数据集**）；三份镜像表仍在 `public/data/sources/`（内容全是原曲，不挪） |
| `validate.py` | `check_source_registry()` 按模式跑 + 契约 §5 的四条不变量：每模式至少一个默认启用的源 / otomads 恰好一个 local 且默认开 / originals 不得含 local / 两表 id 不冲突 |
| `src/store/sources.ts`（新） | 用户开关与回退顺序按模式分键：`tmc.v1.sources.originals`（老键 `tmc.v1.sources` 迁入）+ `.otomads`；`effectiveOrder` 从 session 搬来 |
| `src/data/{types,load}.ts` | `ModeDataset.sources`；`SharedData` 只剩 `cardSets` |
| `src/music/mode.ts` | **删 `effectiveSourceOverrides()`**（连同它的两条用例） |
| `SourceSection` | 用 `dataset.sources`；删 `forced`；本地地址栏只在有本地源的模式（音MAD）出现；一个启用的源都没有时给提示（用户可以自己关，不拦着） |

**为什么删补丁而不是留**：留着它会在用户明确关掉本地源时**照样强制打开**（与新存档分键互相打架），
并把"某模式的源没配对"这种配置错误掩盖掉；删掉之后用**构建期校验**顶上 —— 配错了 `pnpm data:validate` 就红，
而不是等到浏览器里"音MAD 没声音"（那是 D52 当年加补丁要防的症状，现在由不变量守）。

**不进哈希**（写进契约 §6）：源注册表与表 URL **不进** `contentHash` / `dataHash` ——
本地 manifest 的地址每台机器不同（`?localmusic=`），进哈希会让两台各自起助手的机器无法联机。

**验证**：`pnpm data:check` 无漂移 ✓、`pnpm data:validate` 通过 ✓、`uv run pytest` **84 passed** ✓、
`pnpm typecheck` ✓、`pnpm test` **550 passed**（275 条 × chromium + firefox）✓、
`pnpm e2e` **76 passed + 1 skipped**（chromium 34 / firefox 33+1 / mobile 9）✓ ——
新增"**音MAD 模式下不再下载原曲镜像表**"（原曲侧有请求、切到音MAD 后一次都没有）；
`pnpm e2e:perf` 单独跑 ✓。

---

## D114 音MAD 侧可以有自己的卡面（角色文件加可选 `card` + 一套本地图集）

**需求**（用户）：音MAD 模式也加卡面选项，**参考 `characters.toml`**。用户裁定：做 **A**（音MAD 角色自带的
`card` 字段）+ **B**（新增一套音MAD 图集），素材**先不管**、先把结构做通。

**做法**：

| 位置 | 改动 |
|---|---|
| `data/packs/otomads/<key>.toml` | 新增**可选** `card = ["<文件名>", …]`，写法与 `data/characters/*.toml` 完全一致；缺省沿用共享身份的卡面 |
| `tools/src/tmc/packs.py` | 角色文件允许的顶层键加 `card`；`load_packs()` 返回四元组 `(packs, albums, tracks, cards)`；`card` 非"至少一项的字符串数组"直接报错 |
| `tools/src/tmc/build.py` | `build_characters(mode, …, pack_cards)`：音MAD 侧用覆盖值（**只有写了 `card` 的角色**才变），原曲侧不变 |
| `tools/src/tmc/validate.py` | `check_datasets()` 的"跨模式身份一致"**只管 `name`/`order`/`searchNames``**；卡面是唯一例外：覆盖过的角色本来就该不同，没覆盖的仍要求一致；另加"覆盖没生效""覆盖指向未知角色"两条守卫。`check_card_sets()` 允许 `local_only = true` 的本地图集（没有远程 origin，但**不许**又写 origins） |
| `data/card-sets.toml` | 新增第 **7** 套：`id = "otomads"`、`dir = "cards-otomads"`、`local_only = true`、`origins = []` |
| `src/data/{types,load}.ts` | `CardSetRecord.localOnly`；校验放行"本地图集没有 origin" |
| `src/ui/components/CharacterCard.tsx` | 本地图集只用 `localPrefix`（否则 origins 为空会取不到 URL）；其余图集行为不变 |
| `src/ui/panels/config/` | 图集菜单多一行（含本地图集的说明文案：素材自己放进 `public/cards-otomads/`，文件名与曲包里的 `card = […]` 一致） |

**为什么卡面可以例外而其它身份字段不行**：卡面是**呈现**（同一角色换一套图），
而 `name`/`order`/`searchNames` 是**身份**（两处不一致会出现"同一个角色两个名字/两个顺序"）。
`card` 走的是"数据集内的字段"，所以覆盖只影响音MAD 那一份生成物，不触碰共享真源。

**素材还没放**：真实数据里**暂时没有任何角色声明 `card`**（那会让卡面指向不存在的文件），
所以这次是"结构就绪"：加载、构建、校验、URL 解析、菜单都已跑通，由 tools 测试守着；
将来把音MAD 卡面放进 `public/cards-otomads/` 并在对应角色文件里写 `card = [...]` 即可。
**没做**的还有"图集选择按模式分键"（用户当时没选）：目前仍是全局一个 `cardCollection`，
所以音MAD 图集要靠用户在设置页手动选中（另一条路是把音MAD 的默认图集指到它，另立条目）。

**验证**：`pnpm data:check` 无漂移 ✓、`pnpm data:validate` 通过 ✓、`uv run pytest` **89 passed**（+5：
角色文件 `card` 的读取与三类非法形态、`check_datasets` 的卡面例外）✓、`pnpm typecheck` ✓、
`pnpm test` **550 passed**（275 条 × chromium + firefox）✓、
`pnpm e2e`（图集菜单 6 → **7** 套的断言在两个引擎上都跑）✓。

---

## D115 单曲手选带上作者（音MAD 手选刷新即丢）

**现象**：音MAD 单曲模式下给某个角色手选一首 → **刷新后手选静默消失**，播放页那一行也不再显示作者。
（仓库外的 `REVIEW-enhanced-otomad-mode.md` B1；那批数据 86 条曲目里 **85** 条带作者 ✓。）

**根因**：`MusicEntry` 的第 4 位（**可选作者**，D94 引入）没被手选存档的校验认下来 ——
`src/store/single.ts` 的 `isEntry()` 要求 `raw.length === 3` ✗，而设置页存进去的是 4 元组 ✓
（`chosen` 直接来自数据集的曲目 ✓）→ 读档时 `validateSingleTrack()` **逐项丢弃** ✗，不报错、不留痕 ✗。
后一条同样致命：重建条目时写的是 `[0, 1, 2]` ✗，即便放行，作者也会被抹掉 ✗ →
`PlayerPanel.creditLine()` 对 pin 的曲目退回专辑名（"显示作者"对**手选过的**曲目失效 ✗）。

**做法**（`src/store/single.ts`）：

| 位置 | 改动 |
|---|---|
| `isEntry()` | 接受 **3–5** 元（第 4 位是可作者、必须是字符串；第 5 位是 `authors` 字符串数组 —— D135 起跟着存档走） |
| `copyEntry()`（新） | 重建时**保留第 4 位** ✓（3 元仍只留 3 位 ✓）；原来那句 `value[2] as Extra` 随之删掉（第 3 位收窄后本来就是 `Extra` ✓） |

**测试**（原来这条没人守：`single.test.ts` / `modeScope.test.ts` 只走过 3 元组 ✗）：
先写用例后改实现 —— 新增"4 元手选落盘 → 读回完整"1 条（走 `tmc.v1.single-track.otomads` 那把 ✓，
即用户真正踩到的路径 ✓），并把"损坏的存档逐项丢弃"扩成同时守两端 ✓
（合法 4 元保留 ✓、`["a","b","角色曲",7]` 仍丢 ✓）。

**验证**：改前该文件 **2 failed** ✓（复现 B1 ✓）→ 改后 **7 passed** ✓；
`pnpm typecheck` ✓、`pnpm test` **552 passed**（276 条 × chromium + firefox ✓，比 D114 的 550 多 2 ✓）、
`pnpm data:check` 无漂移 ✓（本次不碰 `data/` 与生成物 ✓）、
`pnpm e2e` **76 passed + 1 skipped** ✓（chromium / firefox / mobile ✓；跑前先起了本地曲库助手 8011 ✓ ——
第一次没起，4 条取 `/manifest.json` 的用例红灯 ✗，正是 D105 记过的**环境**问题 ✓，起助手后复跑全绿 ✓）。

---

## D116 列表页点播不再跨模式 / 不再盖住后来的手选（B2）

**现象**（两个后果，同一个根因）：① 在原曲模式下从列表页点播过一首 → 切到音MAD 模式，
那个角色**播不出声**，播放页报「所有已启用的音源都取不到」✗；② 之后在设置页给**同一个角色**重新手选，
播放器也**仍按旧的那首**解析 ✗（手选看着像没生效）。
（仓库外的 `REVIEW-enhanced-otomad-mode.md` B2。）

**根因**：`session.entryRequest` 只在**列表页点播**时写入（D67），却**没有任何地方清它** ✗ ——
字段注释写的是"一次性的点播意图"✗，实际是"一直生效"（刷新才清）✗。而播放器的 `entry` 每次都从
`pinned` 算出来 ✓，`AppShell` 又把请求并进 `pinned`（点播优先）✓ ⇒ 这条请求会**永久压住**该角色的手选 ✓。
C 把两模式的数据集拆开之后（D112）后果①从"看不见"变成"看得见的错误"：旧请求存的是**原曲**数据集的条目 ✗，
播放器拿着它去音MAD 的音源里解析，必然全落空 ✗。

**做法**：

| 位置 | 改动 |
|---|---|
| `session.setMusicMode()` | 模式**真的变了**才清 `entryRequest` ✓（同值再设一次不清 —— 那是用户刚点的那一首 ✓） |
| `session.clearEntryRequest(key?)`（新） | 清点播的**唯一入口** ✓；给 `key` 只清这一个角色 ✓，省略 = 无条件清 ✓ |
| `single.setPin()` / `single.toggleCharacter()` | 设置页动了某个角色就 `clearEntryRequest(key)` ✓（手选 / 禁用都是"用户重新配置了这个角色"✓）；**只清这一个角色** ✓ |
| `single.ts` 的 `dropEntryRequest()`（新，一处注释） | 说明为什么是"同一个角色"而不是无条件清 ✓ |

**为什么只清同一个角色**：`entry` 完全由 `pinned` 派生 ⇒ 清了请求就等于把该角色交还给"手选 / 种子抽"✗，
正在播的那一首会被换掉 ✗。设置页动 A 时顺手清掉 B 的点播，就会把正在播的 B 换一首 ✗ ——
所以只清被动的那个角色 ✓（手选 / 禁用的**正是**它，语义也对得上 ✓）。

**为什么不做"起播即消费"**（review 建议里的第三个选项）：同样是上面那条 —— 消费掉请求后
`entry` 会退回"种子抽的那一首"，多数情况下与点播的那首不同 ✗，正在播的曲子会立刻被换掉 ✗。
要做"消费一次"就得让**点播的那首**另外有个落脚点（队列的 per-character 记忆或播过的曲目），
那是另一个改动，不塞进这次修复 ✓。

**测试**（原来这两个文件都没写过 `entryRequest` ✗）：先写用例后改实现 ——
`modeScope.test.ts` 新增 2 条（切模式清掉 ✓、同模式重设不清 ✓），
`single.test.ts` 新增 1 条（手选 / 禁用**同一个角色**清掉 ✓、动别的角色**不清** ✓，即"不打断正在播的那首"✓）。
两个文件的 `beforeEach` 补上 `entryRequest: null` ✓（用例之间不串 ✓）。

**验证**：改前这两个文件 **2 failed** ✓（复现 B2 ✓）→ 改后 **15 passed** ✓；
`pnpm typecheck` ✓、`pnpm test` **558 passed**（279 条 × chromium + firefox ✓，比 D115 的 552 多 6 ✓）、
`pnpm data:check` 无漂移 ✓（本次不碰 `data/` 与生成物 ✓）、
`pnpm e2e` **76 passed + 1 skipped** ✓（chromium / firefox / mobile ✓；跑前先起了本地曲库助手 8011 ✓）、
`uv run pytest` **89 passed** ✓（只改前端 store，tools 侧不受影响 ✓）。

---

## D117 工具侧：删掉审查点名的死代码与三处硬编码（R1 / R6 / R7③ / R7④）

**来源**：仓库外的 `REVIEW-enhanced-otomad-mode.md` 第二节（R1 / R6）与第七节（R7③ / R7④）。
用户裁定"修"，工具侧这四条一次落地（仓库外文件不在版本库里，本条是它的落地记录）。

| # | 现象 | 做法 |
|---|---|---|
| R1 | `packs.apply_tracks()` **零调用** ✗（`dd9e419` 起生成物改走 `build._pack_music`），而 `dd9e419` 的提交信息与 D112 都写着"删 `apply_tracks()`" —— 代码与记录矛盾 ✗ | 删掉整个函数 ✓；`packs.py` / `build.py` 里还在提它的两处注释一并改掉 ✓ |
| R6 | `public/data/packs.json` **零消费** ✗（`src/` / `e2e/` 里没有任何地方 fetch 它） | **停生成**：删 `build_packs()` 与那行 outputs ✓，并把已提交的 `public/data/packs.json` 从库里删掉 ✓ |
| R7③ | `check_packs()` 的 `album["pack"] in album_packs` **恒真** ✗（`albums` 参数本来就是 `pack_albums`） | 去掉恒真的那一半 ✓，留下真正会红的那条"曲包专辑指向未注册的曲包" ✓ |
| R7④ | 三个镜像 id 在 `build.py` 与 `validate.py` 的**三处**硬编码 ✗（新加镜像要改三处） | 新增 `build.mirror_source_ids()`：从 `data/sources/originals.toml` 的 `kind = "remote"` 派生 ✓；构建 / 校验（3 处）/ 抽查四处读取点全部改用它 ✓ |

**为什么 R6 选"停生成"而不是"文档注明仅信息用途"**：它既没有消费者、也没有对外承诺
（README、契约、部署脚本里都没有它的用途 ✗），留一份"仅供观看"的生成物等于把死输出固化进仓库 ✗。
曲包信息本身还在真源 `data/packs/otomads.toml` 与 `otomads/albums.json` 里（`pack` 字段逐条都在 ✓），
前端需要的部分一条没少 ✓。`docs/otomads-separation-v1.md` §2 把它列进共享项是当时的记录，
按本条裁定不再生成 ✓ —— 那份文件是契约草案的历史记录，不回改 ✓。

**R7④ 顺带收掉的三件事**：

1. `check_source_registry()` 原来自己 `import tomllib` 再读一遍注册表 ✗ → 改用 `build.load_registry()` ✓
   （注册表只剩一个读者 ✓）；
2. 镜像 id 变成派生之后，注册表里一个写错的 `table_url` 会让 `check_sources()` 撞上不存在的文件、
   整套校验以 traceback 收场 ✗ → 新增 `_read_mirror()`：**缺表返回 None 并跳过** ✓
   （缺表这件事由 `check_source_registry()` 正常报错 ✓）；
3. `tmc.check_urls` 的抽查清单也从这个函数取 ✓；`tmc.migrate` 的 `SOURCES` **故意不动** ✓ ——
   它是迁移期的历史清单（配 `LEGACY_SOURCES` 指上游旧文件名），跟着注册表走反而错 ✓，就地加了注释 ✓。

**测试**（`uv run pytest`，仓库原有框架）：新增 `tools/tests/test_build.py` 3 条 ——
生成物清单**逐项**等于契约（R6 改前会红 ✓：`packs.json` 在里面 ✗）、
曲包曲目只进 otomads 数据集（R1 的守卫 ✓）、镜像 id 跟着注册表走 ✓
（合成注册表里加一个 `kind = "remote"`，派生结果就多一个 id ✓ —— 写死的清单不会 ✓）；
`test_rules_and_data.py` 新增 1 条守住 R7③ 剩下的那条检查 ✓（合法通过 ✓、一个字母之差报错 ✓）。

**验证**：`uv run pytest` **93 passed** ✓（89 → +4 ✓）、`pnpm data:check` 无漂移 ✓
（生成物只少一份 `packs.json` ✓）、`pnpm data:validate` 校验通过 ✓ ——
派生出来的仍是那三张表、各 **651** 条 ✓，报告的指纹与改动前一致 ✓。

---

## D118 Web 侧：删掉审查点名的死代码、空转依赖与无效 `setState`（R2–R5 / R7①②⑤）

**来源**：同一条审查的第二节 R2–R5 与第七节 R7① / R7② / R7⑤（用户裁定"修"）。
与 D117 是同一轮，本条是前端那半边（R2 / R3 / R7① / R7② / R7⑤ 在同一批文件里，一并落下）。

| # | 位置 | 现象 → 做法 |
|---|---|---|
| R2 | `src/data/load.ts` | "缺数据集"的断言循环**永不触发** ✗（`Promise.all` 解构时缺一份就已经抛了）→ 删 ✓；随之空出来的 `MUSIC_MODES` import 也删 ✓ |
| R3 | `load.ts` / `PlayerPanel.tsx` | `loadDataset` 上方**两行重复 JSDoc**（旧的"载入全部运行时数据"）✗ 与指向已删字段的**悬空注释** ✗ → 删 ✓；同一文件里另外三处同类残留一并并好 ✓（两条 react import 拆成两行 ✗、`UpcomingFan` 引两次 ✗、卡面尺寸注释重复一遍 ✗ —— 顺带把注释里的 `ResizeObserver` 改成实际用的 `resize` 监听 ✓） |
| R4 | `src/net/useNet.ts` + `engines.ts` | `join()` 给**客户端**引擎传 `getConfig`，而 `createClientEngine` 从不读它 ✗ → 删参数 ✓；并把依赖**类型**分成 `EngineDeps` / `HostEngineDeps` ✓（`getConfig` 只属于主机 ✓）—— 再写错就是编译错误 ✓ |
| R5 | `src/net/useNet.ts` | `confirmStart` 里的 `useGame.setState({ game: useGame.getState().game })` 是**同一引用** ✗（不重渲染、不改摘要，只多一次通知 ✗）→ 删 ✓；广播本来就由 `game.start()` 写 store 触发 ✓ |
| R7① | `src/ui/shell/AppShell.tsx` | `join("|") / split("|")` 造依赖签名 ✗ → `JSON.stringify` ✓，effect 里直接用那份 memo 出来的数组 ✓ |
| R7② | `src/music/useSources.ts` | `JSON.stringify → JSON.parse` 往返只为稳定依赖 ✗ → 依赖仍用内容签名 ✓，effect 里直接用那份对象 ✓ |
| R7⑤ | `src/store/modeScope.test.ts` | 7 处 `as never` 重置状态 ✗ → fixture 上类型（`PresetState`，本来就从 `music/selection` 导出 ✓），`as never` 全删 ✓ |

**测试**（仓库原有的 vitest **浏览器模式**，chromium + firefox ✓）——都是"先加用例"：

- `src/data/load.test.ts` +1：缺 `otomads/index.json` → `DataLoadError` 指名那个 URL ✓
  （R2 删掉的循环想守的就是这件事 ✓，现在由**真会走到**的那条路径守 ✓）；
- `src/net/useNet.test.tsx` +1：客户端发 `confirmStart` → 主机开赛（`countdown` ✓）且**新快照照常广播** ✓
  （R5 删掉那句之后广播仍在 ✓）；
- 新增 `src/music/useSources.test.ts` 1 条：覆盖表内容变了才重新载入 ✓、
  换一个**同内容的新对象不空转** ✓（R7② 的依赖签名语义 ✓）。

**验证**：`pnpm typecheck` ✓、`pnpm test` **564 passed**（282 条 × chromium + firefox ✓，比 D116 的 558 多 6 = 新增 3 条 × 两引擎 ✓）、
`pnpm e2e` **76 passed + 1 skipped** ✓（chromium / firefox / mobile ✓；跑前起了本地曲库助手 8011 ✓，跑完已停掉 ✓）、
`uv run pytest` **93 passed** ✓（同轮的工具侧改动见 D117 ✓）。

---

## D119 联机时音乐模式由主机决定（客户端单选禁用；**不退房还原**）

**现象**：加入房间之后，设置页的音乐模式单选**仍然可点** ✗，但主机每份快照都会重下发 config（D104）⇒
客户端手切之后过一会儿就被改回去，看着像"点了没反应" ✗。（仓库外的 `REVIEW-enhanced-otomad-mode.md` O1。）

**根因**：`adoptHostConfig()` 一律采用主机的 `musicMode` ✓（D104 刻意的），可**界面没跟着这条规矩** ✗ ——
权威端只有一个（主机），客户端那边却留着一个可写的控件 ✗。

**做法**（纯 UI + i18n 三处小改，`session.ts` / `useNet.ts` **一行没动** ✓）：

| 位置 | 改动 |
|---|---|
| `SourceSection.tsx` | `const ownedByHost = useNet((slice) => slice.role === "client")` ✓ —— 用**选择器**而不是 `useNet()` 整个 store ✓（组件 `memo` 过：聊天 / 参与者一变不该重渲染 ✓） |
| 同上（两个单选） | `Radio disabled={ownedByHost}` ✓；`RadioGroup` 的 `onChange` 再加一句 guard ✓（双保险 ✓） |
| 同上（提示行） | 房内客户端把 `MusicModeHint` 换成新文案 `MusicModeHostControlled` ✓ + `data-testid="music-mode-host-controlled"` ✓；正常态给 `music-mode-hint` ✓（两个状态各有一个可断言的落点 ✓） |
| `i18n/localization.ts` | 新增 `MusicModeHostControlled`：en「Set by the host while you are in a room.」/ zh「联机时由主机决定（当前房间使用主机的音乐模式）。」✓ |

**为什么"禁用"而不是"只提示"**（审查给的两个选项）：只提示的话控件仍可点 ✗，点完仍会被改回去 ✗ ——
那个"点了没反应"的观感恰恰是这条要修的东西 ✓。**主机自己那页照旧可点** ✓（模式由权威端定，客户端跟着走 ✓）。

**为什么不退房还原**（用户裁定"没必要" ✗）：`adoptHostConfig` 走 `setMusicMode` ⇒ 主机的模式**会落盘**成本机默认 ✗，
退房后仍留在主机那个模式 ✓。要做"跟随但不落盘"就得给 session 再加一层 `followMusicMode` 之类的东西 ✗，
用户不接受这份复杂度 ✓ —— 这条代价（本机默认模式被主机的模式覆盖）**已知且接受** ✓，沿用 D104 的"一律采用" ✓。
`leave()` 保持原样 ✓（不还原模式 ✓）。

**测试**（仓库原有的 vitest **浏览器模式**，chromium + firefox ✓；先写用例后改实现 ✓）：
`src/ui/panels/config/ConfigPanel.test.tsx` **+2** —— ①"房内客户端"：进房**前**可点 ✓ → 进房后两个单选
`disabled` ✓、提示换成主机口径 ✓，并分别验两道防线（点 label 不落到 input ✓；把 `disabled` 摘掉之后
`onChange` 里那句 guard 仍拦得住 ✓）；②"没进房或自己是主机"：仍可点 ✓、点得动（模式真的切过去 ✓）、
提示回到 `MusicModeHint` ✓。另 `e2e/multiplayer.spec.ts` **+1**：真实房间（同浏览器双标签页 + 本地传输）里
主机那页可点 ✓、访客那页两个单选 `disabled` ✓ 且主机口径的提示可见 ✓。

**改前实测**：两条新用例 **4 failed**（2 条 × chromium + firefox ✓）——失败点就是 `expected false to be true`
（`disabled` 还没加 ✗）与"找不到 `music-mode-hint`" ✗；再把 `onChange` 里那句 guard 临时停掉复跑 →
"房内客户端"这条 **2 failed** ✓（`expected 'otomads' to be 'originals'` ✓），说明**第二道防线真的被测到** ✓。

**踩到的坑（已修）**：`setMusicMode` 是**落盘**的 ✗，而浏览器模式下各测试文件**共用同一个 localStorage** ✗ ——
新用例切到音MAD 之后不还原，后面的 `App.test.tsx` 冒烟就从音MAD 起步 → **3 failed** ✗
（列表里没有霧雨魔理沙、预设统计不对、曲子解析不出地址 ✓）。该文件本来就以 `localStorage.clear()` 起步 ✓，
这次补一个 `afterEach(() => localStorage.clear())` ✓，跑完还原成"空存档" ✓（实测两个文件连跑 **14 passed** ✓）。

**验证**：`pnpm typecheck` ✓、
`pnpm test` **568 passed**（284 条 × chromium + firefox ✓，比 D118 的 564 多 4 = 新增 2 条 × 两引擎 ✓）、
`pnpm e2e` **78 passed + 1 skipped** ✓（chromium / firefox / mobile ✓，比 D118 的 76 多 2 = 新增 1 条 × 两个桌面引擎 ✓
—— mobile project 只跑 `mobile.spec.ts` ✓；跑前起了本地曲库助手 8011 ✓、跑完已停掉 ✓；新用例单独复跑 **2 passed** ✓）、
`pnpm data:check` 无漂移 ✓（不碰数据与生成物 ✓）、
`uv run pytest` **93 passed** ✓（tools 一个字没动 ✓）。

---

## D120 逐曲响度表跟着同一份数据根（O3）

**现象**：播放层按写死的 `./data/loudness.json` 取逐曲音量均衡表 ✗ —— 那是**相对文档地址**解析的 ✗，
而所有数据集都走 `loadDataBundle(base)` ✓。默认 `base` 下两者恰好等价 ✓，所以一直没露馅 ✗；
一旦 base 不是默认值（子目录部署、文档路径比应用根深），表取不到 ✗ → `catch` 把每个系数吞成 1 ✗，
音MAD 侧响度不均、而且是**静默**降级 ✗。（仓库外的 `REVIEW-enhanced-otomad-mode.md` O3。）

**根因**：数据放在哪儿有**两个真源** ✗ —— loader 一个答案、播放层另一个 ✗。

**做法**：

| 位置 | 改动 |
|---|---|
| `data/types.ts` | `SharedData` 增 `loudnessUrl: string` ✓（注释写明"与数据集**同一个** base"✓） |
| `data/load.ts` | `{ cardSets, loudnessUrl: url("loudness.json") }` ✓ —— 用的是**同一个** `url()` ✓ |
| `audio/usePlayer.ts` | `PlayerInputs` 增必填 `loudnessUrl` ✓；effect 改成 `fetch(inputs.loudnessUrl, { cache: "no-cache" })` ✓、依赖带上它 ✓（根变了会重新取 ✓） |
| `ui/shell/AppShell.tsx` | 调用点传 `bundle.shared.loudnessUrl` ✓（**只加 2 行** ✓，为同轮 O4 在同一个文件另一处改动的区域让路 ✓） |
| `ui/panels/ListPanel.test.tsx` | 手搓 bundle 的 `shared: { sources: [], cardSets: [] }` ✗ → `{ cardSets: [], loudnessUrl: "/data/loudness.json" }` ✓（过期的 `sources` 键顺手清掉 ✓） |
| **保留** | 取不到表时的 `catch` ✓ —— 没跑过测量脚本的项目本来就该按原音量播 ✓ |

**测试**（仓库原有的 vitest **浏览器模式** chromium + firefox ✓；先写用例后改实现 ✓）：
`data/load.test.ts` +1（`loadDataBundle("/sub/dir")` → `shared.loudnessUrl === "/sub/dir/loudness.json"` ✓，
顺带钉住结尾斜杠归一化成同一个地址 ✓）；`audio/usePlayer.test.tsx` +1（把表放到 `/sub/dir` 下，
断言播放层**正好**取这个地址 ✓、且系数真的落到 `audio.volume` ✓ —— 原来的用例只读表、不渲染 hook ✗，
证不了"播放层真的用了这个地址" ✗）；原来那条"真表键形状"的用例改成按 `bundle.shared.loudnessUrl` 取表 ✓，
标题也订正成它真正断言的事 ✓。

**改前 / 改后实测**：先加用例、不改实现（chromium）→ **3 failed | 25 passed** ✓
（`expected undefined to be '/sub/dir/loudness.json'` ✓ / `expected 1 to be 0.5` ✓ /
`Cannot convert undefined or null to object` ✓）→ 改后同三个文件 **62 passed**（31 × 两引擎 ✓，基线 58 ✓）；
`src/App.test.tsx` 另跑 **8 passed** ✓（这条路径经过 `AppShell` ✓）。

**验证**：`npx tsc --noEmit` 无诊断 ✓、
`pnpm test` **572 passed**（286 条 × chromium + firefox ✓，比 D119 的 568 多 4 = 新增 2 条 × 两引擎 ✓）、
`pnpm data:check` 无漂移 ✓（不碰数据与生成物 ✓）、`uv run pytest` **93 passed** ✓（tools 一个字没动 ✓）。
**没跑 e2e** ✓：§6.6 对 O3 只要求 typecheck + 单测 ✓（改的是取数地址，界面 / 联机都没碰 ✓）。

**坑（记一笔）**：`ListPanel.test.tsx` 那份手搓 bundle 是 `as unknown as DataBundle` ✗ ——
`tsc` **抓不到**它缺新字段 ✗，只能按"全仓库有几处手搓 `shared`"逐个 grep 核对 ✓（只有这一处 ✓）。

---

## D121 本地曲库地址输入框不再复制一份真值（O2）

**现象**：设置页"本地曲库地址"输入框显示的是**挂载时复制的那一份** ✗，按"应用"又把**那一份**写回 store ✗ ——
只要别处改了 `localMusicUrl`，输入框就停在旧值上 ✗，点"应用"还会把用户没打过的值写回去 ✗。
（今天能触发的路径很窄 ✓ —— 同一标签页内只有这个输入框会写 ✓、`?localmusic=` 只在 store 初始化时读一次 ✓ ——
所以这是**防御性**修复 ✓。仓库外的 `REVIEW-enhanced-otomad-mode.md` O2；本条与 D120 / D122 是同轮
"三个 worktree 并行实现、主会话串行落库"里的第二条 ✓，分工见该文件 §五。）

**根因**：一个值有**两份真值 / 两个写者** ✗ —— store 一份、组件挂载时复制一份 ✗。

**做法**（§6.3 的推荐方案：草稿只为"正在编辑"而存在 ✓）：

| 位置 | 改动 |
|---|---|
| `SourceSection.tsx` | `useState(localMusicUrl)` ✗ → `useState<string \| null>(null)` ✓（`null` = 没在编辑）；`const urlValue = draftUrl ?? localMusicUrl` ✓（没编辑时永远跟着 store 走 ✓） |
| 同上 | 输入框 `value={urlValue}` ✓；`onChange` 仍只写草稿 ✓（一输入就 dirty ✓） |
| 同上 | "应用" = `setLocalMusicUrl(urlValue.trim())` + `setDraftUrl(null)` ✓（写完回到"跟随 store" ✓；**结构上不可能再漂移** ✓） |
| **不采用**（§6.3 的备选）✗ | `useEffect` / 渲染期同步草稿 —— 外部变更会**吞掉正在输入的内容** ✗ |

**测试**（仓库原有的 vitest **浏览器模式** chromium + firefox ✓；先写用例后改实现 ✓）：
`src/ui/panels/config/ConfigPanel.test.tsx` **+3**（并入该文件，§6.3 给的二选一 ✓，复用它的
`expand` / `click` / `toggle` ✓）—— ①输入（带空格）→ 应用 → 输入框 = store（trim 后 ✓）且**继续跟随** store ✓；
②**挂载前** store 里就有值（`?localmusic=` 的形态 ✓）→ 直接回显 ✓、之后外部写入也跟上 ✓；
③**正在输入时**外部写 store → 编辑中的内容不被吞 ✓、store 也没被输入框反写 ✓（这条守的正是**被否掉的备选方案** ✓）。
顺带两处 fixture/helper：`localMusicUrl: ""` 补进 `beforeEach` ✓（`useSession` 是**模块级** store、文件内用例共享 ✗ ——
不补会让红测报出误导性的 `expected '127.0.0.1:9000' to be ''` ✗）；新增 `type()` ✓（走 `HTMLInputElement.prototype`
的 value setter + 派发真 `input` 事件 ✓ —— React 追踪 value，直接赋 `element.value` **不触发** `onChange` ✗，
仓库原来没有这个 helper ✗）。

**改前 / 改后实测**：把实现退回 `9b9a280`、只留最终版用例（chromium）→ **2 failed | 11 passed** ✓
（`expected '  127.0.0.1:9000  ' to be '127.0.0.1:9000'` ✓ —— 点完"应用"输入框还显示没 trim 的草稿 ✗；
`expected '127.0.0.1:8080' to be '127.0.0.1:9000'` ✓ —— 外部写入被忽略 ✗）→ 改后该文件 chromium **13 passed** ✓、
两引擎 **26 passed** ✓（13 × 2 ✓）。**反证** ✓：把"应用后清草稿"换成"留一份等值草稿"→ 用例①的**后半段**单独红 ✓
（`expected '127.0.0.1:9000' to be '127.0.0.1:9999'` ✓，1 failed | 12 passed ✓）—— 修复的两半各自承重 ✓。

**验证**：`npx tsc --noEmit` 无诊断 ✓、
`pnpm test` **578 passed**（289 条 × chromium + firefox ✓，比 D120 的 572 多 6 = 新增 3 条 × 两引擎 ✓）、
`pnpm e2e` **78 passed + 1 skipped** ✓（chromium / firefox / mobile ✓，与 D119 的 78 + 1 持平 ✓ ——
本条**没有**新增 e2e 用例 ✓；跑前起了本地曲库助手 8011 ✓、跑完已停掉 ✓）、
`pnpm data:check` 无漂移 ✓（不碰数据与生成物 ✓）、`uv run pytest` **93 passed** ✓（tools 一个字没动 ✓）。

**明确没做** ✗（§6.3 划的范围）：`e2e/smoke.spec.ts` 那条 `local-music-url` 用例**一个字没改** ✓ ——
它两条路径按构造仍成立 ✓（默认同源 → store 为 `""` → 输入框空、只显示 placeholder ✓；
`?localmusic=127.0.0.1:8011` → store 在挂载前就被 query 初始化 → 直接回显 ✓，这条挂载路径现在也有用例②钉着 ✓）。
另有一处**非回归**的行为没动 ✗：打了字没应用就切模式（输入框卸载）再切回来，草稿会重新出现 ✓ ——
改前也是同样行为 ✓，不属本条范围 ✓。

---

## D122 数据缩水时清理音源覆盖与单曲手选（O4）

**现象**：用户自己的音源开关 / 重排会**比它所属的源活得更久** ✗ —— 把某个镜像从注册表里拿掉，
它的条目**永久留在 localStorage** ✗；那个 id 将来回到注册表，会**带着旧开关 / 旧位置悄悄复活** ✗，
像用户刚亲手设过一样 ✗。而且**两条路径行为不一致** ✗：`move()` 重写整张表、顺手丢掉死条目 ✓，
`toggle()` 却用展开把死 id 续下来 ✗。单曲那半边同样 ✗：`single.prune()` **写过、测过，却全仓库零调用** ✗
—— 角色从数据集里消失后，它的手选 / 禁用状态留在盘上 ✗。
（仓库外的 `REVIEW-enhanced-otomad-mode.md` O4；本条是本轮"三个 worktree 并行实现、主会话串行落库"的第三条 ✓。）

**订正审查里的一句描述** ✗：§四 说"UI 编号可能跳号"**不成立** ✓ —— `effectiveOrder()` **只遍历注册表 id** ✓，
死条目既占不到编号、也挤不掉别人 ✓。新用例把这条观察**钉成回归** ✓，它在改前也是绿的 ✓（正是订正的证据 ✓）。

**做法**（按 §6.5 ✓）：

| 位置 | 改动 |
|---|---|
| `store/sources.ts` | 增 `prune(knownIds)` ✓（照 `single.prune` 的写法：只留注册表里还有的 id ✓，`set` + `handle.save` ✓）；`SourceSlice` 接口同步加一行 ✓ |
| `ui/shell/AppShell.tsx` | 数据集就位处加一个 effect ✓：`singleStoreFor(musicMode).prune(角色 key)` ✓ + `sourceStoreFor(musicMode).prune(注册表 id)` ✓（两把 store 都**按模式分键** ✓，两处取的都是**当前模式**那一把 ⇒ 不会误删另一模式 ✓） |
| 同上 | 被清掉的角色若正是 `entryRequest.key` → `clearEntryRequest(key)` ✓（与 B2 / D116 的"角色没了就别留着请求"一致 ✓） |
| 存档版本号 | **不升** ✓（运行时清理即可，老存档照旧能读 ✓） |

**子代理在实现里改对的两处口径** ✓：

1. **`clearEntryRequest` 按角色 key 判** ✓ —— §6.5 写的是"被清掉的 id 若正是 `entryRequest.key`" ✗，
   可 `entryRequest.key` 存的是**角色 key** ✓，而"被清掉的 id"里还混着**音源 id** ✓ ——
   照字面拿它去比音源注册表**永远不命中** ✗，反而会把**每一条还活着的点播**在下一轮渲染清掉 ✗
   （等于废掉列表页点播 ✗）。实现按角色 key 判 ✓。
2. **`entryRequest?.key` 进依赖数组** ✓ —— 只依赖 `dataset` 时 effect 的闭包拿的是**旧** `entryRequest`
   （请求是渲染之后才写进 session 的 ✗），"死角色的请求要被清掉"实测**失败** ✓
   （`expected { key: 'gone-key', …(1) } to be null` ✗），加上后成立 ✓ 且不自转 ✓。

**落库时主会话补的一处对称性** ✓：`sources.prune` 有"无事早返回" ✓，而 `single.prune` 原来**每次都
`set` + 写盘** ✗ —— 这个 effect 每次换模式 / 每次列表点播都会跑 ✓，白写一遍盘还会把 `pins` /
`disabledCharacters` 两个对象的引用换掉 ✓。两边改成同一口径 ✓，并补一条守卫用例 ✓
（改前红 ✓：`expected { cirno: [ … ] } to be { cirno: [ … ] }` ✓，两引擎 ✓）。

**测试**（仓库原有的 vitest **浏览器模式** chromium + firefox ✓；先写用例后改实现 ✓）：
`store/sources.test.ts` **+5** ✓（死 id 被清 ✓、留下的开关与顺序**原样保留** ✓、**无事可做不写盘** ✓、
**另一模式的表不受影响** ✓，以及把 §四"编号不跳号"钉成回归的那条 ✓）；
`src/App.test.tsx` **+1** ✓（真数据驱动 Shell：先种一个死手选 + 一个死音源覆盖 ✓，跑完两把 store 都干净 ✓、
点播规则的两侧都验 ✓）；`store/single.test.ts` **+1** ✓（无事早返回 ✓，落库时补 ✓）。

**改前 / 改后实测**：实现 stash 掉、只留新用例（两引擎）→ **10 failed | 38 passed** ✓
（chromium 5 / firefox 5 ✓：`TypeError: prune is not a function` ×4 ✓ +
App 那条 `expected [ '专辑', '曲目', '角色曲' ] to be undefined` ✓ —— `single.prune` 从没被调用 ✓）
→ 改后同三个文件 **50 passed**（25 × 两引擎 ✓，基线 36 ✓）。**订正守卫**（"编号不跳号"）改前也绿 ✓
（两引擎 ✓）—— 正是订正口径的证据 ✓。

**验证**：`npx tsc --noEmit` 无诊断 ✓、
`pnpm test` **592 passed**（296 条 × chromium + firefox ✓，比 D121 的 578 多 14 = 新增 7 条 × 两引擎 ✓）、
`pnpm e2e` **78 passed + 1 skipped** ✓（chromium / firefox / mobile ✓，与 D121 持平 ✓ —— 本条**没有**新增
e2e 用例 ✓，但列表页点播那几条 e2e 仍全绿 ✓，说明 `entryRequest` 的清理**没有误伤** ✓；
跑前起了本地曲库助手 8011 ✓、跑完已停掉 ✓）、
`pnpm data:check` 无漂移 ✓（不碰数据与生成物 ✓）、`uv run pytest` **93 passed** ✓（tools 一个字没动 ✓）。

**坑（子代理记的，值得留一笔）** ✗：effect 的依赖里放 zustand 的**整个 state 对象**
（`useSingleTrack()` / `useSourceOverrides()` 不带选择器时**每次渲染返回新对象** ✗）会**自转** ✗ ——
实测 `Maximum update depth exceeded` ✓、`App.test.tsx` 5 条全红 ✗；改成"只依赖 `dataset`、
store 用 `xxxStoreFor(musicMode).getState()` 取" ✓ 后正常 ✓。
另有：`sources.test.ts` 的"清理落盘"用例会把键留在**共享的 localStorage** 里 ✗、污染**下一个测试文件**
（实测炸的是 `App.test.tsx` ✗）✓ —— 新用例自己 `localStorage.clear()` 起步 ✓。

---

## D123 游戏页「按卡组筛选音乐」从按钮改成 MD2 开关（联机同步 + 布局守卫）

**需求**（用户）：把游戏界面「按卡组筛选音乐」从一次性按钮改成 MD2 开关格式，注意 Material Design 2 规范与间距。

**做法**：

| 位置 | 改动 |
|---|---|
| `src/game/types.ts` | `GameState` 增 `filterByDeck: boolean`（默认 false ✓，`emptyState` 同步补上 ✓）—— 开关的显示态，随快照同步 ✓，联机两端开关外观一致 ✓ |
| `src/game/useGame.ts` | `filterByDeck()`（一次性动作 ✗）换成 `setFilterByDeck(enabled)` ✓：开 → 复用 `rules.filterMusicByDeck`（单人/电脑只看自己一方卡槽 ✓、多人看双方 ✓）+ 置 true ✓；关 → `temporaryDisabled: {}` + 置 false ✓；`reshuffleIfWrapped` 兜底触发时同时置 true ✓ |
| `src/net/protocol.ts` | 意图 `filterMusicByDeck` 增 `enabled: boolean` ✓；`stateDigest` 增 `filter=` 位 ✓（主机本地拨开关时，订阅式广播靠摘要变化触发 —— 旧摘要不含 filter/temporaryDisabled ✗，主机自己的筛选会改不到客户端 ✗） |
| `src/net/useNet.ts` | `applyIntentLocally` 改调 `game.setFilterByDeck(intent.enabled ?? true)` ✓（旧客户端只有"点一下=应用"的按钮语义 ✗，缺省按 true，跨版本主机不被新字段卡住 ✓） |
| `src/ui/panels/GamePanel.tsx` | 按钮换成 `FormControlLabel + Switch size="small"` ✓（checked 来自 `game.filterByDeck` ✓，客户端发意图、主机/单机本地落地 ✓），`data-testid="filter-by-deck"` 落在 FormControlLabel ✓、input 有 `aria-label` ✓；轮播 Chip 加 `data-testid="rotation-count"` ✓ |
| `src/ui/game/GameButton.tsx` | 新增 `gameSwitchLabelSx` ✓：height = `MD2.button.medium`（36）、`ml: 0 / mr: 0`（抵消 MUI 默认 -11px ✗）、标签 14sp |
| `src/i18n/localization.ts` | EN 文案改句首大写 `Filter music by deck` ✓（MD2 开关标签句首大写，不是按钮的全大写 ✓），zh 不变 ✓ |

**语义**：开 = 轮播只留卡槽里还有牌的角色（筛选写进 `temporaryDisabled` ✓）；关 = 清掉临时禁用、恢复完整轮播 ✓ —— 旧按钮只有"点一下=应用" ✗，这是开关给它补上的、此前不存在的撤销路径 ✓。`reshuffleIfWrapped` 兜底触发时同时把开关位置 true ✓：兜底确实把轮播收窄了，开关要如实显示，否则界面会撒谎 ✗。

**MD2 与间距**：开关行高 36dp，与同组按钮一致（`MD2.button.medium` = 36 ✓）；组内间距仍是 8dp 栅格 ✓（give-cards 与开关之间 ✓）；标签 14sp 句首大写 ✓；`ml: 0` 抵消 MUI `FormControlLabel` 默认的 -11px margin（否则组内 8dp 间距被涟漪补偿吃掉、开关压到前一个按钮上 ✗）—— 与 D38 单选组同款处理 ✓。

**联机**：意图带 `enabled` ✓；旧客户端缺省按 true ✓（跨版本主机不被卡住 ✓）；`stateDigest` 加 `filter=` 位 ✓ —— 主机本地拨开关时，订阅式广播靠摘要变化触发 ✓。协议版本**没有**升 ✓：意图字段是加性变更 ✓，握手只校验版本与哈希，`PROTOCOL_VERSION` 仍为 4 ✓。

**测试**（布局守卫 + 功能用例，都进 `e2e/smoke.spec.ts` ✓）：按钮尺寸守卫把 `filter-by-deck` 移出按钮清单 ✓（它现在是开关不是按钮 ✓）；分组间距守卫新增开关的六条断言 —— 行高 36 ✓、与按钮垂直居中偏差 0 ✓、与 give-cards 间距 8 ✓、标签 14px ✓、`role="switch"` ✓、默认未勾选 ✓；新增功能用例「开=轮播收窄到卡槽角色，关=恢复完整轮播」✓（读 `rotation-count`，两个桌面引擎都跑 ✓）。单测数量**不变** ✓：改的是存量用例 —— `useGame.test.ts` / `GamePanel.test.tsx` 各一条从"点一下"改成"开/关两段 + 断言 `filterByDeck` 位" ✓，三个文件的 fixture 补 `filterByDeck: false` ✓（总数不变 ✓）。

**验证**（全部实测）：`pnpm typecheck` 无诊断 ✓、
`pnpm test` **592 passed**（296 条 × chromium + firefox ✓，与改前持平 ✓ —— 改的是存量用例 + 2 处断言，没有新增单测 ✓）、
`uv run pytest` **93 passed** ✓（tools 未动 ✓）、
`pnpm e2e` **80 passed + 1 skipped** ✓（chromium 36 / firefox 35+1 / mobile 9 ✓；比基线 78+1 多 2 = 新用例 × 两个桌面引擎 ✓）、
`pnpm data:check` 无漂移 ✓、`pnpm data:validate` 通过 ✓（不碰数据与生成物 ✓）。

**坑（值得留一笔）** ✗：① 旧按钮语义是"点一下=应用" ✗，开关补上了"关=恢复完整轮播"这个此前不存在的撤销路径 ✓ —— 所以 `temporaryDisabled` 的清理只有"关"这一条路，兜底路径必须同步把开关置 true，否则开关显示与轮播实际状态会分叉 ✗；② `reshuffleIfWrapped` 兜底与开关的交互：兜底触发即置 true ✓，防止界面显示与实际行为不符 ✗。

---

## D124 开局重置轮播不再吃掉「按卡组筛选音乐」开关（开关 = 按当前卡槽）

**需求**（用户）：游戏模式下「按卡组筛选音乐」开关的行为，与"开始游戏自动重置轮播列表"的行为冲突。

**先量后做**（探针实测，`filterByDeck: true` + 卡槽里只有 `a`、轮播 `a/b/c/d`）：

```
开关开 + 未开局: { filterByDeck: true, temporaryDisabled: {b,c,d}, 轮播: ["a"] }
开始游戏后:      { filterByDeck: true, temporaryDisabled: {},      轮播: 4 个, currentKey: "b" }
```

`rules.startGame` 按 D19 重洗 `order` 并清空 `temporaryDisabled`（= 轮播重置成完整列表 ✓），
但 D123 新加的 `filterByDeck` 位**没跟着走** ✗ —— 于是三处症状：① 开关显示"开"、轮播却是完整列表（界面撒谎 ✗）；
② 开局第一个回合落在一个**卡槽里没有牌**的角色上（白转一回合 ✗，开关开着开局本来就是为了避免这个）；
③ 此时把开关拨到"关"看不出任何变化（临时禁用本来就是空的 ✗），得"关一下再开"才回来，白点一次。

**裁定**（用户二选一，选 A）：**开关保留** —— 开局重洗后立刻按当前卡槽重筛；并且**选牌阶段改卡组也重筛**
（同一类"开关显示与实际轮播不一致"，一起修）。

**做法**（`src/game/useGame.ts`）：

| 位置 | 改动 |
|---|---|
| 新增 `refilterByDeck(state, myIndex)` | 开关**开着** → 复用 `rules.filterMusicByDeck`（单人/电脑看自己一方 ✓、多人看双方 ✓）；**关着** → 原样返回（不产生新对象 ✓）。"开"的口径只有这一处 ✓ |
| `start()` | `rules.startGame(...)` 之后过一遍 `refilterByDeck` —— 重洗 + 清空照旧发生 ✓，开关开着就把新轮播按当前卡槽收窄 ✓ |
| 新增 `commitDeck(game)` | 改卡组的动作统一从它落地：**只在选牌阶段**重筛 —— `init` / `setMode`（口径随模式变 ✓）/ `resize`（缩小会丢卡 ✓）/ `fill` / `clear` / `shuffle` / `addCard` / `removeCard` / `moveCard` / `moveDeckCard` / `setOrder` ✓ |
| `setFilterByDeck` / `reshuffleIfWrapped` | 改成复用同一个 helper（"开"的语义只写一次 ✓） |

**语义**（写进 `GameState.filterByDeck` 的注释）：开关开着 = **按当前卡槽** —— 选牌阶段卡组一变就重筛、
开局重洗后也立刻重筛；**开局之后**轮播是本局的**快照**（抢牌 / 交牌不自动重筛，只有"转满一圈但还有牌"的
兜底会重筛 ✓）—— 否则场上牌一变轮播就跟着跳，回合节奏会不可预期 ✗。

**联机**：重筛发生在**主机**的 store 动作里 ✓（客户端要么是发意图的一方、要么等快照 ✓），
`stateDigest` 不用动 —— 改卡组的动作必然改动牌库那几段摘要 → 订阅式广播照旧触发 ✓（`filter=` 位 D123 已加 ✓）。
协议版本仍是 4 ✓（没有新增字段 ✓）。

**测试**：`useGame.test.ts` **+2** —— ① 开局保留开关：`order` 仍是 4 个（洗过但同批角色 ✓）、`filterByDeck` 仍为 true ✓、
轮播仍是卡槽角色 ✓、倒计时结束后**第一回合的角色一定在卡槽里** ✓、开局后再关掉仍恢复完整轮播 ✓；
② 开关开着时选牌阶段改卡组会重筛：加卡立刻收回该角色 ✓、拿掉卡就收窄 ✓、`setMode` 换口径（多人多回对手卡槽的角色）✓、
清空收窄到 0 ✓、关掉回完整 ✓。`GamePanel.test.tsx` 的开关用例补一段"开局后开关仍勾选、`rotation-count` 不变" ✓；
`e2e/smoke.spec.ts` 的开关用例补"开局 → 开关仍开 + 轮播数不变 → 中止 → 关掉 → 完整" ✓（两个桌面引擎都跑 ✓）。

**验证**（全部实测）：`pnpm typecheck` 无诊断 ✓、`pnpm test` **596 passed**（298 条 × chromium + firefox ✓，
比 D123 的 592 多 4 = 新增 2 条 × 两引擎 ✓）、`uv run pytest` **93 passed** ✓（tools 未动 ✓）、
`pnpm e2e`：改过的开关用例两个桌面引擎都绿 ✓（单独复跑 **2 passed** ✓）；全量跑出 **78 passed + 2 failed + 1 skipped** ——
其中"联机种子"那条是本机负载抖动 ✓（单独跑 `multiplayer.spec.ts` **5 passed** ✓），
`mobile.spec.ts` 的"播放页窄屏居中"那条则 **在本机 HEAD 上就先红** ✗（`current-card` 偏 9px > 8px 容差；
`git stash` 掉本轮全部改动复跑同样红 ✓ —— 与本轮无关，另立条目 ✓）；
`pnpm data:check` 无漂移 ✓、`pnpm data:validate` 通过 ✓（不碰数据与生成物 ✓）。
**反向对照**：把 `src/game/useGame.ts` 的改动 `git stash` 掉再跑新 e2e 用例 → 在
`rotation-count` 那条断言上失败 ✓（说明这条守卫真的抓得住旧行为，不是空断言 ✓）。

**坑（值得留一笔）** ✗：D123 只把"兜底收窄轮播 → 开关置 true"这一半补齐了 ✗，
另一半"轮播被重置回完整 → 开关要跟着回 false（或按当前卡槽重新收窄）"漏了 ✗ ——
**开关是"轮播状态的显示"，凡是轮播被改动的地方（重置 / 收窄 / 卡组变动）都得同步它**，
不然界面就会撒谎（D123 的坑②同源）。

---

## D125 倒计时三声不再卡播放（滴答只发声；上下文没跑起来时不堆叠）

**需求**（用户）："部分情况下倒计时三声音效会卡播放"，先只验证不修；验证完裁定 **修**。

**先量后做**（探针实测：仓库外副本 + 真浏览器单测口径；两条都是**复现**，不是推测）

| 现象 | 实测数字 |
|---|---|
| `play()`（"换歌前先响铃"开着）排好的"铃响完再起播"回调 | 响铃窗口内来一声 `tick()` → 回调被 `clearTimer()` 吞掉 → `{playback:"countingDown", audioPaused:true}`，界面还显示"在播" ✗；同一场景**没有** tick 时是 `{playback:"playing", audioPaused:false}` ✓ |
| 真实 Web Audio 里三声滴答的调度 | 上下文建好后一直是 `suspended`、`currentTime` 冻在 0 → 12 个振荡器全部 `at=0 / start=0`（三声叠在同一时刻）✗ |
| 叠在一起的可听后果（离线渲染真 PCM） | 单声峰值 **0.746**（0 个削波采样）✓；三声同刻叠加峰值 **2.239**、**215 个采样 > 1.0** ✗ |

可达路径：对局中只锁**页签按钮**（`AppShell.tsx`），**已经停在播放页**的面板不卸载，它的 ▶ 照样能点 ——
"客机停在播放页时主机开赛 → 倒计时 3 秒内按 ▶"就是那个"部分情况下" ✓。

**根因**：① `bell.ring()` 一进来就 `clearTimer()`，而**滴答与"铃后起播"共用同一个铃** → 滴答把别人的回调一起清了 ✗；
② 声音直接按 `context.currentTime` 排，而上下文没跑起来时这个时钟**不前进**，`resume()` 又是 `void` 掉不 await 的 →
几声全排在同一个冻结时刻，等真正恢复的那一刻一起炸出来 ✗。

**做法**

| 位置 | 改动 |
|---|---|
| `src/audio/bell.ts` 新增 `pulse(durationMs)` | **只发声**：不排回调定时器、也不清别人的 —— 与 `ring()` 的唯一区别就是"会不会顶掉上一次的回调" ✓ |
| `src/audio/bell.ts` 抽出 `sound(lengthMs)` | 上下文 `running` → 直接排 ✓；否则**先请 `resume()`，恢复了再补**，补的时候已过 `RESUME_CATCH_UP_MS`（150ms）就**丢掉**（宁可不响，也不在错的时间响 ✓）；且只有**最新**那一声（代数比对）允许补响，积压的几声不会一起放出来 ✓ |
| `stop()` / `dispose()` | 顺带把"还在等 resume 的那一声"作废（代数 +1）✓ |
| `src/audio/usePlayer.ts` | `tick()` 从 `ring(undefined, BELL_TICK_MS)` 改成 `pulse(BELL_TICK_MS)` —— 滴答从此不碰"铃后起播"那条时序 ✓ |
| `src/ui/shell/AppShell.tsx` | 三声的偏移抽成 `COUNTDOWN_TICK_MS`，并记住倒计时起始时刻：定时器**迟到超过 `TICK_LATE_TOLERANCE_MS`（350ms）就跳过这一声**（后台标签页的节流会把几声挤在一起放 ✗）；判定拆成可测的 `tickDue(elapsedMs, offsetMs)` ✓ |
| `src/ui/panels/PlayerPanel.tsx` | "换歌前先响铃"开关加 `aria-label="player-countdown"`（给回归用例一个稳定入口）✓ |

**语义**：滴答是纯提示音，**永远不该决定正曲什么时候起播** —— 起播只由 `ring()` 的回调决定 ✓；
上下文起不来时这几秒可以是**静音**的（听不见，好过听成一声爆音）✓。

**测试**：新增 `src/audio/bell.test.ts` **5 条**（假 AudioContext）：pulse 不打断 ring 的回调 ✓、
ring 仍会顶掉上一次 ✓、stop 打断回调且不触发 + dispose 关上下文 ✓、挂起时**一个振荡器都不排**且恢复后不补放积压的 ✓、
很快恢复时该响的照样补上（不是一律静音）✓。`usePlayer.test.tsx` **+1**：铃的窗口里来一声 tick → 正曲照样起播 ✓。
`App.test.tsx` **+3**：开局后正常时序**真的响三声**（数振荡器 = 4 泛音/声）✓、
"倒计时期间在播放页按 ▶"这条路径端到端（铃响完正曲起播、不再卡在 `countingDown`）✓、`tickDue` 的迟到边界 ✓。

**验证**（全部实测）：`pnpm typecheck` 无诊断 ✓；`pnpm test` **614 passed**（307 条 × chromium + firefox ✓，
比 D124 的 596 多 18 = 新增 9 条 × 两引擎 ✓）；`playwright test --project=chromium -g 倒计时` **1 passed** ✓
（改过的倒计时流程在真浏览器里端到端复跑 ✓，13s）。
**反向对照**：把 `src/audio/usePlayer.ts` 单独退回 HEAD（`bell.pulse` 留着）再跑新用例 →
**只有那两条回归用例红**（`expected true to be false` = 正曲仍停着 ✗），同批其余 26 条照旧绿 ✓ —— 守卫抓得住旧行为 ✓。

**坑（值得留一笔）** ✗：① 单测里假定时器的队列时钟是**按点**触发的（sinon 会把时钟推到每个定时器自己的到期时刻再执行），
所以"后台节流回来时一次全放"没法忠实复现 → 只把 `tickDue` 的判定钉住，App 层只覆盖正常时序的三声 ✓；
② `App.test.tsx` 原先 `afterEach` 只清 DOM、**不卸载 React root**：旧实例还活着，它和当前用例共享同一个 `useGame`，
开局时两个外壳各响一声（实测"三声"变成 2+2 ✗）—— 现已 `root.unmount()` + 每个用例把对局 store 复位到"选牌阶段" ✓
（同一文件耗时也从 6.4s 降到 4.0s ✓）。

---

## D126 联机栏的 PeerJS 开关按 MD2 对齐（不再贴到名称框上）

**需求**（用户）："PeerJS 的开关对齐有问题，开关贴到名称框上了，参考 Material Design 2 修复"。

**先量后做**（e2e 探针实测：先写守卫拿到"改前"那一列，再改）

| 指标 | 改前 | 改后（MD2） |
|---|---|---|
| 名称框 → 开关行 | **-3px**（压住名称框 ✗） | **8px** ✓ |
| 开关行 → "建立房间" | **24px**（疏 ✗） | **8px** ✓ |
| 开关行与名称框垂直居中偏差 | 0 ✓ | 0 ✓ |
| 开关行高度 | **24px**（比同排按钮矮一截 ✗） | **36px** ✓ |
| 标签字号 / 标签节点 | **12px**（caption）且**没有** `MuiFormControlLabel-label` 类 ✗ | **14px** ✓ / 有该类 ✓ |

**根因**（两条，同源）：① `FormControlLabel` 默认 `margin-left: -11px`（把涟漪对齐到标签文字）—— 大厅那一行
**没套** `gameSwitchLabelSx`，8dp 栅格被吃掉成 -3px ✗，右侧还留着默认 `margin-right: 16px` → 24px ✗；
② 标签写成 `label={<Typography variant="caption">…</Typography>}`：MUI 只把**字符串**标签包进自己的标签节点
（`MuiFormControlLabel-label`）—— 直接塞元素进去等于把标签从 MUI 的标签体系里摘出来，字号 12px、helper 也管不到 ✗。

**做法**（`src/ui/game/LobbyPanel.tsx`）：与游戏页"按卡组筛选"开关**同一份规格** —— `label={t(...)}` 传字符串 +
`sx={gameSwitchLabelSx}`（`src/ui/game/GameButton.tsx` 里已有的 MD2 开关行样式：`ml: 0 / mr: 0`、
`height: MD2.button.medium` = 36dp、标签 14sp）✓。没有新造样式：这类"开关 + 文本"行全仓库共用这一个 helper ✓。

**测试**：`e2e/smoke.spec.ts` 新增 **1 条**（`联机栏：PeerJS 开关按 MD2 规格对齐（8dp 栅格、不贴名称框）`）：
一次比对 7 个指标（左/右间距、居中偏差、行高、标签字号、标签文字字号、标签节点类名）✓ ——
一条断言同时挡住"负边距回来了"与"标签又被塞成元素"两种退化 ✓。

**验证**（全部实测）：`pnpm typecheck` 无诊断 ✓；新守卫**改前红、改后绿** ✓（红时打印的正是上表"改前"那一列 ——
反向对照不需要动代码 ✓）；`e2e/smoke.spec.ts` 全文件 chromium + firefox **58 passed** ✓（29 条 × 两引擎，4.8min）；
`e2e/multiplayer.spec.ts` chromium + firefox **9 passed + 1 skipped** ✓（大厅那条一行布局就是联机流程要用的 ✓）。

---

## D127 对局音频的短淡入短淡出（回合切换不再硬切）

**需求**（用户）："为游戏模式音频增加短淡入短淡出"。

**先量后做**：听感问题没有"改前数值"可测，所以**先写守卫**：e2e 每帧采样 `audio.volume` —— 改前（AppShell 仍硬切）
红在 `expected < 0.5, received 1`（起播一步到目标音量 ✗），改后绿 ✓。

**做法**

| 位置 | 改动 |
|---|---|
| 新增 `src/audio/fade.ts` | `rampGain(from, to, ms, onStep)`：**时间基**线性包络（按 `Date.now()` 算进度，不数步数）；`GAME_FADE_MS = 200`、`FADE_STEP_MS = 16`。时间基是为后台标签页：定时器被节流成 1s 一跳时，数步数会卡在半路（音量停在中间、淡出永不结束 ✗），按时间算则一跳到位 ✓ |
| `src/audio/usePlayer.ts` | 包络值 `fadeGainRef` **乘在**"用户音量 × 逐曲响度"之上（那条线一行没动 ✓）；目标音量收进 `targetVolume()` 一处算；`playImmediate({ fadeMs })` 支持短淡入；新增 `fadeOutPause({ fadeMs })` = 短淡出后再 `pause()`；`pause()`（用户按暂停）保持立即 ✓ |
| `src/ui/shell/AppShell.tsx` | 对局路径：`turnStart` → `playImmediate({ fadeMs: GAME_FADE_MS })`；`countdown` / `off` → `fadeOutPause()`。列表点播与用户播放/暂停**不传** `fadeMs`，行为不变 ✓ |

**为什么不用 Web Audio 的 `GainNode`**：那得把 `<audio>` 接进 `MediaElementSource` —— 远程音源没有 CORS 头会被
**静音** ✗，现有那条"用户音量 × 逐曲响度"也得搬进音频图里。需求只是"别硬切"，所以用 `HTMLMediaElement.volume`
上的线性包络就够，而且对所有音源一视同仁 ✓（铃/滴答本来就自带包络，不参与 ✓）。

**语义**：淡出期间界面**立刻**显示"已停"（`playback = "stopped"`）—— 界面不必等这 200ms ✓；
淡出没走完就又起播（令牌变了）**不许按停**，否则会把新回合的曲子按掉 ✗；停完包络**复位**，下一次起播不会是哑的 ✓。

**测试**：新增 `src/audio/fade.test.ts` **3 条**（起点/终点/单调 ✓、取消后不再回调 ✓、`ms<=0` 与起止相同只回调一次 ✓）；
`usePlayer.test.tsx` **+4**（起播淡入、点播仍硬起 ✓；停播淡出后才暂停、停完复位 ✓；淡出未走完又起播不被按停 ✓；
用户按暂停仍立即 ✓）；`e2e/smoke.spec.ts` **+1**（真浏览器每帧采样：起播第一帧不到目标的一半、有一串上升中间值 ✓；
暂停前有一串下降值且已近静音、停完复位 ✓）。

**验证**（全部实测）：`pnpm typecheck` 无诊断 ✓；`pnpm test` **628 passed**（314 条 × chromium + firefox ✓，
比 D126 的 614 多 14 = 新增 7 条 × 两引擎 ✓）；`e2e/smoke.spec.ts` 全文件 chromium + firefox **60 passed** ✓
（30 条 × 两引擎，5.7min）。
**反向对照**：把 `src/ui/shell/AppShell.tsx` 单独退回 HEAD（仍硬切）→ 新守卫红在 `expected < 0.5, received 1` ✓。

## D128 音MAD 曲包真源拆到独立数据仓库（submodule `data/otomads`）

**需求**（用户）：先评估"音MAD 数据单独放一个新仓库是否可行"，再按 **方案 A** 执行。五条裁定：
目的是**仓库整洁**；otomads 在主仓库里**可选**；新仓库暂不管音频与卡面（之后音MAD 可能带自己的卡面覆盖
或原曲没有的角色）；版本用 **tag** 锁；**不保留** `data/packs/otomads` 的 git 历史。

**形状**

| 项 | 值 |
|---|---|
| 数据仓库 | [`Dustymind/touhou-music-cards-otomads-data`](https://github.com/Dustymind/touhou-music-cards-otomads-data)（public；拆分时是一个初始提交，**历史迁移见 D129**） |
| tag | `th09.5` —— 主仓库的 submodule pin 在它上面 |
| submodule 内容 | `packs/otomads.toml` + `packs/otomads/*.toml`（35 份 / 86 首）+ `sources/otomads.toml` |
| 留在主仓库 | 生成物 `public/data/otomads/*.json` 与 `loudness.json`、`data/card-sets.toml` 的 `otomads` 图集块、全部工具链、协议 v4 |

**为什么生成物不跟着搬**：`src/data/load.ts` 启动同时取两份数据集（契约 §4 策略 A），协议 v4 在
**握手期**交换两个哈希（D112 C3）。生成物留在主仓库 ⇒ 应用与协议**零改动**；数据仓库只承载真源。

**代码**（根目录从"一个"变成"主仓库 + submodule"两组；submodule 缺失就跳过）：

| 位置 | 改动 |
|---|---|
| `tmc/repo.py` | `pack_roots()` / `source_roots()`（**函数**：测试会 monkeypatch `DATA`）、`find_pack_manifest()` / `find_source_registry()`、`shown()`（临时目录下 relative_to 会抛，兜底绝对路径） |
| `tmc/packs.py` | `load_packs()` 遍历全部根目录，不存在的根提示后跳过；新增 `available()`；`_load_root()` 拆出 |
| `tmc/build.py` | 注册表走 `find_source_registry`；曲包不可用时**只生成 originals + 共享项**，不拿空数据覆盖已提交的 `public/data/otomads/*.json`（`--check` 打印跳过提示） |
| `tmc/validate.py` | otomads 注册表缺失给 note（不报错）；曲包不可用时 note 并跳过曲包校验 |
| `tmc/ingest_pack.py` | 清单按根目录查找；新文件的注释写**实际路径**（`data/otomads/packs/...`） |
| `tools/tests/*` | 依赖真实曲包的 3 条（`test_generated_outputs_...` / `test_pack_tracks_land_only_...` / `test_data_invariants_hold`）加 `skipif(not packs.available())` |

**验证**（全部实测）：`pnpm data:build` 写出 12 个文件（otomads 35 角色 86 曲，哈希 `4c2ae0dee354` 与分离前一致 ✓）；
`pnpm data:check` 无漂移 ✓；`pnpm data:validate` 通过 ✓；`cd tools && uv run pytest` **93 passed** ✓；
`pnpm typecheck` ✓；`pnpm test` **628 passed**（314 条 × chromium + firefox ✓）；`pnpm e2e` **84 passed + 1 skipped**（chromium + firefox + mobile，8.3min ✓）。
**"可选"实测**：把 `data/otomads` 临时移走 → `pnpm data:check` 只保原曲+共享项并给提示、`pytest` 按预期 **skip 3 条** ✓（跑完已复位）。

**之后要做的事**（写进了 `data/otomads/README.ai.MD`）：音MAD 若要引入**原曲没有的角色**或自己的身份，
要么主仓库先加同名 key，要么另立 S2 契约（`docs/otomads-separation-v1.md` §5）——
submodule 只是给了第二份名单落脚点，跨库一致性仍要新约定。

**后续（2026-09-26，用户要求）：消费方 pin 的是 `commit`，不是 tag。**
submodule 本来就只能记 commit（tag 只是给某个 commit 起个名），所以"pin 到 tag"与"pin 到 commit"在
git 层没有区别；改的是**口径**：数据仓库改完数据**不必等打 tag**，主仓库直接
`git -C data/otomads fetch && git -C data/otomads checkout <commit>` → `pnpm data:build` 即可。
tag（`th09.5-*`）保留，但降级为"给人看的里程碑标记"，不再是消费方的依赖点。
复现性不受影响：`git submodule update` 永远按 commit 校验出，跟分支才是不可复现的那种做法。

## D129 音MAD 数据的提交历史迁到数据仓库（重写 tag `th09.5`）

**需求**（用户）："能否将 commit 记录搬过去" —— D128 当时按"不保留历史"执行，这一轮改成迁移。

**做法**（在主仓库的临时克隆上跑 `git-filter-repo`；单文件脚本从上游 raw 取，不进依赖）：

```bash
git branch pack-history 16f5e07        # 拆分前最后一个碰曲包数据的提交
git filter-repo --refs refs/heads/pack-history \
  --path data/packs/otomads.toml --path data/packs/otomads/ --path data/sources/otomads.toml \
  --path-rename data/packs/:packs/ --path-rename data/sources/otomads.toml:sources/otomads.toml
```

- 结果：**13 条提交**（2026-09-17 `feat: port the otomads music mode` → 2026-09-23
  `data: start the marisa track one second earlier`），作者与日期保留，路径已按新布局重写。
- `5dfde1e`（"从主仓库删除"那条）**不在**其中：`pack-history` 停在 `16f5e07`，它的后代都不参与过滤。
  （第一次用 `--refs <hash>` 直接过滤没有重写分支 —— 必须先建一个指向该提交的分支。）
- 迁移后的 36 个文件头部注释仍指向主仓库路径，补两条提交收尾：
  `docs: point the pack comments at this repository` + `docs: add the repository readme`（README 里加了"沿革"）。

**收尾与校验**：数据仓库 `main` 与 tag `th09.5` force-push 到重写后的历史（`00ae748`，共 **15** 条）；
主仓库 submodule 更新 gitlink（仍 pin tag `th09.5`）并提交 `data: pin the otomads submodule to its migrated history`。
迁移前后逐文件核对：37 个数据文件 blob 哈希**逐一相同** ✓；主仓库 `pnpm data:check` 无漂移 ✓。
**注意**：克隆过旧历史（`d02b5d6`）的人要重新克隆或 `git fetch --force`；数据仓库刚建，没有别的克隆。

## D130 本地源工具与音频流程迁到数据仓库（每源一张响度表 + 角色清单）

**需求**（用户）：执行方案 B —— 把"本地源工具"也搬进数据仓库。四条裁定：① 响度**按源表项**；
② 角色清单用**带 name/order 的 TOML**；③ 契约文档仍以主仓库 `docs/packs-audio-v1.md` 为准；
④ 主仓库保留 `pnpm` 包装，但**数据仓库必须能独立跑起完整的音乐源**。

**搬了什么**（数据仓库 `tools/` = 自带 uv 工程；与主仓库**零 import、零 path 依赖**，只靠文件格式当契约）：

| 数据仓库（新） | 主仓库（留） |
|---|---|
| `otomads.local_source`、`packformat`（格式层：读 + 写 + 音频路径工具）、`ingest_pack`、`fetch_audio`、`loudness` / `measure_loudness`、`parse_ingest_rows`、`ingest_otomads`、`ingest_local_audio` + **59 条测试** | `tmc.packs` **瘦身成只读**（读 + 严格校验 + `audio_descriptors`；`audio_filename` / `source_key` 随抓取搬走）、`tmc.build`、`tmc.validate`、新增 `tmc.roster` |
| `characters.toml`（清单）、`loudness/otomads.json` | 生成物 `public/data/**`、`data/card-sets.toml` 的 otomads 图集块、协议 v4、`.music/` 与 `local-source.toml`（机器相关，不搬） |

**每源一张响度表**（用户①）：源注册表新增可选 `loudness = "loudness/otomads.json"` → `build_sources()`
透传成 `SourceRecord.loudnessUrl`（相对数据集目录）→ `data:build` 把它拷进
`public/data/otomads/loudness/otomads.json`。运行时：`SharedData.loudnessUrl` 退场，`usePlayer` 按
**解析到的 `sourceId`** 取对应表，**没有表的源**（三个原曲镜像）系数按 1。生成仍在源的所有者那边：
`fetch_audio` / `measure_loudness` 只写 `loudness/<包>.json`。

**角色清单**（用户②）：`tmc.roster` 从 `data/characters/*.toml` 生成数据仓库的 `characters.toml`
（`key` / `name` / `order`）；数据仓库的 `ingest_pack` 只认它，所以能**独立录入**；`tmc.validate` 新增
`check_roster` 守一致（submodule 缺失时给 note 跳过）。手工追加的"原曲没有的角色"会保留 —— S2 的落脚点。

**独立跑验收**（数据仓库干净目录实测）：`uv sync --project tools` ✓；`uv run --project tools pytest`
**59 passed** ✓；`local_source --print-url` ✓，真起服务后 `/manifest.json` 200 + Range **206** ✓；
`measure_loudness` 对测试音频出表 ✓；`fetch_audio --dry-run`（含 `--track` 过滤）/ `ingest_pack --dry-run` /
`parse_ingest_rows` ✓ —— 全程不 import 主仓库任何代码。

**主仓库接线**：`pnpm local` / `pnpm audio:fetch` / `pnpm audio:measure` 是**纯路径包装**
（`cd data/otomads/tools && uv run … --config ../../../local-source.toml`；submodule 缺失时一行报错），
`pnpm data:roster` 生成清单；`tools/pyproject.toml` 去掉 `yt-dlp`。

**踩到的坑**：`usePlayer` 的表地址输入从"一个 URL"变成"sourceId → URL 的映射"后，调用方每次渲染新建对象
会让取表 effect 无限重跑（单测超时暴露）—— 依赖改成**内容的 `JSON.stringify` 指纹**，映射本体放 ref。

**验证**：`data:build` 写出 13 个文件（多出响度表）、`data:check` 无漂移 ✓、`data:validate` ✓（含清单守卫）、
主仓库 `pytest` **34 passed**（缺 submodule 时 3 条按预期 skip）✓、`pnpm test` **628 passed** ✓、
`pnpm e2e` **84 passed + 1 skipped**（7.9min ✓；首跑 4 条红是**助手没起** —— e2e 的既有前置条件，
起 `pnpm local` 后全绿）。**缺 submodule 实测**：`data:check` 只保原曲+共享项并给提示 ✓、`data:validate` 通过 ✓。

**契约**（用户③）：曲包格式与音频流程仍以主仓库 `docs/packs-audio-v1.md` 为准（§6 新增"响度按源"一条）；
数据仓库的 `README.ai.MD` 写"写入侧 + 独立运行"。

---

## D131 源表地址改成真相对路径（子目录部署不再 404）+ 三家静态托管配置

**需求**（用户）：先问三件事 —— ① 主仓库能否纯前端单独部署；② 数据仓库能否单独部署附加音乐源；
③ 网页版能否读自定义本地源服务器。回答期间**实测**发现一个真 Bug：把 `dist/` 挂在子目录
（GitHub Pages 项目页的真实形态 `user.github.io/<repo>/`）时，**原曲一首都放不出来**。
用户裁定：**修 Bug + 补守卫 + 顺手配好部署形态**（Cloudflare Pages / GitHub Pages / Vercel）。

**Bug 的形状**（实测，chromium）：

| 请求 | 结果 |
|---|---|
| `/sub/data/**`（应用数据，`loadDataBundle` 相对 base） | 200 ✓ |
| `/sub/assets/**`、`/sub/fonts/**` | 200 ✓ |
| `/data/sources/{netease163,cloudflare_r2,thbwiki}.json` | **404 ✗** |

三个镜像源的 `table_url` 写的是**根绝对路径** `/data/sources/x.json`，而 `base: "./"` 只治得了
**相对引用**（`index.html` 里的 `<script src="./assets/…">`）—— `loadSourceTables` 直接
`fetch(source.tableUrl)`，`base` 管不到那条字符串 ✗。后果不是"少一个源"：三份镜像表是原曲**唯一**的
地址来源，全 404 → 播放器显示"所有已启用的音源都取不到" → 原曲 368 首全哑（音MAD 不受影响，
它只有本地源）。README §5 当时写着"子目录部署也能直接跑"，与实测不符。

**根因**：`table_url` 是"根绝对路径"还是"相对路径"这件事，**没有守卫**——`data:check` 只比生成物
与真源是否漂移（两边都带 `/` 就一致 ✓），`data:validate` 的检查先 `.lstrip("/")` 再找文件（`/` 和没有
一样通过 ✓）。所以这个形态差异一路溜到用户面前。

**改法**（五处）：

| 位置 | 改动 |
|---|---|
| `data/sources/originals.toml` | 三处 `table_url` 去掉前导 `/`：`data/sources/x.json` |
| `data/otomads/sources/otomads.toml`（数据仓库） | `table_url = "/manifest.json"` → `"manifest.json"`（**数据仓库也要跟着发版**：tag `th09.5-260924` 被 force-move 到 `ee27bb6`，主仓库 gitlink 跟着走） |
| `tools/src/tmc/build.py` | 新增 `table_url_problem()`：**只允许**相对路径或 http(s) 绝对 URL；`build_sources()` 对每条注册表项当场校验，坏形态 `SystemExit`（`pnpm data:build` 直接红） |
| `tools/src/tmc/validate.py` | 注册表检查新增第 5 条不变量；另加 `check_source_table_urls()` 查**生成物**（音MAD 那份注册表在 submodule 里，只看主仓库 TOML 会漏） |
| `vite.config.ts` | 生产构建**不再出 sourcemap**：那份 `index.js.map` 3.7 MB，比站点其余内容（0.8 MB）大四倍；要线上排查用 `vite build --mode development` |

**为什么禁根绝对路径**：四种部署形态里有一种（子目录）它必坏，而相对路径**四种都对**
（域名根 = 同源根、子目录 = 同源子路径、本机直开、单端口反代）。写错一个 `/` 不该等到用户在
某个平台上发现"没声音"。

**三家静态托管配置**（都提交进仓库）：

| 平台 | 文件 | 地址形态 | 要点 |
|---|---|---|---|
| GitHub Pages | `.github/workflows/deploy-pages.yml` | **子目录** `user.github.io/<repo>/` | `actions/checkout@v7` + `setup-node@v7`(24) + `pnpm/action-setup@v6`(12) + `configure-pages@v6` + `upload-pages-artifact@v5` + `deploy-pages@v5`；`permissions: pages/id-token`、`concurrency: pages`；**不需要 Python/submodule**（`public/data/**` 随仓库提交） |
| Cloudflare Pages | `public/_headers`（+ 面板设置：构建 `pnpm build`、输出 `dist`） | 域名根 | 缓存策略写在 `_headers` 里；`/data/**` 刻意不长缓存（`contentHash` 是联机握手要比的） |
| Vercel | `vercel.json` | 域名根 | `framework: null`（别让它去猜 Vite 的默认构建）+ 显式 build/install 命令与输出目录 |

**验证**（本轮实测）：

* **CI 干跑**：临时目录里 `pnpm install --frozen-lockfile` ✓ + `tsc --noEmit && vite build` ✓
  （即工作流那两步，排除"CI 里装不上/编不过"这类只能到线上才发现的问题）；
* **子目录部署复现 → 修复**：`dist/` 挂在 `/sub/` 下，三份镜像表变成
  `/sub/data/sources/*.json` **200** ✓、`3 sources` ✓、点播放真的取到网易云 mp3 ✓（改前同一条路径 404）；
* **守卫**：故意把一处改回 `/data/sources/…` → `data:build` 退出码 1、`data:validate` 退出码 1 ✓，改回后
  `data:check` 无漂移 ✓；
* **产物体积**：`dist/` 从 5.0 MB → **1.4 MB**（sourcemap 退场）。

**顺带实测存下来的两条结论**（写进 `deploy/README.md`）：

1. **https 页面能读 http 回环**：`http://127.0.0.1:8011` 与 `http://localhost:8011` 在 https 页面上
   chromium / firefox **都放行**（manifest 200 + 音频 206，因为回环被当可信来源）；`http://<私有 IP>`
   会被拦，`https://127.0.0.1:8011` 打到只讲 http 的助手是 `SSL_PROTOCOL_ERROR`。
2. **数据仓库独立部署**：从数据仓库自己的克隆起 `local_source`（不经主仓库任何包装）→
   manifest 200 / 86 条、Range 206、`pytest` 59 passed ✓。

**tag 用 `th09.5-260924`（force-move），不新开 tag**（用户要求）：数据仓库那次改动**没有新开 tag** ——
`th09.5-260924` 从 `61e47f1` force-move 到 `ee27bb6`（`ee27bb6` 与 `61e47f1` 之间只差
`sources/otomads.toml` 的一处路径与 `README.ai.MD` 一行说明）。所以：

- 主仓库 gitlink pin 的还是 `ee27bb6`（同一个 commit，只是它现在挂的 tag 名是 `th09.5-260924`）；
- 拉过旧历史的人要 `git fetch --force --tags`，否则本地 `th09.5-260924` 仍指 `61e47f1`；
  **submodule 里的那份也要单独 force-fetch**（submodule 是独立仓库，`git fetch` 不会更新 tag），
  没网时可以从克隆直接 fetch：`git fetch --tags --force <数据仓库克隆路径>`；
- 老 tag 名 `th09.5-260925`（曾被推送过）已删除，只在推送完成前存在过几分钟。

---

## D132 抓取音频改成并发（`--jobs`，默认 4）

**需求**（用户）：音乐拉取能否并行或加速（如果 yt-dlp 有相关设置）。

**先算账**（本机 32 核实测），再决定往哪儿使劲：

| 环节 | 实测 | 说明 |
|---|---|---|
| `import yt_dlp` + `YoutubeDL()` + extractor 匹配 | **0.13 秒/首** | 可忽略 |
| yt-dlp 后处理 `FFmpegExtractAudio`（4 分钟 m4a → mp3，`-q:a 0`） | **1.005 秒/首** | 且 84/86 的原件本来就是 mp3 ⇒ **这一步根本不发生** |
| 裁剪 `-c copy`（90 秒） | **0.075 秒/首** | |
| 若源非 mp3 又要裁（重编码） | **0.383 秒/首** | |
| **86 首的本地开销合计** | **≈ 23 秒** | 其余 **100% 是网络**（playurl 往返 + 音频本体），期间 CPU 空闲 |

结论：瓶颈全在网络，而原来 `for track in tracks` 是**严格串行**的。

**yt-dlp 自带的并行/加速开关为什么不解决问题**：

| 选项 | 结论 |
|---|---|
| `--concurrent-fragments N` | **只并行 HLS/DASH 的"分片"**（m3u8/mpd）。bilibili 的音频是**单个文件**直链，没有分片 ⇒ 开了也是 1 分片 |
| `--http-chunk-size` / `--buffer-size` | 只影响单连接的读写块，不增加并行度（还要配 `--downloader` 才有意义） |
| `--sleep-requests` / `--throttled-rate` | 方向相反（限速/退避） |
| Python API 层面 | `YoutubeDL` 是**按实例**的（一个实例处理一条 URL），没有"多 URL 并行"的开关 |

**改法**（数据仓库 `tools/src/otomads/fetch_audio.py`，`--jobs` 默认 **4**，`1` = 串行）：

1. `ThreadPoolExecutor` + `as_completed`，进度行改成"完成即打印"的 `[n/总数]`（并发下顺序不保证）；
2. `save_state()` 加 `_STATE_LOCK`：多线程同时收尾时，不锁就会**互相覆盖**（表现为"跑完了但状态里少几条"）；
3. `ensure_raw()` 用**按 source 分锁**的 `_raw_lock()`：原件按 source 存（`.raw/<sha1(source)[:16]>.mp3`），
   两条曲目引用同一 source 时只下一份；
4. `process_track()` 的返回值从 `dict` 变成 `(outcome, claimed)`：同源同区间的"认领"必须由调用方在锁里并表，
   线程不再直接写共享的 `outputs`；
5. `download()` 加 `cachedir: False`：并发时每个线程各建一个 `YoutubeDL`，关掉缓存目录就没有共享写点了。

**过程中被测试抓出来的两个真竞态**（都不是想出来的，是跑出来的）：

| 现象 | 根因 |
|---|---|
| `--jobs 4` 时报「状态文件损坏，忽略」 | `states.setdefault(pack_id, load_state(path))` —— Python **先求值实参**，所以每个线程都去读一遍同一个文件，正好读到别人写了一半的内容 ✗。改成**进线程池之前把状态全部读进来**，运行期只有写 |
| 8 条里两条同源曲目都走成 `fetched`（本该一条 `linked`） | "认领"与"产出"分在两处：线程 B 认领后还没 render 完，线程 A 就看 `twin.exists()` 为假 → 白裁一遍 ✗。改成**认领与产出在同一把锁里**（代价是渲染串行，但 `-c copy` 只 0.08 秒，且不同 source 用不同键、互不阻塞） |

**改动落在数据仓库**（主仓库 `pnpm audio:fetch` 只是路径包装），所以照 D131 的规矩走了一遍：
数据仓库提交 + 新 tag → 主仓库切 tag → 提交 gitlink。

**验证**：数据仓库 `pytest` **61 passed**（新增 2 条并发用例：8 条曲目 / 4 线程 / 6 个 source 的状态完整性、
同源 3 对只下一份原件且成品两两同 inode；重复跑 8 次全绿）；`pnpm audio:fetch`（全部已缓存）**skip 86** ✓、
`--jobs 16` 同样 skip 86 ✓（幂等没被并发破坏）；主仓库 `typecheck` / `test` / `e2e` / `data:*` 均与基线一致
（本轮只动数据仓库的工具，主仓库不涉代码）。

**注意**：真实的**下载**路径（`--jobs > 1` 下走网络）没法在会话里验证 —— bilibili 的并发风控只能实测。
想先小步试：`pnpm audio:fetch --track <一首> --force`（只重下命中那一首），再决定要不要整包 `--jobs 4`。

---

## 用户裁定汇总（两轮）

| # | 议题 | 裁定 | 备注 |
|---|---|---|---|
| Q1 | 架构 | 纯前端 SPA + 独立本地音乐助手 | 单仓库 |
| Q2 | 前端框架 | Vite + React 19 + MUI 7，去掉 Next/Tailwind | —— |
| Q3 | 卡面素材 | **全部走远程**（R2 / GitHub Pages） | 与我的原建议不同 |
| Q4 | 无角色曲目 | 不强行归属，单列清单 | —— |
| Q5 | `更多道中曲` 语义 | brief 字面语义（后续作品里作为面 BOSS 的那首道中曲） | —— |
| Q6 | 规则扩充 | E1/E3 采纳、PC-98 计入首发；**E2 经质疑后撤销** | 见下 |
| Q7 | 工具链 | Python/uv | —— |
| Q8 | 分碟细则 | Trance 算独立专辑；格斗碟不再按 a/b/c 拆 | —— |
| Q9 | 删改策略 | 只改类别不删曲目；确需删除的逐条确认 | —— |
| P1 | 三态「已启用」 | **压过专辑勾选**（三态可区分） | 二次确认 |
| P2 | E2 一格两用 | **不成立**：按 THBWiki 重新判定并更正 | 用户质疑正确 |

### E2 更正记录（重要）

用户指出 `クリスタライズシルバー` **不是道中曲**。核对 THBWiki：该曲标注为「1面BOSS **蕾蒂·霍瓦特洛克 角色曲**」（`th07_03`）；TH07 第 1 面的道中曲是 `無何有の郷 ～ Deep Mountain`（`th07_02`）。先前的 E2 例子是**未经核对的推测**。

随后把 THBWiki Music Room 的 **21 部作品、492 条曲目标签**全量抓取并机械检查（`.ref/thbwiki/`）：

- **同一作品内既是「面主题曲」又是「角色曲」的曲目 = 0 条**；7 组同名多标签全部是同类重复（WAV/MIDI 两版）或 `曲名不詳` 的对话曲。
- 结论：**E2 无适用对象，规则撤销**；分类改为直接采用 THBWiki 标签。
- 附带发现：**upstream 有 70 个曲名出现在多张专辑里、且角色不同** —— 这些是**不同的曲子**（同名不等于同曲）。因此 `附加信息` 必须按 `(角色, 专辑, 曲目)` 逐条取自"该专辑所属作品"的标签，绝不能按曲名合并或一刀切。

### D132 追加：子进程不许继承终端的 stdin（"抓取跑完终端不回显"）

**现象**（用户报的）：音乐抓取跑完，终端里敲命令**看不到回显**（能跑，但像瞎了一样）。

**排查**：这是"子进程抢终端"这一类的经典症状 —— 父进程把 stdin 留给子进程，
子进程若是 `ffmpeg`，它**只要看到 stdin 是终端**就会去接管它（`read_key` 那条路），
异常路径退出后终端可能停在非回显状态。本项目里两个高危点：

| 位置 | 次数 |
|---|---|
| `loudness.mean_volume_db()`（量响度，每条曲目一次） | 一轮 **86 次** |
| `fetch_audio.render()`（裁剪，`-c copy`） | 每首裁过的 1 次 |

**改法**（全部 `ffmpeg`/`yt-dlp` 调用点）：`stdin=subprocess.DEVNULL`，ffmpeg 另加 `-nostdin`
（两个都要：`-nostdin` 只管"要不要读"，拦不住"stdin 是 tty"这件事）。涉及
`fetch_audio`（download/render/ffmpeg_problem/uv lock/uv sync）、`loudness`、`ingest_local_audio`、`ingest_otomads`。

**守卫**：`tools/tests/test_pack_audio.py::test_every_ffmpeg_and_ytdlp_call_gets_its_own_stdin`
—— 读 `src/otomads/*.py` 的 AST，凡是命令里带 `ffmpeg`/`ffprobe`/`yt-dlp` 的 `subprocess.*` 调用
**必须**显式给 `stdin`，否则红（实测：故意删掉一处 → 报 `ingest_otomads.py:109` ✓）。
只读源码、不起进程，所以任何机器上都能跑。

**没能做的验证**（如实记下）：**Linux 沙箱里复现不出这个症状** —— 用真 pty（`pty.openpty`）跑
`ffmpeg volumedetect`、以及整条 `fetch_audio`（含真下载 + 裁剪 + 量响度），跑前跑后
`lflag` 都是 `0x8a3b`、ECHO/ICANON 都还在。用户的终端是 **WSL2**，社区里同类报告正集中在
WSL 的 `subprocess.Popen`（见搜索结果：`subprocess.Popen making WSL 2 terminal inputs invisible`）。
所以这条按"规范写法"落地，不赌平台；`stdin=DEVNULL` 对 ffmpeg 的**输出没有任何影响**（同一文件
继承 stdin / DEVNULL / 走函数，三者都量出 `-10.3 dB` ✓，这是本轮实测的）。

**顺带**（用户要求）：编辑了 `README.ai.MD`（补 `--jobs 4` 与并发说明）与 `tools/README.md`
（新增"两条实现纪律"：并发只在应用层、子进程必须重定向 stdin）。

**flag 改名：`--offline-ok` → `--skip-update`**（用户要求）：旧名字只说了"离线"这**一种**用法，
而它管的是"**这一步别做**"—— 不查 PyPI、不升级；离线只是最常见的场景。
`ensure_ytdlp(skip_update=…)`、`args.skip_update`、帮助与全部文档一起改（主仓库只有文档，工具在数据仓库）。

**commit 整合**（用户要求）：数据仓库把本次的 5 条 squash 成 3 条
（相对路径 / 并发抓取 / stdin 与改名），**用户自己的 `README` 两条提交原样保留**；
主仓库把本次的 10 条 squash 成 3 条（源表相对路径 + 守卫 / 三家部署配置 + mobile 用例 / gitlink 与决策）。
两条分支都是**已推送的历史被重写**（`--force-with-lease`），旧 SHA 留档在
`backup-commits.tmp/`（工作区根，不进任何仓库）。中间那几个 tag 指向的 commit
（`ee27bb6` / `66206c6` / `addfdb8`）在远端变成不可达，`git gc` 后会消失 —— 只影响历史，不影响任何形态的部署。

**数据仓库 tag**：`th09.5-260924` 最终指向 `2dc63e4`（主仓库 gitlink 跟着走）。

---

## D133 「关于」弹窗（不是页签）：四行信息 + MD2 对话框规格

**需求**（用户，三轮）：① 加 About / 关于；② **改成弹窗**，只写四件事 —— **项目作者 / 仓库地址 /
原作·原曲作者 / 上游版本作者**，**要有关闭按键**，样式遵循 MD2；③ 内容文件要**能直接在内部编辑所有文本**，
且「关闭」二字取**白色**。

**第一轮做错的**（记下来免得再犯）：先做成了**第 5 个页签 + 一整页**（介绍 / 怎么玩 / 数据来源 /
版本与数据 / 致谢 + 五张卡片 + 动态数据 chip）。用户否掉：信息量远超需要，而且要为此动一堆本来不该动的东西 ——
`TAB_ORDER`、`session` 的页签存档、主题里的页签最小宽（5 个页签在 412dp 手机上排不下，被迫把 MUI 的 90 改成
MD2 的 72）、以及 6 条围绕"页"写的测试。**结论：需求说"弹窗 + 四行"就做弹窗 + 四行**，
把工程动作限制在真的需要的那几处。

**结论**（做成了什么）：

| 面 | 位置 |
|---|---|
| **弹窗里的全部文字**（标题、每行标签与内容、关闭按钮） | **`src/content/about.ts`** —— 用户只改这一个文件 |
| 弹窗本体（排版，不含任何文案） | `src/ui/components/AboutDialog.tsx` |
| 入口 | 应用栏最右的 ⓘ 图标按钮（48dp 触控区 + 24dp 图标，`MD2.iconButton`；无障碍名字取 `aboutContent.title`） |

**内容文件为什么长成"数组 + 双语对"**（第三轮改的）：第一版是四个**具名字段**
（`projectAuthor` / `repository` / …）＋标题与四个标签留在 `localization.ts` ——
结果是"改一个标签要动另一个文件"，"加一行"要先加类型再加键。现在：

```ts
export const aboutContent: AboutContent = {
  title: { en: "About", zh: "关于" },        // ← 要写两份
  close: { en: "Close", zh: "关闭" },        // ← 要写两份（颜色是正文白，见下）
  rows: [                                     // ← 数组顺序 = 弹窗里的顺序；加/删/换序都只动这里
    { label: { en: "Project author", zh: "项目作者" },   // ← 要写两份
      name: "Dustymind",                                 // ← 只写一份（专有名词）
      url: "https://github.com/Dustymind" },             // ← 留空 "" = 只显示文字，不给链接
    …
  ],
};
```

`localization.ts` 里那 6 个 `About*` 键**删掉了**（不留第二处真源）；那个文件现在只管界面固定标签。
唯一省不掉的是 `title` / `close` / `label` 要写 en/zh 两份 —— 那是语言开关的代价，
所以把"哪些要写两份"直接写进文件头的表格里，并由 `about.test.ts` 守住。

**不写标签的行 = 单行行**（用户要求）：`label` 也改成**可选**，"没标签"同样按三种写法判 ——
**整条不写 `label`** / 两份都留空 / 只有空白。没标签时**连 `caption` 元素都不挂**（不是空占位），
那一行就只剩内容一行；浏览器实测：有标签的行 **46px**（标签 + 内容两行），没标签的行 **24px**（一行）。
行上带一个 `data-single-line="true"` 标记，测试与将来的样式钩子用它，不必猜 DOM 结构。
守卫：`AboutDialog.test.tsx` 的"不写 label 的行是单行行"（不写 / 两份留空 / 有标签各一行，
断言 `caption` 有无、标记属性、以及**单行行确实比两行行矮**）。

**行间距按行分别给**（用户第三轮又反馈"无标题时空行间隔过大"）：第一版把所有行塞进 `Stack spacing={2}`，
于是"续行"和别的项一样吃 16dp 项间距 —— 在作者名下面那行模型名看起来就是**凭空多了一条空行** ✗。
现在间距写在行自己身上：**第一项 0 / 没有标签的续行 8dp / 有标签的项之间 16dp**
（都走 `MD2.grid` 的 8dp 栅格；浏览器实测 `gapAbove` = 8 / 16）。
守卫同上那条用例的后半段：断言三档 `margin-top` 是 `0px / 8px / 16px`，
再**只比大小**地量一遍真实空白（`项间距 > 续行间距`）——
**不比绝对值**：入场是 `Grow`（scale 0.75 → 1），动画没落位时所有 rect 都被缩放
（实测 8dp 量成 5px，和 e2e 里那条"关闭键 27px"是同一个坑）。

**没有链接的行 = 白色纯文字，绝不渲染空链接**（用户要求）：`url` 改成**可选**，
"没有链接"把三种写法都算上 —— **不写 `url`** / 空串 `""` / 只有空白。
之前只判 `row.url === ""`：用户若把 `url` 那一行**删掉**，`undefined` 判不出来，就会渲染出一个
**没有 `href` 的空 `<a>`**（点不动，却把文字染成主色）。现在没地址就是 `<Typography color="text.primary">`
（= onSurface 100% = 白），有地址才是主色 `<Link target="_blank" rel="noreferrer noopener">`。
守卫：`AboutDialog.test.tsx` 里那条"没有链接的行"塞了一份**临时内容**（不写 / 空串 / 空白 / 有地址各一行），
断言前三行没有 `<a>` 且颜色是 `rgb(255, 255, 255)`、整张弹窗里**只有一个**链接元素 ——
这也是 `AboutDialog` 留出可选 `content` 口子的原因（默认仍是用户编辑的那份内容真源）。

「关闭」取白色（**用户裁定，唯一一处有意偏离 MD2**：MD2 的对话框动作按钮用主色）：
`<Button color="inherit">` —— 跟随纸张正文色（onSurface 100% = `#FFFFFF`）。
实测（真浏览器）：`getComputedStyle(close).color === "rgb(255, 255, 255)"`，而四行的值仍是主色链接。

**没动的东西**（这就是这一版比第一版好的地方）：`TAB_ORDER` 与页签存档（还是四个页签）、
主题常量（页签最小宽仍是 MUI 默认）、`data/` 与 13 个生成物、联机协议。
弹窗的开合是**纯界面状态**（`AppShell` 里的 `useState`）：不落盘、不进联机快照。

**并顺手把上游那个键名改了**：上游第 4 个页签的**键**叫 `TabNameAbout`、**文案**却是 "Match/游戏"
（`.ref/notes/B-ui-config-spec.md` §8.3 记过这处不一致）。本仓库现在真有一个「关于」弹窗，
两者同名会一直让人看错，所以游戏页的键改成 **`TabNameMatch`**（**文案一字未动**）。

**MD2 对话框规格落在哪**（`src/ui/components/AboutDialog.tsx` 里逐条有注释）：

| MD2 规格 | 实现 |
|---|---|
| 最小宽 280dp / 最大宽 560dp | `slotProps.paper.sx` 上的 `minWidth/maxWidth`；**关掉** MUI 的 `maxWidth` 断点（它那套是 xs/sm/md，不是"固定区间"） |
| 圆角 4dp | `MD2.shape`（纸张圆角本来就由主题的 `MuiPaper` 给，这里显式写出来） |
| elevation 24dp | MUI `Dialog` 的默认值就是 24 —— 与 MD2 一致，不用手写 |
| 遮罩 32% 黑 | `slotProps.backdrop.sx`（MUI 默认 50%，偏暗） |
| 标题 20sp/500、上/左/右 24dp | `DialogTitle` 用的是主题里的 `h6` = MD2 类型比例的 20sp/500；`px/pt: 3`（24dp） |
| 内容左右 24dp | `DialogContent` 的 `px: 3` |
| 操作区 8dp、按钮右对齐 | MUI `DialogActions` 的默认就是 `p: 1` + `justify-content: flex-end` |
| 进入 150ms / 退出 75ms，淡入 + 从 80% 放大 | `slots={{ transition: Grow }}`（scale 0.75→1）+ `transitionDuration={{ enter: 150, exit: 75 }}`（Dialog 会把它同时转发给遮罩） |
| 关闭方式 | 右下角「关闭」文字按钮（MD2 的 dismissive action）+ **点遮罩** + **Esc**，三者都走同一个 `onClose` |
| 窄屏 | 纸张外边距 `m: 3`（24dp，MUI 默认 32dp 在手机上更窄）；412dp 手机上实测宽 364dp、不横向溢出 |

**守卫与实测**：

| 守卫 | 查什么 |
|---|---|
| `src/content/about.test.ts`（5 条） | `title` / `close` 的 en、zh 都不空；行 `label` 可省、但写了就要两份都在；每行 `name` 不空且至少一行；`url` 要么不写/留空、要么是能 `new URL()` 解析的完整地址；文案里没有 Markdown 残留 |
| `src/ui/components/AboutDialog.test.tsx`（13 条） | 内容真源里的**每个字**都渲染出来；**行数与顺序 = `rows` 数组**（`about-row-<下标>`）；有地址的行是链接且 `target=_blank rel=noreferrer`、留空的行不是链接；关闭按钮在 `MuiDialogActions` 右对齐、**是白字**、按下去回调一次；点遮罩关、Esc 关；关闭后不再渲染；**没有链接的行是白字且没有空链接**（不写/空串/空白三种写法）、**MD2 尺寸/圆角/阴影/遮罩色**；切语言后标题+标签+关闭按钮一起变中文；内容只写一行时页面也只有一行。断言一律**跟着内容真源算**，改人名/改标签不会假红 |
| `src/App.test.tsx`（+1 条） | 应用栏 ⓘ 的 `aria-label` = `aboutContent.title`；点开后每行的标签与内容都在、有地址的行是 `_blank` 链接；点「关闭」后弹窗从 DOM 消失 |
| `e2e/smoke.spec.ts`（+1 条，双引擎） | 同上走真实浏览器；**文字直接 import 内容真源**；链接**按行定位**（按文字找会撞车：`Dustymind` 是 `Dustymind/touhou-…` 的子串，strict mode 报两个元素 —— 实测踩到）；MD2 的 min/max 宽、4dp 圆角、elevation、遮罩色 |
| `e2e/mobile.spec.ts`（+1 条） | 412dp 手机上弹窗 ≥280dp、两侧各留 24dp、不横向溢出；关闭键 ≥32dp 且点得掉。**量之前先等动画落位**：入场的 scale 挂在 `.MuiDialog-container` 上（纸张的 transform 恒为 `none`，盯它等于没等），没等就量会得到 **27px = 36 × 0.75** 的假红 —— 用 `expect.poll` 等缩放归 1（与播放页卡面那条用例同口径） |

数字：`pnpm typecheck` ✓；`pnpm test` **674 passed**（76 文件；比 D132 基线 636 多 38 = 19 条 × 双引擎）、
`pnpm e2e` **87 passed + 1 skipped**（见 docs/README.md 现状表）。

**没做的事**：没给弹窗加"编辑入口"（运行时改内容 = 又一套持久化，与"静态站 + 内容随仓库走"的形态不符）；
没把上游的 `TabNameSourceCode`（"Source/源码"）搬过来 —— 弹窗里的"仓库地址"就是那个职能。

---

## D134 「关于」弹窗里的外置曲库署名（自动行 + 拼音首字母混排 + 本地源门槛）

**需求**（用户）：把**外置曲库（音MAD 曲包）曲目的作者**加进「关于」弹窗，**放在「原作」上方**；
标签英文写 `Extra pack music author`。随后用户定了三条：**自动收集**、**按名字排序（英文/拼音首字母）**、
**本地曲库助手真的在跑才显示**。

**数据实情**（`public/data/otomads/characters.json`）：96 条曲目里 **85 条带 `author`**，去重后 **56 个署名**、
长尾很重（最多的一位 12 首，49 位只有 1 首），且不少是合写（`A & B & C`）——**合写原样保留，不拆**。
原曲数据集 378 条**一条都没有** author 字段。数据里只有每首曲子的 `source`（bilibili 视频地址），
**没有作者主页** ⇒ 名字按"没有链接就白色纯文字"的规则渲染。

**做法**：

| 面 | 位置 |
|---|---|
| 名单的**收集与排序** | `src/music/packAuthors.ts`（`collectPackAuthors` / `packAuthorsFor` / `sortKeyOf`） |
| **门槛**（助手在跑） | 同上 `packAuthorsFor()`：当前模式的本地源 `kind === "local"` + `enabled` + `status === "ready"` 且表里有曲目 |
| 行的**位置与标签** | `src/content/about.ts` 的 `{ auto: "pack-authors", label: … }`（现在放在「原作」上方） |
| 渲染 | `AboutDialog` 的 `AutoRow`（默认一段文字用「、」连接；`layout: "lines"` 则一行一位） |

**排序为什么要自己造键**：直接拿 `Intl.Collator("zh-Hans-u-co-pinyin")` 排**不够** ——
实测 ICU 把**拉丁名排在所有汉字之后**（`Chyan_184` 落在 `张伟` 后面），那就不是"首字母混排"了。
现在的键 = 首字母：拉丁取首字母；汉字**拿 ICU 的拼音序当数轴**，在 23 个锚点字
（每个首字母取该字母的**最小音节**：a=阿、b=八、c=擦…z=匝）里找"最后一个 ≤ 它"的锚点；
假名/数字显式归到 `~`（排在字母之后）。这个键**是 ICU 序的细化**（同键内仍按 ICU 排），
所以不会与它打架，也与多音字无关 —— 锚点比较用的就是 ICU 自己给的读音。
实测真实名单：`鞍山侯国玉电乐团`(a) → `拔剑Sketon`(b) → `Chyan_184`(c) → `打酱油的小火柴`(d) → …
→ `丶Mikan`(zhǔ, z) → 假名（`きゅーみぅ`…）殿后；共 56 个，两引擎同序。

**门槛带来的可见性**（要记住）：本地源只属于音MAD 数据集 ⇒ **原曲模式下这一段不显示**
（那个模式根本不加载本地源，无从判断助手在不在跑）；切到音MAD 模式且助手在跑时才出现。

**守卫**：

| 守卫 | 查什么 |
|---|---|
| `src/music/packAuthors.test.ts`（10 条） | 排序键（拉丁/汉字/假名/数字/开头下划线）、A→Z 混排（`鞍` < `拔` < `Chyan_184` < `打` < `张` < 假名）、去重、无 author 的行、原曲数据集不贡献、合写不拆；门槛六种状态（表还没建 / idle / error / ready 但空 / ready 有曲目 / 本地源被关掉 / 原曲模式）；**真实数据**里 56 个署名去重且混排生效 |
| `AboutDialog.test.tsx`（+3 条） | 自动行渲染在**锚点那一行的位置**、名字用「、」连成一段、白色不是链接；名单为空时**整行不渲染**（连标签都没有）；`layout: "lines"` 一行一位 |
| `App.test.tsx` | 单测里助手没在跑 ⇒ 自动行的标签**不出现**（就是用户定的那个条件） |
| `e2e/smoke.spec.ts`（+1 条，双引擎） | 切音MAD + 助手在跑 ⇒ 段落出现、含真实署名（从生成物读）、**在「原作」上方**、名字不是链接。踩过一次坑：这个用例的断言一开始写死中文标签，而页面默认是 en ⇒ 改成从内容真源取 `label.en` |
| `e2e/mobile.spec.ts`（+1 条） | 手机上面名单很长时：弹窗不超出屏幕、**内容区内部滚动**、关闭键始终留在屏幕里、不横向溢出 |

**没做的**：没把假名拉丁化（要内置五十音表，先不做 —— 排在最后已经可读）；
没做"只列前 N 位"或折叠（用户要全列）；没有为作者名加链接（数据里没有主页）。

---

## D135 外置曲库的多作者支持（`authors` 数组 + 播放页与关于页共用一套排序）

**需求**（用户）：① 给自定义曲库（音MAD 曲包）加**多重作者**支持；② 播放器显示作者时，
**排序按关于页那套方法**（英文/拼音首字母混排，D134）。

**现状**：曲包只有单个 `author = "丹花伊吹 & 艾了个拉 & …"`（85 条里 5+ 条是 ` & ` 合写的），
一路原样进生成物第 4 位 `[专辑, 曲名, extra, author]`，前端当**一个字符串**显示。

**三条不能破的约束**（查过才动手）：

1. **磁盘名 = `作者 - 标题.mp3`**，它同时是助手 manifest 的匹配键、响度表 `loudness/otomads.json` 的键、
   单曲模式存档的一部分（数据仓库 `packformat.audio_filename`，D95/D96 明写"不能改"）；
2. 前端 `gainKeyOf()` 就是拿第 4 位拼这个 key ⇒ **第 4 位不能变成数组、也不能排序**；
3. 老数据里 `author` 是**一整串**，猜 ` & ` 当分隔符会拆错（人名里也可能有 `&`）。

**结论**：

| 面 | 做法 |
|---|---|
| 曲包写法 | `author = "甲 & 乙"`（老，整串，**不拆**）或 **`authors = ["甲", "乙"]`**（多作者）；两者只能写一个 |
| 解析（主仓库 `tmc.packs`） | `authors` → 规范化成 `track["authors"]`（数组）**加** `track["author"] = " & ".join(...)`（stem 那一位） |
| 生成物 | 第 4 位仍是整串（D94 不变）→ **顺手追加第 5 位** `authors`（只有写了数组才有） |
| 前端类型 | `MusicEntry = [album, title, extra, author?, authors?]`（`load.ts` 校验第 5 位是非空字符串数组） |
| 播放页 | `creditLine()`：有第 5 位就 `formatAuthors()`（**排序** + 「、」连接），否则原样显示第 4 位 |
| 关于页 | `collectPackAuthors()`：有第 5 位就逐个署名，否则整串算一个（D134 那一段因此自动受益） |
| 排序实现 | 抽到 **`src/music/authorOrder.ts`**（`sortKeyOf` / `sortAuthors` / `formatAuthors` / `AUTHOR_SEPARATOR`）—— 关于页与播放页**共用一份，不许各写一套** |
| 单曲存档 | `copyEntry()` 把第 5 位一起带上（丢掉它，pin 的曲目显示会退回整串） |

**为什么两种写法在磁盘上等价**：`authors = ["甲","乙"]` ⇒ `"甲 & 乙"` ⇒ 文件名与老写法逐字节相同
⇒ **把老条目改成数组不需要重抓/重裁音频**，响度表的键也不用动。这也是为什么连接符固定是 `" & "`
（`packs.AUTHOR_JOIN`）而不是「、」——后者只用于**显示**。

**守卫**（本轮）：

| 守卫 | 查什么 |
|---|---|
| `tools/tests/test_rules_and_data.py`（+7 条 pytest） | 老写法整串保留且不产生 `authors`；`authors` 规范化出的整串**与老写法逐字节相同**；`author`+`authors` 同写报错；非数组/空数组/空项报错；`build._pack_music` 第 4 位整串、**第 5 位数组**、没作者只有 3 位 |
| `src/music/authorOrder.test.ts`（6 条） | 首字母键（拉丁/汉字/假名/数字/空串）；A→Z 混排；不改原数组；比较函数是全序；`formatAuthors` 排序+「、」；单人原样 |
| `src/music/packAuthors.test.ts`（+1 条） | 写了 `authors` 数组 → **逐个署名**（`["乙","甲"]` → 甲、乙 两条），整串不再算一个署名 |
| `src/ui/panels/PlayerPanel.test.ts`（5 条，新文件） | 第 5 位 → 排序后「、」连接；单作者原样；只有整串 → **不按 `&` 拆**；没作者回退专辑名 / `showAlbumName:false` 整行不显示；无曲目 → null |

数字：主仓库 pytest **56 passed**（原 48）；`pnpm test` **724 passed**（362 条 × 双引擎）；
`pnpm data:check` **无漂移**（现有数据没写 `authors` ⇒ 生成物逐字节不变，`contentHash` 也不变 ⇒ 不影响联机握手）。

**数据仓库那一半（本轮已做，tag `th09.5-260925` → `8c1b78b`）**：

| 面 | 做法 |
|---|---|
| 解析（数据仓库 `otomads.packformat`） | `TRACK_KEYS` 加 `authors`；`_read_authors` 与主仓库同一套规则；新增 `AUTHOR_JOIN` 与 `author_of()` |
| 成品文件名 | `audio_filename()` 改用 `author_of()` —— 行为不变（还是 `作者 - 标题.mp3`），但只写 `authors` 也能算对 |
| 录入器（`otomads.ingest_pack`） | 录入行那一项写成数组即落盘成 `authors = [...]`（`FIELD_ORDER` 加 `authors`，`track_block` 会写 TOML 数组）；只写 `author` 的老行不受影响 |
| 测试 | 数据仓库 pytest **74 passed**（原 62，+12）：数组规范化出的名字与老写法逐字节相同、`author`+`authors` 同写报错、非数组/空数组/空项报错、整串不拆、只给 `authors` 时文件名也对、录入器写数组（含转义）与坏行报错 |
| 文档 | 数据仓库 `README.ai.MD` 补 `authors` 一段（**用户的 `README.md` 一个字没动**） |

**跨仓库耦合的守卫**（这次新加的一条）：`AUTHOR_JOIN` 在两个仓库各有一份（零 import 依赖），
主仓库 `tools/tests/test_build.py::test_author_join_matches_the_data_repo_helper` 按**文本**比对两个字面量、
并检查两边的代码里都出现 `"authors"`；submodule 没初始化时跳过（与其它依赖曲包的用例同口径）。

**流程**（按 HANDOVER §11）：改**克隆** → 提交（只提交我改的 5 个文件，用户未提交的
`loudness/otomads.json` 与两个 pack 文件原样留着）→ 打 tag `th09.5-260925` →
主仓库 submodule `git fetch --tags --force <克隆> && git checkout th09.5-260925` → `pnpm data:check`
**无漂移**（数据内容没变，生成物逐字节相同 ⇒ `contentHash` 不变）、`pnpm data:validate` 通过、
主仓库 pytest **56 passed**（原 48，+8）。**两个仓库都还没 push**（用户定）。

**合写署名的拆分（用户裁定后已做，并入同一个 tag `th09.5-260925` → `89ec9c3`）**：
8 条合写拆成 `authors = [...]` —— 7 条 ` & ` 写法（`" & ".join(parts)` 与原文逐字节相同 ⇒ 成品文件名不变、
**不用重抓/重裁音频**）＋ 1 条 ` vs ` 写法（`koakuma.toml`：连接符换成 ` & ` ⇒ 成品文件名变了，
**同时重命名**了 `.music/otomads/` 里那个 mp3 与 `loudness/otomads.json` 的键，增益值不变）。
去重后署名 **56 → 72**；8 条曲目带上 `authors` 数组（助手侧逐条核对过"算出的文件名都在磁盘上"）。
拆分脚本自带保真检查（`" & ".join(parts) == 原文`，不一致就跳过并报错）。

**由此产生的指纹变化**：音MAD `contentHash` `4c2ae0dee354` → `88b738f3ea41`（第 5 位进哈希）
→ **`09fdd246a127`**（用户随后把两条人工曲目的 `source` 与一条实测增益也一并提交了，`source` 本来就进哈希）⇒ **联机握手的两端必须一起更新**；原曲那份（`e95684b826fb`）不受影响。

**没做的**：数据仓库克隆里用户未提交的改动（两条 `source` 补丁 + `y的自然对数` 的增益 -14.6→-16.0）
本轮**未触碰**：提交时用 `git apply --cached` **只暂存我改的 hunk**（索引里 8 个文件、工作区里只剩他那 3 处）。
旧 tag 指向 `8c1b78b`，前移前的 SHA 记在 `backup-commits.tmp/tag-moves.txt`。

## D136 项目改名：东方谐频拾遗 ~ Forgotten Harmonic Frequencies in Cards and Otomads（三档命名）

**需求**（用户）：先问"用东方谐频拾遗做项目名如何（先不修改）"，讨论一轮后给出**全名**并裁定**全量落地**。

**名字为什么是这几个字**（讨论里定的，别"顺手改通顺"）：

- 「拾遗」不是随手挑的雅词：歌牌源自百人一首、百人一首源自勅撰和歌集，而《拾遺和歌集》正是
  "把前几部集子**漏掉的**和歌收拢起来"的那一部 —— 与本项目"从公开镜像与音MAD 曲包**拾取散落曲目**"同构；
  同人音乐圈也已有「〜拾遺」的专辑先例（《永夜新月譚拾遺》《秘封夜総会拾遺》）。
- 「谐频」是**双关**：谐波 / 谐波频率（这游戏靠听一小段前奏认曲）＋「谐」的诙谐义（音MAD 本身就是梗文化）。
- 英文的 `Forgotten` 是对「拾遗」的**可读性取舍**（中文留典籍腔、英文取"被遗忘的"）；
  `Cards` 与 `Otomads` 不是新造词 —— 它们是**应用内既有的英文词**升格（`MusicModeOtomads` 的英文一直是 "Otomads"）。
- 音韵：`Forgotten **H**armonic **F**requencies` 头韵；中文六字在古典读法里是"平平平平**入**平"（拾＝入声）。

**三档命名**（本轮唯一要记住的规则 —— **别把三档合成一档**）：

| 档 | 文案 | 落点 |
|---|---|---|
| 短名 | 东方谐频拾遗 / Forgotten Harmonic Frequencies | `ShellAppTitle`：应用栏（`AppShell.tsx`）＋游戏页面板标题（`GamePanel.tsx`，`h6`） |
| 全名 | 东方谐频拾遗 ~ Forgotten Harmonic Frequencies in Cards and Otomads | `index.html` `<title>`、`README.md` H1 |
| **不动** | 包名 `touhou-music-cards`、tag `th09.5-*`、数据仓库名、联机协议与两个 `contentHash`、部署路径 | 仓库名 / 版本号 / 握手 / 三家静态托管 |

**为什么短名与全名必须分**：应用栏标题是 `whiteSpace: nowrap` 的**硬宽度**，全名（6 汉字 + 60 拉丁字符）
在那两处会换行 / 溢出（窄屏实测见下）。

**落点（主仓库 6 个文件）**：`index.html`、`src/i18n/localization.ts`（`ShellAppTitle`）、
`src/App.test.tsx`（它断言的是 **en** 串，必须跟着改）、`README.md`、`tools/pyproject.toml`、`docs/rng-v1.md`。

**故意没动的三处**（免得下次被当成漏改）：

1. `src/content/about.ts` 的「原版歌牌游戏 / 原版歌牌游戏作者」—— 那是**上游** lightbulb128 的项目，不是本项目；
2. `README.md` 第 3 行的「歌牌游戏」—— 是**体裁**名词（这游戏确实是个歌牌游戏），不是项目名；
3. 数据仓库 `tools/pyproject.toml` 的 description —— 用户随即要求**一起做**（走完整一轮），见下面"数据仓库那一半"。

**窄屏实测**（临时探针：chromium，412 / 360 / 320dp × zh / en；**跑完已删**，不进仓库）：

| 语言 | 标题文本宽度 | 应用栏高度 | 横向溢出 |
|---|---|---|---|
| zh | **121px** | **96px** | 三档宽度都没有（`toolbarScroll == toolbarClient`、`docScroll == docClient`） |
| en | **295px** | **128px** | 同上，也没有 |

⇒ **代价只有一条，且只在"英文 + 窄屏"**：英文标题变长后，`Alice!` 按钮与 ⓘ 在 < ~470dp 上挤不进标题那一行，
被 `flexWrap` 推到第二行 ⇒ 应用栏高 **96 → 128px**（多一行 32px）。**中文（默认语言）与宽屏都不受影响**。
**本轮保持现状**：无溢出、触摸目标仍是 48dp（`e2e/mobile.spec.ts` 的触摸目标用例过）；若要收回这一行，
办法是给窄屏单独一套更短的英文短名（要新增 i18n 键），**用户未要求，不做**。

**数据仓库那一半（用户要求一起做，走完整一轮 §11）**：

| 步 | 内容 |
|---|---|
| 克隆 | description 改成 `东方谐频拾遗 · 音MAD 曲包数据仓库的工具：…`，提交 `61d9e8d chore: rename the project in the tools description` |
| tag | **force-move `th09.5-260925`**：`43868b5` → `61d9e8d`（同一天第 5 次移动）。**不新开 tag** 的理由与 D131 那次相同：tag 名里只有当天一个日期，新开 `th09.5-260926` 会是"明天"的错日期 |
| submodule | `git fetch --tags --force <克隆> && git checkout th09.5-260925` → `61d9e8d`；`pnpm data:check` **无漂移**，两个 `contentHash` 都没变 ⇒ **联机两端不用一起更新** |
| 主仓库 | gitlink 单独提交（`data: pin the otomads submodule to th09.5-260925 (tools description rename)`） |

**两个坑（这个仓库以后还会踩）**：

1. **`git tag -f <name> <commit>` 会把附注 tag 换成轻量 tag** —— `git cat-file -t` 从 `tag` 变 `commit`。
   本仓库三个 tag **全是附注 tag 且各带一行中文说明**，所以移动必须写
   `git tag -f -a -m "<说明>" <name> <commit>`，并把这轮内容追加进说明（现在是
   `多作者 + 合写拆分 + 补齐 source + 响度表自查 + 缓存键刷新 + 工具描述改名`）。本轮先踩了一次、已重建修回。
2. **`backup-commits.tmp/tag-moves.txt` 记的是 commit SHA，不是 tag 对象 SHA** —— `git rev-parse <tag>` 给的是
   tag 对象，要 `git rev-parse <tag>^{}` 才是 commit（本轮第一次也记错了、已改）。

**顺手修掉的一处漂移**：`docs/reports/validation-report.md` 里还写着"带 source（可自动抓取）**84** 条"——
`e9b4430` 补了那两条人工曲目的 source 之后没人重生成这份报告；`pnpm data:validate` 一跑就变 **86**。
数据本身没错，错的是这份被跟踪的产物，已单独提交（`data: refresh the validation report (86 tracks with source)`）。

**验证**：`pnpm typecheck` ✓；`pnpm test` **724 passed / 82 文件**（与 D135 基线同数，`App.test.tsx` 双引擎都过）；
`pnpm e2e` **90 passed + 1 skipped**（8.7 分钟，含 mobile 的 11 条；前置是 `pnpm local` 在跑）；
`pnpm data:build` 13 个文件 / `data:check` **无漂移** / `data:validate` ✅（引用集合指纹 `9eecf074138b`）；
`pnpm build` **1.4 MB / 18 文件**；主仓库 pytest **56 passed**、数据仓库 pytest **78 passed**。

## D137 给缺失的角色预置曲包骨架（`tmc.scaffold`；S2 仍只预留）

**需求**（用户）：后续要**手工**编辑数据仓库补全其余角色的音MAD 曲目，问能否提前把剩余角色的元数据搬过去
（或放模板）。裁定：**走"骨架文件"（方案 A）**、**C（S2）只预留不实现**、注释**要带** `name`/`order`、
生成要做成**可重复**的子命令。

**先摸清的三条硬约束**（决定了"能搬什么"）：

1. `characters.toml` 是**派生**清单（`tmc.roster.build_roster` = 曲包引用到的角色 + 手工追加的原曲没有的角色）。
   把还没曲目的角色提前写进去 ⇒ `tmc.validate.check_roster` 走 `p.error` 报「清单里有不再被曲包引用的角色」，
   且 `pnpm data:roster` 会把它删掉 ⇒ **`name`/`order` 不能提前搬进清单**。
2. 角色文件顶层只允许 `key` 与可选的 `card`（`tmc.packs.CHARACTER_KEYS`；`_reject_unknown` 对陌生键**直接报错**）
   ⇒ **`name`/`order` 也不能作为真键写进骨架**，只能进注释。
3. 契约 `docs/otomads-separation-v1.md` §5 把这件事定成 **S1（单一真源投影，已实现）vs S2（各自真源）**，
   并把 S2 挂在触发条件上（音MAD 要有原曲没有的角色/卡面时）。**想把身份搬过去 = 半个 S2**，本轮不做。

**做了什么**：新增 `tools/src/tmc/scaffold.py`（`pnpm data:scaffold`）—— 为「真源里有、`packs/otomads/`
里还没有文件」的角色生成骨架：头两行与数据仓库 `otomads.ingest_pack.FILE_HEADER` 同款，接着是
`name` / `order` 注释、`key = "..."`，以及一份**注释掉的** `[[track]]` 示例（示例里 `extra` 的合法取值
直接从 `validate.EXTRAS` 取，不会漂移）。**幂等**（已有文件一个字节不动）、`--dry-run` 可先看、
submodule 没初始化时给可执行提示。落点是 submodule（`data/otomads/packs/otomads/`），与 `tmc.roster`
同一套"主仓库工具写数据仓库工作区"的做法。本轮生成 **86 份**（121 个真源角色 − 35 个已有曲目的）。

**它为什么是惰性的**（实测，不是推断）：

| 检查 | 结果 |
|---|---|
| `pnpm data:build` | 13 个文件；原曲 `e95684b826fb` / 音MAD `09fdd246a127` —— **两个哈希都没变** |
| `pnpm data:check` | ✅ 生成物无漂移（`public/data/**` 逐字节不变） |
| `pnpm data:validate` | ✅ 通过（引用集合指纹 `9eecf074138b` 不变；`characters.toml` 仍是 35 条） |
| 主仓库 pytest | **64 passed**（原 56，+8 条新用例） |
| 数据仓库 pytest（读的是含 86 份骨架的 121 个文件） | **78 passed** |

机制上：骨架没有 `[[track]]` ⇒ `packs.load_packs` 不产出曲目 ⇒ 不进任何数据集；`tmc.roster.diff()`
只看 `characters.toml`、不看角色文件；数据仓库 `local_source` 的 manifest 是**扫磁盘**生成的、不读角色文件；
`ingest_pack` 对已存在的文件是**追加**（`path.exists()` 分支）⇒ 骨架与它兼容，填过之后不会被重建。

**C（S2）预留**：真要"音MAD 自有身份 / 自有顺序 / 自有别名"时再开；届时要改的四处已写进契约 §5
（`tmc.roster` 的清单语义、`check_roster`、契约本身、数据仓库 `README.ai.MD`），且要先约定"跨库后角色 key 的来源"。

**顺带修掉的一处漏改**：改名那轮（D136）的核对 grep 用了 `--include=*.md`，**没匹配到 `README.ai.MD`
（大写扩展名）**，于是数据仓库根那份说明的第 1 行还写着旧项目名 —— 本轮一并改成「东方谐频拾遗 · 音MAD 曲包数据」。
教训：跨仓库改名核对**不要按扩展名过滤**。

## D138 音MAD 素材的静态部署（`stage_media`：打归档 + 铺 dist，构建时拉取）
> ⚠️ **前提已变**（无对应决定条目）：主仓库已于 **`e572332`（2026-09-28）转为 public**。
> 下面"主仓库是私有仓库 ⇒ 匿名 404 / 要带令牌"的前提因此不再成立。

**需求**（用户，三轮）：① 问"现行数据库能否单独构建静态页面以供部署" ⇒ 答：数据仓库**不能**（它没有前端与
构建器，只有数据 + Python 工具），主仓库能、而且本来就是纯静态，唯一缺的是音MAD 素材；
② 问"能否做成同源静态素材" ⇒ 答：能，但要生成**烘焙了部署基地址**的 manifest + 按 `media/<专辑>/<曲目>.mp3` 放音频；
③ 裁定：**324 MB 音频走"构建时拉取"**，并把"① manifest ② 音频 ③ 卡面"三步做成**命令 + 说明**。

**做了什么**：新增数据仓库工具 `otomads.stage_media`（**纯标准库**，两个子命令）：

| 子命令 | 作用 |
|---|---|
| `pack` | 按**部署布局**打归档：`manifest.json`（**相对地址**）+ `media/<专辑>/*.mp3` + **本源响度表**（`loudness/otomads.json`，D139 起）+ 可选 `cards-otomads/*`。同一份曲库打两次**逐字节相同**（tar 成员按名排序、mtime/uid/gid/mode 归零、gzip 的 mtime 与 FNAME 都不写） |
| `stage` | 铺进 `dist/`：`--archive <URL\|路径>`（构建时拉）或 `--from <曲库>`（本地铺）；`--base` 才写成绝对地址。结束**自检**（manifest 行数 / 专辑 / 每一行的文件真的在磁盘上），不一致退出码 1 |

主仓库包装：`pnpm media:pack` / `media:stage` / `OTOMADS_MEDIA_URL=… pnpm media:pull`。

**部署方式（用户随后裁定，推翻本节最初写的那条）**：**静态音MAD 源由人手动铺，不接 CI** ——
主仓库的 Pages 工作流保持"纯静态、不需要 Python / 不需要 submodule"的原取舍（工作流里只留一段注释指到这里）。
两条把这条路走死的事实，记下来省得再试：

1. **主仓库是私有的**：Release 资产对**匿名**请求返回 **404**（`releases/latest/download/…` 与
   `releases/download/<tag>/…` 都试过），所以"CI 里一行 `curl … | tar`"在本仓库**走不通**，要拉必须带令牌
   （`gh release download`）。想给**公开**地址就得放对象存储 / 公开仓库，再用 `OTOMADS_MEDIA_URL` 指过去。
2. 归档已发布成 Release 资产 `th09.5-260925`（**336,834,005 bytes**），带令牌下载回来与本地 **sha256 逐字节一致**
   （实测，3 分 21 秒）；解包 87 个成员。手动铺的命令与口径见主仓库 `README.md` 的「音MAD 素材」一节。

**为什么 manifest 写相对地址**（关键设计）：前端把解析出来的 URL **直接赋给 `audio.src`**（`src/audio/usePlayer.ts:296`），
相对地址按**页面**解析 ⇒ 同一份归档在域名根与子目录（GH Pages 项目页）下**都能用**，不必为部署形态重新打包；
而助手的动态 manifest 必须是绝对地址（它可能跨源）。要绝对就 `--base`。

**踩到 / 避开的坑**：

1. **gzip 会把输出文件名写进头（FNAME）** ⇒ 同一份素材打到不同路径就得到不同字节；`GzipFile(filename="")` 才叫可复现。
2. **归档是不可信输入**（可能来自网络）：`stage` 拒绝绝对路径、`..`、符号/硬链接/设备成员（tar 的经典路径穿越），
   两条测试盯着；3.11 没有 `extractall(filter=…)`，用 try/except 兼容（3.12+ 顺带走官方 `data` 过滤器）。
3. **`vite build` 会清空 `dist/`**（默认 `emptyOutDir`）⇒ 顺序永远是"先 build、再铺素材"，重建后要重铺。
4. 归档（324 MB）与 `public/cards-otomads/` 都进 `.gitignore`：**素材不进仓库**这条不变。
5. 工具改的是**克隆**、而 `pnpm` 包装跑的是 **submodule**（§9.2 那条老坑）⇒ 本轮照旧"克隆改 → 提交 → 前移 tag → 切 submodule"。
6. **`pnpm preview` 不能当静态服务器用**：它继承 dev 的代理（`vite.config.ts` 把 `/manifest.json` 与 `/media`
   转发给 8011 助手），助手没跑时这两条是 **500**。验证"站点自带素材"必须用真静态服务器
   （`python3 -m http.server --directory dist`）。这条已写进主仓库 README 与 `deploy/README.md`。

**静态站的实测**（临时探针，chromium，**跑完已删**）：把 `dist/`（含铺好的素材）用 `python3 -m http.server` 发出来，
应用按**页面相对**取到 `GET /manifest.json` → **200**，切到音MAD 后请求
`GET /media/otomads/%E5%B7%9D%E5%85%88%E5%83%A7%20-%20…mp3` → **200**（同源、百分号编码解码后就是磁盘文件），
设置页统计显示「可用 **86** / 全库 **86** 首 · 35 个角色有曲目」。

**实测**（真实 86 首 / 322.1 MB）：`pack` **7.3 秒**出 321.2 MB 归档（87 个成员 = 1 manifest + 86 音频）；
`stage` **1.8 秒**铺完并**自检通过**；manifest **86 行**、地址相对、曲目名 = 磁盘 stem、百分号编码解码后逐一对得上文件。
数据仓库 pytest **93 passed**（原 78，+15）。

## D139 响度表跟着源走（manifest 声明 `loudness` + 前端优先 + 回退）

**需求**（用户）："响度表应该跟着自定义源（如音MAD源）部署吧" —— 提得准：D130 的契约是
"**表由源的所有者生成**"，但**分发**却在应用侧（`tmc.build` 拷进 `public/data/<模式>/loudness/`，
前端把它**相对数据集目录**解析）⇒ 源单独部署（CF Pages / R2 / 独立静态站）时，表并不在源那一侧。

**方案（零破坏）**：源在自己的 **manifest** 里声明表 —— 可选键 `loudness`，路径**相对 manifest 自身**：

* **前端**：`loadSourceTables` 把它解析成 URL（新增 `sourceRelativeUrl()`，**保持相对形式** ⇒ 域名根与
  子目录都对）记在源表上；`AppShell` 组装 `loudnessUrls` 时**优先用它**，没声明才回落到
  `SourceRecord.loudnessUrl`（数据集目录，D130）。播放层那份表的 effect 是**整表重建**（`setGains(next)`），
  所以"最后一次到达的"就是生效的那份。
* **数据仓库**：`stage_media.pack` / `stage --from` 把注册表声明的表打进归档（`loudness/otomads.json`）
  并声明它；CLI 打印覆盖自查（缺 = 那首没量过，合法；多余 = 改名残留）。

**为什么不用"改解析基准"**（把 `loudnessUrl` 一律相对 manifest 解析）：那会让**本机助手 / 单端口**形态 404 ——
助手只发 `/manifest.json` 与 `/media/*`、单端口代理也只转发这两条，表目前是应用自己发的。走那条路得同时改
助手路由 + `vite.config` 的代理 + `single-port-proxy.mjs` + `Caddyfile`。而"声明 + 回退"零破坏：

| 形态 | 改后 |
|---|---|
| 同源静态（CF Pages 等） | 表在源侧 `<base>/loudness/otomads.json`，manifest 声明它 ⇒ 读源侧 ✓ |
| 本机助手 / 单端口 | 助手 manifest **故意不声明** ⇒ 回落应用侧那份 ✓ 与改动前完全一致 |
| 源在别的域名（R2 等） | manifest 与表同宿主 ⇒ 天然成立（改前做不到）✓ |
| 旧归档（没有声明） | 回落 ✓ |

**实测**（真实 86 首）：`pack` → **88 成员**（1 manifest + 86 音频 + 1 响度表），manifest 带
`"loudness": "loudness/otomads.json"`；`stage` 打印「响度表 loudness/otomads.json：**86 条**」并自检通过。
真静态服务器（`python3 -m http.server --directory dist`）+ chromium 探针（**跑完已删**）：应用先取应用侧那份
（manifest 载入前的回落），manifest 载入后取**源侧** `/loudness/otomads.json`，且它**最后一次**到达 ⇒ 生效。

**保留的一处冗余**：静态形态下会先多取一次应用侧那份（13 KB、同源）。选简单规则（`声明 ?? 注册表`）而不加
"等 manifest ready 再取注册表那份"的分支 —— 换来的是所有既有形态行为**完全不变**，代价可忽略。

**验证**：数据仓库 pytest **100 passed**（+7）；前端**双引擎各 367 passed**（+5，`sources.test.ts` 共 17 条）；
`pnpm typecheck` ✓。

---

## D140 本地曲库地址可以重置回默认值（「重置」按钮；默认值只有空串这一种写法）
> ⚠️ **归一化那半句已被 D161 取代**：现在只有"第一段看起来像主机名（含 `:` 或 `.`）"才补 `http://`，
> **裸文件名与相对路径原样保留** —— 所以 `manifest.json` 填进框里**不会**再变成 `http://manifest.json`，
> 默认值写空串的理由也就不成立了。函数后来也改名 `normalizeManifestUrl`（`src/music/manifestUrl.ts`）。
> 另：本节提到的死键 `ConfigTabPresetReset` 也**已经删掉**了（`eb3dcdc`「drop the i18n keys nothing renders」），
> 不再是"没动"。

**需求**（用户）："现有本地源配置项是否可以增加默认值，如果可以，在配置框右侧，'应用'按键左侧，
增加'重置'按钮，用于将该配置恢复成默认值。注意间距，注意遵循 Material Design 2。"

**结论：可以 —— 默认值本来就存在，而且是空串**（不是某个具体地址）：

| 环节 | 事实 |
|---|---|
| 存档 | `session` 的 fallback 与校验回落都是 `localMusicUrl: ""`；`pickString("")` **认空串** ⇒ 空串能落盘、刷新后仍是默认 |
| 语义 | 空串 → `normalizeLocalManifestUrl` 返回 `null` → `applyLocalManifestUrl` 原样返回注册表 ⇒ 用数据里的 `table_url`（D131 的相对路径 `manifest.json`）⇒ 单端口 / 静态站形态下就是**同源** `/manifest.json` |
| 界面 | 输入框的 placeholder 一直是这个默认（`localSource.tableUrl`） |

**为什么默认值只能写成空串**（两个坑）：① 把 `manifest.json` 填进框里 ⇒ `normalizeLocalManifestUrl`
按"不带 scheme 就补 `http://`"处理，得到 `http://manifest.json` ✗；② 拿一个具体地址（如 `127.0.0.1:8011`）
当默认值 ⇒ `applyLocalManifestUrl` 会**永远**把本地源改写成绝对地址，直接破坏 D55 的"默认同源"契约
（`e2e/smoke.spec.ts` 那条用例正是钉它的）。

**做法**：

| 位置 | 改动 |
|---|---|
| `i18n/localization.ts` | 新增 `LocalMusicReset: u("Reset", "重置")`（`ConfigTabPresetReset` 是折叠面板重构后留下的死键，**没动**） |
| `SourceSection.tsx` | 这一行变成 输入框 → **重置** → 应用；重置 = `setLocalMusicUrl("")`（存档已经是空就跳过写盘）+ `setDraftUrl(null)` |
| 同上 | `disabled` 看**框里显示的值**（`urlValue.trim() === ""`）而不是存档 —— 所见即所得：只打了草稿没应用也能点，点了草稿一起丢（用户选的口径） |
| 同上 | **不动**地址栏里的 `?localmusic=`："URL 参数优先于存档"（D55）那条规则没变；重置只清存档 |

**MD2 / 间距**（用户点名的两条；全部落在既有常量内，没有新增数值）：

- 间距沿用 `spacing={1}` = **8dp**（MD2 8dp 栅格）；主操作「应用」放最右（MD2 惯例）且保持 outlined，
  「重置」用文字按钮（低强调）—— 与 `2c4f2df` 之前那个被删掉的重置按钮同一档。
- small 尺寸：filled 输入框 **48dp**（实测）、按钮 **32dp**（`MD2.button.small`），`alignItems: "center"`
  ⇒ 三者中线对齐、行高仍由输入框决定（按钮不把它撑高）。

**窄屏实测**（临时探针，chromium，**跑完已删**；412/360/320dp × zh/en，音源分区展开 + 音MAD 模式）：
这一行的右边缘六种组合**都是离视口 32px**（16 页边距 + 16 分区内边距）、`scrollWidth == clientWidth`、
三个控件始终一行、间隙 **8/8**、高度 **48/32/32**、中线对齐 ✓；往输入框里压 40 字符的长地址也不溢出 ✓。
⇒ 不需要 `minWidth: 0` / 换行之类的补丁。

**顺带发现（不在本条范围，别当成这次改坏的）**：同一个探针量到**音源分区展开后**页面在窄屏会横向溢出
（320/zh **+12**、360/en **+45**、320/en **+85**），元凶是**源行自己那一排**（`source-state-*` 的开关
`FormControlLabel` 与上/下移 `IconButton`）：把「重置」`display: none` 掉之后溢出量**一模一样**，
原曲侧（连重置按钮都还没挂载）同样溢出，不展开分区则为 0。D136 的窄屏探针只量了**折叠态**、
`mobile.spec.ts` 的溢出用例也只点页签不展开分区 ⇒ 这条一直没人覆盖。**本条不动它**（要改的是源行的排布）。

**测试**：

- 单测 `ConfigPanel.test.tsx` **+2**（该文件 15 条）：①有新覆盖时按钮可点 → 点了 store 与输入框都回空、
  按钮随之变灰；②只打草稿（存档还是默认）时也可点 → 草稿被丢掉、没被写进 store。
  **反证**：把 `disabled` 改成看存档（`localMusicUrl === ""`）→ 用例②红 ✓（1 failed | 1 passed）。
- e2e `smoke.spec.ts` 那条扩写：默认态断言输入框为 `""`、行内规格 **48/32/32 + 8/8 + 中线对齐 + 行右边缘不出屏**、
  空值时重置不可点；`?localmusic=` 那半段补"点重置 → 输入框回空、按钮变灰、`/manifest.json` 请求回到**同源**"。
  **反证**：把 onClick 里的 `setLocalMusicUrl("")` 摘掉 → 该用例红 ✓（`toHaveValue` 收到 `127.0.0.1:8011`）。
- e2e `mobile.spec.ts` **+1**（移动端 12 条）：412 与 **320**dp 下这一行三个控件仍在一行、间隙 8dp、
  高度 48/32/32、行右边缘不出屏（只量这一行**自己**的边缘 —— 见上面那条历史溢出）。

---

## D141 音MAD 的默认源改成项目 CDN（`table_url` 绝对地址 + 曲目地址按 manifest 解析）

**需求**（用户）："默认值为 `https://otomads-cdn.tsukinomiyako-mangesui.top`" —— D140 那条里我写的是
"默认值只有空串这一种写法（= 用注册表里的相对路径 `manifest.json`，同源）"，用户把这个默认值**定死在 CDN 上**。
问过一层（注册表 / 音源层加一条 / 前端会话默认），用户选**注册表**：默认值就该在数据里。

**探测**（先验 CDN 到底能不能用）：`/manifest.json` **200**（86 首、`application/json`、Cloudflare、
`access-control-allow-origin: *`）＋ 表里声明 `"loudness": "loudness/otomads.json"`（该表也 200）；
`/media/otomads/…mp3` 带 `Range` → **206** + `content-range` + `audio/mpeg`；根路径 **404**（纯素材 CDN，不是应用站）。

**⚠ 先修一个真 bug**：CDN 那份 manifest 的曲目地址是**相对路径**（`media/otomads/…`，`stage_media` 的口径），
而 `usePlayer` 是 `audio.src = resolved.url` **原样**用 ⇒ 相对地址按**页面**解析，会去应用自己那台主机上找音频
（404）⇒ **CDN 等于白指**。改法：`buildEntries(rows, manifestUrl)` 多一个基地址参数，相对地址按
**manifest 所在的那一层**解析（复用 D139 那个 `sourceRelativeUrl`）：

| manifest 形态 | 曲目地址 | 结果 |
|---|---|---|
| 绝对（CDN / R2 / 本机助手） | 相对 | 拼成源那一层的绝对地址 ✓（跨域也能播） |
| 相对（同源 / 子目录部署） | 相对 | **仍是相对形式** ⇒ 与改前逐字一致 ✓（子目录照样对） |
| 任意 | 已经是绝对 | 原样通过 ✓ |

**数据侧**（`sources/otomads.toml`，数据仓库）：`table_url` 改成 CDN 的 manifest 地址；注释重写
（两种合法形态、`kind = "local"` **为什么故意保留** —— 设置页「本地曲库地址」与 `?localmusic=` 只覆盖
kind=local 的源，本机开发就靠它指回去）；`description_*` 改成"默认由项目 CDN 提供"（原来写的是
"由本机助手提供"，已经不是事实了）；`label_*` **没动**（`本地曲库` 是 e2e 与回退顺序显示在用的名字）。
顺手补上数据仓库 `.gitignore` 的 `otomads-media.tar.gz`（HANDOVER §10.10 欠的那一行）。

**"空 = 默认"这条语义完全没变**：D140 的「重置」还是写空串，只是空串现在落到 CDN 上 ⇒
输入框留空、placeholder 显示 CDN 地址、全新安装也直接走 CDN ✓（用户选的就是这条）。

**连带的口径变化**（都写进 README / `deploy/README.md` / 数据仓库 `README.ai.MD`）：

- 静态站与单端口形态**不必再自带那 324 MB 素材**（D138 的 `pnpm media:stage` 从"必须"降级成"想同源自带时才用"，
  而且还要把 `table_url` 改回 `manifest.json` 才生效）；
- 本机开发（`pnpm local` + 5173）**不再自动用助手** ⇒ `?localmusic=127.0.0.1:8011`（或设置页填地址）；
- `?localmusic=` / `applyLocalManifestUrl` / 单端口反代那两条路径**一行没改**，只是从"必用"变成"要用才用"。

**测试**：单测 `sources.test.ts` **+2**（19 条）：`buildEntries` 的三种形态 + 跨域源下"曲目地址与响度表
两条口径一致"。e2e：`smoke.spec.ts` 那条本地曲库用例改成**默认走 CDN**（CDN 用 `page.route` 挡在本机，
测试**不依赖外网**：断言 placeholder 是 CDN、默认请求打 `…/manifest.json`、覆盖本机助手、重置回 CDN），
其余凡是要音MAD 素材的用例一律 `?localmusic=127.0.0.1:8011` **钉到本机助手**
（`smoke` 3 处、`mode-separation` 3 条、`mobile` 2 条、`perf` 1 处）。

**验证**：数据仓库 pytest **100 passed**；主仓库 pytest 全绿（64 条，退出码 0）；`pnpm data:build` 13 个文件、
`data:check` 无漂移、`data:validate` ✅（引用集合指纹 `9eecf074138b` 不变）；
**两个 `contentHash` 都没变**（`e95684b826fb` / `09fdd246a127`）—— 源表地址不进哈希（契约 §6）⇒
联机两端不用一起更新 ✓。数据仓库提交 `bb3c307`、tag `th09.5-260925` 第 10 次前移
（`83b95a6` → `bb3c307`，tag 对象 `8dcb12e`，旧 SHA 已进 `backup-commits.tmp/tag-moves.txt`）。

---

## D142 音频裁剪从 `-c copy` 改成"解码后精确切 + 重编码"（用户：裁剪有问题）

**需求**（用户）："现有的音频裁剪有问题，能否使用重采样方式裁剪音频"。即**推翻 D107 的第 3 条答复**
（当时选 `-c copy`：无损、快、误差 ≤ 一帧）。本次先把"问题是什么"测出来，再改口径。

### 1. 先把三处缺陷测出来（不是听感，是数字）

`-c copy` 是流拷贝：切点只能落在 mp3 **帧边界**上（48 kHz 帧长 24 ms、44.1 kHz 26 ms），
而 `start_time` 是拿来**点拍**的毫秒值（现状 16 首里就有 `2.339 / 1.388 / 1.060 / 5.168 / 3.557`）。
用 Chirp / 白噪 / 点击脉冲三种"解析真值"信号 + 真曲目共测：

| # | 缺陷 | 实测 |
|---|---|---|
| 1 | 起点只能就近取整到帧边界 | 真曲目 `1.388s` 偏 **+90.431 ms**；`2.339s` 偏 +1.000 ms；44.1 kHz 合成用例 −9.546 ms；源里有安静段时（码率起伏 ⇒ 定位按**字节**估算）见过 **−78 ms** |
| 2 | 容器时长 ≠ `stop − start` | +8…+32 ms 偏长；`1.388s` 那首偏**短** 90 ms |
| 3 | **头一帧解不出来** | 输入定位（`-ss` 在 `-i` **前**）让 mp3 解码器**冷启动**，而 mp3 的帧要用**比特池**（前几帧的主数据）⇒ 成品第 0 帧只有**噪声底**：真值 RMS 2957.8 时成品是 65.3（**2.2%**）、真值 11311.7 时成品是 **0.0**（整帧 24 ms 静音） |

**第 3 条是这次的关键发现**：它不只属于 `-c copy` —— **朴素的"解码后再重编码"照样中**
（只要 `-ss` 在 `-i` 前）。所以"换个编码器"解决不了问题，得连**定位方式**一起改。

### 2. 修法：三段式（粗定位 → 丢预热段 → 限时长 → V0 重编码）

```bash
ffmpeg -y -ss <start-0.5> -i <原件> -ss 0.5 -t <时长> -c:a libmp3lame -q:a 0 <成品>
```

输出侧那次 `-ss` 是**在 `-i` 之后**的：它不触发解码器冷启动，只丢**已经解出来**的样本；
被丢掉的 0.5 秒正好把冷冷解出来的头几帧一起丢掉（比特池喂热了）⇒ 缺陷 1 与 3 一并解决。
0.5 秒 ≈ 19 个 mp3 帧，远多于解码器需要的两三帧（多解 0.5 秒音频，可以忽略）。
**不重采样**：84 份原件是 44.1 kHz（38）/ 48 kHz（46），都是 mp3 原生支持的采样率 ——
再插一道 SRC 只是白添失真（ffmpeg 在编码器不支持某采样率时会自己插重采样，这里用不上）。

**修完实测**（16 首真曲目全部重裁）：起点偏差 **0.000 ms**、解码时长**恰等于** `stop − start`
（16 首误差 ≤ 0.007 ms）、首帧 RMS 回到真值（11307.0 vs 11311.7）、逐样本残差比 `-c copy` **还小**。

**代价（写清楚，别再被当成"无损"）**：

- **二次有损**：`.raw` 本身已是 mp3 ⇒ 这一遍是第二代（同一首实测逐样本残差 **5.67%**）。
  用最高档 V0（≈245 kbps）压到最小；体积几乎不变（同一首 1581 vs 1586 KiB、另一首 967 vs 980 KiB）。
  **永远从 `.raw/` 重裁** ⇒ 反复调区间不会叠损（只有"一次裁剪 = 一代"）。
- **每首 ≈ 0.4–0.6 秒**（`-c copy` 是 0.06 秒），只对**带区间的 16 首**付 ⇒ 86 首的本地开销
  从约 23 秒变成约 30 秒（多出来的 7 秒就是这 16 首的差价）。
- 根治二次有损的正路是"下载时保留原始容器（m4a/opus），裁剪与转 mp3 合成一遍" —— **本轮不做**
  （要重下 86 首 + 改 `.raw` 布局），已记进 `docs/packs-audio-v1.md` §11/§13。

### 3. 顺手补的一个坑：渲染口径必须进状态签名

幂等检查只看 `source / start / stop / outHash`。换了裁剪实现而区间没变 ⇒ 旧的 `outHash` **仍然对得上**
⇒ 16 首会被**全部跳过**，表现成"改了代码但音频一个字节都没变"。所以状态加 `render` 字段
（`RENDER_VERSION = "encode-v1"`）并纳入 `fresh` 判定。不裁剪的曲目是"与原件同一 inode 的硬链接"，
字节与口径无关 ⇒ 签名位留空（`LINK_RENDER = ""`），否则改一次裁剪会连带 70 首未裁剪的曲目
全部重链 + 重量响度。

### 4. 改动清单

| 位置 | 做了什么 |
|---|---|
| 数据仓库 `tools/src/otomads/fetch_audio.py` | `render()` 三段式；常量 `TRIM_ENCODER` / `TRIM_WARMUP` / `RENDER_VERSION` / `LINK_RENDER`；签名与 `fresh` 加 `render`；docstring/注释里的账全部改成实测值 |
| 数据仓库 `tools/tests/test_pack_audio.py` | **+5**（100 → **105**）：命令形状（不许 `-c copy`、两次 `-ss` 的位置与数值、`-t`、编码器与 `-q:a 0`）、回退在文件头截断、只给 `start_time` 时**不许**给 `-t`、渲染口径作废旧裁剪但**不**作废硬链接、**真跑 ffmpeg 的白噪精度用例**（时长恰为请求值 + 首帧不许是坏的；没有 ffmpeg 时 skip） |
| 数据仓库 `loudness/otomads.json` | 重裁触发重量：2 首各差 **0.1 dB** ⇒ 表动 4 行；其余 14 首量出来一模一样 ⇒ 不动 |
| 数据仓库 `tools/README.md` / `README.ai.MD` | 本地开销那笔账与"裁剪"口径 |
| 主仓库 `docs/packs-audio-v1.md` | §5 整节重写（含三处缺陷的实测表）、§7 第 3 条标注被 D142 推翻、§10 验证计划、§11 把 sample-accurate 从未做移到已做、**新增 §13** 记本轮 |
| 主仓库 `README.md` / `data/packs/README.md` | 裁剪口径 + 并发那笔账 + 排错表加"改了裁剪实现靠渲染口径自动作废" |

### 5. 反证（两条都真跑过，确认用例是有效守卫）

- 把 `TRIM_ENCODER` 改回 `["-c", "copy"]` 并去掉回退 ⇒ **3 条红**：命令形状那条、
  文件头截断那条、真 ffmpeg 精度那条（后者直接报"成品 1.020979 s，比请求的 1.000 s 多 **1007 个采样**"）；
- 把 `render` 从签名里摘掉 ⇒ 渲染口径那条红（`'' == 'encode-v1'`）。

### 6. 验证与影响面

- 数据仓库 pytest **105 passed**；主仓库 pytest 全绿、`pnpm data:build` 13 个文件、
  `data:check` 无漂移、`data:validate` ✅（引用集合指纹 `9eecf074138b` 不变）。
- **两个 `contentHash` 一个字没变**（`e95684b826fb` / `09fdd246a127`）—— 改的是"怎么裁"，
  不是"裁哪里"（`start_time` / `stop_time` / `source` 全没动）⇒ 联机两端**不用一起更新** ✓。
- 本地曲库：16 首带区间的成品全部从各自的 `.raw/` **离线**重裁（不重新下载），状态全部记为
  `render = "encode-v1"`。
- **Release 资产已换成新音频**：`pnpm media:pack` 重打归档（86 首 / 0 卡面 / 321.1 MB，
  含响度表）、`gh release upload th09.5-260925 otomads-media.tar.gz --clobber`。
  **336,835,277 B → 336,719,238 B**，sha256 `74e09675…` → **`f80fa36f…`**；上传后 GitHub 报的 digest
  与本地算的一致 ✓。换之前先把归档解出来与 `.music/otomads/` **全量逐字节比对**（86 首全等，不抽样）。
  **主仓库 `th09.5-260925` tag 没动**（仍是 `gh release create` 建的轻量 tag `295a3fc`，换的只是资产）。
- **⚠ CDN 那份仍是旧音频**：静态音MAD 源按 D138/D141 的裁定是**手动部署**，本机也没有 wrangler/rclone/aws
  之类的凭据 ⇒ 由用户重铺。实测差异：`【原汤化原食】已经只能听见歌声了` 在 CDN 上是 **1,624,445 B**（旧）
  vs 新 **1,619,501 B**，CDN 的响度表里那 2 首也还是旧 dB。**CDN 重铺之前线上播放的仍是有 90 ms 偏差的旧版。**


---

## D143 一条 `source` = 一首曲目（多 P 默认 p1，`?p=N` 按链接参数让 yt-dlp 自己解析）

**需求**（用户）："修复：自定义源默认解析 1p 而不是别的 p，有别的 p 时根据链接参数让 yt-dlp 自行解析"。

### 1. 根因（不是猜的，是读 extractor + 实测出来的）

`yt_dlp/extractor/bilibili.py` 的 `BiliBiliIE._real_extract`：

```python
is_anthology = len(page_list_json) > 1                 # 多 P
part_id = int_or_none(parse_qs(url).get('p', [None])[-1])
if is_anthology and not part_id and self._yes_playlist(video_id, video_id):
    return self.playlist_from_matches(...)             # ← 整张选集（每 P 一个条目）
if is_anthology:
    part_id = part_id or 1                             # ← 压成单个视频时**默认 p1**
```

`fetch_audio.download()` **没传 `noplaylist`** ⇒ `_yes_playlist()` 为真 ⇒ 多 P 返回整张选集；
而 `outtmpl` 是**固定文件名** ⇒ 各 P 互相覆盖 ⇒ 留下的永远是**最后一 P**。
**历史脚本 `ingest_otomads.py` 传的是 CLI 的 `--no-playlist`（等价），是搬到 `fetch_audio` 时丢的** ——
也就是说这是一次**回归**，不是从来如此。

**逐条查过全部 86 条 source 的 pagelist**：4 条是多 P，且都没带 `?p=`：

| `source` | p1 | p2 | 修前原件 |
|---|---|---|---|
| `BV1Mk4y1673i` 月时盆 | 118 s「原曲不使用」 | 99 s「原曲只使用（对比用）」 | 98.731 s ⇒ **p2** ✗ |
| `BV167411G7UG` 七重奏 | 145 s「献给死猫的7重奏」 | 164 s「工程力学」 | 163.515 s ⇒ **p2** ✗ |
| `BV1Ck4y1m7qk` 千年幻想郷 | 179 s「811」 | 182 s「工程录像」 | 181.487 s ⇒ **p2** ✗ |
| `BV17z421d7mj` 最终鬼畜全明星 | 79 s（本体） | 79 s「无原曲」 | 两 P 等长、时长分不出，按同一逻辑也是 p2 ✗ |

**3 条正好在 D142 刚重裁的那 16 首里** —— 也就是说上一轮"精确裁剪"裁的是**错的那一 P**。

### 2. 修法

| 位置 | 做了什么 |
|---|---|
| `download()` | 加 **`noplaylist: True`**：多 P 且无 `?p=` ⇒ `part_id = part_id or 1` = **p1**；带 `?p=N` ⇒ `part_id` 已有值、不进那个分支 ⇒ **仍按链接参数**。**不改写 URL、不硬编码站点**（契约 §4 的"任意站点"不变） |
| `download()` | 改成"**先解析、后落地**"：`extract_info(download=False)` → 查条目数 → `process_ie_result(download=True)`。解析出多个条目就**直接报错**（提示加 `?p=N`），绝不随便挑一个。兜底用 |
| `ensure_raw()` | 参数 `stale_source` → **`stale`**（口径变了也要重下原件） |
| `process_track()` | 签名加 **`fetch: FETCH_VERSION`** 并进 `fresh`；`stale_raw` 显式判"来源变了**或**抓取口径变了"；dry-run 会把"重下（抓取口径变了）← URL"说出来，不再显示成"（原件已在）" |
| 测试 | **+4**（105 → **109**）：`noplaylist` 必须传（并断言"解析阶段不下载"）、多条目必须报错、`fetch` 缺失必须重下、dry-run 必须说明要重下 |

**`stale_raw` 的一个坑**（被既有用例当场抓住）：不能写成 `entry.get("fetch") != FETCH_VERSION` ——
**没有状态条目**的曲目（第一次见它，原件是同 source 的孪生曲目刚下的那份）会被判成 stale ⇒ 白重下一遍，
破坏契约 §7 第 10 条"同源只下一份"。所以判据是 `bool(entry) and (...)`：**只有"以前抓过"的曲目才比口径**。

### 3. 数据修复

1. **定向修 4 首**（用户报的就是它们）：原件全部变成 p1 —— `117.141 / 144.299 / 178.261 / 78.848` s；
   3 首带区间的顺带重裁（成品 `142.299 / 174.704 / 106.141` s = 原件 − start）。
2. **全量重抓 86 首**（用户裁定"全部重抓"）：`fetched 69 / trimmed 13 / skip 4`、**退出码 0**（无失败、无缺失）。
3. **全量重抓只改了 2 个文件**：`对了 向北邮出发吧`、`最终鬼畜蓝蓝路 (2023 Remix)`（原本连原件都没有）。
   其余 **84 首重下得到逐字节相同**的音频 ⇒ **反过来证明"只有多 P 源受这个 bug 影响"**（单 P 的
   `noplaylist` 行为完全一样）。这一条比"重抓一遍就完了"有价值得多。
4. 响度表：`targetDb -11.3 → -11.2`（中位数因补上那 2 首而移动）⇒ **增益系数全部重算**（49 行）；
   4 首修过的 dB 也变了（月时盆 **-21.7 → -13.7** 最明显，它现在是 p1「原曲不使用」）。
5. 两个 `contentHash` **仍然不变**（`source`/`start`/`stop` 一个字没动 ⇒ 改的是"怎么抓"，不是"抓哪个"）⇒
   联机两端不用一起更新 ✓。

### 4. 反证

- 拿掉 `"noplaylist": True` ⇒ `test_download_asks_yt_dlp_for_a_single_video` 红（`KeyError: 'noplaylist'`）；
- 把 `fetch` 从签名/`stale_raw` 里摘掉 ⇒ 口径与 dry-run 两条红（`'重下' in '落成品（原件已在）'` 失败）。

**另外用真实链接验过行为本身**（不只是单测里的假 yt-dlp）：

| 链接 | 旧（无 `noplaylist`） | 新（`noplaylist=True`） |
|---|---|---|
| `BV1Mk4y1673i`（多 P，无 `?p=`） | 播放列表 **2 条目**（p01、p02）✗ | 单个视频 = **p01 原曲不使用** ✓ |
| 同上 `?p=2` | 单个视频 = p02 ✓ | 单个视频 = **p02** ✓（按链接参数） |
| `BV1kw411q7S8`（单 P，对照） | 单个视频 ✓ | 单个视频 ✓（不受影响） |

### 5. 裁点：**已确认，无需改动**（我一度误判成"要重新校准"）

改 p1 时我把 `月时盆`（11.000）、`七重奏`（2.000）、`千年幻想郷`（3.557）的 `start_time` 挂成了遗留项，
理由是"当年是在 p2 上落盘的，换到 p1 未必还在同一个位置"。**用户 2026-09-25 确认：这些时间本来就是
校准好的、不用重校准** ⇒ 遗留项撤销，也**不再**是发布闸门（Release 资产当时已按未变的值换掉）。

复核（三首都是从 p1 原件裁的，`成品 = 原件 − start`，逐条一致）：七重奏 144.299 → 142.299 s、
千年幻想郷 178.261 → 174.704 s、月时盆 117.141 → 106.141 s。

**教训**：`start_time` 是**用户的艺术参数**，不是能从时长反推的量。"原件换了 ⇒ 裁点大概要重调"
只是猜测，不该写成待办、更不该拿它当发布闸门 —— 问一句比推断便宜。

---

## D144 媒体地址带**数据版本**（源清单声明 `revision`，前端拼 `?v=`）
> ⚠️ **已被 D149 取代**：逐曲版本号在**归档/清单侧**已改成内容哈希 `sha1(内容)[:16]`，本条的名字+大小+mtime 口径只在**本机助手**那一侧还留着。

**需求**（用户）："修正：在数据发生变动时（原曲源和同链接的自定义源）重载入最新音乐，而不是复用缓存"。

### 1. 先把"复用缓存"定位到具体一层

| 层 | 现状 | 会不会复用旧内容 |
|---|---|---|
| 数据集（`data/**`、`sources.json`、两个 `index.json`） | 应用一律 `fetch(..., {cache:"no-cache"})`；`_headers` 给 `/data/*` 也是 `max-age=0, must-revalidate` | **不会**（每次校验） |
| 源清单 / manifest | 助手发 `Cache-Control: no-store`；CDN 那份是 `max-age=0, must-revalidate`；应用同样 `no-cache` | **不会** |
| 响度表 | 同上（`no-cache`） | **不会** |
| **媒体（`<audio src>`）** | 应用**原样**赋 URL；CDN 给 `.mp3` 发 `cache-control: public, max-age=14400` | **会**：最多 4 小时拿旧的 |

实测确认：CDN 上那首「原汤化原食」在被换过之后，`content-length` 先返回旧值（1,624,445）→ 之后
`cf-cache-status: EXPIRED` 才回源拿到新值（1,619,501）。而应用侧**没有任何**让媒体地址变化的手段。

**结论**：要修的不是"重新拉表"，而是**让缓存键挂在音频上**。链接不变就必须有别的位去变 —— 那就是版本号。

### 2. 修法：清单里放版本号，前端拼进 URL

- **数据侧**（数据仓库）：`packformat.media_revision([(名字, 路径)])` = 名字 + 字节数 + mtime 的 sha1 前 16 位。
  助手的 `/manifest.json` 与 `stage_media` 的归档 manifest 都写**两处**：顶层 `revision`（整表兜底）
  与每行**第 4 位**（逐曲）。
- **应用侧**（主仓库）：`tableRevision()` 读顶层、`buildEntries()` 里**行里第 4 位优先**，
  最后 `versionedUrl()` 拼成 `?v=<版本>`（已有查询串用 `&`，值做 URL 编码）。
  没声明版本 ⇒ **一个字节都不拼**，与改前逐字一致。

### 3. 两个刻意的取舍

1. **逐曲，不是整表一个版本**。整表一个也能修好"拿旧的"，但任何一次变动都会让整包 86 首（321 MB）
   **全部**换 URL ⇒ 所有客户端重下一遍。逐曲之后只有真变过的那几首换。实测：只动 1 个文件的 mtime ⇒
   **86 行里只有 1 行**变；文件没动时两次算出来完全相同（可复现，不会平白触发重下）。
2. **三个远程镜像不拼版本**。它们的裸数组没有 `revision` 键 ⇒ 不拼。理由：表本身是**同源数据集文件**、
   每次 `no-cache` 校验；媒体在别人主机上、内容不变。硬给一个"整表内容哈希"反而会让数据集一重建
   就让 **368 首原曲**全部换 URL。用户说的"原曲源"这一半，缺的从来不是版本号而是那份表本身的新鲜度 ——
   那条路已经是通的（`no-cache` + `/data/*` 的响应头）。

### 4. 版本号为什么不读文件内容

86 首 ≈ 370 MB，而"重新打包"是几秒级的操作。`名字 + 大小 + mtime` 已经能覆盖用户真正在意的三种变动：
改一个字节（大小或 mtime 变）、重裁一次（两者都变）、加/删一首（多/少一行）。
**不覆盖**的是"内容变了但大小与 mtime 都没变"—— 那需要有人手工伪造时间戳，不在威胁模型里。

### 5. 验证

- 数据仓库 pytest **112 passed**（109 → +3）；主仓库 `pnpm test` **752 passed**（+10 = 5 条 × 双引擎）、
  `pnpm typecheck` ✓。`_headers` 给自托管形态的 `/manifest.json` 与 `/loudness/*` 补了
  `max-age=0, must-revalidate`（清单被压住的话，换不换 URL 都白搭）。
- **真起助手实测**：`/manifest.json` → `Cache-Control: no-store`、顶层 `revision = c754325a2dd4794c`、
  86 行全是 4 位、逐曲版本号两两不同。
- `pnpm media:pack` 重打的归档：manifest 顶层 `743231decd5f6a44`，示例行 `v=d1e9c1dd60836f3b`。

### 6. 生效条件

**源清单必须是带 `revision` 的那一版**：

- **本机助手**：改完代码即是 ✓；
- **Release 资产**：已重打并**换掉**（336,719,238 → **340,516,723 B**，
  sha256 `f80fa36f…` → **`dcd2f98580a2634f…`**；上传前全量逐字节比对过 86 首与响度表，
  上传后 GitHub 报的 digest 与本地一致 ✓）⇒ 自托管的人重新取一次归档即可；
- **项目 CDN**：**只差一个 `manifest.json`**。2026-09-25 复核：CDN 的**媒体已经是最新的**
  （D143 变过的 6 首逐首比长度全等，抽一首 `cmp` 逐字节相同）、响度表与数据仓库那份逐字节相同 ——
  用户早前铺过一次，只是那次在 D144 之前，所以清单还是旧形状（86 行 × 3 位、无 `revision`）。
  前端因此不拼 `?v=`、行为与改前完全一致（不会坏，只是没有这个能力）。
  **换掉那一个 `manifest.json` 即可生效**（几十 KB），不必重传 324 MB 素材。
  **没有别的闸门**：归档里就是"p1 音频 + 用户确认过的裁点"（D143 §5 那条遗留已撤销）。
  > **D145 追补（2026-09-25 实测）**：CDN 现在**已经是带 `revision` 的那一版**
  > （`GET /manifest.json` → 200、86 行全是 4 位、顶层 `revision = 797d231f6163a58a`）——
  > 用户后来自己铺过一次，D144 的这个能力**线上已经生效**。上面那段"只差一个 manifest"是当时的快照。

## D145 音MAD 曲目表由**源**在运行时提供（清单带 `albums` / `characters`，C 路线）

**需求**（用户 2026-09-25 裁定）：三条候选里**只做 C** —— 把"音MAD 包有哪些曲目"从**随应用部署的
静态文件**改成**运行时从源取**。做完之后：加曲目 / 改裁切 / 换音频 = **只动数据仓库 + 铺源**，
主仓库一个字都不用改（连 pin 都不用动）。A（CI 里现算 `data:build`）/ B（`pnpm data:pin <tag>`）
**已弃用**：它们只是让"那份会冻结的生成物"跟上 pin，C 之后没有必要。

### 1. 病灶：曲目表是**构建期**产物

| 层 | 今天从哪来 | 数据一变要做什么 |
|---|---|---|
| **音MAD 曲目表**（`public/data/otomads/characters.json`） | **构建期**（`pnpm data:build` 从 submodule 的 `packs/`） | 重跑 → 提交 → **重新部署前端** |
| 音MAD 媒体地址 / 音频 / 响度表 | **运行时**从源取 | 铺源 |
| 原曲那 368 首 | 构建期 | 重跑 + 重新部署前端（**C 不管这个**） |

**症状很好认**：设置页「源状态」那一行数的是 **manifest 的条目数**（今天 86）—— 在源里加一首，
它会变成 **87**，但**曲目选不到**：`src/**` 全程遍历 `dataset.characters[].music`，而源只提供地址
（`resolveTrack` 只做 `(专辑, 曲名) → URL`）。CI 只跑 `pnpm install && pnpm build`（不装 Python、
不拉 submodule）⇒ "只在数据仓库改"这条路今天走不通。

### 2. 契约：清单多两个**顶层**键

`albums`（包自带专辑）+ `characters`（`{key, music, card?, name?, order?, searchNames?}`）；
`music` 条目的形状与 `tmc.build._pack_music` **逐字一致**，`tracks` 行形状与前三项**不动**。
老前端不认这两个键就忽略 ⇒ 向后兼容。完整形状写进 `docs/packs-audio-v1.md` §16（契约的家），
另一份清单契约 `docs/sources-separation-v1.md` §1.5/§6 各加一段指过去。
**身份不搬进数据仓库**（S1）：应用启动时本来就把原曲数据集取全了，快照只给"角色 → 曲目"。

**跨仓库形状靠一份共享测试向量钉住**：`packformat.music_entry`（数据仓库）↔ `tmc.build._pack_music`
（主仓库）各有一份**同一字面量**的 `PACK_MUSIC_VECTOR`，任一侧改了形状，两侧里总有一侧会红 ——
形状漂移的表现正是"看得见、点不响"。

### 3. 运行时怎么拼（`src/data/packSnapshot.ts`）

- 快照在**同一个 payload** 里解析（与 D139 的 `loudnessUrl` 一个套路，**不额外发请求**），
  挂在 `SourceTable.snapshot` 上；
- `parsePackSnapshot` **严格校验**：形状不对返回 `undefined` ⇒ 走自带那份兜底（绝不半信半疑地用）；
- `withPackSnapshot(baked, snapshot)`：otomads 的 `characters` = 快照每个 key 去**原曲数据集**取身份
  （缺身份且快照没自带 ⇒ **跳过并记一条可读错误**）；`card` 有才覆盖（D137）；`albums` 用快照的；
  `sources` **沿用自带那份注册表**（注册表不归源管）；`characterByKey`/`albumByName`/`counts`/
  `contentHash` 跟着重算；
- **`AppShell` 是全站唯一装配点**：`liveBundle = useMemo(() => withPackSnapshot(bundle, snapshot), …)`，
  **四个面板拿的都是它**（它们内部各自 `useCurrentDataset(bundle)` —— 只改 AppShell 自己不够，
  否则源多给的曲目进不了列表页/播放页/对局），`dataHashes()` 与 `window.__TMC_DATA_HASH__` 同源。

### 4. 握手哈希：交接文档里打架的两处，用户当场裁定

`packHash(albums, characters)` = `src/rng` 的 `stableHash` 跑**两个不同标签**、各 31 位拼成
16 位十六进制（62 位）。覆盖**专辑表 + 每个角色的曲目条目**（`key`/`card`/`music`，按 key 排序 ⇒
与数组顺序无关）；**不覆盖** URL、**音频版本号**、身份字段、页面来源。不用 `crypto.subtle`
（非安全上下文不存在）。

**问一：没有快照时 otomads 的哈希用哪个？→（用户选 A）永远用应用侧 `packHash`。**
交接文档里 §5.6/§6 说"完全走今天那条路（自带数据集 + 自带哈希）"，§3 又说"有源的一边与只有兜底的
一边在同一份数据上算出来自然相同" —— 两条只有一条能成立。选 A 之后：**同一份曲目表 ⇒ 同一个哈希**，
一人用本机助手、一人用 CDN、两人页签不同，都能一起玩；代价是**没有快照时 otomads 的界面指纹不再是
构建期那个 sha256**（数据集本身逐字不变，只是哈希口径换了一套）。
实测这份"同一份数据"不是假设：今天源给的曲目表与自带那份**逐条相同**
（35 角色 / 86 条 `music` 条目全等、专辑表相等）⇒ 两种形态算出来的哈希**确实是同一个值**（e2e 里钉住了）。

**问二：`packHash` 算不算每首的音频版本（D144 的 `revision`）？→（用户选 A）不算。**
`revision` 是"这台机器上那份文件"的 mtime 指纹：算进去会让**两个各自用本机助手的人**
（曲库文件相同、mtime 不同）握不上手，也会让"助手 vs CDN"握不上手 —— 那恰好推翻了 §8.3 自己举的
"今天能一起玩"的例子。音频身份仍由 URL 上的 `?v=` 保证（同一个源必然同一版）。**代价明说**：
曲目表相同、而两边音频字节不同（各自曲库里的同名文件不一样）**不会**被握手拦住。

**原曲那份哈希不变**（仍是构建期 sha256）；**协议版本不动**（仍 4）—— 线上形状没变，
变的是 otomads 哈希的**取值**，而"取值不同"本身就是判据。

### 5. 兜底与首个可玩帧

- 快照缺失 / 校验失败 / 源 error ⇒ 自带数据集 + 自带 counts（只有 otomads 的指纹按 §4 换成应用侧算的）；
- **首个可玩帧不等源**（用户已定：先按兜底渲染、拿到源再重建）。源慢/源挂 = 今天的样子
  （设置页「源状态」那一行显示 loading / error）；源回来之后整棵子树跟着新数据重渲染，
  `window.__TMC_DATA_HASH__` 在**同一次重渲染**里改写 —— 建/加入房间是用户动作、必然更晚，
  所以握手期拿到的一定是生效后的哈希。

### 6. 验证（含反证）

- 数据仓库 pytest **123 passed**（112 → +11：快照形状 4 条、助手 3 条、`stage_media` 4 条，
  含"不传新参数输出逐字不变"与"`stage --base` 不丢快照"）；主仓库 pytest **65 passed**（64 → +1，共享向量）。
- 主仓库 `pnpm typecheck` ✓；`pnpm test` 双引擎**各 428 passed**（376 → +52 = 26 条 × 2：
  `packSnapshot.test.ts` 49 + `sources.test.ts` 3）。
- **e2e 新增 `e2e/pack-snapshot.spec.ts`（2 条 × 双引擎）**：用 `page.route` 把助手那份 manifest 取回来
  只改"包数据"（多一首、地址借用一首真音频的地址）⇒ 应用里**统计 +1、列表里出现、点它能播**
  （媒体地址就是清单里那一行）；另一条钉"老清单（剥掉这两个键）与今天逐字一致"以及
  "源给的正是同一份数据时，**两种形态的指纹相同**"。
- **反证**：把 `withPackSnapshot` 摘掉（`liveBundle = bundle`）⇒ 新 e2e 那条**红**（统计停在 86），
  恢复后**绿**；
- `pnpm e2e` 全量（chromium + firefox + mobile，先起助手）**95 passed + 1 skipped**（+4 = 新用例 2 条 × 两个桌面引擎）。
- **端到端验收（§7.4，临时探针跑完即删）**：在数据仓库那份 submodule 的工作树里**只加一首**
  （改 `packs/otomads/cirno.toml` + 放一个 `<标题>.mp3` 成品，模拟 `fetch_audio` 之后的样子）⇒
  助手**不重启**就变成 87 条；应用（`pnpm local` + `?localmusic=127.0.0.1:8011`）统计 **87 / 87**、
  列表里出现、点它能播 `…/media/otomads/临时验收曲目.mp3?v=c83174da51da4540`；
  **同一时刻主仓库的 `public/data/otomads/index.json` 仍是 86** —— "不碰主仓库"当场可证。
- 真起助手实测：`/manifest.json` 41,860 B，键 `schema/pack/revision/tracks/albums/characters`，
  **86 行 / 35 角色 / 86 条曲目条目**；与自带那份逐条比对**全等**。
- `pnpm data:build` 13 个文件 / `data:check` **无漂移** / 两个 `contentHash` **都没变**（数据内容没动）。

### 7. 生效条件

**源侧的 manifest 必须换成带这两个键的那一版**：本机助手改了代码即是（每次请求现读 `packs/`，
"加一首立刻生效"就是这么验的）；Release 归档已重打；**项目 CDN 还要换掉那一个 `manifest.json`**
（几十 KB）—— 老清单只会走兜底：不会坏，但等于没改。

### 8. 代价（用户已认）

1. **兜底那份快照从此冻结**：`public/data/otomads/*.json` 停在某个时间点。影响有限 —— 源不可达时音频
   本来就一首也放不出来（源表全 error），旧曲目表只是个"能显示、点不动"的壳。
2. **仓库里的守卫不再覆盖线上**：`data:check` / `data:validate` 比的是"陈旧 pin 生成的东西"，
   自洽所以不会红，但它守的不是线上那份。
3. **握手语义随生效数据集走**：一端用了新数据、另一端还停在兜底那份 ⇒ 曲线目表不同 ⇒ 握手期被拒
   （fail-closed）；曲目表一样就照旧能一起玩（哈希不含 URL 与版本）。

## D146 素材站（CDN）交给 CI 铺；GitHub Pages 暂时停用（应用由 Vercel 部署）
> ⚠️ **前提已变**（无对应决定条目）：主仓库已于 **`e572332`（2026-09-28）转为 public**。
> 下面"主仓库是私有仓库 ⇒ 匿名 404 / 要带令牌"的前提因此不再成立。

**需求**（用户 2026-09-25）：

> 1. 能否写ci，让cloudflare pages部署静态cdn
> 2. 暂时禁用github pages部署，但保留ci工作流文件，目前是vercel部署

### 1. 先摸清"CDN 到底是什么"（别猜）

| 证据 | 结论 |
|---|---|
| 工作区根 `.wrangler/cache/pages.json` = `{"account_id":"5102f386…","project_name":"otomads-cdn"}` + `.wrangler/tmp/pages-*` | 线上是 **Cloudflare Pages 项目 `otomads-cdn`**，而且是 **`wrangler pages deploy` 直传**（不是 Worker + R2，也不是 Git 集成 —— 那两种都铺不动这条路） |
| 工作区根 `dist/`（326 MB，15:46）= `manifest.json` + `media/` + `loudness/` | 旧手动流程的**部署根**；CI 之后它就没用了 |
| CDN 响应头实测：`/manifest.json`、`/loudness/*` → `public, max-age=0, must-revalidate`；`/media/**/*.mp3` → `public, max-age=14400, must-revalidate` + `accept-ranges: bytes`；根 404 → `no-store`；都带 `access-control-allow-origin: *` | **归档里没有 `_headers` 文件**（88 个成员 = manifest + 86 音频 + 响度表）⇒ 这套逐路径缓存来自 **zone 级规则 / Pages 默认**，**不在部署物里** ⇒ CI 里**不**加 `_headers`（加了反而改变现状） |

### 2. `deploy-otomads-cdn.yml`（主仓库，手动触发）

```
本地  pnpm media:pack → sha256sum → gh release upload th09.5-260925 otomads-media.tar.gz --clobber
CI    Actions → deploy-otomads-cdn → Run workflow（或 gh workflow run deploy-otomads-cdn.yml）
```

工作流：**前置检查**（缺凭据当场失败）→ `gh release download`（本仓库私有 ⇒ 用自己的 `github.token`）→
**归档自检**（`.github/scripts/check_otomads_archive.py`）→ 解到部署根 → **读 Pages 项目的生产分支**
（不写死 `main`：写错会让这次部署静默落成 **preview**，自定义域名一动不动，表现是"CI 全绿、线上没变"）
→ `npx wrangler@4 pages deploy`（直传；wrangler 按内容哈希去重，只改清单时实际只传几十 KB）→
**线上复核：CDN 那份 manifest 与归档逐字节相同**（带 `?ci=` 绕开边缘缓存，最多重试 12 次）。

三个刻意的取舍：

1. **打包不进 CI**：manifest 里每首的 `revision` 是**本机那份文件**的名字+大小+mtime（D144），而曲库
   （377 MB）不在任何仓库里（素材不进仓库，D138 的裁定没变）⇒ 只有手上有曲库的机器打得出正确清单。
   CI 只做"把**已发布**的归档铺上去"——所以本地那两步（pack + upload）仍然是必须的。
2. **工作流放在主仓库而不是数据仓库**：归档是**主仓库的 Release 资产**，私有仓库要用令牌才读得到 ——
   自己的 workflow 用 `github.token` 就行；放数据仓库就得再配一个 PAT（多一个会过期的秘密）。
   数据仓库那边改数据，仍然只影响"本地打包"这一步。
3. **成功判据是"线上与归档逐字节相同"**，不是"wrangler 退出码 0"：D144 那轮的教训正是
   "Claude 以为铺好了、其实线上还是旧清单"（当时只有人肉 `cmp` 才发现）。这条复核会自动抓出来。

一次性配置（Settings → Secrets and variables → Actions）：secret `CLOUDFLARE_API_TOKEN`
（Cloudflare → My Profile → API Tokens → 模板 “Edit Cloudflare Workers”，或自定义 **Account → Cloudflare
Pages → Edit**）、secret `CLOUDFLARE_ACCOUNT_ID`（`5102f3861137b0abc1a12e2c793c19d2`）；
可选 variable `CF_PAGES_PROJECT`（默认 `otomads-cdn`）、`OTOMADS_CDN_HOST`（默认项目 CDN 域名）。

### 3. GitHub Pages 暂时停用（**保留文件**）

`.github/workflows/deploy-pages.yml` 只摘掉 `push:` 触发（改成只在 `workflow_dispatch` 里手动跑），
文件与步骤一个字没动，恢复方法写在文件头两行：恢复 `push:` + Settings → Pages → Source 选 GitHub Actions。

**为什么停**：这个仓库的 Pages **从没启用过** —— 本工作流 23 次运行**全部失败/取消**，每次 push 都卡在
`actions/configure-pages`（`Get Pages site failed`）。应用现在由 **Vercel** 部署（`vercel.json` 在仓库里，
push 到 `main` 由 Vercel 自己构建），所以那些失败纯粹是噪音。

### 4. 验证

- **CI 脚本按四个场景实测**（本地跑真归档，不是想象）：① 真归档 → `✅ 88 个成员 / 86 行 / 35 角色 /
  86 条曲目 / revision 743231decd5f6a44`；② 缺 `albums`/`characters` → 红（这正是"部署等于没生效"）；
  ③ 只多一条"还没抓"的曲目 → **绿 + 两条警告**（合法的补全中间态，不能拦住部署）；
  ④ **线上那份旧清单** → 红（`manifest 缺 albums/characters`）—— 恰好证明"还差的那一步"没做。
  脚本里踩到并修掉两个真 bug：曲名匹配没按前端口径（磁盘名是 `作者 - 标题`、曲目表里作者是独立字段）、
  地址里的文件名**百分号编码**而归档成员名是原始 UTF-8（要 `unquote` 再比）。
- 主仓库 pytest **69 passed**（65 → +4：`tools/tests/test_ci_scripts.py` 钉住"CI 脚本的归一化口径与
  `sources.ts` 那条正则一致"、硬判据与警告判据）。
- **没跑**：真实的部署（本机没有 Cloudflare API Token，那是 secret）—— 第一次运行要用户点了才算验过；
  `pnpm test` / `pnpm e2e` 这轮没动应用代码，不重跑。

### 5. 还没做（要人做）

1. 加两个 secret（上面那张表）；
2. 跑一次 `deploy-otomads-cdn` —— **这一跑同时就是 D145 的收尾**：Release 资产里已经是带
   `albums`/`characters` 的新归档（上一轮换过），铺上去之后 C 才真正生效；
3. 工作区根的 `dist/`（326 MB 的旧部署根）可以删了。

> **D147 追补（同日）**：这个工作流**搬到源仓库**了 —— 现在是数据仓库的
> `.github/workflows/deploy-cdn.yml`，归档也搬到**数据仓库的 Release**（tag `media`，公开仓库 ⇒
> **匿名可下**，不需要 PAT）。上面"主仓库 + 私有 Release 资产"那一套已被 D147 取代，本节只留作沿革。

## D147 素材站部署搬进源仓库；归档走**公开** Release；顺手给数据仓库补上 CI

**需求**（用户）："自动化cdn更新ci能否给音MAD源仓库跑，而不是主仓库"（外加：顺手给数据仓库加测试 CI，
并问过"构建产物能否放在 GitHub CI artifacts"）。

### 1. 先定"归档放哪"，再谈"工作流放哪"

主仓库是**私有**仓库 ⇒ 数据仓库要读它的 Release 资产就得配一个**会过期的 PAT**。两条路：

| 方案 | 代价 |
|---|---|
| 数据仓库 + PAT 读主仓库的私有资产 | 多一个会过期的 secret；D146 §2 的"工作流放主仓库"正是为了躲开它 |
| **归档搬到数据仓库**（用户选这条） | 公开仓库：它自己的 workflow 用内置 `github.token` 就能下载，**零 PAT**；附带好处是自托管的人**匿名**就能取 —— D146 §2 那条"私有仓库 ⇒ 匿名 404、要带令牌"的限制就此消失 |

搬的只是**发布通道**（Release 资产），**打包仍然只能在有曲库的机器上**（逐曲 `revision` = 本机文件的
mtime+大小，D144；曲库 377 MB 不进仓库）——这一点 D146 的结论没变。

### 2. 做了什么

| 仓库 | 动作 |
|---|---|
| 数据仓库 | 新增 `.github/workflows/deploy-cdn.yml`（部署）+ `.github/workflows/tests.yml`（push/PR 跑 133 条 pytest，**这仓库第一次有 CI**）；`stage_media.review` / `packformat.normalize_title+titles_match`；`tools/tests/test_media_review.py`（10 条）；两个 README 更新；tag `th09.5-260925` **第 15 次前移**（`f8d8e83` → `f7b69d9`，tag 对象 `178e066` → `52182e6`） |
| 数据仓库 Release | 新开 tag **`media`**（**发布通道，不动**）：`otomads-media.tar.gz` **340,517,992 B / sha256 `d3e084fb…`**（与本地逐字节一致，GitHub 报的 digest 相同） |
| 主仓库 | 删掉 D146 那份 `.github/workflows/deploy-otomads-cdn.yml` 与 `.github/scripts/check_otomads_archive.py`；跨仓库口径守卫从 `test_ci_scripts.py` 并进 `tools/tests/test_build.py`（现在盯的是数据仓库的 `packformat.normalize_title` ↔ `sources.ts` 那条正则）；`deploy/README.md` §A.3、`docs/packs-audio-v1.md` §16.6、submodule pin |

**为什么自检逻辑搬进工具包**（而不是继续当 CI 脚本）：CI 脚本没人 import、平时也不跑，最容易漂移；
搬成 `stage_media.review` 之后它进了 pytest、本地一条命令就能跑（`python -m otomads.stage_media review
--archive …`），而且**它能对照本仓库的 `packs/`** —— 这正是"新家"才做得到的事：归档少了 = 改完 packs
忘了重打包（**只警告**，因为"还没抓"是合法中间态）、归档多了 = 归档比仓库旧。硬失败仍是那三条
（清单五键、每行都有文件、曲目表非空）。

### 3. CI 抓到的第一个错误假设（值得记）

`tests.yml` 第一版只装 pytest —— 结果 **6 条 fetch 相关用例红**：`import yt_dlp` 虽然写在函数里
（延迟导入），但那些用例真的会走到 `installed_ytdlp()`。修法：`pip install -e ./tools "pytest>=8.0"`
（依赖从 `tools/pyproject.toml` 走，不写死版本）。**这就是"给源仓库补 CI"的直接收益**：
本地 133 条全绿，是因为本地那台机器上什么都有。

### 4. "构建产物能否放 CI artifacts"（用户问的）

| | Release 资产 | Actions artifact |
|---|---|---|
| 装得下**本地打的**包吗 | ✅ `gh release upload` 随时传、哪台机器都行 | ❌ artifact 只能由**某次 workflow run 自己**产出；工作流跑的时候包早就打好了，没有 run 可以挂（也没有 API 能把本地文件挂到某个 run 上） |
| 会过期吗 | 不会 | **会**：公开仓库最长 **90 天**（实测这次的 `pytest-report` 到期 2026-10-25） |
| 自托管的人怎么取 | 公开仓库**匿名** `curl -LO …/releases/download/media/otomads-media.tar.gz` | 永远要鉴权，还得先知道 run id |
| 适合装什么 | 发布的、要被别人消费的东西 | **这次 run 自己产出的**东西：部署记录、测试报告、构建产物 |

所以分工写死成：**归档 = Release 资产**（部署源 + 自托管入口），**部署记录/测试报告 = artifact**
（`deploy-cdn` 存 manifest + sha256，`tests` 存 JUnit XML）。artifacts 不是"构建产物的家"，
是"这次跑出来的东西的临时抽屉"。

### 5. 验证

- **匿名取归档实测**：`curl -L …/releases/download/media/otomads-media.tar.gz` → **200 /
  340,517,992 B**（不再 404、不用令牌）；GitHub 报的 digest 与本地 `sha256sum` **相同**。
- **数据仓库 CI 真跑通了**：`tests` 工作流 **132 passed + 1 skipped**（20 秒），JUnit 作为 artifact
  上传 ✓；那 1 条 skip 是**本来就有的条件跳过**（`test_fix_…` 需要真的 ffprobe，测试自己写明"故意不做替身"）。
- **本地**：数据仓库 pytest **133 passed**（123 → +10）；主仓库 pytest **66 passed**（把 D146 的 4 条
  CI 脚本守卫并成 1 条跨仓库口径守卫）；`review` 拿**真归档**跑过：`✅ 86 行 / 35 角色 / 86 条曲目条目
  / 顶层 revision 743231decd5f6a44`；两个工作流的 YAML 用 PyYAML 本地解析过（triggers/jobs 都对）。
- `pnpm data:build` 13 个文件 / `data:check` **无漂移**；submodule 切到新 tag。
- 主仓库推送后：CDN 工作流只剩数据仓库那一份（`.github/workflows/` 里只有 `deploy-pages.yml`，仍是停用态）。

### 6. 还没做（要人做）

1. 在**数据仓库**加两个 secret（`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`）；
2. 跑一次 `deploy-cdn` —— **这一跑同时是 D145 的收尾**（归档里已经是带 `albums`/`characters` 的新清单，
   铺上去 C 才真正线上生效）；
3. 主仓库那份**旧的私有 Release 资产**（`th09.5-260925` 下的同一个归档）确认没人用了就可以删；
   工作区根的 `dist/`（326 MB 旧部署根）也可以删。

## D148 素材站改由 **Cloudflare Pages 的 Git 集成**构建（CF 自己的 CI）

**需求**（用户）："能否撤回部分改动，让 cloudflare pages 接入音MAD源git仓库，使 cloudflare ci 完成静态页面
部署工作流" → 确认指**素材站**后："执行"。

### 1. 一条硬约束：**现有项目改不了，只能新建**

CF 官方文档写死：Direct Upload 的项目**不能**转 Git 集成（"You cannot switch to Git integration later.
You will have to create a new project with Git integration to use automatic deployments." ——
[Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)），而 `otomads-cdn`
正是 `wrangler pages deploy` 直传建的（工作区根 `.wrangler/cache/pages.json` 可证）
⇒ 做法是"**新建一个 Git 集成的项目 + 把自定义域名搬过去**"（老项目先留着，回滚就是把域名挂回去）。

### 2. 构建容器够用（核实过，不是猜）

CF 的构建镜像（Ubuntu 22.04 / gVisor）自带 **Python 3.13.3**、Node 22、pnpm 10、pip
（[Build image](https://developers.cloudflare.com/pages/configuration/build-image/)）⇒ 构建命令
**不需要装任何依赖**：我们的工具是纯标准库，脚本里只补一条 `sys.path` 就够。

### 3. 做了什么（仓库侧）

| 位置 | 内容 |
|---|---|
| 数据仓库 `tools/build_cdn_site.py`（**新**） | CF 的构建入口：取 Release 归档（公开 ⇒ 无令牌；认 `file://` 便于本地演练）→ `stage_media.review`（**不过就不铺**）→ `extract` 到 `dist/` → 打印摘要。manifest **原样铺**（逐曲 `revision` 是打包机器的 mtime 指纹，容器里重算必错） |
| 数据仓库 `stage_media.extract()` | 原来私有的 `_extract` 提成公开：**归档是不可信输入**（拒绝对路径 / `..` / 链接），这是唯一该用来铺盘的路 |
| 数据仓库 `.python-version` = `3.13` | 钉住构建镜像的 Python（CF 官方建议 pin 关键预装件） |
| 数据仓库 `.github/workflows/trigger-cdn.yml`（**新**） | 给"**只换了音频**、git 里没变化"的更新补一次构建：[Deploy Hook](https://developers.cloudflare.com/pages/configuration/deploy-hooks/) POST（hook URL 是 secret，别贴公开处）；不配它就去面板点 Retry |
| 数据仓库 `tools/tests/test_build_site.py`（**新**） | 用**真子进程**跑那个脚本：产物与归档**逐字节相同**、输出目录里不多不少、自检不过时**一个文件都不建**且退出码 1 |
| 文档 | 数据仓库 `README.ai.MD` / `tools/README.md`；主仓库 `deploy/README.md` §A.3（面板六步、触发表、回滚两条、排查三条）、`docs/packs-audio-v1.md` §16.6 |

### 4. "撤回部分改动"的顺序（用户原话）

**现在不撤**：数据仓库的 `deploy-cdn.yml`（wrangler 直传）与那两个 CF secret 先留着当回滚手段，
**等 CF 这条验证绿了再删**。归档与 `media` tag **必须留**（CF 构建就是下它）；`tests`、`review` 留
（后者从"GH 工作流里的一步"升级成"CF 构建里的一道闸"）。

### 5. 验证

- **构建脚本本地跑通两次**：`file://`（拿现成归档）与**真 HTTP**（从公开 Release 下 **340,517,992 B**，
  urllib 跟随重定向 ✓）⇒ 都铺出 `dist/`；**88 个成员与归档逐字节相同**、`dist/` 里不多不少。
- 数据仓库 pytest **135 passed**（133 → +2：构建脚本的两条）。
- 三个工作流的 YAML 本地用 PyYAML 解析过（triggers/jobs 都对）。
- **没做**：真正的 CF 构建（面板里的六步是用户的活；我进不去他的 CF 账号）。所以这一轮的"验证绿了"
  指的是**仓库侧**：脚本 + 守卫 + 文档齐了，第一次 CF 构建由用户点。

### 6. 还没做（要人做）

1. 面板六步：新建 Git 集成项目（连数据仓库、生产分支 `main`、构建命令 `python3 tools/build_cdn_site.py`、
   输出目录 `dist`、`SKIP_DEPENDENCY_INSTALL=1`）→ 手动跑一次 → **用 `*.pages.dev` 验证** → 搬自定义域名；
2. 可选：加 secret `CF_DEPLOY_HOOK`（音频-only 的更新用它一键重铺）；
3. CF 绿了之后：删 `deploy-cdn.yml`、删那两个 CF secret、删老项目 `otomads-cdn`，
   顺便删主仓库那份旧私有 Release 资产与工作区根的 `dist/`。

### 7. D148 追补：第一次真跑，**构建成功、部署那步红了**（2026-09-25，用户贴的 CF 日志）

```
Detected the following tools from environment: python@3.13.15
SKIP_DEPENDENCY_INSTALL is present … Skipping automatic dependency installation.
Executing user build command: python3 tools/build_cdn_site.py
⬇️  取归档：… /releases/download/media/otomads-media.tar.gz
    落盘 otomads-media.tar.gz（340517992 B）
✅ 铺好 /opt/buildhome/repo/dist：86 行地址 / 35 个角色 / 86 条曲目条目 / 顶层 revision 743231decd5f6a44
Success: Build command completed
Executing user deploy command: npx wrangler deploy dist          ← 红在这里
✘ [ERROR] A compatibility_date is required when uploading a Worker.
```

**两个发现**：

1. **"Connect to Git" 现在默认给的是 Workers Builds 项目**（一个只放静态资源的 **Worker**），
   不是老的 Pages 项目 —— 日志里的 `npx wrangler deploy …`、"the CI system expected **otomads-cdn-git**"
   与"要 `compatibility_date`"都是这一点的证据。于是要的配置也不同：资源目录由仓库里的
   **`wrangler.jsonc`**（`assets.directory`）说了算，面板那一格 "Build output directory" 是 Pages 才有的；
   Deploy command 要写 **`npx wrangler deploy`**（**不带** `dist`：位置参数会被当成 Worker 脚本路径）。
2. **`.python-version` 是自找的 2 分 40 秒**：钉 `3.13` ⇒ CF 现装一份 Python（10:27:19 → 10:30:00），
   而镜像本来就带 3.13.3（工具只要 ≥3.11）⇒ **删掉它**。构建本体只花约 1 秒（下 340 MB 约 15 秒）。

**改了什么**：数据仓库加 `wrangler.jsonc`（`name = otomads-cdn-git`、`compatibility_date = 2026-09-23`
即 CF 建议值、`assets.directory = ./dist`、`not_found_handling = none` —— 老站根路径就是 404，不能回退成
HTML）、删 `.python-version`；`deploy/README.md` §A.3 重写成 Workers Builds 版（含"先看清是哪一种宿主"的对照表
与排查四条）；`README.ai.MD` 同步。**没动 tag**（改的是 CF 的配置与文档，不进 submodule 的消费面）。

**下一步（用户）**：面板里把 Deploy command 改成 `npx wrangler deploy` → 重跑 → 用
`<worker>.<account>.workers.dev` 验证（`curl` 一下 manifest 的键与行数）→ 再把自定义域名从老 Pages 项目
搬到 Worker 的 Domains & Routes。

### 8. 第一次真部署的验收（2026-09-25，`otomads-cdn-git.mrl646.workers.dev`）

用户改了 Deploy command 后部署成功。逐项实测（走本机代理 —— `*.workers.dev` 在本机**直连被 DNS 污染**，
解析到 `2a03:2880:…face:b00c…`，这本身也是"必须尽快搬自定义域名"的理由）：

| 项 | 结果 |
|---|---|
| `manifest.json` 与归档 | **逐字节相同**（`ad0a4bf7…`，86 行 / 35 角色 / 86 条 / revision `743231decd5f6a44`） |
| `loudness/otomads.json` | **逐字节相同**（`acbc0271…`） |
| 抽一首音频全量下载 vs 本机曲库 | **逐字节相同**（1,745,964 B / `d877a8ce…`） |
| 根路径 `/` | **404**（`not_found_handling: none` 生效 ✓，与老站一致） |
| 清单/响度表缓存头 | `public, max-age=0, must-revalidate` ✓（与老站一致） |
| **CORS** | ✗ **丢了**：Workers 静态资源默认不发 `Access-Control-Allow-Origin`，而老 Pages 项目自带 ⇒ 应用（在别的源上）`fetch()` 这份 manifest 会被浏览器挡掉（媒体不受影响：`<audio>` 没设 `crossOrigin`、且 `preload="auto"`） |
| **Range** | ✗ **不认**：三种 `Range` 请求都返回 **200 + 整份**（老 CDN 是 206 + `content-range`）。只影响"跳到随机起播位"要多下点字节；`preload="auto"` 本来就会下整首 ⇒ 接受，恢复它要加 Worker 脚本（写在 `deploy/README.md` §A.3） |

**改了什么**：`tools/build_cdn_site.py` 现在往构建产物里写一个 **`_headers`**（Workers 静态资源认它、
且不会把它当资源发出去）：`Access-Control-Allow-Origin: *` + `Access-Control-Expose-Headers: …` +
`X-Content-Type-Options: nosniff`，并把清单/响度表（`max-age=0, must-revalidate`）与媒体
（`max-age=14400, must-revalidate`）的缓存策略**显式钉住**（值取自老站实测，不再依赖 zone 规则）；
`tools/tests/test_build_site.py` 加一条守卫（少了 CORS 就红）；`deploy/README.md` §A.3 加了
"老站 / Workers 默认 / 所以怎么办"的对照表与 Range 的取舍。数据仓库 pytest **136 passed**（135 → +1）。

### 9. 真浏览器把问题钉死，Range 修复进仓库（2026-09-25，同一天）

**① 用户已配好 Deploy Hook，并"部署了 Worker 脚本修复 Range"** —— 但实测线上仍是 `200 + 整份`，
而且**仓库里根本没有脚本** ⇒ 两个后果：修复没生效、且**下一次构建会把它冲掉**（Workers Builds 从仓库
构建，面板/本地的代码改动活不过一次构建）。

**② 用真浏览器问清楚了"到底需要哪些头"**（临时探针，跑完即删；`?localmusic=https://<worker>` 指过去）：

```
Access to fetch at 'https://otomads-cdn-git.mrl646.workers.dev/manifest.json' from origin 'http://127.0.0.1:5190'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

顺带**否掉了"预检"这个担心**：老 CDN 的 `OPTIONS` 也是 **405**（只是带 CORS 头），而应用今天是好的
⇒ 应用的 `fetch(..., {cache:"no-cache"})` **不触发预检**，缺的就是响应上那个头。

**③ 把 Range 修复做进仓库**（`media-worker.mjs` + `wrangler.jsonc` 挂 `main`/`assets.binding`/
`run_worker_first = ["/media/*"]`）：

| 改动 | 为什么 |
|---|---|
| 脚本按 `Range` 切 206（三种写法 + 416 + HEAD） | 静态资源不认 Range（实测） |
| CORS / `accept-ranges` / 媒体缓存头写进脚本 | `_headers` **不作用于 Worker 生成的响应**（CF 文档明说） |
| 只匹配 `/media/*` | 清单/响度表/404 继续走静态资源那条路：免费、走边缘、`_headers` 照旧 |
| `node --test tools/tests/media_worker.test.mjs`（7 条） | `Range` → 闭区间是唯一自己写的协议解析，错了就是"播不出来/播一半" |

**④ 本地把整条路验过**（`wrangler dev --config <数据仓库>/wrangler.jsonc`，小样本 dist）：
无 Range → 200 + `accept-ranges: bytes` + CORS + `max-age=14400`；`bytes=0-99` / `bytes=100-` /
`bytes=-100` → **206 + `content-range`**，且**切片与源文件逐字节相同**；越界与乱写 → 416；
非媒体路径仍由静态资源服务（`manifest.json` 200 + CORS + `max-age=0`）。
**踩到一个坑并写进注释**：本地 miniflare 那条路给的是**流式响应、没有 `Content-Length`**
（第一版按长度切片 ⇒ 所有 Range 都回 416）；脚本改成"必要时把正文读进来量长度"。

**⑤ 还没生效**：push 不触发构建（`build-info.json` 轮询 404 五分钟为证）⇒ 需要用户在面板点一次
Retry，或用他刚配好的 Deploy Hook（`gh workflow run trigger-cdn.yml -R …`）触发一次。

### 10. 修复上线后的复验（2026-09-25，Deploy Hook 触发）

用户配好 Deploy Hook 后，用数据仓库的 `trigger-cdn` 工作流触发构建（**9 秒成功** ⇒ hook 与 secret 都对 ✓）。
新构建上线（`build-info.json`：`builtAt 11:16:30Z`、`archiveSha256 d3e084fb…`）后逐项实测：

| 项 | 结果 |
|---|---|
| `manifest.json` | 200 + **`access-control-allow-origin: *`** ✓ + `max-age=0, must-revalidate` ✓ + **逐字节相同**（`ad0a4bf7…`） |
| `loudness/otomads.json` | **逐字节相同**（`acbc0271…`） |
| 媒体（无 Range） | 200 + CORS ✓ + **`accept-ranges: bytes`** ✓ + `max-age=14400, must-revalidate` ✓ |
| 媒体 `bytes=0-99` / `bytes=-100` | **206** + `content-range: bytes 0-99/1745964` / `bytes 1745864-1745963/1745964` ✓ |
| 媒体越界 | **416** + `bytes */1745964` ✓ |
| 音频切片 500–1599 | **与曲库逐字节相同** ✓ |
| 根路径 / `_headers` | 404 / 404（后者说明它被运行时解析、没被当资源发出去 ✓） |
| **真浏览器端到端**（临时探针，跑完即删） | ✓ 应用取到表并解析出地址 `…/media/otomads/川先僧%20-%20普通肥猫魔法使.mp3?v=1f46946f1c0bb35e` —— 相对地址按 manifest 那一层解析 ✓、`?v=` 来自清单行 ✓、**无任何失败请求** ✓ |

（用户先前在 CF 那边部署的那份 Range 脚本，被这次构建覆盖成仓库里这份 —— 本来就活不过一次构建，
所以"脚本必须在仓库里"这条也当场印了一回。）

**还没做（用户一步）**：把 `otomads-cdn.tsukinomiyako-mangesui.top` 从老 Pages 项目搬到 Worker 的
Domains & Routes。搬完我从**真域名**再复验一遍（`*.workers.dev` 在本机直连被 DNS 污染，全程只能走代理），
之后就能收尾：删老 Pages 项目、删 `deploy-cdn`、删那两个 CF secret。

### 11. 域名搬迁与收尾（2026-09-25，用户"已更换"）

**真域名复验（本机直连，不经代理）**：`build-info.json` **200**（老 Pages 项目没有这个路径 ⇒ 域名确实指向
新 Worker）；`manifest.json` / `loudness/otomads.json` CORS `*` + `max-age=0, must-revalidate` +
**与归档逐字节相同**（`ad0a4bf7…` / `acbc0271…`）；媒体 `accept-ranges: bytes` + CORS +
`max-age=14400, must-revalidate`（**与老站一致**），`bytes=0-99`/`bytes=-100` → **206**、越界 → **416**；
音频切片 500–1599 **与曲库逐字节相同**；根路径 404；
**真浏览器、无任何覆盖**（临时探针，跑完即删）取到表并解析出
`…/media/otomads/川先僧%20-%20普通肥猫魔法使.mp3?v=1f46946f1c0bb35e`，**零失败请求**。

**收尾**：数据仓库删掉 `deploy-cdn.yml`（wrangler 直传老 Pages 项目那条路）与它依赖的两个 CF secret
（保留 `CF_DEPLOY_HOOK`）；`trigger-cdn.yml` 的注释改准（项目名 `otomads-cdn-git`，并写明
**push 不触发构建** ⇒ 这个按钮是必需而非可选）；`.gitignore` 补 `.wrangler/` 与 `/dist/`。
**留给用户**：在 CF 面板删掉老 Pages 项目 `otomads-cdn`；主仓库那份旧私有 Release 资产与工作区根的
`dist/`（326 MB 旧部署根）可删。

## D149 曲目表改动由 **CI 重打归档**自动上线；逐曲版本号改用**内容**哈希（2026-09-25）

起因是用户连环三问：①"直接改源仓库的文件能不能自动更新" ②"能否让 GitHub CI 完成 releases 归档创建推送、
由仓库修改触发" ③"能否让 CI 调 yt-dlp 下载有变动的音频/全量更新音频"。最后落成一句话：
**曲目表改动全自动，音频抓取留在本机**（③见文末追补 —— 那是原理性的拦路虎，不是懒得做）。

### 1. 一问：push 原本什么都不触发（这一半可修）

**结论分两半**，一半可修、一半是原理性的：

1. **push 原本不触发构建**（`trigger-cdn` 只有 `workflow_dispatch`；CF 那边的 "Git 集成"也没在 push 时构建
   —— 早先轮询 `build-info.json` 五分钟为证）⇒ **可修**：给 `trigger-cdn.yml` 加上 `on: push: branches: [main]`（当晚就被 §2 的 `repack-media` 取代 —— 现在 `trigger-cdn` 只剩手动入口），
   由它去 POST Deploy Hook（Secret 已经在用）。**实测**：`11:40:28` 推送 → 工作流 10 秒成功 →
   线上 `build-info.json` 从 `11:16:30Z` 变成 **`11:40:53Z`**（新构建 + 新部署）✓。
   ⇒ 站点侧文件（`wrangler.jsonc`、`media-worker.mjs`、`tools/**`、工作流本身）**改完推上去就自动生效**。
2. **"改仓库里的数据文件"不会改变线上内容** ⇒ **原理性**：站点内容来自 `media` Release 的归档，
   而 manifest 里每首的逐曲版本号是**本机文件**的名字+大小+mtime（D144），音频库不在 git 里
   ⇒ 构建只能"下载已发布的归档再原样铺"，仓库里的 `packs/*.toml` 它根本不读（读了也只会让曲目表与音频对不上）。
   加曲目/换音频的完整链路仍是：`pnpm media:pack` → `gh release upload media … --clobber` → 触发一次
   （面板 Retry / 手动工作流 / 推一个空提交 —— 因为 `gh release upload` 不产生 git 事件）。

### 2. 于是有了 `repack-media`：CI 用**上一份归档的媒体**重打（这一半也能自动）

既然站点内容来自归档，而**媒体本身**只有本机有，那就让 CI **只重打清单、不碰音频**：
`repack-media.yml`（`push` + `workflow_dispatch`）下载现役归档 → 用仓库现在的 `packs/` + 响度表重打 →
**逐字节比对**：变了才换 `media` 资产；**变没变都会 POST 一次 Deploy Hook**（读工作流就知道：那一步只排除了
`dry_run`，注释里写着「站点侧改动本来就要重建」）⇒ 只改文档的 push = 不换资产 + 照常重建一次。

**新音频的顺序**：**先换归档资产、再推源码**。CI 的媒体只来自**上一份归档** ⇒ 先推源码的话，它拿旧归档重打，
新曲目「没音频」⇒ 资产被换成**少了那首**的版本、还照常触发上线（`review` 只在日志里警告「归档少了」）；
反过来（先传资产再推源码）则重打结果**逐字节相同** ⇒ 不换资产 + 一次重建即生效。没有 git 事件那种
（只重裁、曲目表没动）就用 `gh workflow run trigger-cdn.yml`。
`trigger-cdn` 随之退成"只重建站点"的手动按钮。
**实测**：`11:47:25` 推送 → `repack-media` **56 秒**成功 → 线上 `build-info.json` 变成 `11:48:38Z`（新构建 + 新部署）✓。
⇒ 加曲目 / 改标题 / 改裁量 / 改响度表：**改完推上去就自动上线**，不用本机、不用手工上传。

### 3. 前提：逐曲版本号必须是**内容**哈希（D144 的 mtime 口径作废）

`packformat.content_revision` = `sha1(文件内容)[:16]`。照 D144 的"名字+大小+mtime"算的话，
CI 重打出来的清单与本机打的**永远对不上** ⇒ 客户端每次都要重下 324 MB。
`tools/tests/test_repack.py` 钉着"本机打包 == CI 重打，**逐字节相同**"这条不变式。
代价（一次性）：切换那天 86 首的 `?v=` 全变一遍，之后只有真变过的才变。

### 4. 三问：能不能让 CI 自己调 yt-dlp 抓音频？**不能**（2026-09-25 实测，别再试第二次）

在**分支**上放了个临时探针（`probe-ytdlp`，跑完即删，不打扰 main），用 GitHub 托管 runner 试三条真 source：

| 观测 | 结果 |
|---|---|
| runner 出口 IP | `130.131.55.228`（Azure 数据中心） |
| `https://www.bilibili.com/` | **200**（域名可达，不是网络问题） |
| 三条 source 解析 | **全部 `ERROR: [BiliBili] … HTTP Error 412: Precondition Failed`** ⇒ 命中 bilibili 的**风控**（数据中心 IP），不是地区封锁 |
| runner 上的 ffmpeg | 有，但**没有 `libmp3lame`** ⇒ D142 的重编码裁切会失败（apt 那份 ffmpeg 带 lame，这条大概率可解，但上面那条无解） |
| 86 条 source 的宿主 | **全是 `www.bilibili.com`** ⇒ 没有"换成能抓的源"这条退路 |

⇒ **抓取必须发生在 bilibili 认的出口 IP 后面**（本机/住宅网络），与"有没有曲库"无关（yt-dlp 不需要曲库）。
想全自动的话，可行路线是**自托管 runner**（跑在用户自己那台机器上：IP 被接受 ✓ 曲库也在那儿 ✓）：
`runs-on: [self-hosted, linux]` + `otomads.fetch_audio --root <曲库>` + `stage_media pack` + 换资产 + 触发。
安全前提：**只挂 `push` / `workflow_dispatch`，绝不要 `pull_request`**（公开仓库上 fork PR 会让外部代码跑在自家机器上）。

**两张表**（"改什么 ⇒ 会不会自动上线"）分别写进了数据仓库 `README.ai.MD` 与 `deploy/README.md` §A.3：
一次 push 触发的重建 = 下载 340 MB + 自检 + 部署，约 2–3 分钟（静态资源请求免费、不限量）。

---

## D150 素材站的部署搬进 **GitHub Actions**：一条链跑完测试 → 重打 → 构建 → 部署（2026-09-25）

**触发**：用户报"站点没更新"。查下来 CF 面板给的是：

> 此项目已与您的 Git 帐户断开连接。这可能会导致部署失败。

**症状与证据**（值得记下来，因为它是**静默失败**）：

| 观测 | 值 |
|---|---|
| 数据仓库 push | `8da9c34`（含新曲目），CI `tests` + `repack-media` **全绿**，`repack-media` 里 POST Deploy Hook 那一步 **success（HTTP 2xx）** |
| 手动再跑一次 `trigger-cdn` | 同样 success |
| 线上 `build-info.json` | 仍是 `builtAt 13:22:07Z` / `archiveSha 8e9f34f8…`，`manifest.json` 仍 **86 行**（新曲目那首没上） |
| `cf-cache-status` / `cache-control` | `HIT` + `max-age=0, must-revalidate` ⇒ 边缘有校验过，**源站就是旧的**（不是缓存骗人） |
| 等多久都没用 | 约 9 分钟、两轮触发、带 cache-buster 查询 ⇒ 一条构建都没出现 |

**根因**：Deploy Hook 只负责"请求一次构建"，构建本身要靠项目的 **Git 连接**去拉代码 ——
连接断了，hook 照样回 2xx（所以 CI 全绿），但**零构建**。用户按官方文档去重连（Settings → Builds →
Git Repository → Manage，外加 GitHub 侧检查 App 安装）后**仍未恢复**。

**决定**：不再把"上线"这件事押在 CF 侧的连接状态上，把整条链搬进 GitHub Actions ——
数据仓库新增 `.github/workflows/publish.yml`，`push`（或手动）时三段串行：

```
① test（141 pytest + 7 node --test）→ ② repack（重打归档；逐字节变了才换 media 资产）
→ ③ deploy（下归档 → python3 tools/build_cdn_site.py → npx wrangler deploy）→ 线上复验 sha 一致
```

**顺带删掉**：`repack-media.yml`（并入 publish 的第②段，**去掉 POST Deploy Hook 那步**）与
`trigger-cdn.yml`（它唯一的作用就是那个 hook）。CF 面板上的 Workers Builds 项目随之退役，可以删。

**代价与取舍**：

- 需要一次性人工：CF 建一个 API Token（模板 **Edit Cloudflare Workers**；自定义要 `Workers Scripts:Edit`
  + `Workers Routes:Edit`）+ `gh secret set CLOUDFLARE_API_TOKEN -R …`。**没配时第③段跳过并打 notice**，
  不算失败 ⇒ 结构可以先落地、token 随后补。
- `wrangler deploy` 对静态资源按哈希**增量上传**：首次全量（约几分钟），之后只传变化的那几首。
- 自定义域名**必须写进 `wrangler.jsonc` 的 `routes`**（`custom_domain: true`）：`wrangler deploy` 只保证
  "配置里声明过的"绑定，不声明就有被摘掉的风险，而 `sources/otomads.toml` 的 `table_url` 指着它。
- 收益：失败在 Actions 日志里看得见（CF 那边我们看不见）、不再依赖面板状态、触发面只剩 `push` 与一个
  带 `dry_run` 的手动入口。

**收尾（2026-09-25，用户"已清理"）**：CF 的 Workers Builds 项目已删、仓库 secret `CF_DEPLOY_HOOK` 已删
（`gh secret list` 只剩 `CLOUDFLARE_API_TOKEN`，创建于 `19:11:14Z`），老 Pages 项目 `otomads-cdn`
的 `otomads-cdn.pages.dev` 也已解析不到。**删完复验**：`build-info.json` / `manifest.json` **200**、
媒体 `Range` → **206**、根 **404** ⇒ 删构建项目**没有**把 Worker 与自定义域名带走（Worker 本身是独立资源）。

---

## D151 按音乐模式分键的 store 样板收进 `makeModeStores()`（2026-09-25）

**背景**：`preset` / `single` / `queue` / `sources` 四个 store 各有一整套**同样的装配** ——
`slices: Record<MusicMode, …>`、`xxxStoreFor(mode)`、`useXxx()` 的三重载（无参 = 当前模式那把 /
传 selector 取一段），每份 15–18 行逐字相同（只差类型名与导出名）。D110 定下"状态按模式分键"之后，
这层样板就一直是复制粘贴（一次审计里被点出来：69 行 × 4）。

**做法**：`src/store/modeScope.ts` 导出 `makeModeStores(makeSlice)`（返回 `storeFor` / `currentStore` /
`useStore` 与 `ModeStore` / `ModeHook` 类型）。各 store 只留自己的 `makeSlice`（state、行为、校验、`prune`），
尾部样板 15–18 行 → 3 行。**对外导出名与两个可见重载签名逐字不变**；`useXxx()` 无参仍**每次现取**
当前模式那把（缓存"上一次的模式"会在切模式后拿到旧表 —— 这是这条重构最容易踩的地方）。

**没动的**：`sources.prune` 与 `single.prune` 口径一致但没抽公共 helper；`single.ts` 的布尔过滤
（**只留 `true`**）与 `preset`/`queue` 的 `pickBooleanMap`（true + false）**语义不同，不合并**；
D110 里"故意不分键"的 seed / session.musicMode 两项没有被卷进来（`sources` 不在此列 —— D113 起它已按模式分键）。

**验证**：`pnpm typecheck` exit 0；`pnpm test:chromium` **428 passed**（426 + 新增的 2 条工厂用例）；
改动面的 e2e（`smoke` / `mobile` / `multiplayer`）全绿。新增 `modeScope.test.ts` 钉两条：
"同一个模式每次拿到同一把、改一边不动另一边"与"`useStore` / `currentStore` 跟着会话模式换表"。

**顺带（同一轮）**：`GamePanel` 的"自己 / 电脑"两组 `补满+洗牌+清空` 与 `PresetSection` 三处
"全选 / 全不选"按钮对抽成文件内组件；抽完用**归一化 `outerHTML` 哈希**与改前逐字比对
（`c354d99a` / `24b68a80` / `ce59584b` len=16318，两边相同）⇒ DOM 与 `data-testid` 没变，
e2e 按 testid 的断言照旧。

---

## D152 亮/暗模式 + 自定义主题色（设置页「外观」）（2026-09-26）

**需求**（用户）：加自定义主题色与亮/暗切换；放在设置页；注意布局、格式统一、间距、MD2 规范，
并且**不要破坏清理代码时立下的规矩**（颜色只在 `theme.ts`、组件不写死值、样板不重复、既有 `data-testid` 不动）。

**做法**

- 色板仍是 `theme.ts` 一处真源：`MD2_PALETTE` 本来就有亮/暗两套 ⇒ 让它成为 `buildTheme({ mode, primary })`
  的输入。**不带参数时与改前逐字相同**（既有的"深色 + MD2 基准色"断言原样通过）。
- **组件里不出现写死的主题色**：`MODE_TOKENS` 把亮/暗两套 onSurface（MD2：87% / 60% / 12%）写进 `:root`
  的 CSS 变量，组件只引 `ThemeTokens.*`；`MD2_BORDER` 与 `MD2.accordion.icon` / `.divider` 也改指变量
  ⇒ 切模式、换主题色**不用改任何组件**。
- 主题色：`THEME_COLORS` 给 8 支 MD2 500 号基准色；深色下按 **200 号口径提亮 35%**（`themeColorFor`，
  否则 500 号落在 `#121212` 上对比度不足），浅色下把过亮的颜色压暗 20%；`onColorFor` 按 WCAG 相对亮度
  决定 onPrimary 用黑还是白。`isHexColor` / `normalizeHex` 是设置页与 store **共用的一处**校验口径。
- 持久化：新 store `src/store/appearance.ts`（**全局一份**，不按音乐模式分键 —— 主题与"在听哪一支曲子"无关，
  与 D110 里"故意不分键"的 seed / musicMode 同类），沿用 `persist.ts` 的版本化存储 + 逐键校验：
  非法颜色退回"用 MD2 基准色"，坏存档不会把界面搞黑。
- 设置页：新分区 `id="appearance"`，复用 `SectionPanel`（默认折叠 + 惰性挂载 + 同一套 `section-*` testid 约定），
  间距取 `MD2.grid` 的倍数；模式用 `ToggleButtonGroup`（MD2 segmented control）、色板用 32dp 色块 + 选中环、
  自定义走 `<input type="color">`、"恢复"复用既有文案键（不新增重复文案）。位置紧挨「数据」之后 —— 都是全局偏好。

**验证**：`pnpm typecheck` exit 0；`pnpm test:chromium` **439 passed**（428 + 11 条新用例：`theme` 4 / store 4 /
分区 3；分区那三条覆盖"点亮色 ⇒ `body` 底色与正文色真的跟着变"这条链）；改动面 e2e（`smoke` + `mobile`）exit 0。

**刻意没动**：`CardColors` / `CustomColors`（D83 保留项）、`Palette`（深色字面量，`AboutDialog.test.tsx` 钉着它）、
计时器的黑底白字小方块（刻意的"秒表"观感，两种模式下都成立）、对话框 scrim（MD2 规范与模式无关）。

---

## D153 音MAD 卡面接 B 站封面：一首一封面、源内可覆写（2026-09-26）
> ⚠️ **已被 D164 / D167 取代**：封面链接**不再**补 `@<w>w_<h>h_1c` 预裁后缀，只产原版链接。

**需求**（用户，三句话定稿）：① 给音MAD 数据库的卡牌"调用 B 站封面当卡面"；② **一首一封面**，默认存**直链**，
写进 `packs/otomads/<角色 key>.toml`，**允许源内覆写**；③ 这套图集**只在音MAD 模式可选、源不提供就不显示**，
同时**音MAD 模式仍要能用原版卡面**。要求"做完先不推送"。

**数据侧**（数据仓库，未提交）：每条 `[[track]]` 新增可选的 `cover = "https://…"` —— **一首一封面、跟着曲目本身走**
（形状见下面「修订」）。新工具 `otomads.fetch_covers` 抓 `source` 里的 BV → `api.bilibili.com/x/web-interface/view`
的 `data.pic` → 换 https + 补裁切后缀 `@703w_1000h_1c.webp`（B 站图床现裁成 **703×1000**，正好是 `CardAspectRatio`，
一张约 60 KB）；**默认逐条只补没有的**（已有的一个字不动 = 人工覆写入口），`--force` 才整包刷新；
缓存 `.covers-cache.jsonl` 可续跑。`packformat` 把它攒成 manifest 的 `characters[].covers`
（D145 那条运行时路径），`pnpm data:build` 也把它烘进 `public/data/otomads/characters.json`。

**客户端**（一处真源 `src/data/cardFaces.ts`）：

- **卡数 = `covers.length || card.length`**（一首一张卡）⇒ 音MAD 卡池从"角色 × 立绘"变成"角色 × 曲目"
  （36 角色 / 87 张）。**卡数与图集无关**，所以换图集只换图、牌库里的 `cardIndex` 不会错位。
- **规则零改动**：`buildSongConflicts` 的自链接改按 `cardCount` 判（原来按 `card.length`）——
  不变式与改前逐字相同：**一个角色在整张桌子上最多一张卡**（牌库+收集区，两个玩家一起算）。
  合成角色（三姐妹那种）因此仍然互斥，而同一角色的多张变体只是"挑哪首歌的封面"。
- **新图集 `otomads-cover`**：`source_only = true` + `mode = "otomads"`，`dir`/`origins` 都为空（每张卡面**本身就是
  绝对 URL**）。`availableCardSets()` 守"源不提供就不显示"；选中的图集在当前模式下不可选时**只回落渲染**
  （`resolveCardSet`），不动用户偏好 —— 于是"音MAD 选封面集、切回原曲再切回来"不会丢选择。
- **音MAD 模式仍可用原版卡面**：选上游图集时按 `card` 轮转（多立绘角色各轮到自己那张），`card` 语义一个字没改。
- `CharacterCard`：绝对 URL **原样用**（不拼目录、不 `encodeURIComponent` —— 那会把 `://` 一起编码掉），
  源封面集 `objectFit: cover`（16:10 的封面居中裁掉两侧，不留白边），`<img>` 统一
  `referrerPolicy="no-referrer"`。**B 站图床按 Referer 拦**：带外部 Referer 一律 403、不带才是 200（实测）。
- 播放页"当前卡面"跟着**正在放的那首**走（`player.entry` 在 `music` 里的下标），播的是别的模式的曲目就回到第 0 张。
- `packHash`（联机握手）把 `covers` 算进去：它决定**能抽到哪些牌**，两端不一致会出现"一边抽得到、另一边没有"。
  原曲那份恒为 `null` ⇒ 两份口径不变。

**踩到的坑（浏览器实测抓到的）**：`withPackSnapshot` 的身份兜底取的是**原曲**数据集，它没有 `covers` ——
于是"清单先到、封面后到"的那几百毫秒里 `hasSourceCovers` 翻成 false，图集整套消失、牌桌回落成上游立绘。
修法：`covers` 单独从**自带的音MAD 数据集**兜底（身份字段的边界不变，仍是 S1）。现在清单不带 `covers` 时
自带的封面继续生效 —— 老清单 / 归档还没铺也不影响。

**实测数据质量**（87 张）：全部可加载（0 失败）；**68 张正好 703×1000**，19 张的原图比裁切框小（如 1015×634、
240×150）⇒ 图床不放大、原样返回，浏览器按 `cover` 居中裁；其中 7 张原图宽度 < 720，放大到卡面会糊 ——
这些就靠 `cover` 的**手改覆写**换掉（工具默认不碰已写的值）。

**验证**：`pnpm typecheck` exit 0；`pnpm data:build` + `data:check` 无漂移；`pnpm data:validate` ✅（图集 8 套）；
应用侧 pytest **72 passed**（含跨仓键集合守卫）、数据仓库 pytest **176 passed**；vitest **90 文件 / 928 passed**
（chromium + firefox）；真浏览器验证：原曲模式下列表里**没有**这套图集、音MAD 模式下 3 张示例卡 + 牌桌 24 张卡
**全部**从 `i0/i1/i2.hdslb.com` 解码成功（703×1000）、页面零报错。

**刻意没动**：`card` 的语义与跨模式身份一致（契约 §5 S1）、`otomads`（本地图集）那条路、卡片状态底色与 D108 的
逐张判定、`gameSetting` / 存档口径（牌库本来就不落盘）。数据仓库 85 份骨架文件头里那句"顶层只允许 `key` 与
`card`"**依然是对的**（`cover` 在 `[[track]]` 里，不占顶层键）。

### D153 修订：`cover` 挪进 `[[track]]`（同日，用户要求）

**用户要求**：`cover` 不要放在角色文件顶层，改成写在**每条 `[[track]]` 里**。

**为什么这条值得改**：顶层数组是**位置绑定**（第 i 条 ↔ 第 i 首），两个后果都不好——
中间插/删一首会让后面的封面整体错位（长度不变时**不报错**，最难查）；而工具要补缺只能"整包重建"，
`--force` 会**把手改一起盖掉**。写进曲目里之后这两条同时消失。

| | 旧（顶层数组） | 新（`[[track]].cover`） |
|---|---|---|
| 绑定 | 位置：第 i 条 ↔ 第 i 首 | **跟着曲目本身**，增删/重排天然不错位 |
| 手改一条 | 得数第几条 | 改那一行（**手改即覆写**） |
| 工具补缺 | 全跳过或 `--force` 全重建（盖手改） | **逐条只补没有的**，已有的一个字不动 |
| 校验 | 数组长度 = 曲目数 | **每个角色全有或全无**；半有半无 ⇒ 报错并点名第几首 |

**线上形状一个字没改**：`load_packs()` 仍给 `covers: dict[key, list[str]]`，快照仍发 `characters[].covers`
（数组、顺序 = 曲目顺序）⇒ `cardFaces.ts` / `packSnapshot.ts` / `packHash` / 客户端渲染**零改动**，
联机口径不变。改的只有 TOML 源那一侧（`TRACK_KEYS` 加 `cover`、`CHARACTER_KEYS` 去掉 `cover`）。

**旧形状不静默**：两边的读法都会报一句指路的话（"跑 `fetch_covers` 会自动迁移"），而数据仓库的
`fetch_covers` **默认就会迁移**它 —— 按顺序逐条搬进 `[[track]]`、删掉顶层那段（含标记注释），**不联网**、
幂等、长度对不上就不动那个文件。于是"手改过的值"也是被搬下去而不是被覆盖。

**真数据迁移与验证（2026-09-26）**：`fetch_covers` 一次跑完 **36 个角色 / 87 条**（0 次联网：迁移不需要网络，
值从顶层数组搬下去）。**线上形状逐字未变**——三个指纹迁移前后完全相同：

| 指纹 | 迁移前 = 迁移后 |
|---|---|
| 助手 `/manifest.json`（sha256） | `ed77c58500ee06c21cf253b38d05717ba4266adad3fb305af10fe0c1cc9c0632` |
| 自带 `public/data/otomads/characters.json`（sha256） | `8031b0e0f673c512c1e7cedc5c14b874e5e822ab5e09119a10ab0d108b3e9380` |
| 构建期 `contentHash`（`pnpm data:build` 打印） | `b627c12347b9` |

⇒ **应用仓库的运行时零改动**（`cardFaces.ts` / `packSnapshot.ts` / `packHash` / 组件全没动），只改了注释与文档。
测试：数据仓库 pytest **198 passed** + `node --test` 0 fail；应用侧 pytest **77 passed**（+5 条 per-track 规则用例：
全有 / 全无 / 半有半无点名第几首 / 非 https / 旧形状指路）；vitest **90 文件 / 930 passed**；
e2e（`smoke` + `mode-separation`）**36 passed**；部署实测：牌堆 87、随机补满后 24 张**全解码**、全部来自
`i0/i1/i2.hdslb.com`、零页面报错。

**顺带的边界调整**（数据仓库，超出本次形状改动但必要）：`stage_media.review_archive` 的"归档 ↔ 本仓库 `packs/` 对照"
原本会在 `load_packs()` 硬失败时把**整条 CDN 构建**带崩（`build_cdn_site.py` 走同一个函数），
而那条对照本来就是**只警告**（D147）—— 现在读不动时降级为警告并把原文抄进日志（+回归用例）。
迁移后行为与改前一致（严格读法能读通）。

### D153 行为优化：多重卡牌**只在自定义卡面下**生效（同日，用户要求）

**用户要求**：多张卡牌（一个角色在卡池里占好几张）只在**自定义卡面**时启用。

**问题**：上一版让"一首一张"跟着**数据**走，于是**任何**图集下音MAD 角色都有 N 张卡 ——
选原版立绘（dairi / ZUN / 幻想人形演舞…）时会看到**同一个角色的 N 张一模一样的立绘各占一张卡**：
牌堆被撑大（36 → 87），而视觉上什么信息都没多。

**改法**（`src/data/cardFaces.ts`）：

| 口径 | 用什么算 | 谁在用 |
|---|---|---|
| `cardCount(character, cardSet)` | **卡池**：`sourceOnly` 图集（源按曲目给素材）⇒ `covers.length`（一首一张）；其余图集 ⇒ `card.length` | 对战页建卡池、播放页"接下来"卡条 |
| `cardFaces(character, cardSet)` | **渲染**：按**数据最大**口径铺满（比卡池长是故意的） | `cardFiles`（牌桌/未使用区/选卡条） |
| `maxCardCount(character)` | **互斥**：两种口径取最大，**与当前图集无关** | `buildSongConflicts` 的自链接 |

**为什么互斥表不能跟着图集走**：它是"一个角色在整张桌子上最多一张卡"这条不变式的实现（D108）。
若按当前图集算，联机两端选了不同图集（一边封面集、一边原版）就会得到**两张不同的表** ——
一边能放同一角色的第二张、另一边不能。取最大之后两端一致，且与改动前的行为逐字相同。

**为什么不给本地图集（`local_only`）也开多重**：它的卡面来自 `card`（没有按曲目给的素材），
撑成 N 张只会是同一张图重复 N 次 —— 正是这次要消掉的现象。所以"多重卡牌"的开关就是
`sourceOnly`（= 源按曲目给卡面的那套）。

**换图集时牌堆会变，但不会丢牌**：`init()` 只换 `pool`/`conflicts`，**不动牌库**；
已有的 `cardIndex` 靠渲染表的铺满口径照样画得出图（不会白卡），互斥表也仍按最大口径挡着。
联机时若对面用着封面集、发来本端卡池里没有的 `cardIndex`，同样因为渲染表铺得满而正常显示。

**实测**（本地部署，音MAD 模式，同一副 24 张牌库）：图集 = 封面集 ⇒ **牌堆 87**（= 曲目数）、牌桌 24 张
24 张不同封面；切成 dairi-sd ⇒ **牌堆 39**（= 36 个角色 + 慧音 2 张 + 三姐妹 3 张 = `sum(card.length)`，
正是 D153 之前的口径）、**牌库里的 24 张一张没丢、零空白卡、24 张全部来自 `/cards/` 且解码成功**。

**测试**：`cardFaces.test.ts` 16 条（新增"原版图集回到 `card.length` 张""本地图集不算自定义"
"`maxCardCount` 取最大""渲染表比卡池长"）；`songConflicts.test.ts` 新增"自链接按最大口径、与图集无关"
（两个方向：covers 多 / 立绘多）；`GamePanel.test.tsx` 新增端到端"牌堆大小跟着图集走"
（**期望值跟着数据算**：`sum(covers)` vs `sum(card.length)`）+ 换图集后牌库不丢且都有图。
文件级 `beforeEach` 补了 session 归零（图集现在真的会影响卡池，不再是可以忽略的偏好）。
vitest **90 文件 / 942 passed**。

## D154 音MAD 曲包扩到 **106 首 / 43 角色**（19 首新曲目，2026-09-26）

**用户要求**：跑一次数据仓库的更新推送（含封面链接拉取）。落在数据侧是**九份角色文件里手填的 19 条曲目**
（其中 7 个角色原本只有空骨架：秋静葉 / 秋穣子 / 鍵山雛 / 河城にとり / 犬走椛 / 東風谷早苗 / 洩矢諏訪子），
走完 `fetch_covers` → `fetch_audio` → `measure` → `pack` → **先换 Release 资产、再 push** 那条链。

**结果**：归档 **413,139,403 B / sha256 `88b3c577…`**（上一份 343,469,436 B / `4f5be065…`），
`stage_media review` ✅（106 行地址 / 43 角色 / 106 条曲目条目 / 顶层 `revision fb506be454c1b956`）；
CI 重打与本机那份**逐字节相同** ⇒ ② 段没换资产（D149 那条不变式又验了一次）；
线上 `build-info.json` 的 `archiveSha256` 与本地一致，`manifest.json` **106 行 / revision `fb506be454c1b956`**。

**三个真踩到的坑（都值得记）**：

1. **数组写到 `author` 键上**：`author = ["甲", "乙"]`（正确写法是 `authors = [...]`）。
   `_read_authors()` 只校验 `authors`，不校验 `author` 的类型 ⇒ 它会一路活着走到
   `author_of()` 才炸成 `AttributeError: 'list' object has no attribute 'strip'`，而且是在 `fetch_audio`
   的**线程池里跑到 50/106 处整条崩**、报错既不点名曲目也看不出是哪一份文件。**19 条新条目里有 2 条**
   是这个写法 ⇒ 不是罕见笔误。现在 `load_packs()` 直接报错并指路 `authors = [...]`（数据仓库 +1 用例，199 passed）。
2. **空骨架填上曲目后要跑 `pnpm data:roster`**：数据仓库的 `characters.toml` 是**派生**的（= 有曲目的角色），
   不跑就漏掉这 7 个角色的 `name` / `order`（36 → 43）；顺序是"数据仓库提交 roster → 主仓库 pin"。
   漏跑的表现很安静：`data:build` 照样出 43 个角色，只是那 7 个没有名字与排序。
3. **`fetch_covers` 是 `fetch_audio` 的前置闸门**：严格读法下 `cover` 对一个角色**全有或全无**
   （半有半无在运行时的 `covers` 数组里是空洞 ⇒ 与曲目静默错位），所以新加条目没封面时
   `fetch_audio`（连 `--dry-run`）**连 packs 都读不动**，报错指路 `fetch_covers`。

**数据侧的连带变化**：`loudness/otomads.json` 87 → 106 个键（**旧值一个都没动**；`targetDb` -11.2 → -11.3，
= 中位数随曲库整体移动 0.1 dB）；`contentHash` `153efed2456b` → **`0911e4f51422`**；
pin `398abc7` → **`eb15152`**（commit，不是 tag —— D128 那条口径）。

**验证**：`pnpm data:build` + `data:check` 无漂移；`data:validate` ✅（曲包 106 条、带 source 106 条、带区间 23 条）；
数据仓库 pytest **199 passed**；应用侧 pytest **77 passed**（`test_data_invariants_hold` 那组**当前数据快照**
跟着更新：otomads 36/87/87 → **43/106/106**，并集 465/455 → **484/474**）；vitest **90 文件 / 942 passed**；
e2e（`smoke` + `mode-separation` + `pack-snapshot`）chromium **38 passed** / firefox **38 passed**。

**顺带**：主仓库 `.music/` 与数据仓库 `.music/` 是**两份独立拷贝**，而 `pnpm local`（e2e 的助手）吃的是前者 ⇒
曲包加歌后不同步，助手 manifest 的 `tracks` 行数（87）会与应用统计的曲目数（106）对不上，
两条 e2e 就是这么红的 —— 加完歌记得把新 mp3 同步进主仓库那份曲库（本次已同步 19 首）。

---

## D155 共享卡面层的结构性清理 + 越界卡面的夹取（模式 3 的地基，2026-09-26）

**背景**：第三个音乐模式（自定义）要求"卡面**只有**源给的那一张、内置图集在该模式下不可用"。落地前先把
`src/data/cardFaces.ts` 里两处**今天看不出来、加新模式就会出事**的写法改成结构性的（① ②），
再顺手补掉一个越界白卡（④）。三块**不依赖模式 3**，所以先独立做一轮：这样"另两个模式行为不变"
可以在**没有模式 3 噪声**的情况下被证明。

**① `resolveCardSet` 的回落穿透（`?? sets[0]`）**

改动前候选为空时会回落到**原始** `sets[0]`，也就是"偷偷用第一套内置立绘"。今天走不到（两个模式永远有
`mode === undefined` 的内置图集可选），但模式 3 正好会走到 —— 那个模式下**一套内置图集都不该列**，
却会画出上游立绘。改成**回落链只允许落在 `availableCardSets` 的结果里**：

```ts
const usable = availableCardSets(sets, dataset);
return usable.find((set) => set.id === selectedId) ?? usable[0] ?? NO_CARD_SET;
```

语义因此变成"这个模式下没有可用图集 ⇒ 空图集（不画图）"，**永不再看原始 `sets`**。
反证：改动前 `resolveCardSet([COVER_SET], "otomads-cover", 原曲数据集)` 得到 `otomads-cover`
（在原曲模式里画 B 站封面），改动后得到空图集。

**② "哪些模式共用内置图集"收进模式侧的一处判定**

`availableCardSets` 原来的条件是 `set.mode === undefined || set.mode === dataset.mode`。
而 `set.mode === undefined` 对**所有**内置图集都成立 ⇒ 任何新模式都会自动把它们列出来。
判据移到 `src/music/mode.ts`：

```ts
export const OWN_FACE_MODES: readonly MusicMode[] = [];      // 模式 3 落地时加 "custom"
export function usesOwnCardFaces(mode: MusicMode): boolean { return OWN_FACE_MODES.includes(mode); }
```

过滤条件变成 `set.mode === undefined ? !ownFaces : set.mode === dataset.mode`。
**判据放在 `mode.ts` 而不是 `cardFaces.ts`**：它回答的是"这个模式怎么拿卡面"（模式的性质），
而不是"这张表长什么样"；将来"哪些图集能在哪些模式选"再复杂也只看这一个函数。
今天列表为空 ⇒ 两个模式**逐字不变**（`cardFaces.test.ts` 原有 4 条"图集可选性"用例一条没改）。

**④ 越界 `cardIndex` 从"白卡"改成"第 0 张"**

`DeckGrid.tsx` 与 `UnusedCards.tsx`（两处）原先直接 `cardFiles[key]?.[cardIndex] ?? ""`：渲染表虽然按
**数据最大**口径铺满（`maxCardCount`），但对端用着另一套图集、或存档里留着旧数据时下标仍可能越界 ⇒
**画出一张空白卡**。新增纯函数（放 data 层、只收原始值，不把 `CardInfo` 引进 data 层）：

```ts
export function cardFileAt(files, characterKey, cardIndex): string {
  const list = files[characterKey];
  return list?.[cardIndex] ?? list?.[0] ?? "";
}
```

正常路径（渲染表按 `maxCardCount` 铺满）走不到这条兜底 ⇒ 现有用例不受影响；越界那条从白卡变成第 0 张，
对现有两个模式也是改进。**没做**的事：不去 `useGame` / 状态采用处夹取 `cardIndex` —— 那动的是协议同步的
状态，两端不一致的风险比白卡大。

**影响面**：三个模式共用这一层，模式 3 落地时只需要在 `OWN_FACE_MODES` 里加一个 `"custom"`
（R3 再加合成图集），不需要在卡面层打任何模式专用补丁。

**验证**：`pnpm typecheck` ✓；`cardFaces.test.ts` **16 → 21 条**（新增：两套内置模式都共用内置图集、
用完可选集不再回落 `sets[0]`、越界/负数/非数字回到第 0 张、表里没这个角色才是空串）。

---

## D156 第三个音乐模式「自定义」的数据骨架：模式枚举 + **恒为空**的兜底数据集

**用户要求**：新增第三个音乐模式「自定义」（内部 id `custom`）。**应用不带这个模式的任何数据**，
数据全部来自使用者自己填的自定义源链接；每张卡 = 一个卡名 + 一张卡面 + 一首曲目（严格 1:1）。
本节只记**数据骨架**（计划里的 R1）：模式枚举、空兜底数据集、工具侧的分支与守卫。
源链接、清单校验、卡面、三元预设、联机下发分别在后面几轮（D157 起）。

**落地**（四个模式枚举处 + 生成管线）：

| 处 | 改动 |
|---|---|
| `src/music/mode.ts` | `MusicMode` 加 `"custom"`；`MUSIC_MODES` 三项 |
| `src/store/modeScope.ts` | `slices` 加 `custom`（这条"逐一点名"的约定正好挡住漏项） |
| `src/data/load.ts` | `loadDataset(<base>/custom, "custom")`；`cardsets.json` 的 mode 白名单改用 `MUSIC_MODES`（**一处真源**） |
| `src/data/types.ts` | `SourceRecord.kind` 加 `"custom"`；`DataBundle.datasets` 三份 |
| `tools/src/tmc/build.py` | `MODES` 加 `"custom"`；`build_characters`/`build_albums` 加**显式空分支**；`modes = MODES if submodule else ("originals", "custom")` |
| `tools/src/tmc/validate.py` | 图集 mode 白名单改用 `build_mod.MODES`；注册表 kind 白名单加 `custom`；报告文案 |

**空兜底数据集**（`public/data/custom/`，随仓库提交）：`characters: []`、`albums: []`、
一条 `kind = "custom"` / `table_url = ""` / `enabled = true` 的源（`data/sources/custom.toml`）。
`contentHash` 仍按同一套算法算（空数据也有稳定值，`660f63413604…`）⇒ 联机两端"都没配源"时哈希天然一致。

**最危险的一处**：`build_characters` 原本是"`originals` 一套、**其余全走曲包那套**" ⇒
只把 `MODES` 加一项，`custom` 会安静地拿到音MAD 的 43 个角色 / 106 首曲目（没有任何报错）。
所以两个 `build_*` 都加**显式分支**，并有反证用例：把 `elif mode == "custom"` 摘掉 ⇒
`tools/tests` 里 6 条用例立刻红（含"三份生成物互不串味"）。

**空串 `table_url` 是合法的 —— 但只限 `kind = "custom"`**：新增 kind 感知的包装
`build.source_table_url_problem(kind, value)`；`kind == "custom"` 时空串放行（"还没填"是这个模式的正常状态），
**非空时仍按原规则判**，其余 kind 一字不改 ⇒ D131 那条"根绝对路径在子目录部署下必 404"的守卫没有松动。
三个调用点（`build_sources` 的守卫、`validate.check_source_table_urls`、`tools/tests` 里那条
"已提交生成物地址形态"）都换成它。

**构建不依赖 `data/custom` / `data/otomads`**（Q2）：自定义那份**不依赖任何真源**（它恒为空）⇒
曲包 submodule 初始化与否，`public/data/custom/*` 与原曲那几份**逐字相同**。
两条守卫：① 单测把"submodule 在不在"这个开关翻过来跑两遍比文本；
② 手工把 `data/otomads` 挪走跑 `pnpm data:check` —— **无漂移**（实测）。

**验证**：`pnpm data:build` 17 个文件（13 → +4）、`data:check` 无漂移、`data:validate` ✅
（注册音源 4 → 5，每模式数据集多一行"自定义 0 角色"）；`tools` pytest **81 passed**（77 → +4）；
`pnpm typecheck` ✓；vitest **45 文件 / 478 passed**（+2：三份数据集两两哈希不同 + 自定义那份为空兜底；
另加一条 session 选中 `custom` 后落盘）。

---

## D157 自定义模式的**源链接**与清单：默认空 / 重置 = 清空 / 严格校验 / 运行时整体重建
> ⚠️ **已被 D161 取代**：清单里那个键已从 `face` **改名为 `cover`**。

**用户要求**：模式 3 的数据全部来自"使用者自己填的自定义源链接"（浏览器本地保存，**默认空、重置 = 清空**）。
链接为空 ⇒ **不发请求、不报错**，界面提示"必须填写自定义源链接"。清单合法 ⇒ 卡与曲目立刻出现。

**源链接（`src/store/session.ts`）**：三个层次，优先级从高到低 ——

| 层 | 从哪来 | 落盘？ |
|---|---|---|
| `customSourceOverride` | ① 联机时主机下发（F3，只在本会话生效）② `?customsource=`（启动时读一次） | **不落盘** |
| `customSourceUrl` | 使用者在设置页填（「应用」写它、「重置」写成**空串**） | 落盘 |

- 覆盖带了 `from: "query" \| "host"` 标记：`useNet.leave()` 只清**主机那份**（离开房间即恢复自己的源），
  `?customsource=` 那份跟着页面走、留着 —— 一个字段同时表达"谁给的"与"什么时候失效"，不必再存两份。
- 与 D140 的「本地曲库地址」**故意不同**：那里的「重置」是"回到数据里的默认值"，这里默认值本来就是空 ⇒
  「重置」就是**清空**；空值时按钮置灰（无事可做）。
- 归一化两个 kind **共用一套**（`manifestUrl.ts::normalizeManifestUrl`，D140 那条原样搬过来并改名）：
  空 ⇒ 不覆盖；带 `.json` ⇒ 整条；否则补 `manifest.json`、无协议补 `http://`。
  `applyLocalManifestUrl` 因此长成 `applyManifestOverrides(sources, {local, custom})`（只改**对应 kind** 的源）。

**清单 → 数据集（新增 `src/data/customManifest.ts`）**：严格校验，**任何一条不满足 ⇒ 整份 `undefined`**
（fail-closed，与 `packSnapshot` 同一个哲学）：`schema === 1` / `mode === "custom"` / `cards` 非空 /
每张卡 `name`·`album`·`title`·`face`·`audio` 非空 / 可选字段写了就得非空 / `id` 唯一
（不写则用 `(卡名|专辑|曲名|卡面)` 的稳定哈希派生，**与数组顺序无关**）。**缺音频 = 整份不合法**（F2）：
宁可整份不生效，也不要"看得见、点不响"。`(专辑, 曲名)` **不要求**唯一 —— 两张卡共用一首是允许的
（`songConflicts` 会把它们判成互斥，一局里只允许一张在场，**这是有意的**）。

- **卡面与音频在校验阶段解析成绝对地址**：相对 ⇒ 按**清单目录**拼（`sourceRelativeUrl`，D141 的口径），
  绝对 ⇒ 原样；逐卡 `revision` 拼 `?v=`、顶层 `revision` 兜底（D144 的口径）。
- 形状：一条卡 ⇒ 一条 `CharacterRecord`（`card` 与 `covers` 都写这一张面 ⇒ 1:1 在数据里就写死了，
  卡数恒为 1），专辑按**首次出现顺序**建（`kind: "other"`、`pack: "custom"`）。
- **卡自己带音频**（F1）：`CharacterRecord.audio` 与 `music` 一一对应，播放层**不再查 `(专辑, 曲名)` 表**；
  取哪一格用 `entryIndexOf()`（与 D153 的 `covers[i]` 同一个下标算法，两处共用）。
- 响度表：清单顶层 `loudness` 走的是 **D139 那条通用路径**（`loadSourceTables` 对任何 payload 都读它，
  按清单那一层解析）⇒ 不需要在自定义这条路上再写一遍；增益键仍是 `作者 - 曲名` 那个 stem。
- `loadSourceTables` 里**地址为空的源一个请求都不发**（模式 3 默认就是空的；其余模式有守卫挡着）。

**指纹 `customHash`（契约 C6）**：覆盖 卡 key / **卡名** / **顺序** / 卡面（解析后的绝对串）/ 专辑 / 作者 / 曲名；
**不覆盖** 音频地址与版本号（换 CDN / 换宿主不该把两端拆开，与 D145 同口径）、清单来源 URL。
与 `packHash` 共用同一套**骨架**（`packSnapshot.ts::fingerprint`：排序 → 序列化 → 两个冻结标签各哈希一次），
只是投影不同：音MAD 的身份由原曲数据集守（S1）所以不算 `name`/`order`，模式 3 的身份**就是**清单给的、
必须算。**`packHash` 的输出逐字未变**（重构时用真实数据集实测：otomads `5a7e836113e3c1e2`、
originals `3d83c3eb519ba812`，改动前后同值）。

**界面**：设置页的「音乐源」分区在模式 3 下只渲染**一行**（输入框 → 重置 → 应用 + 状态 + 提示），
不渲染开关 / 上移下移 / 本地曲库地址；状态显示的是**卡数**（这个模式没有 `entries`，F1），
清单被拒时给红色"清单不合法"，生效值来自主机时给一行说明。间距沿用同一套常量（`spacing={1}` = 8dp、
按钮 small 32dp、输入框 48dp、`alignItems: "center"`），一个都没动。

**验证**：`pnpm typecheck` ✓；vitest **46 文件 / 531 passed**（新增 `customManifest.test.ts` 39 条 ——
合法清单、22 条坏形状矩阵、`withCustomManifest`、`customHash` 覆盖/不覆盖；`sources.test.ts` +2 条
自定义清单与响度表；`useSources.test.ts` +1 条"空地址不发请求、改地址会重载"；`usePlayer.test.tsx` +3 条
逐卡音频；`ConfigPanel.test.tsx` +4 条那一行；`session.test.ts` +4 条优先级与落盘边界）。

---

## D158 模式 3 的卡面：代码里的**合成图集**，图集菜单在该模式下不出现
> ⚠️ **已被 D164 取代**：模式 3 下**要**渲染 `CardSetSection`（用来选 16:9 / 4:3），`CardSetSection.tsx` 也改了。

**用户要求**：模式 3 的卡面**只有源给的那一张**（每卡一张、不可更换），`cardsets.json` 里的任何图集
在这个模式下都不可用；播放页 / 游戏页画的必须是源给的卡面，**不回落**内置立绘。

**落地**（D155 已经把地基清好了，这一轮只是"把模式 3 登记进去"）：

- `src/music/mode.ts`：`OWN_FACE_MODES = ["custom"]` —— 判据仍然只有那一处；
- `src/data/cardFaces.ts`：新增代码里的**合成图集** `CUSTOM_CARD_SET`
  （`{ id: "custom-source", mode: "custom", sourceOnly: true, dir: "", origins: [], localPrefix: "./" }`）；
  `availableCardSets` 对自带卡面的模式**直接返回它**（内置图集与用户的本地图集一套都不列），
  `resolveCardSet` 于是必然落在它上面 ⇒ **用户存下的 `cardCollection` 被忽略但不改写**
  （切回别的模式，偏好原样恢复 —— 与 D153 的"回落只影响渲染"同一条原则）。
- `sourceOnly` 让 `CharacterCard` 把卡面值**当整条 URL 用**（不拼目录、不编码）并按卡面比例 `cover`，
  与音MAD 的 B 站封面同一套；每卡恰好一张 ⇒ `cardCount` / `maxCardCount` 恒为 1，
  `cardFace` 的取模轮转在 1 张下天然安全（**不改卡面层的任何算法**，靠数据形状保证）。
- `src/ui/panels/ConfigPanel.tsx`：模式 3 下**不渲染** `CardSetSection`，改渲染同一个分区里一行只读说明
  （"这个模式的卡面由源提供，每卡一张，不能在这里更换图集"）—— 分区标题照旧在，设置页五个分区的节奏不变。
  `CardSetSection.tsx` 本身**一个字没动**（它只是"不该在这里出现"）。

**为什么合成图集不进 `cardsets.json`**：那张表是**数据**（构建期生成、随仓库提交），而模式 3 的卡面来源
是"运行时由使用者的清单决定"—— 没有 `dir`、没有 `origin` 可写，写进数据表反而要给它编一套假字段。
放在代码里，它就是"这个模式怎么拿卡面"这条规则的一部分，与 `OWN_FACE_MODES` 挨着。

**验证**：`pnpm typecheck` ✓；vitest **46 文件 / 537 passed**（`cardFaces.test.ts` +3：合成集是唯一可选项、
用户偏好被忽略但不改写、1:1 ⇒ 卡数恒为 1；`ConfigPanel.test.tsx` +1：图集分区只剩一行说明）。
**反证**：把 `OWN_FACE_MODES` 改回空表 ⇒ 那两条新用例立刻红（`expected false to be true`、
`expected 'dairi-sd' to be 'custom-source'`），其余 22 条照旧通过 —— 正是 D155 想要的那种"只动该动的"。

---

## D159 模式 3 的选曲：**专辑三元 + 作者三元**，以及**逐卡禁用**（卡池同口径）

**用户要求**：这个模式的音乐选择只剩**专辑三元 + 作者三元**；"仅单曲模式"只剩**逐曲（= 逐卡）禁用**
（没有总开关、没有手选），禁用的卡**不进轮播、也不进卡池**。

**真值表（Q4，`src/music/customSelection.ts`）**：`启用 = 专辑 !== "off" && 作者 !== "off"`
（只有三个取值时，这与"两者都 unset 才全开 + 任一 off 一票否决 + on 压住另一维未配置"完全等价，
详见那张表）。关键一条与另两个模式的直觉相反：**两维都 `unset` = 全开**（那边是"专辑默认勾选"）。
**没有作者的卡只看专辑那一维**（Q7）—— 作者维度对它不适用，不是"未配置"。

**两把新 store**（形状与另两个模式不同 ⇒ **不走 `makeModeStores()`**）：

| store | 键 | 内容 |
|---|---|---|
| `src/store/customPreset.ts` | `tmc.v1.custom-preset` | `{albums: Record<string, Tri>, authors: Record<string, Tri>}` + `setAlbumTri` / `setAuthorTri` / `reset` |
| `src/store/customSingle.ts` | `tmc.v1.custom-single-track` | `{disabled: Record<string, true>}` + `toggle` / `prune` |

**键名与另两把刻意不同**（不是 `preset.custom` / `single-track.custom`）：那两个键已经被
`makeModeStores()` 生成的那把**模式 2 形状**的表占着（模式 3 下队列与音源仍在用它那一套键）。
两把形状不同的 store 挤同一个键 ⇒ **谁后写谁把对方清空，而且不报错**（各自的校验器都只会把对方的
字段读成空表）。这条有回归用例盯着（`customStores.test.ts` 的"键隔离"）。另外这两把**不需要 `sync()`**：
另两个模式要它是因为"新专辑默认勾选"得写进表里，这里的缺省值就是 `unset`（与"键不存在"等价）。

**卡池与轮播同一口径**：`AppShell` 的 `isUsable()` 按模式分派（模式 3 = 三元允许 **且** 未被逐卡禁用），
`usableKeys` 同时喂给队列与游戏页（新增 `GamePanel` 的 `cardKeys` prop，**不传 = 今天行为**，
有守卫用例）。禁用一张卡还会清掉它那条列表页点播（否则点播会一直盖住"已禁用"，与 `single.ts` 同一条）。

**播放层**：`PlayerInputs` 多一个可选 `cardEnabled`（模式 3 传，别的模式不传）——
这个模式一卡一首，给了它就直接取那一首，不再走 `preset` / `allowedTracks` 那套
（"专辑勾选 + 类别三态 + 秘封碟"的语义在这里一个都没有）。手选/点播（`pinned`）仍然优先，
**对局中忽略预设**（= 全曲库）这条也照旧生效。

**界面**：`CustomPresetSection`（专辑行 + 作者行，作者空的不列）与 `CustomSingleSection`
（一行一张卡：卡名 · 曲名 · 专辑 · 作者 + 「禁用」chip，禁用的压暗）。两处都用 `SectionPanel` 的
`preset` / `single` id —— 设置页五个分区的节奏不变，只是模式 3 的这两个分区换了内容。
顺带把**两个**共用件抽出来（前一个提交）：`TriToggle`（三态控件，预设的类别开关也改用它，DOM 与
testid 一字不变）与 `useProgressiveRows`（那套"rAF → 宏任务 → 再渲染一片"的分片补齐，
`SingleTrackSection` 继续用；模式 3 的逐卡列表行里只有文字 + chip，靠 `LazyRow` 的视口懒挂载就够，
**没有**套这一层）。

**验证**：`pnpm typecheck` ✓；vitest **48 文件 / 575 passed**（`customSelection.test.ts` 18 条 ——
真值表**逐格** 9 条 + 空作者 + 统计 + 列表；`customStores.test.ts` 12 条 —— 落盘、`unset` 不落盘、
坏存档收窄、键隔离、prune 的"没死条目就不写盘"、toggle 清点播；`ConfigPanel.test.tsx` +3 条模式 3 的两个分区；
`GamePanel.test.tsx` +1 条"传 `cardKeys` 就只进那些卡、不传即今天行为"；`usePlayer.test.tsx` +3 条
`cardEnabled` 的三个方向；`App.test.tsx` +1 条"模式 3 没配源时三个页签都渲染得出来 + 必填提示"）。

---

## D160 协议 v5：**第三个数据哈希** + 主机把自定义源随会话下发给客户端

**用户要求**：模式 3 支持联机（Q6）——协议升 v5 加第三个数据哈希，**主机把源链接随会话配置下发给客户端**，
客户端"本地空就自动采用、本地有别的值就弹确认"，采用**只在本会话生效**（F3）。

**协议（`docs/protocol-v1.md` 已同步）**：`DataHashes` 三项；`MusicModeWire` 三项；
`SessionConfigWire.customSourceUrl?`；`hello.customSourceUrl?`；`reject.customSourceUrl?`；版本 4 → 5。
`dataHashMismatch` 拆成 `mismatchedModes` + `mismatchDetail`：拒绝时的 `detail` 变成**人话**
（"原曲 + 自定义"这种点名），不再是一句笼统的 "static data hash mismatch"。

**握手流程**（主机权威）：

```
客户端 hello{protocol:5, dataHash{3}, customSourceUrl}
  ├─ 三个哈希全同 → welcome（config 里带着主机那份源，供展示/排障）
  ├─ 不同，且主机在 custom 模式、主机有链接 → reject{reason:"data", detail, customSourceUrl:主机的}
  │     ├─ 客户端本地空       → **自动采用** → 拉清单 → 数据集重建 → 重发 hello（**只自动重试 1 次**）
  │     └─ 本地有别的值       → 大厅里问一句（采用 / 留在房外）
  └─ 其他不同 → 照旧 reject{reason:"data"}，只是 detail 点名了模式
```

**为什么"只重试 1 次"**：采用的是"数据还没到"的那一刻决定的，重发要等**数据重建**（由 `AppShell` 在
`liveBundle` 换新时调 `retryHello()` 驱动 —— 与 `window.__TMC_DATA_HASH__` 同一次重渲染，D145 那条口径）。
若不设上限，"采用 → 还是不同 → 再采用"就是死循环。

**采用只写会话级覆盖**（`customSourceOverride`，D157 那三个层次里的中间层）：存档一个字不改，
`useNet.leave()` 只在 `from === "host"` 时清它 ⇒ 离开房间即恢复自己的源（F3 落在代码上）。

**会话配置里的 `customSourceUrl` 只作展示**：`adoptHostConfig` **不**顺手改本地那份 ——
"两端数据相同"的常见情形是同一个源的不同写法（本机 vs CDN），这时悄悄改掉用户填的地址只会让人困惑。
它落在 `useNet.hostCustomSourceUrl`，设置页那行在房内显示"主机在用：…"（排障时一眼能对上）。

**人话**：`src/i18n` 新增 `CustomSourceHostUsing` / `CustomSourceHostDiffers` / `CustomSourceHostAdopt` /
`CustomSourceHostStay`；大厅里那条用 MD2 的 `Alert`（warning）+ 两个按钮（主操作"采用"是 contained，
"留在房外"是文字按钮），与「关于」弹窗同一套排版口径。

**验证**：`pnpm typecheck` ✓；vitest **48 文件 / 582 passed**（chromium 与 firefox **各 582**）——
`engines.test.ts` +3 条（主机在模式 3 且自己有源时随 reject 下发、两个反例不下发、detail 点名模式），
`useNet.test.tsx` +5 条（自动采用 + 只重发 1 次 + 重发时带上刚采用的源、有别的值时不自动采用、
采用只改会话级覆盖、拒绝后自己的源不变、会话配置里的源只作展示且离开房间清掉），
`GamePanel.test.tsx` +1 条（大厅那条提示的两个按钮）。

---

## D161 模式 3 收尾：真浏览器 e2e、契约文档、以及两个"同源地址被当成别的"的修复

**e2e（新增 `e2e/custom-mode.spec.ts`，6 条 × 两个桌面引擎）**：素材是 `e2e/fixtures/custom/`
下**真的一份源**（`manifest.json` + 自己生成的三张卡面 / 三段 1 秒静音 mp3 + 响度表，
`?customsource=` 指向它，同源静态文件）—— 用真源而不是 `page.route` 打桩，因为
"地址归一化 → 相对路径按清单目录解析 → 卡面渲染"这三步正是最容易出错、也最值得在真浏览器里过一遍的地方。
六条：① 没配源 ⇒ 0 张卡 + 必填提示 + **一个请求都不发**；② 配了源 ⇒ 卡/曲目立刻出现、
播放页画的是源给的卡面、统计跟着清单走；③ 专辑/作者三元逐档切换（默认全开、off 一票否决、
无作者的卡不受作者维度影响）；④ 逐卡禁用 ⇒ **轮播与卡池同时**少一张；⑤ 重置 = 清空 + 刷新仍是空；
⑥ 窄屏 320 / 412dp 那一行与整页都不横向溢出。

**e2e 抓出的两个真 bug**（都在"同源"这条路上，单测与组件测试都照不到）：

1. `normalizeManifestUrl` 把**相对当前页面**的地址当成了裸主机：`/cards/manifest.json` →
   `http:///cards/manifest.json`。修法：只有"第一段看起来像主机名（有 `:` 或 `.`）"才补 `http://`，
   根路径 / 带目录的相对路径 / 只有文件名的 `manifest.json` **原样保留**（同源静态托管是最常见的形态之一）。
2. `CharacterCard.cardUrl` 把 `sourceOnly` 图集的卡面当成了内置图集的**文件名**：清单解析出来的
   `/cards/faces/a.png` 被拼目录 + `encodeURIComponent`，变成 `.//%2Fcards%2Ffaces%2Fa.png`（必然 404）。
   修法：**源给的卡面一律原样用**（它已经是解析好的地址，可能是 `https://…`、也可能是同源 `/…`）。
   两条都补了单测（`sources.test.ts` 的归一化用例、`GamePanel.test.tsx` 的渲染断言）。

**契约文档**：新增 [`docs/custom-mode-v1.md`](custom-mode-v1.md)（三段式 / 清单形状与校验 / 卡面与音频 /
三元与逐卡禁用 / 哈希与协议 / 空源与联机采用 / 地址形态 / 界面 / 五条不变量），
`docs/protocol-v1.md` 同步到 v5，`docs/README.md` 的现状表与契约表、根 `README.md` 的模式说明同步。

**「关于」弹窗**加一行（Q8）：说明模式 3 的素材来自使用者自己的源、工具在它自己的仓库里，
**不放外链**（那个仓库还没有公开，与"源代码仓库（暂未开放）"那一行同一个处理）。

**数据仓库怎么挂**（Q2）：先**推送那个仓库**，再挂 submodule —— 顺序不能反：
提交一个指向不存在远端的 gitlink 会让 `git clone --recursive` 直接失败，那是**坏的仓库状态**。
仓库公开（`Dustymind/touhou-music-cards-custom-data`，private）之后已按 Q2 挂上：

```bash
git submodule add https://github.com/Dustymind/touhou-music-cards-custom-data.git data/custom
# → gitlink 4514fd5（那个仓库的初始提交），.gitmodules 里多一条
```

两条守卫都实测过：**在场**与**挪走**（`mv data/custom …`，即"没初始化"那一种状态）跑
`pnpm data:check` 都**无漂移**、`data:validate` 的数字一字不改 —— 主仓库构建确实不读它。

那个仓库里**不放文档**（用户要求）：`README.md` / `README.ai.MD` / `tools/README.md` 已经移出、
合并成工作区根的 `local-docs/custom-data-repo.md`，初始提交因此**从第一个字节起**就没有 `.md`。

**收尾之后的一处改名**（用户要求）：清单里那张卡面的键从 `face` 改成 **`cover`** ——
自定义数据仓库那边一并改（目录 `faces/` → `cover/`、卡表键 `face`/`face_source` → `cover`/`cover_source`、
模块 `custom.fetch_faces` → `custom.fetch_covers`、助手白名单、`.gitignore`、全部测试），
应用侧 `customManifest.ts` 与 e2e 夹具跟着改。理由：同一个概念在本项目里已经叫 `cover`（音MAD 的
`[[track]] cover`、`CharacterRecord.covers`），没必要为模式 3 另起一个名字。
另外那个仓库**不放文档、也不提别的仓库**（用户要求）：三份说明合并进工作区根的
`local-docs/custom-data-repo.md`；代码注释里"某数据仓库怎么怎么样"的来源说明全部改写成实测结论
（技术理由一条没少，只是不再指向另一个仓库）。

**验证**：`pnpm typecheck` ✓；vitest **49 文件 / 587 passed**（chromium 与 firefox 各 587）；
e2e `custom-mode.spec.ts` **6 passed**（chromium / firefox 各 6）；
`pnpm data:build` 17 文件 / `data:check` 无漂移 / `data:validate` ✅；主仓库 pytest **81 passed**。

---

## D162 切语言时挂载着的面板会卡住（`memo` × 模块级 `t()`）

**用户报告**：中英文反复切换时，**部分字段卡住不切换**。

**原因**（一类，不是一个点）：`t()` 读的是 `src/i18n/localization.ts` 里的**模块级** `locale`，
而设置页的五个分区与四个页面面板全都 `memo(...)` 过。切语言走的是 `useSession.setLocale`：
AppShell 跟着重渲染了，但这些面板的 **props 一个都没变**（`bundle` / `tables` / …）⇒ `memo` 直接把整块跳过，
里面的文案停在旧语言 —— 要等它**因为别的原因**重渲染（切页签、展开分区、换图集…）才跟上。
实测（e2e 式的真浏览器用例）：中文下 AppBar 与「数据」分区是中文，而「音乐选择预设」「仅单曲模式」
与播放/列表/游戏三页仍是英文。只有当场订阅了会话的那些（`ConfigPanel`、`SourceSection`、
`CardSetSection` —— 它们 `useSession()` 取整份 state）不会卡。

**修法**：新增 `src/ui/memoOnLocale.tsx` —— `memo` 的替代品，多订阅一次 `locale`：

```tsx
export function memoOnLocale<P extends object>(Component: ComponentType<P>) {
  return memo(function LocaleBound(props: P) {
    useSession((slice) => slice.locale);   // 值不用：订阅它是为了"语言一变就重渲染"
    return <Component {...props} />;
  });
}
```

`memo` 挡住的只是**父组件驱动**的重渲染，组件自己订阅的状态照样会重渲染它 ⇒ 一处修好整棵子树
（含 `ListRow`、`AllNoneButtons` 这类子组件里的文案），不必把 locale 逐层透传、也不必在每个子组件里各写一遍。
**约定**：这个仓库里凡 `memo` 过的面板/分区一律用它包（10 处），这样"新加一个文案"不会悄悄带回同一个 bug。

**守卫**：新增 `src/ui/localeSwitch.test.tsx`（真数据 + 真挂载）——设置页五个分区各挑一处只在某一语言里
出现的字，zh → en 逐个断言；再**来回切三轮**后要求每一处都回到中文；播放/列表/游戏三页各挑一处同样断言
（列表页那一处只能读输入框的 `placeholder`：那一页只有搜索框带文案，而 placeholder 不进 `textContent`）。
**反证**：把 `memoOnLocale` 换回 `memo` ⇒ 两条用例立刻红。

**验证**：`pnpm typecheck` ✓；vitest **50 文件 / 589 passed**（chromium 与 firefox 各 589；+2 = 新用例）。

---

## D163 卡面比例收成一个入口：「多套比例并存」的适配（模式 3 从 703:1000 竖版改成横版）

**用户要求**：给自定义模式启用横版卡面；**所有涉及卡面的代码都要"原比例 + 16:9"双适配**。

**为什么需要**：模式 3 的卡图由使用者自己提供。第一张真卡的封面是 B 站原图 **1920×1200**，
而卡面比例一直是内置图集那条 **703:1000（竖版）** ⇒ 应用按 `object-fit: cover` 居中裁掉**左右约 63%**
（上一轮交接里"卡面比例的待办"就是这个）。

**改法（一处真源 + 六处适配）**：

1. **比例跟着图集走**：`CardSetRecord.ratios?`（能换哪几档；缺省时按
   `localOnly` / `sourceOnly` 判，内置六套两种都不是 ⇒ 不能换）。`cardsets.json` 里那 8 套
   **一个字节都没动** —— 原曲/音MAD 两个模式的内置图集行为逐字不变。
2. **取法只有一条**：新增叶子模块 `src/theme/cardRatio.ts`（**不引 MUI**，所以数据层的
   `cardFaces.ts` 也能引它），导出档位常量与 `cardAspectRatio(cardSet)`；缺省/认不得的档一律回落
   原比例 703:1000（坏数据不许把卡面高度算成 0 / `NaN`）。数据边界另有一道硬校验：
   `validateCardSets` 对 `ratios` 只认 `CARD_RATIOS` 里那三档（非空、去重），非法就是**整份数据报错**。
3. **六处调用点全部改成 `cardAspectRatio(cardSet)`**（原来各写一遍 `CardAspectRatio`，
   漏一处就会出现同一页两种形状的卡）：
   `CharacterCard`（`aspect-ratio`）、`CardStrip`（可视窗口高）、`DeckGrid`（卡槽高 + 彩蛋框）、
   `UnusedCards`（网格占位高）、`UnusedCardsTray`（三档高度）、`UpcomingFan`（牌堆高）。
   顺带把 `UnusedCardsTray` 的档位算式提成纯函数 `trayDetents(viewportHeight, cardHeight)`（可单测），
   `+ 4` 改回引用 `DECK_GAP`（同一个值）。
4. **`resolveCardSet` 必须返回引用稳定的对象**：`GamePanel` 把 `cardSet` 放进"重建卡池"那个 effect
   的依赖里，而"每次都新建 `{...CUSTOM_CARD_SET, ratio}`"会让 effect 每渲染都跑、`init()` 改状态、
   再渲染 —— 实测就是 `Maximum update depth exceeded`（三条既有用例当场红）。现在每个档位缓存一个
   常量图集（`customCardSet(ratio)`），并有一条单测钉住"同图集/同档 ⇒ 同一个对象"。

**验证**（实测，全部真浏览器）：`pnpm typecheck` ✓；新增 `src/theme/cardRatio.test.ts` +
`src/ui/cardGeometry.test.tsx`（**逐个面量像素**：卡牌本体 / 占位卡 / 卡条窗口 + 条里的卡 /
牌桌空槽 + 整块牌桌 / 未使用卡牌网格 / 底部面板档位，三种形状都量过）。
（三档与"逐档链接"的部分见下一条 D164 —— 这一条只管"比例从常量收成一个入口"这件事。）

---

## D164 「卡面设置」分区 + **三档画幅**（常规 / 16:9 / 4:3）；`cover` 收两种形态，工具改产源分辨率链接

**用户要求**（两条消息合起来）：①「这个模式加个开关，在 4:3 和 16:9 之间切」，并且**全局**把「卡面图集」
改名成「卡面设置」；②「封面拉取自动把 16:9 和 4:3 都拉下来（原分辨率）」；③ 随后把范围钉成
**所有"非内置六套"的卡面**（模式 3 的自定义卡面 + 音MAD 的 B 站封面集 + 本地自放图集），
三档都要支持，`cover` 允许"16:9 + 4:3 两份或单份（单份由前端运行时裁）"，并且
**通过 source 生成 cover 链接的脚本改成自动产源分辨率的 16:9 / 4:3 链接**。

> 这条落地的过程中先在同一个分支上做过"两档（16:9 / 4:3）+ 本地裁两份文件"的版本；
> 用户把范围与形态定下之后，那一版**被本条取代**（`75ce969` 的本地裁切在数据仓库里保留为历史，
> 行为改成产链接）。
>
> ⚠️ **本条里的"逐档表 / 两份或三份链接"后来又被 D167 取消**：`cover` 统一成**一条链接**
> （原版无修改的图），裁切完全由前端做。三档画幅本身仍然有效，见 D167。

**① 谁能换档（判据只有一处）**

- **内置六套**（dairi / dairi-sd / enbu / enbu-dolls / thbwiki-sd / zun）**不能换**：它们是整套原版立绘，
  永远 703:1000、永远 `object-fit: contain`（宁可留白也不许裁）。判据在 `cardRatioChoices()`：
  `localOnly || sourceOnly` 才是"素材由使用者/源给的"，内置六套两种都不是 ⇒ 出不了画幅控件。
  出厂数据上有一条单测逐个点名（`load.test.ts`）。
- **自定义卡面**能换三档：本地自放图集、音MAD 的 B 站封面集、模式 3 的合成图集。
  默认档写在图集自己的 `ratios` 第一项里 —— 模式 3 是 **16:9**（沿用"这个模式统一横版"那条裁定），
  其余是**常规**（不动开关 = 今天的观感）。
- 用户偏好存 `session.cardRatio`（全局、落盘、逐键校验，`""` = 没选过 ⇒ 跟着图集的默认档）。

**② 形状与图：一条回落链**

`CharacterRecord.coversByRatio` = **逐档数组**（`coversByRatio[档][i]` 与 `covers[i]` / `music[i]` 平行）。
`cardFace()` 取当前档那一份，没有就回落到主链接（`covers[i]`，即 `original` → `16x9` → `4x3`
里第一个有的）—— 单链接的旧数据因此照旧能用：三个档位共用那一张，形状由
`object-fit: cover` **运行时裁**（切了档就不再 `contain`，否则 16:9 会得到两条白边）。
`resolveCardSet()` 把生效档位落到图集的 `ratio` 上，于是卡牌 / 卡条 / 牌桌 / 底部面板 / 播放页
五处都不用各记一遍偏好。

**③ 数据形态（两个仓库同一套契约）**

```jsonc
"cover": "https://…/x.jpg"                                  // 单链接：三档共用，前端运行时裁
"cover": { "original": "https://…/x.jpg",                    // 任意非空子集；键只有这三个
           "16x9":     "https://…/x.jpg@1920w_1080h_1c.webp",
           "4x3":      "https://…/x.jpg@1600w_1200h_1c.webp" }
```

- `original` = 源分辨率原图（B 站 `data.pic` 原样）；两个裁切档 = **图床按源分辨率现裁**
  （`W = min(OW, ⌊OH·rw/rh⌋)`、`H = min(OH, ⌊OW·rh/rw⌋)`，不放大）⇒ 对 1920×1200 的封面就是
  1920×1080 / 1600×1200。
- 解析只有一处：`src/data/coverField.ts`（清单与曲包共用）。认不得的键、空值、空对象 ⇒ 整份拒掉。
- **逐档数组要么每条曲目都有、要么整档不要**（与 `covers` 同一条纪律：半有半无 = 与 music 错位）。
- 哈希把**所有**档位算进去，而"用户现在看哪一档"**不进哈希**（显示偏好）⇒ 两端各选各的也能握手。

**④ 工具（两个数据仓库）**

- `otomads.fetch_covers`：逐条把 `source` 的 B 站封面测出原始尺寸（下载一次原图、stdlib 解
  JPEG/PNG/WebP/GIF 头，尺寸进缓存），写成一行内联表 `{ original, 16x9, 4x3 }`；测不出来就回落成
  单链接字符串并逐条报错（可续跑）。
- `custom.fetch_covers`：从"下载器"改成"产链接" —— B 站图源产三档链接（**不用再上传素材**）、
  其它图源/相对路径保持单链接原样。

**验证**（主仓库）：`pnpm typecheck` ✓；vitest **1250 passed（chromium / firefox 各 625）**；
e2e `custom-mode.spec.ts` **8 passed**（真浏览器里三档各换形状**与 img.src**、刷新后还在、
内置图集没有控件、单链接的卡三档共用一份）；两个数据仓库的 pytest 分别 **261 passed**（音MAD 工具：
106 条真封面全部测出尺寸，两个裁切链接 HTTP 200 且像素与算出来的一致）与 **400 passed**
（自定义工具：改成产链接，真卡三档链接实测 200，`cover/` 里一个字节都没多）。
**未做（要人拍板 / 有并行改动）**：音MAD 曲包那 106 条的**数据刷新**（`--force` 会重写全部
`packs/otomads/*.toml`）—— 那三个（后来四个）文件当时正有**别人未提交的新曲目**在改，所以只落了工具，
数据留给下一轮；同理主仓库的 `public/data/otomads/*` 重烤与归档重打也还没做。

**一个真 bug（被既有用例当场抓住）**：`resolveCardSet` 若每次新建 `{...set, ratio}`，`GamePanel`
那个以 `cardSet` 为依赖的 effect 会每渲染都跑 ⇒ `init()` 改状态 ⇒ 死循环
（`Maximum update depth exceeded`）。现在按 (图集, 档位) 缓存一个对象，并有单测钉"引用稳定"。

## D166 并入 fork 的音MAD 数据（106 → 191 首 / 43 → 80 角色）；补上 D164 的"数据刷新"未做项；`cover` 收三档表、新增逐曲 `bitrate`
> ⚠️ **已被 D167 取代**：`cover` 只认**一条非空 https 链接**，逐档表那种写法已当场报错（`tools/src/tmc/packs.py:263-266`）。本条下面关于"单链接或逐档表"的描述已作废。

**用户要求**：先在数据仓库 commit 本地在写的那 49 首（**不推送**）→ 把 fork（`ydzrds/touhou-music-cards-otomads-data`）
的提交**原封不动**并进来 → 之后走完整发布路径（补封面 / 抓音频 / 量响度 → 打包自检 → **先换归档资产** → 推源码 →
`pnpm data:roster` + submodule pin → 验收线上）。

> 编号说明：**D165 这个号没有使用**。当时 `custom-mode-v1.md` 先占了「D165」当引用，
> 但它指的其实是 D164（「卡面设置」+ 三档画幅）—— 2026-09-28 已把那 3 处引用改回 D164。
> 编号空洞**保留不改**（重新编号会打乱既有的交叉引用），所以这一条仍是 D166。

**① 合并形态**：fork `main` 与主线**已分叉**（ahead 7 / behind 8，merge base `69a13bb`）⇒ 不是快进。
那 7 个提交（th14–th17、凭依华等）改了 28 个曲包、**新增 36 首**，但**一个 cover、一行响度、一个音频都没带**。
fork 另有 `patch-1/2/3` 三条一次性分支：逐字比对后确认那三首**已经逐字在 fork `main` 里**
（只多几行残留的骨架注释）⇒ `cherry-pick --skip`，**没有丢任何一首**。
文本冲突破在 `kishin-sagume` 一处：主线给已有曲目**补了 cover 行**、fork 在**同一位置追加新曲目** ⇒ 两侧都留。
合并后 191 首 = 106（已发布）+ 49（本地在写）+ 36（fork）。

**② 补齐派生数据**（D164 里"数据留给下一轮"的那件事）：`fetch_covers` **新增 85 条 / 失败 0**
（`kishin-sagume` / `kochiya-sanae` / `shameimaru-aya` 三个"半有半无"的角色跟着同角色已有的**字符串**形状写，
其余 37 个角色写三档表）；`fetch_audio` 抓齐 **191/191**（`.raw` 也是 191 份）；`measure_loudness`
**106 → 191 键、旧值一个没动**。

**③ 三处数据毛病（本地那批从没跑过校验，这一轮才露出来）**

- `mizuhashi-parsee` 的 `authors = "EarthSky"`（数组键写成了字符串）⇒ 改成 `author`；
- `reiuji-utsuho` 的 `extra = " 角色曲"`（前导空格，不在四种 `extra` 里）⇒ 去掉；
- `kochiya-sanae` 下**两条同名 `Otto Remote`**（两个不同投稿：鞍山侯国玉电乐团 / `xHGNz_`，BV 不同、时长 195/194 秒）。
  按维护者指定的写法把第二条改成 **`Otto Remote - xHGNz`**：曲包、曲库文件名（作者前缀 + 新曲名）与响度表键同步。
  **为什么必须不同名**：清单行的曲名是磁盘名 `作者 - 曲名`，而曲包条目的身份是 `(专辑, 曲名)` ——
  `sources.ts` 的 `resolveTrack` 兜底扫描会给两条同名条目返回**同一条**媒体行 ⇒ 两张卡播同一个文件、
  另一首永远取不到（`(角色, 专辑, 曲名)` 唯一性那条不变量正是为这个立的）。

**④ `tmc` 跟上 D164**（此前只有它停在 D153 的"只认字符串"）：`cover` 现在收**单链接**或**逐档表**
（`original` / `16x9` / `4x3`，至少一档、值都是非空 https），并补上"**同角色档位集合必须一致**"
（否则快照里的 `coversByRatio` 会与 `covers` / `music` 静默错位）；`tmc.validate` 的封面检查同口径。

**⑤ 新键 `bitrate`（逐曲 CBR 码率，32–320 kbps）**：第一次上线时 `wrangler deploy` 直接失败 ——
Cloudflare Workers 静态资产**单文件上限 25 MiB**，而 `ふゆこけ - セックスの杖刀人` 是 22.6 分钟 / 36.9 MB。
按维护者的选择**整首保留、这一首降到 128 kbps**（20.6 MiB，1352 秒一秒没少；响度 −8.1 → −8.5）。
键落在数据仓库的 `packformat`（校验）+ `fetch_audio.render`（整首重编码，**可与裁剪同时用**），
**状态签名与"孪生键"都带上它** ⇒ 改码率会重渲染、同 source 同参数仍只产出一份；
主仓库 `tmc.packs` 同步收这个键（校验但**不进生成物**，与 `source` / 两个时间键同类）。

**验证**

- 数据仓库 pytest **271 passed**（新增 `track_bitrate` 的取值/报错用例、共享键集合向量补 `bitrate`）；
  主仓库 pytest **81 passed**（含"主仓库键集合 == 数据仓库 literals"那条交叉校验）；`data:check` 无漂移。
- 归档 **191 首 / 719.4 MB**；`stage_media review` ✅（**191 行地址 / 80 角色 / 191 条曲目条目**，最大文件 20.6 MiB）。
- 顺序照 UPDATING §3：**先** `gh release upload media … --clobber`（754,356,665 B）**再** `git push`；
  CI ② 打的是"**归档逐字节没变 ⇒ 不换资产**"（本机打包 == CI 重打，可复现性没破）；③ 构建 + 部署 + 线上复验全绿。
- 线上：`build-info.json` `commit = 1cc6db5`、`archiveSha256 = 03733130…`（与本地 `sha256sum` 一致）、
  `manifest.json` **191 行 / 80 角色**、`revision c1b165a2d431fab5`（与归档顶层一致）、媒体 `Range` → **206**、根 404。
- 主仓库：`data/otomads` gitlink `eb15152` → `4b441a6`（roster）→ `1cc6db5`（bitrate）；
  `pnpm data:roster` 写出 **80 个角色**（原 43 + 新 37）；`data:build` 重烤 17 个文件（`data:check` 无漂移）。

**未做 / 留给下一轮**：主仓库的**前端单测与 e2e 这一轮没跑**（只动了 Python 工具与数据，`src/` 一个字节没动）；
`docs/README.md` 里的 e2e / vitest 计数沿用上一轮实测值。

---

## D167 统一 `cover`：**一条链接**（原版无修改的图），缩放与裁切完全由前端做

**用户要求**（原话）："统一行为，cover 变量仅接收一条链接，卡面大小缩放完全由前端实现"；
随后补一句："封面获取脚本，默认获取原版无修改封面，不加任何分辨率限制参数"。

**为什么改**：D164 让 `cover` 同时接受"单链接"和"逐档表"两种形态，于是每个环节都要写两条路
（解析、校验、快照、烘焙、哈希、两个数据仓库的工具），而"逐档表"换来的只是**同一张图的两种服务端
预裁**。用户裁定统一成一条：源给**原版**图，画幅是**前端**的事 —— 前端本来就要为"单链接"那条路
做裁切（`object-fit: cover`），那就把那条路变成唯一的路。

**改法（三处一起）**

1. **应用侧**：`coverField.ts` 整个删掉（它的两种形态没了）；`CharacterRecord.coversByRatio`、
   `PackSnapshotCharacter.coversByRatio`、`packHash` / `customHash` 的那一项、`load.ts` 的校验、
   `cardFace()` 的逐档查表全部取消 ⇒ `covers` 又只是"每首/每卡一条链接"的字符串数组。
   **画幅三档照旧**（`cardSet.ratios` / `session.cardRatio` / 「卡面设置」里的分段控件 / 内置六套不参与），
   只是切档现在**只改前端的框**：`CharacterCard` 的 `object-fit: cover` 按当前档位裁同一张图
   （`sourceOnly` 或"切过档"⇒ `cover`，内置图集 ⇒ `contain`，与 D163 一致）。
2. **主仓库工具（tmc）**：`packs._read_track_cover` 只认**非空 https 字符串**（表 ⇒ 当场报错并指路
   "一条链接"）；`build_characters` 直接写 `covers`（不再拆 `coversByRatio`）；
   `validate` 的封面两条比对也回到直接比字符串数组。
3. **两个数据仓库的 `fetch_covers`**：都改成**产一条原版链接** ——
   `original`（B 站 `data.pic` 原样，只把 `http://` 升成 `https://`），
   **不加任何 `@<w>w_<h>h_1c` 后缀、不加任何分辨率参数**；为算裁切尺寸而做的"下载原图 + 解文件头"
   那套全部删除（不再需要）。`packformat` / `manifest.py` 只认字符串形态，
   快照与清单里不再有 `coversByRatio`。

**代价（明确记下来）**：前端拿到的是**原图**（例如 1920×1200 ≈ 390 KB），比老的
`@703w_1000h_1c.webp` 服务端预裁（≈100 KB）大几倍；换来的是"任何一个画幅都是真·原图裁出来的"
与"数据侧只有一种形态"。浏览器会缓存，且只有当前图集可见的那几张会被请求。

**验证**：（见本轮 HANDOVER §18 —— typecheck / vitest / e2e / 两个数据仓库的 pytest / 本地助手实测）

---

## D168 音MAD 封面集下**音频跟着牌桌上那张卡**（修"音频与卡面不对应"，2026-09-27）

**用户报告**（原话）："音MAD模式的otomad-cover卡面下，音频与卡面不对应。"

### 复现与病灶（实测，不是推断）

浏览器里跑真数据（本机曲库助手，音MAD + `otomads-cover` + 电脑模式 + 「按卡组筛选音乐」），
逐回合量"正在放的音频文件名"与"场上那个角色的那张牌"：

| 回合 | 角色 | 音频是第几首 | 场上那张牌 | 卡面对得上吗 |
|---|---|---|---|---|
| 4 | onozuka-komachi | 1 | `onozuka-komachi-0` | ✗ |
| 5 | yasaka-kanako | 0 | `yasaka-kanako-2` | ✗ |
| 6 | komeiji-koishi | 1 | `komeiji-koishi-4` | ✗ |

- **数据是对的**：逐条比过 80 个角色的 `[[track]].cover` 与运行时快照的 `covers[i]`，
  顺序、内容**一条不差**（`music[i]` ↔ `covers[i]`）；牌桌上的卡面也确实取对了（`cardIndex` → `covers[i]`）。
- **播放页（不对局时）也是对的**：那里的卡面按"正在放的那一首"的下标取（`entryIndexOf`），实测逐首对得上。
- **不对的是对局里的选曲**：`usePlayer` 的 `entry` 由 `pickWithSeed(该角色的全部曲目, turnSeed(gameSeed, turnSeq, currentKey))`
  挑一首 —— 它**只看角色**，跟场上那张牌是第几首毫无关系。而音MAD 的封面集是"**一张卡 = 一首曲目**"
  （D153）：牌桌上那个角色只有**一张**牌（D108 的自链接），上面画的是 `covers[i]`；放出来的却是 `music[j]`。
  于是"看着牌面找歌"这件事在这一模式下**根本不成立** —— 卡面跟音频讲的不是同一首歌。

### 改法

**规则**：牌面按曲目给的对局里，这一回合放的就是**答案卡**那一首（`music[cardIndex]`）。

| 层 | 改动 |
|---|---|
| `GameState` | 加 `perTrackFaces`（这一局的牌面按不按曲目给）与 `currentCardIndex`（本回合答案卡的卡序，`null` = 没有/不适用） |
| `rules.nextTurn` | 回合开始时**记下**答案卡（`answerCardOf`：所有玩家**牌库**里 `currentKey` 的那张）的 `cardIndex`；`startGame` / `stopGame` 清成 `null` |
| `rules.answerCardOf` | 新增：场上那个角色的牌（一局里唯一）；只看牌库、不看"已得"（已得的牌不在桌上，没有卡面要对应） |
| `useGame.init` | 第三个参数把 `perTrackFaces` 写进状态（**`undefined` = 不动**：联机客人端不覆盖主机下发的口径） |
| `usePlayer` | 新输入 `roundTrackIndex`：给了就用 `character.music[i]`（越界落回原口径）。优先级 = **点播 > 回合卡面曲 > 单曲模式手选 > 卡级判据 > 预设/种子** |
| `usePlayer` | 手选（单曲模式）与**点播**拆成两个输入（`pinned` / `request`）：对局里"放哪一首"归场上的牌，而点播是使用者的直接指令 |
| `cardFaces.resolveCardSet` | 多一个 `tablePerTrackFaces`：为 `false` 时把源封面图集从可选集里去掉（回落原版立绘），**只影响渲染与卡池**，偏好不动 |

**为什么记在状态里、而不是渲染时现算**（两条都是硬约束）：

1. **回合中途不许换歌**：抢中的牌会离开牌库 —— 现算的话，"答案卡"在抢中的一瞬间变成 `null`，
   曲子会当场换成另一首（`turnStart` 之后音频一直放到下个倒计时，听得见 ✗）；
2. **两端必须是同一首**：这是"这一回合放哪一首"的唯一依据，写进状态就**自动同步**，不用加协议字段。
   两端各自的图集偏好（可能不同）也就不会把歌拆成两首。

**为什么"牌面按不按曲目给"要单独一个字段**：它决定上面的规则生不生效。判据是 `usesPerTrackFaces(cardSet)`，
而**卡面图集是各端自己的偏好**：主机用原版立绘（一个角色一张卡，卡不指向任何一首）时，
这一局就该按老口径（种子选一首）—— 那条路上牌面是立绘，说不上"对不上"。字段进状态之后：

- 主机建池时写入（`init` 的第三个参数，`GamePanel` 传 `usesPerTrackFaces(本机生效图集)`）；
- 客人端**不写**（`undefined`）：牌是主机发的，口径归主机 —— 否则客人每次收到快照后又按自己的图集翻回去，
  两端来回打摆 ✗（这条有单测钉住：`init(..., undefined)` 保留原值）；
- 客人端还拿它做**渲染回落**：主机那一局不是按曲目给卡面时，客人手上的源封面图集在这副牌上
  **没有意义**（`cardIndex` 全是 0 ⇒ 每张卡只能显示第一首的封面，而音频放的是这个角色的任意一首）
  ⇒ `resolveCardSet(..., false)` 把源封面图集从可选集里去掉、回落成原版立绘（与"源没给封面就整套不显示"同一条）。

**协议 v5 → v6**：加了两个 `GameState` 字段 = 换了快照形状。老版本收不到它们 ⇒ 会按"不按曲目给卡面"
选曲、两端放**不同的歌** ✗ ⇒ 按 D142/D143 那条规矩在握手期拒绝版本不一致的对端。
**会话配置一个字没动**（`SessionConfigWire` 仍是音乐模式 + 会话种子 + 自定义源链接）。

**有意不做的**：不给"每位玩家各看一副牌面"加同步 —— 卡面图集仍是本机偏好（各端画各自的图），
只有"这一回合放哪一首"必须一致。所以这台机器上的**画风**与另一台可以不同，歌一定相同。

### 验证

- **反证过的 e2e**（`mode-separation.spec.ts` 新增）：音MAD + 封面集 + 电脑模式 + 按卡组筛选，
  4 个回合逐回合断言"音频文件反查出来的卡序 == 牌桌上 `data-card-key` 的卡序"，并顺带比该卡面的
  `img.alt` 与 manifest 的 `covers[index]`；把 `roundTrackIndex` 临时改成 `null` ⇒ **这条必红** ✓。
- 单测：`rules.test.ts`（回合记卡序 / 不按曲目给不记 / 牌不在场上不记 / 对手牌库也算 /
  抢中后不重算 / 停局清掉）、`usePlayer.test.tsx`（卡序取哪首放哪首 / 压过单曲手选 / 点播压过它 / 越界回落）、
  `cardFaces.test.ts`（`false` 回落、`true` 与 `undefined` 逐字不变）、`useGame.test.ts`（`init` 写入口径、`undefined` 保留）。
- 真浏览器实测（本机曲库助手，191 首）：修前 6 回合里 3 回合对不上，修后 **6/6 全部对应**，
  且卡序跟着牌走（`kochiya-sanae-7`、`shameimaru-aya-5` 这种大卡序都对得上）。

---

## D169 媒体地址的路径编码收敛到 RFC 3986 规范形式（修"部分曲目无法播放"，2026-09-27）

**用户报告**（原话）："部分曲目无法播放，重点查误报那几条。"

### 复现与病灶（真 CDN 实测）

把 191 条曲目**逐条**按真代码解析出 URL、再带 `Range` 取 1 KiB（`<audio>` 取媒体一律带 `Range`）：

| 源 | 结果 |
|---|---|
| 本机曲库助手（`127.0.0.1:8011`） | **191/191 都是 `audio/mpeg`** ✓ |
| CDN（`otomads-cdn.tsukinomiyako-mangesui.top`，音MAD 的**默认**源，D141） | **182 首 `audio/mpeg` + 9 首 `500`（HTML 错误页）** ✗ |

那 9 首：`flandre-scarlet` 两条、`kaenbyou-rin`、`komeiji-koishi`、`komeiji-satori`、
`moriya-suwako`（就是上一轮我误报过的那 4 条之一）、`shameimaru-aya` 两条、`yakumo-ran`。

**共同点：文件名里有 `(` `)` `!` `'` `*` 或 `|`**。清单是数据仓库用 `urllib.parse.quote()` 的
**默认安全集**生成的 ⇒ 这些 `sub-delims` 被编成了 `%28` `%29` `%21` `%27` `%2A` `%7C`。
Cloudflare 的静态资源站对**非规范**路径先回 **307** 跳到规范写法（`(` 直接出现；`%7C` 它不动），
而**带 `Range` 请求头**的那种跟随会 **500**：

| 请求 | 结果 |
|---|---|
| 清单里的编码 URL + `Range: bytes=0-1023`（= 浏览器取媒体） | **500** |
| 同一个 URL 不带 `Range`（跟随 307） | 200（所以"能播"是假象 —— 只有 `<audio>` 的取法会炸） |
| **规范 URL**（`(`/`)` 直接出现）+ `Range` | **206** ✓ |
| 规范 URL + `Range: bytes=0-` | **206** ✓ |

⇒ 文件名里带这几个字符的曲目**整首放不出来**（`usePlayer` 的 `error` 换源也救不了：只有一个源）。
本机助手不受影响（Python 的 `http.server` 两种写法都收）—— 这解释了"本机能放、线上不能"。

### 改法

**在应用侧收敛路径编码**（`src/music/manifestUrl.ts` 新增 `canonicalPathEncoding`）：把路径里
那些"本身就能直接出现"的百分号编码还原，其余一个字节不动。两个建 URL 的地方都走它：

- `sources.ts` 的 `buildEntries`（源表的媒体地址；本地曲库 / CDN / 三个远程镜像都过这里）；
- `customManifest.ts` 的 `card.cover` / `card.audio`（模式 3）。

**还原的字符是逐字符量出来的，不是"RFC 允许"就照搬** —— 这一点第一版做错过，记在这里：

| 字符（真数据里出现的） | 编着写（清单原样）带 `Range` | 裸着写带 `Range` |
|---|---|---|
| `(` `)` `!` `'` `*` | ✗ 307 → **500** | ✓ 206 |
| `&`（15 首）/ `:`（1 首） | ✓ 200/206 | ✗ 307 → **500** |
| 空格 / `%2F` / `%3F` / `%23` / `%25` / 非 ASCII | ✓ | ——（必须留着编码） |

第一版按 RFC 3986 的 `pchar` **全还原**（`&` `:` 也还原）⇒ 191 首里**反而坏了 16 首**
（15 首带 `&`、1 首带 `:` —— 全都进了"能播"名单之外）。所以最终**只还原 `! ' ( ) *` 这 5 个**，
其余一个字节都不动；没量到的（`$ + , ; = @`）按保守处理也不动。
**`%2F` 尤其不能动**：还原成 `/` 会把一个文件名劈成两层目录，指向就变了。
也不动 `?query` / `#fragment` / `scheme://host`（实测：主机名里的 `%28` 原样保留 ✓）。

**为什么在应用侧、而不是只改数据侧**：同一个资源的两种编码在 HTTP 里等价，收敛到规范形式
**不改变指向**，只是让请求头一次命中边缘节点。放在应用侧的好处是**任何源**（CDN / 自建静态站 /
本机助手 / 模式 3 的自定义清单）怎么写都能救回来，而且不必等数据侧重新生成清单 + 重新部署。
规范形式对服务端同样合法（本机助手两种写法实测都 206），所以不是给某个 CDN 特判。

### 验证

- 单测（`sources.test.ts` 新增 2 条）：`%28`/`%29`/`%21`/`%27`/`%2A` 还原；`%26`/`%3A`（**反过来**的那两类）
  与 `%7C`、空格、`%2F`、`%3F`、`%23`、`%25`、`%24%2B%2C%3B%3D%40` 与非 ASCII 的每个字节**逐字不动**；
  幂等；只动路径（query / fragment / 主机名原样）；`?v=` 仍拼在收敛之后（版本号照旧 `encodeURIComponent`）。
- **全量复核（真 CDN，191 首，`Range: bytes=0-1023` 取回来看是不是 MP3）**：
  清单原样 **182/191** → 第一版全还原 **175/191** ✗ → 定稿 **191/191 ✓**（`bad: []`）。
- **真浏览器 + 真 CDN**：清空本地源覆盖（= 走默认 CDN），把中招的 4 首（带 `(`、`!`、`'`、`|`）
  逐条点着放 —— `currentTime` 走到 2.2–3.6 s、`paused=false`、零报错 ✓；解析出来的 URL 里 `(`/`!`/`'`
  已裸写、`%7C` 按设计留着，**不再触发 307** ✓（这 4 首在定稿规则下的 URL 与第一版逐字相同 ✓）。
- 顺带改了一条**已有的** e2e 断言（`pack-snapshot.spec.ts`）：它原来直接比"清单里那一行的原字符串"，
  收敛之后两边编码不同，改成"两边都过一遍 `canonicalPathEncoding` 再比" —— 断言的**意图**
  （地址就是那一行指向的资源）没变，比较口径跟着实现走（那一条里 `waitForPlaying` 本来就是真的出声 ✓）。
- 全量：`pnpm typecheck` ✓、vitest **104 文件 / 1258 passed**（chromium / firefox 各 629）、
  e2e **115 passed + 1 skipped**。

### 留给数据侧的一条（没动）

清单本身仍是非规范编码（`quote()` 的默认安全集）⇒ **别的消费者**（脚本/第三方播放器）拿这份清单
仍会先吃一次 307；带 `Range` 的消费者会遇到同一个 500。要根治就在数据仓库生成清单处把安全集
写成 RFC 3986 的 `pchar`（`quote(path, safe="/!$&'()*+,;=:@")`），重新跑一次 publish 即可 ——
应用侧这一层留着当兜底（源怎么写都收）。

---

## D170 许可分层：代码 MIT、字体 OFL、第三方署名随产物走；面次参照表单独标 CC-BY-NC-SA-3.0（2026-09-28）

**结论**：给仓库补齐许可体系，按**聚合**处理而不是一句 "MIT" 了事：

- 自己的代码与文档 → **MIT**（`LICENSE` + `package.json` 的 `license` 字段）。
- `public/fonts/Inconsolata-Medium.ttf` → 保持 **SIL OFL-1.1**（原样分发 ⇒ Reserved Font Name 不触发）。
- 打进产物的第三方 npm 包（**31 个**：28 MIT + 3 BSD-3-Clause）与 Google Material Icons（Apache-2.0）
  → `THIRD-PARTY-NOTICES.md`；**同一份内容复制进 `public/THIRD-PARTY-NOTICES.txt`**，随 `dist/` 分发。
- 逐路径的权威映射写成 `REUSE.toml`，用 `uvx --from reuse reuse lint` 校验。
- `data/meta/stage-cast.tsv` **保留提交**，但单独标成 **`CC-BY-NC-SA-3.0`**（方案 B）。
- 上游授权凭据（`docs/permissions/`）用自定义的 `LicenseRef-Permission-Evidence` 标记。

**理由**

1. 本仓库是**聚合**：代码、第三方字体、汇编数据各持各的许可，没有单一 SPDX 表达式能描述整仓，
   所以逐路径声明（REUSE 规范）而不是一句 "MIT"。
2. **署名必须跟着分发副本走**：MIT 与 BSD-3-Clause 都要求在分发副本里保留版权与许可声明，
   而部署出去的是 `dist/`。只把 `THIRD-PARTY-NOTICES.md` 放在仓库根**到不了产物** ——
   这正是之前"生产 bundle 里许可横幅 **0 条**"那个缺口的补法。
3. `stage-cast.tsv` 是**唯一**把 THBWiki 中文译文提交进仓库的地方（它的曲名与角色名是 THBWiki 的
   **翻译**，如 `ほおずきみたいに紅い魂` → `如鬼灯般的红色之魂`；翻译是演绎行为，比"取事实"弱）。
   它只是 `tmc.validate` 导出的离线复核表：**`tools/` 里没有任何地方读它**（唯一引用是 `validate.py`
   的写出），`tmc.build --check` 的漂移守卫也只覆盖 `public/data/`。
   两条路里选了**方案 B（保留提交 + 单独标许可）**而不是"移出版本库"：
   后者会与 D3「生成物提交进仓库」相悖，而它只是构建期产物；
   保留提交、把许可边界标到**文件级**，既不违背 D3，也照样把许可说清楚。
   做法是在 `REUSE.toml` 里给它一条精确到文件路径的 annotation —— REUSE 默认的 `closest`
   规则让精确路径胜过 `data/**`，所以 `data/**` 其余部分仍是 MIT。
   而**产物里本来就只有 ZUN 的原始日文曲名**（`恋色マスタースパーク`）与日文角色名
   （`霧雨魔理沙`），没有译文，分类数据按 MIT 发布站得住。

**影响 / 代价**

- **与"整仓 MIT"的直觉不符**：只看根 `LICENSE` 的人会以为数据全是 MIT。所以根 `LICENSE`
  与 `data/README.md` 都就地写明了这条例外，`reuse spdx` 也能逐文件查到真实归属。
- `data/meta/stage-cast.tsv` 是全仓库**唯一带 copyleft 的文件**（CC-BY-NC-SA-3.0，NC + SA）——
  别再往它里面加内容，加了就同样受这两个条款约束。
- 上游仓库没有 LICENSE（默认保留所有权利），本项目是按作者同意发布的：凭据与一处残余风险
  记在 `docs/permissions/upstream-authorization.md`。
- 「分类独立重推导」已**执行**（比原计划省事：ZUN 的原始日文曲评 `tt-ja` 就在同一份快照里，
  不需要游戏本体）。实测 510 条里推出 142 角色曲 / 99 道中曲 / 53 系统曲，
  **与 THBWiki 类别层 0 冲突**；但覆盖率约 58%（180 条没有曲评），
  所以它是佐证与部分来源，**不能**单独取代类别层。脚本与数字见 `docs/data-provenance.md` §3。

**实测**

- `reuse lint`：**376/376** 文件有许可与版权信息，0 missing / 0 unused，**compliant with REUSE 3.3**。
- 产物口径：`vite build --mode development` 的 sourcemap 实测 `dist/assets/index-*.js` 里出现
  **31** 个第三方包（28 MIT + 3 BSD-3-Clause）；构建期依赖（`@babel/*`、`cosmiconfig` 等）不进产物。
- `pnpm typecheck` ✓；about 相关单测 **44 passed**（chromium + firefox 各 22）；
  `npx vite build` ✓ 且 `dist/THIRD-PARTY-NOTICES.txt`（8621 B）随产物落地 ✓。

---

## D171 文档失效断言清理：5 个只读子代理横向审计 + 三条处置规则（2026-09-28）

**触发**：同日的文档重组（D170 那一批）之后，用户要求清理"**已经失效 / 重复 / 过于琐碎**"的断言，
范围是**工作区所有文档**，不限于 D 类引用。

**做法**：5 个**只读**子代理分片审计（契约 3 份 / separation 2 份 / 数据管线 2 份 / 入口文档 7 份 /
本决策日志）。给每个子代理的硬约束是：**必须回代码或数据里给出 `file:line` 证据**、
**没把握不许报**（这类审计最容易误报）、并明确圈出**不报**的东西（历史路径、带日期的快照）。
共报 **64 条，逐条复现后全部采纳** —— 复现过程中还纠正了子代理 3 处口径（例如把"带 `start_time` 的行数"
当成曲目数，实际 TOML 解析后是 36 条）。

**三条处置规则**（本条最该被记住的部分）：

| 情形 | 做法 | 原因 |
|---|---|---|
| **当下事实性错误**（字段名 / 路径 / 版本号 / 计数 / 编号引用） | **直接改** | 它描述的是"现在"，错了就是错了 |
| **被静默推翻的旧结论** | **只加 `> ⚠️ 已被 Dxxx 取代` 标记，原文一字不动** | 守「更早的条目不再改」；原文记的是历史事实 |
| **落地当时的记录 / 带日期的快照** | **加"落地当时"横幅**，数字保留 | 那些数字当时是对的 |

**"错误归属"也算失效**：引用的 D 编号**存在**、但那一条里**没有该内容**，同样把人带错 ——
本次修了 3 处（D14 引 D3 → 应为 **D10**；D115 引 D109 → **D94**；D115 引 D106 → **D105**）。
**编号存在不够，内容对得上才算有效引用。**

**改了什么（要点）**

- **协议口径**：三份契约都还写 v4 / v5 + 两个哈希，实况是 **v6 + 三个哈希**（含 custom）。
- **权威现状表自己错了 3 处**：专辑 40→**39**、音MAD 数据仓库 271→**222**、自定义 400→**368**
  （实测 `83 / 222 / 368`）。那张表是「唯一维护点」，它错等于全错。
- **数字全面停在旧数据**：曲包 86 首 / 35 角色 → **191 / 80**（散落 6 份文档）、裁剪 16→**36**、
  曲库 324 MB → **722 MiB**、上游快照 21 部 / 492 → **22 部 / 504**。
- **工具路径**：`tools/src/tmc/{local_source,fetch_audio,loudness}.py` 都不存在（D130 搬去数据仓库），
  `deploy/README.md` 里起助手那条命令**照抄会失败**。
- **静默推翻**：加 **13 条取代标记**。最典型的是 D110「音源不分键 + `effectiveSourceOverrides` 强制打开」
  整段被 D113 反转却无人回指，还带错了 D52 / D95 / D112 以及 D151 / D152 两处**晚条目的复述**。
- **标题层级**：D154–D164 / D166 / D167 误置于 `###`，规范到 `##`（3 条真正的修订子节保留 `###`）；
  并说明 **D165 是未使用的编号空洞**。

**同一批顺带改的代码**（两处，都是"文档说的与代码不符、代码那边是对的"）：
`src/rng/index.test.ts` 补上 `rng-v1.md` 声称已钉住、实际漏掉的那条冻结向量；
`src/store/single.ts` 的注释从"3 或 4 元"改成"3–5 元"（D135 起第 5 位也存档）。

**一条额外发现**：主仓库已转 **public**（`e572332`），而 D54 / D138 / D146 仍按"私有仓库 ⇒
匿名 404 / 要带令牌"写。这条**没有对应的决定条目**（是个 chore 提交），所以用 `⚠️ 前提已变` 标注，
并同步改了工作区根 `UPDATING.md` 的可见性表。

**没做的**：工作区根那 6 份**计划与交接文档**（`HANDOVER.md` / `B-C-PLAN.md` / `THIRD-MODE-PLAN.md` /
`REVIEW-enhanced-otomad-mode.md` / `HANDOVER-ROUTE-C.md` / `local-docs/`，都不在版本库内）
只修了指向旧 `reports/` 的失效命令，**没有逐条审计** —— 它们是过程文档，按"历史事实"对待。

---

## D172 移除「Cloudflare R2」音源：原曲镜像 3 → 2（2026-09-28）

**结论**：把 `cloudflare_r2`（上游作者的 R2 桶，`https://r2bucket-touhou.hgjertkljw.org/mp3/…`）
从原曲模式的音源注册表里**整个移除** —— `data/sources/originals.toml` 删掉那个 `[[source]]` 块、
`data/sources/cloudflare_r2.json`（152 KB 曲目表）与生成物 `public/data/sources/cloudflare_r2.json`
一并删除；`thbwiki` 的 `order` 从 3 收到 2（消掉空档；纯排序键，语义不变）。

**结果**：原曲镜像 **3 → 2**（`netease163` ① → `thbwiki` ②）、注册音源总数 **5 → 4**
（原曲 2 + 音MAD 1 + 自定义 1）、`pnpm data:build` 写出的生成物 **17 → 16** 个。
§5 的四条不变量仍成立（每个模式至少一个默认启用的源）。

**为什么不影响联机**（实测，不是推断）：`content_hash(characters, albums, pack_audio)`
**不含源表** —— 删源后三个模式的 `contentHash` **逐字未变**
（`e95684b8…` / `34afd0aa…` / `660f6341…`），握手不会因此拒掉任何对端。
源表只决定"某首曲最终解析到哪个地址"，而那是**本机偏好**，本来就不进哈希。

**除数据之外改了什么**：

- `src/store/sources.test.ts`：它把 `cloudflare_r2` 当**夹具**用（3 元素数组测排序与清理）。
  改成合成 id `mirror_b` 并就地注释 —— 让这组用例**不再随真实注册表变化而红**。
- `e2e/smoke.spec.ts` 的「音乐源回退顺序」：3 行 → 2 行、"末位不能再下移"的目标从
  `cloudflare_r2` 换成 `netease163`、上移次数 2 → 1。
- `e2e/mode-separation.spec.ts`：那条用例本来就**数量无关**（`toBeGreaterThan(0)` +
  切模式后不再增），只改了两处注释。
- 活文档：根 `README.md`、`data/README.md`、`THIRD-PARTY-NOTICES.md` 第 4 节、
  `docs/sources-separation-v1.md`（§2 布局 / §5 对照表 / §Q3）、`deploy/README.md`（两处），
  以及 `docs/README.md` 现状表的「注册音源 8 / 5 → **8 / 4**」。

**没动的**（按「更早的条目不再改」）：`tools/src/tmc/migrate.py` 的 `SOURCES` / `LEGACY_SOURCES`
—— 它自己的注释写着「**历史**清单，故意不跟注册表走」，指的是**上游**那三张表
（`.ref/upstream-v3/`）；改了就没法复现当初的迁移。本日志与 `docs/reports/` 里的历史提及同样保留。


---

## D173 曲目身份换成**曲id**：`MusicEntry` 对象化、生成物 `schema` 2、协议 v7、单曲存档 v2 迁移（2026-09-29）

**结论**：v2 重构（REFACTOR-PLAN v2，S0–S5）里动契约的那一步。`MusicEntry` 从 `[专辑, 曲名, 分类]`
元组变成**对象**（`{id, album, title, extra, author?, authors?}`）；生成物里 `characters.json` 的 `music`
缩成**曲id 列表**、曲目信息搬到每模式一份的 `tracks.json`（TrackIndex）；运行时用曲id 认曲目，
`trackId(专辑, 曲名)` 只留作**旧清单的桥接键**（本机助手 / 远端清单仍是元组行）。三件必须一起动：

1. **生成物 `schema` 1 → 2**（`tmc.build.SCHEMA_VERSION`）：`load.ts` 只认 2，`schema` 进 `contentHash`
   ⇒ 原曲 `ef2609eed260` → `f24566164f7e`；
2. **协议 6 → 7**（`PROTOCOL_VERSION`）：曲id 口径变了 ⇒ 三个模式的哈希取值随之变 ⇒ **握手期硬切**、不做版本
   协商（与 v4/v5 同一条口径：数据不同就拒绝开局）。**线上字段一个没变**，变的只是哈希取值；
3. **单曲存档 v1 → v2**：`single-track.<mode>.pins` 存的就是元组 ⇒ `migrate` 查 TrackIndex 一次性转换，
   查不到的条目**丢弃、不猜**；其余键形状没变、版本号不动（`preset` / `queue` / `sources`）。

**为什么不留双读**：旧形状的容忍分支（`isEntry` 的元组分支等）全部删掉，`migrate` 是唯一旧入口 ——
两个形状并存会让"这条数据是新是旧"变成每个消费点都要回答的问题（REFACTOR-PLAN v2 §15 的裁定）。

**Linux 补跑发现并修掉的四个真实缺陷** —— Windows 那轮只跑了 typecheck + pytest，vitest / e2e 因缺浏览器
跳过，所以下面这些当时没暴露：

- **源表全部解析成空**：`loadSourceTables` 把构建期那张 id 键控表 `{schema, entries:{…}}` 按旧的 `{tracks}`
  形状剥了一层 ⇒ `undefined` ⇒ 表空 ⇒ **整个曲库"所有已启用的音源都取不到"**（冒烟用例与真机都会中）。
  修法：形状归一收进 `buildEntries`（id 键控表 / `{tracks}` 清单 / 裸数组三种都认），调用方不再自己剥。
- **自定义模式"两张卡共用一首歌"的互斥失效**：曲id 用了卡的 key ⇒ `distinctTracks` 多算一首、
  `songConflicts` 不再把两张卡判成同一首歌（契约 `custom-mode-v1.md` C2 §4 明文要求互斥）。改回**按歌取**
  （`trackId(专辑, 曲名)`，即 S2 之前的身份）；卡的唯一性仍由角色 key 守。
- **运行时换源会"复活"失败的源**：失败集合按 `entry.id` 记，而解析可以走桥接键 / 归一化兜底两条路 ⇒
  标记对不上、下一次解析又选回同一个源（候选耗尽后本应给可见错误）。`resolveTrack` 现在把**命中的那个键**
  一起返回，失败集合按它记。
- **一批测试夹具还停在元组形状**：`load` / `packSnapshot` / `sources` / `App` / `ConfigPanel` /
  `e2e/smoke`（预设统计 `142 / 378` → `144 / 378`：S1/S2 对齐上游 `extra` 后角色曲 236 → 234 条）、
  `e2e/pack-snapshot`（清单快照要把**每个**角色的曲id 转成元组行，只转第一个会让整段快照被拒）。

**验证**（Linux，2026-09-29）：`pnpm typecheck` 0 错误；`pnpm gate` 绿（19 个文件，引用指纹
`9eecf074138b`）；pytest 主仓库 **71** + 音MAD **222** + 自定义 **368**；vitest chromium **635**、
firefox **635**；e2e **115 passed + 1 skipped**。S2 的数据等价性由 `backup-commits.tmp/s2_equiv.py`
的一次性比对脚本逐条核过（368 TrackIndex + 651×2 id 键控源表 + 191 otomad id）。

**没动的**：`data/otomads` / `data/custom` 两个 submodule 的 gitlink（本分支不换数据）；
数据仓库侧的工具合并（REFACTOR-PLAN v2 §13.2/§13.3）属于各自仓库的后续。

