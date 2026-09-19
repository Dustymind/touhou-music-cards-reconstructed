# 联机协议契约 v1

这份文档描述本项目的联机协议：实现分别在 `src/net/protocol.ts`（类型与版本）、`src/net/engines.ts`
（主机 / 客户端状态机）、`src/net/useNet.ts`（意图怎么落到 store）、`src/net/transport.ts`（通道抽象）。

**改协议 = 升 `PROTOCOL_VERSION` + 更新本文件 + 在 `docs/DECISIONS.md` 记一笔**。握手会拒绝版本不一致的
对端，所以"悄悄改一个字段"的后果不是兼容，而是**直接连不上**。

## 模型：主机权威 + 全量快照

- 客户端只发**意图**（`ClientIntent`）；主机校验后用**发送方真实下标**落地 —— 意图里自报的 `player`
  字段一律不信（`useNet.applyIntentLocally` 的 `from` 才是身份）。
- 主机每接受一个动作：`seq += 1` → 广播**完整快照**，客户端整体覆盖本地状态。
- 与上游（事件回放 + 增量事件）的差别是**有意的**：状态只有几百字节到几 KB，换来
  "任意时刻都能收敛、重连只要一份快照、不必处理丢事件/重复事件"。
- 传输是可替换的：`BusTransport`（同页内存，单测）、`BroadcastChannelTransport`（同浏览器多标签）、
  `PeerTransport`（PeerJS / WebRTC，跨机器）。真要换成后端权威服务器，只需再加一个实现，规则层零改动。

## 握手

```
客户端 ── hello {name, isObserver, dataHash, protocol} ──▶ 主机
   主机校验 protocol 是否相等、dataHash 前 12 位是否相等
   ├─ 不等 → reject {reason: "protocol" | "data", detail}
   └─ 相等 → 分配下标（主机固定 0；客户端从 1 起，空缺复用）
              ── welcome {yourIndex, peers, state, seq, config, melee} ──▶ 该客户端
              ── peers {peers} ──▶ 广播给其余人
```

- `dataHash` = `public/data/index.json` 的 `contentHash`，比较**前 12 位**（`dataHashMismatch`）。
  数据不一致就**拒绝开局**，而不是等状态错位（上游是静默错位）。
- `melee` = 进房人数 > 2（1v1 还是混战）。
- 没握手就发意图 → `goodbye {reason: "not welcomed"}`。

## 消息表

客户端 → 主机（`ClientIntent`）：

| 类别 | 种类 |
|---|---|
| 握手 | `hello` |
| 抢拍与回合 | `pick`（带 `timestamp`）、`confirmStart`、`confirmNext`、`give` |
| 牌组编辑 | `addCard` / `removeCard` / `clearDeck` / `fillDeck` / `shuffleDeck` / `moveDeckCard` / `giveCard` / `adjustDeckSize` |
| 会话 | `setMode` / `setTraditional` / `filterMusicByDeck` / `rerollQueue` |
| 其它 | `chat`、`requestSync` |

主机 → 客户端（`HostMessage`）：

| 消息 | 何时 | 载荷 |
|---|---|---|
| `welcome` | 握手通过 | `yourIndex` / `peers` / `state` / `seq` / `config` / `melee` |
| `snapshot` | 每接受一个动作后广播；`requestSync` 时单发 | `state` / `seq` / `config` |
| `peers` | 有人进出 | `peers` |
| `chat` | 有人发言 | `from` / `text` / `system?` |
| `reject` | 握手失败 | `reason: "protocol" \| "data" \| "full"`（`full` 目前没有发出点） |
| `goodbye` | 未握手就发意图等 | `reason` |

## 顺序与幂等

- `seq` 单调；客户端**忽略 `seq < lastSeq`** 的旧快照（乱序保护）。
- `requestSync` 回的是**当前 `seq`** 的快照（不 +1），所以重连补同步不会推高序号。
- 发言不产生快照（聊天不是对局状态）。
- 快照是全量的，所以意图不需要幂等键：后到的快照就是最终答案；`give` 的"只结算一次"由
  `givesLeft` 计数保证。
- `pick` 的 `timestamp` 是**客户端自报**的回合内用时（毫秒），主机把它夹进 `[0, elapsed]` 后
  按它排序决定"谁先抢到"。这是有意的信任边界：联机时反应时间只能由客户端如实上报，
  主机做的是范围校验与排序（`rules.notifyPickEvent`）。

## 会话配置（音乐模式 + 会话种子）

```ts
interface SessionConfigWire { musicMode: "originals" | "otomads"; sessionSeed: Seed }
```

- 随 `welcome`、**每一份** `snapshot`、`requestSync` 的回复一起下发（主机侧的 `hostConfig()`）。
- 客户端**总是采用**（哪怕数值恰好与自己相同 —— 同浏览器两个标签页共用 localStorage，种子本来就一样，
  但"这份是主机的"这个语义仍要落进 store）；只有种子**真的变了**才重排轮播，否则每份快照都会洗一次队列。
- 客户端「重新抽选」不再自己换种子：发 `rerollQueue` 意图 → 主机 `roll()` 换种子并重排 → 下一份快照下发。
- 随机数的完整契约（`draw` / `derive` 两条口径、冻结向量）见 [`rng-v1.md`](rng-v1.md)（D104）。

## 一致性自检

`stateDigest(state)` 把状态压成一行：`state` / `turnSeq` / `currentKey` / `givesLeft` / `winner` /
`mode` / `gameSeed` / 牌型尺寸 / 双方牌库与已得 / 抢拍记录。联机页把它挂在 `data-testid="net-digest"` 上，
e2e 逐回合比对两端摘要 —— 不一致就说明协议或随机派生分叉了。

## 版本演进

| 版本 | 变更 |
|---|---|
| 2 | `GameState` 加 `gameSeed`（开局洗牌 / 选曲种子） |
| **3** | `musicMode` 字段升级成 `SessionConfigWire`（多一个 `sessionSeed`）；新增 `rerollQueue` 意图（D104） |

改动流程：升 `PROTOCOL_VERSION` → 改本文件的表 → `docs/DECISIONS.md` 记一笔 → 跑
`pnpm test`（`src/net/*.test.ts`：握手 / 快照 / 重连 / 配置下发）与 `pnpm e2e`
（`e2e/multiplayer.spec.ts`：同浏览器双标签、跨浏览器、摘要一致、种子权威）。
