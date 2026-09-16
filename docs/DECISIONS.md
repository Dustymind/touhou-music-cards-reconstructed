# 决策记录（DECISIONS）

本文件是**定稿的决策依据**。每条记录：结论 → 理由 → 影响面。方案正文见 [`PLAN.md`](PLAN.md)，数据分类规则见 [`rules-classification-v1.md`](rules-classification-v1.md)。

裁定日期：2026-09-16（用户两轮答复）。

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

**理由**：与 D12（字体只分发 OFL 的 Inconsolata）、D3（卡面不随仓库分发）同一条原则：
**仓库里不放授权不明的上游素材**。E2E 抓到了原实现的 `Bell3.mp3` 404（文件从来没进过仓库），
顺手按这条原则修掉，而不是把上游的 mp3 拷进来。

**代价**：铃声与上游不是同一个音色（长度近似）。想完全复刻可把上游 `Bell3.mp3` 放进 `public/` 并改回
`new Audio("./Bell3.mp3")`。

---

## D15 主题：照搬上游深色色板 + 指定的字体 fallback 顺序

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
上游才支持。这条差异记在 `reports/M9-acceptance.md` 的已知限制里。

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

**三处有意差异**（都写进 `reports/M9-acceptance.md`）：

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
