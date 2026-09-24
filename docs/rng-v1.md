# 随机数契约 v1

这份文档描述"东方谐频拾遗"里**唯一**的随机数实现（`src/rng/`）以及种子的权威模型。
改这里的任何一条，都等于改协议：联机两端会算出不同结果，**必须同时升级 `PROTOCOL_VERSION`**
（`src/net/protocol.ts`）并在 `docs/DECISIONS.md` 记一笔。

## 为什么要有这份契约

重建过程中出现过三类"近似伪随机"的写法，它们都能跑，但都会在联机时静默分叉：

| 写法 | 问题 |
|---|---|
| `rng: Rng = Math.random` 默认参数 | 谁忘了传种子就各自随机一次；结果虽然会被快照覆盖，但覆盖前两端已经显示/播过不同的东西 |
| `seed + character.order * 7919` | 加法线性派生：相邻角色容易撞到同一首，且改一个常量就全变 |
| `FNV 哈希 % 2147483647` / `seed % 2147483647` | 取模只用到低位，低位规律性强，不同输入容易落到同一个值 |
| 客户端也用 `Math.random()` 掷一次 | 两端各掷各的，靠"快照随后覆盖"兜底 —— 抢拍、选曲都会闪一下不一致 |

v1 之后：**随机数只有一套实现，种子只有权威端生成，其余人一律"采用"。**

## 值域与类型

```ts
export type Seed = number;              // 整数，[0, SEED_MAX]
export const SEED_MAX = 2147483647;     // 0x7fffffff，31 位
```

用 31 位而不是 32 位的原因：种子会进存档（`tmc.v1.seed`）与状态摘要（`stateDigest` 的 `seed=`），
固定成"非负 31 位"就没有"同一个种子两种写法"，也不用操心 JS 位运算的符号位。

## 三个层次

| 层次 | API | 用途 | 是否跨端一致 |
|---|---|---|---|
| **生成** | `newSeed()` | 权威端造一个新种子（密码学随机源 `crypto.getRandomValues`） | 不需要（生成方只有一个人） |
| **派生** | `deriveSeed(seed, ...labels)` | 从**已同步**的种子派生子种子 | 必须一致 |
| **取用** | `createRng(seed)` → `float/intBelow/pick/shuffle/percent` | 真正的随机数序列 | 同种子必同序列 |

另有两类"不是种子"的随机，单独标注、不与上面混用：

| API | 用途 | 说明 |
|---|---|---|
| `randomToken(length)` | 房间号、PeerJS id 后缀 | 标识，只要求不重复 |
| `ephemeralRandom()` / `ephemeralIntBelow(n)` | 装饰动效（文字抖动、随机底色、闪点） | 不需要可复现 |
| `stableHash(text)` | `?g=` 卡片倾斜、彩蛋文案轮换 | "展示层也必须两端一致"的小选择，等价于 `deriveSeed(0, "hash", text)` |

`src/` 下除 `src/rng/` 之外**不允许出现 `Math.random`**，`newSeed()` 只允许出现在
`src/rng/index.ts` 与 `src/store/seeds.ts` —— 由 `src/rng/authority.test.ts` 扫源码守住。

## 算法

1. **序列：mulberry32**（`createRng`）。全程 32 位整数运算（`>>>` / `Math.imul`），
   没有浮点累积、没有引擎相关的取整差异，所以浏览器 / Node / 不同版本都得同一串数：

   ```
   state = (state + 0x6d2b79f5) >>> 0
   t = state
   t = imul(t ^ (t >>> 15), t | 1)
   t ^= t + imul(t ^ (t >>> 7), t | 61)
   next = (t ^ (t >>> 14)) >>> 0        // float = next / 2^32
   ```

2. **混淆：murmur3 的 fmix32**（`mix32`）。单比特改动会雪崩到整个字，用来把
   种子与标签彻底打散：

   ```
   h ^= h >>> 16; h = imul(h, 0x85ebca6b)
   h ^= h >>> 13; h = imul(h, 0xc2b2ae35)
   h ^= h >>> 16
   ```

3. **标签**：字符串走 FNV-1a 折成 32 位后**再过一次 `mix32`**（FNV 只负责"把字符串变成数"）；
   数字先 `>>> 0` 再过 `mix32`。标签**有序**参与，所以 `("a","b") ≠ ("b","a")`。

4. **派生**：

   ```
   hash = mix32((seed >>> 0) ^ 0x9e3779b9)
   for (i, label) of labels:
       hash = mix32(hash ^ labelBits(label) ^ imul(i + 1, 0x27d4eb2d))
   return hash >>> 1                    // 落到 [0, SEED_MAX]，用移位而不是取模，避免偏置
   ```

## 冻结向量（改了就是破坏协议）

```
createRng(12345).next()   → 4207900869, 1317490944, 2079646450
createRng(12345).float()  → 0.979728268, 0.306752264, 0.484205422
createRng(7).intBelow(10) → 0, 0, 9, 6, 5
deriveSeed(12345, "turn", 3, "cirno") → 369832200
deriveSeed(12345, "turn", 3, "-")     → 395564828
stableHash("Alice")                   → 810019001
deriveSeed(0, "hash", "abc")          → 1159611592
shuffleWithSeed([1,2,3,4,5], 7, "queue") → 5,3,2,4,1
randomStartPosition(100, 999, "track-a") → 1.769447
```

`src/rng/index.test.ts` 把这些数字钉在测试里。

## 种子权威：谁是"服务端"

`src/store/seeds.ts` 是唯一的种子入口：

| 角色 | 谁 | 行为 |
|---|---|---|
| `authority` | 单机本机 / 联机**主机** | 有 `ownSeed`（落盘）；`draw()` 现抽子种子、`roll()` 换新种子 |
| `replica` | 联机**客户端** | `adoptedSeed` 来自主机的 `SessionConfig`；`draw()` / `roll()` 返回 `null` |

两种写法别混：

| 方法 | 谁调用 | 结果从哪来 | 场景 |
|---|---|---|---|
| `draw(label, …)` | 只有权威端 | 本机现抽（`nonce` 递增），**结果**随快照同步 | 随机补满、打乱牌库、开局洗牌、随机交牌 |
| `derive(label, …)` | 两端都可以 | 从**已同步**的种子纯派生，不消耗 `nonce` | 每回合选哪首、CPU 这一回合怎么出手 |

也就是说：**"主机决定的"用 `draw`，"两端各自算的"用 `derive`**。用错就会出现"两端显示不同、随后被覆盖"的闪烁。

### 下发路径

```
主机 useSeeds.ownSeed
      │  hostConfig(): { musicMode, sessionSeed }
      ▼
welcome / snapshot（SessionConfigWire，协议 v3）
      ▼
客户端 useSeeds.adopt(sessionSeed)  →  useQueue.adoptSeed(...)  →  按同一顺序重排
```

「重新抽选」在客户端不再是本地换种子，而是发 `rerollQueue` 意图：主机 `roll()` 换种子、
洗自己的队列，随后那份快照把新 `sessionSeed` 带给所有人。

## 存档

- `tmc.v1.seed` → `{ ownSeed }`（本机自己的种子，落盘；**采用来的种子不落盘**，离开房间就回自己的）
- D104 之前轮播种子存在 `tmc.v1.queue` 的 `seed` 字段里，首次启动会迁移过来（`legacyQueueSeed()`）。

## 自检

```bash
pnpm test                                  # src/rng/*.test.ts：冻结向量 + 派生性质 + 源码守卫
grep -rn "Math.random" src/ --include=*.ts --include=*.tsx | grep -v "^src/rng/"
```
