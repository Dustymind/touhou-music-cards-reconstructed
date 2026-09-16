# 验收报告（M0–M9）

生成时间：本次会话末。所有数字都是**当场实测**，命令与结果一并记录。

---

## 1. 交付物

| 部分 | 位置 | 规模 |
|---|---|---|
| 数据真相源 | `data/characters/*.toml`（121）、`data/albums.toml`（39）、`data/sources/*.json`（3）、`data/meta/*`（参照表/裁定表/别名表/合并条目） | 121 角色 / 378 条曲目 / 368 首去重 |
| 数据管线 | `tools/src/tmc/`：`repo` `fetch_roles` `stages` `roles` `migrate` `validate` `build` `local_source` `check_urls` | 9 个模块 + 33 个测试 |
| 运行时数据 | `public/data/`：`characters.json` `albums.json` `sources.json` `cardsets.json` `index.json` `sources/*.json` | 8 个文件，含 `contentHash` |
| 前端 | `src/`：数据层、持久化、主题、本地化、音乐源与选曲、播放层、对战规则/CPU/联机、四个页面 | 141 个测试 |
| 端到端 | `e2e/`：冒烟（双引擎 ×6）+ 联机（同浏览器双标签、跨浏览器 chromium↔firefox + 本地 PeerJS 信令） | 15 passed / 1 skipped（2.0 分钟） |
| 文档 | `docs/PLAN.md` `docs/DECISIONS.md` `docs/rules-classification-v1.md` `docs/DECISIONS.md` `README.md` + `reports/*` | —— |

## 2. 验收命令与结果

```bash
# 数据侧
cd tools
uv run python -m tmc.migrate            # 角色 121 / 条目 357 / 待判定 0
uv run python -m tmc.validate --report  # ✅ 校验通过（引用集合指纹 3051004ed6e0）
uv run python -m tmc.build --check      # ✅ 生成物无漂移
uv run pytest                           # 32 passed

# 前端
pnpm typecheck                          # ✅ 0 error
pnpm test                               # 141 passed（22 个文件）
pnpm build                              # ✅ dist/（~400KB gzip 126KB）
pnpm dev                                # ✅ 200
pnpm preview                            # ✅ 200（静态产物）

# 端到端（Playwright，浏览器装在仓库内 .playwright-browsers/）
pnpm e2e                                # ✅ 15 passed / 1 skipped（chromium + firefox）
```

E2E 用例清单（`pnpm e2e`）：

| project | 用例 | 结果 |
|---|---|---|
| chromium | 同浏览器两个标签页联机：握手 / 聊天 / 快照同步 | ✅ 12.5s |
| chromium | **跨浏览器联机：Chromium 主机 + Firefox 客户端（本地 PeerServer → 真 WebRTC）** | ✅ 14.3s |
| chromium | 冒烟 6 条（加载/搜索/预设三态/仅单曲/对战开局/音源解析） | ✅ |
| firefox | 同浏览器两个标签页联机 + 冒烟 6 条 | ✅ |
| firefox | 跨浏览器用例 | 跳过（由 chromium project 统一拉起两个浏览器，避免重复） |

跨浏览器用例验证的是**真 WebRTC**：信令走 `e2e/peer-server.mjs`（127.0.0.1:9100），
两端交换 SDP/ICE 后建起 DataChannel，聊天双向、开局后 Firefox 端跟随 Chromium 主机的快照、
Firefox 端抢拍能改到 Chromium 主机的状态且两端摘要一致。

数据体检的关键数字（与上游逐项对齐）：

| 指标 | 上游 | 现在 |
|---|---:|---:|
| 角色 / 曲目条目 / 去重曲目 | 121 / 358 / 347 | 121 / **378** / 368（含 21 条人工补配） |
| 专辑（拆碟后） | 39 | 39 |
| 三源表覆盖被引用曲目 | 有 1 条悬空 | **3/3 全覆盖** |
| `附加信息` 待判定 | —— | **0**（19 条已闭环 + TH20 14/14 复核 + 21 条补配） |
| 道中曲面次核对 | —— | **97/97 verified**（补配后新增条目逐条同样核对） |

## 3. 需求对照

| 需求 | 落地 |
|---|---|
| 0 · 多重架构预埋 | `data/packs/`（预留曲包）+ 专辑/曲目带 `pack` 字段 + 音源 `kind: local/remote` + 传输层抽象（总线 / BroadcastChannel / PeerJS / 预留 WS） |
| 1 · 基本游戏逻辑 + 多人同步 | 纯规则 reducer（回合、判定、罚牌夹紧、牌库转移、经典/休闲终局）+ CPU + **主机权威快照同步**（自增 seq、数据哈希与协议握手、乱序保护、requestSync 重连）；**跨浏览器真 WebRTC 已用 E2E 实测收敛**（含"客户端抢拍 → 主机落地 → 两端摘要一致"） |
| 2 · UI/音乐/立绘/彩蛋 | 页签外壳与四页；卡面 6 套图集（远程多 origin + 本地优先）；彩蛋：Alice 按钮、答案提示框、`?g` 倾斜、`?r2`/`?local`、`?cheatcode=`（SHA-256 白名单）、倒计时铃（Web Audio 现场合成，见 D14） |
| 3 · TOML 角色存储 + 附加信息 | 一角色一 TOML（`key`/`name`/`order`/`card`/`searchNames`/`music[专辑,曲目,附加信息]`）；四类 `附加信息` 全部落库并可追溯到 THBWiki 标签或人工裁定表 |
| 4 · 源表数组化 + 开关/顺序/本地源 | `[[专辑, 曲目, URL]]`；音源开关 + 可调顺序 + 运行时换源回退；本地曲库助手（Range/CORS/端口回退/manifest） |
| 5 · 预设改版 | 秘封曲多层（父项批量控制 + 子项独立）、先 CD 再官作、三个三态开关（不配置/已启用/已禁用）；弃用"禁用 xxx" |
| 6 · 仅单曲模式 | 总开关 + 逐角色选曲（只列预设启用曲目）+ 禁用角色 |
| 7 · 立绘选取 | 图集注册表 + 按角色卡面列表 + origin 兜底 + 状态底色 |
| 8 · 剩余结构参考原架构 | 播放队列/临时跳过/随机起播/播放时长/键盘无快捷键等行为对齐上游 |

## 4. 与上游的有意差异（都写在 `docs/DECISIONS.md`）

1. **终局**：真正进入 `finished` 并计算胜者（上游从不进入该状态，只能手动 Stop）。
2. **同步模型**：主机每次动作后广播完整快照 + `seq`（上游是增量事件回放），换取"任意时刻可收敛、重连只要一份快照"。
3. **持久化**：版本化信封、逐键校验（上游任一键损坏即丢弃整份存档）。
4. **曲目身份**：`(专辑, 曲目)` 二元组（上游是手抄路径字符串）。
5. **字体**：只分发 OFL 的 Inconsolata；正文用本机 Whitney，之后按
   苹果默认 → 鸿蒙默认 → 微软雅黑 → Noto CJK 回退（D15）。
6. **主题**：整体照搬上游深色色板（页面 `#141414` / 纸面 `#262626`）；上游的 `mainTabBackground`
   外层容器不再重复套一层（面板自带 Paper）。

## 5. 已知限制

- **跨机器（不同物理机）联机未实测**：本机已用 chromium↔firefox + 本地 PeerJS 信令 + 真 WebRTC 打通；
  跨公网还依赖公网 STUN/TURN（当前用 PeerJS 默认配置，即 Google STUN），极端 NAT 下需要自建 TURN。
- E2E 为了在容器里建 WebRTC 连接，关掉了浏览器的 mDNS 候选混淆（见 `docs/DECISIONS.md` §D13）；
  真实环境不需要。
- 卡面素材不随仓库分发，首次加载需联网；离线使用需自行放入 `public/cards*/`。
- 秘封倶楽部 CD 的"第 N 作"序号在 THBWiki 与 MusicBrainz 之间有分歧，因此只作展示顺序，不作键。
- TH20（東方錦上京）的 14 条已用线上 Music Room 判定，但仍建议在后续版本与官方资料复核。
- 游戏页未实现拖拽（改为点击选牌 + 点击空位交牌），键盘快捷键对齐上游（本来就没有）。
