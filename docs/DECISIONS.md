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
