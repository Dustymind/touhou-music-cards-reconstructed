# 自建卡面图床（GitHub → Cloudflare R2）迁移指南

> 面向本仓库的运维文档。目标：把内置六套卡面素材从 GitHub 托管迁到**自己的** Cloudflare R2 桶，  
> 并把站点指向新桶。实现侧的改动点只有一行（`data/card-sets.toml` 的 `origin_r2`），  
> 为什么这么设计见 [`DECISIONS.md`](DECISIONS.md) 的 **D190**。
>
> 事实核查时间：2026-10-08。Cloudflare 控制台文案变动频繁，以你看到的界面为准。
>
> **✅ 本仓库当前状态（2026-10-08 已落地）**：桶 `touhou-cards` 已上传完毕，
> 公开域名 **`https://touhou-music-cards-storage.dustymind.cc/`**，`origin_r2` 已填。
> 实测：836 个对象 / 175 MiB，六套目录各 139~141 个文件，**应用引用的 127 个文件名零缺失**，
> 自定义域取图 `200 image/png`。下文步骤保留完整，供重建 / 迁移 / 排障时对照。

---

## 0. 先搞清一件事：素材本来就是"别人的"

本仓库**不分发卡面素材**（6 套约 178 MB，版权与体积原因，见 D10）。运行时由浏览器按 `origins`  
顺序远程取图，三个上游镜像指向**同一个 GitHub 仓库**  
[`lightbulb128/touhou-card-player-v3`](https://github.com/lightbulb128/touhou-card-player-v3)  
的 `public/` 目录：

| # | 地址                                                                                  | 实测响应头                                                                                                              | 说明                      |
| - | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| 1 | `https://r2bucket-touhou.hgjertkljw.org/`                                           | 见下                                                                                                                 | **上游作者自己的 R2 桶**（不是我们的） |
| 2 | `https://lightbulb128.github.io/touhou-card-player-v3/`                             | `Content-Type: image/png`、`Access-Control-Allow-Origin: *`、`Cache-Control: max-age=600`                            | GitHub Pages            |
| 3 | `https://cdn.jsdelivr.net/gh/lightbulb128/touhou-card-player-v3@main/public/`       | `Content-Type: image/png`、`access-control-allow-origin: *`、`Cache-Control: public, max-age=604800, s-maxage=43200` | jsDelivr CDN            |
| 4 | `https://raw.githubusercontent.com/lightbulb128/touhou-card-player-v3/main/public/` | `Content-Type: image/png`、`Cache-Control: max-age=300`、**无 CORS 头**                                                | GitHub raw（兜底第三手）       |

**关键结论：这四个位置是同一批字节。** 你要做的不是"造图"，而是**换一个域名**，  
所以迁移的本质是"复制目录 + 把站点指过去"，不是重新生成素材。

六个目录（与 `data/card-sets.toml` 的 `dir` 字段一一对应）：

| 桶内目录                | 图集 id        | 界面选项       | 上游桶实测 |
| ------------------- | ------------ | ---------- | ----- |
| `cards/`            | `dairi-sd`   | dairi（Q 版） | 200   |
| `cards-dairi/`      | `dairi`      | dairi（全身）  | 200   |
| `cards-enbu/`       | `enbu`       | 幻想人形演舞     | 200   |
| `cards-enbu-dolls/` | `enbu-dolls` | 幻想人形演舞（人偶） | 200   |
| `cards-thwiki/`     | `thbwiki-sd` | THBWiki    | 200   |
| `cards-zun/`        | `zun`        | ZUN 原画     | 200   |

每个目录里是**同一批 127 个 PNG 文件名**（取自 `characters.json` 的 `card` 字段，  
**文件名含日文**，如 `チルノ.png`、`アリス＆上海蓬莱.png`）。全部实测为 `.png`。

> ⚠️ 别试图访问 `https://<桶>/cards/` 看目录列表 —— **R2 公开桶不提供列目录**  
> （官方文档明说 public bucket "does not let you list the bucket contents"）。  
> 刚才实测该 URL 返回 `404`（`cards/` 恰好 200 是因为存在同名索引对象之类），  
> **`404` 不代表目录不存在**。验证要用**具体文件路径**。

---

## 1. 决策：用哪条路迁移

Cloudflare 官方给的三条路，**对"GitHub → R2"这个场景只有一条能用**：

| 方案                | 官方定位           | 能不能用于 GitHub 源                                        | 结论         |
| ----------------- | -------------- | ----------------------------------------------------- | ---------- |
| **Super Slurper** | 控制台一键批量迁移      | ❌ **源只支持 S3 / R2 / GCS / 其他 S3 兼容对象存储**。GitHub 不是对象存储 | **不可用**    |
| **Sippy**         | 按需迁移（请求时回源并落盘） | ❌ 同样要求源是 **S3 兼容**（`--provider=aws` 等）                | **不可用**    |
| **rclone**        | 命令行批量上传/同步     | ✅ 只要能落到本地磁盘，就能上传                                      | ✅ **唯一可行** |

**结论：必须先把 GitHub 的文件拉到本地（或直接由 rclone 从 HTTP 抓），再用 rclone 推到 R2。**

> 顺带说明：上游那个 `r2bucket-touhou.hgjertkljw.org` **本身就是一个 R2 桶**，  
> 理论上可以用 Super Slurper 的 "Cloudflare R2 → R2" 通道直接搬。  
> 但那是**别人的**桶，需要对方的 S3 凭据，你拿不到 —— 所以这条路也不通。

---

## 2. 迁移步骤

### 步骤 0 — 准备素材到本地（二选一）

**方式 A：从 GitHub 仓库 clone（推荐，拿到原始文件名）**

```bash
git clone --depth 1 https://github.com/lightbulb128/touhou-card-player-v3.git upstream
# 六个目录在 upstream/public/ 下
ls upstream/public/
# cards  cards-dairi  cards-enbu  cards-enbu-dolls  cards-thwiki  cards-zun
```

**方式 B：直接从上游 R2 桶下（实测六个目录全 200）**

```bash
# 用 rclone 的 http 后端（只读）抓整个目录树
rclone copy :http,url='https://r2bucket-touhou.hgjertkljw.org/': upstream-public/ -P
```

⚠️ rclone 的 `http` 后端**依赖源站提供目录列表（file listing）**，而 R2 公开桶不列目录  
⇒ **方式 B 大概率抓不到东西**。**用方式 A。**

### 步骤 1 — 创建 R2 桶

控制台：**R2 object storage → 概览 → Create bucket**，填名字（如 `touhou-cards`）、选位置、创建。

或用 Wrangler（本机需先 `npx wrangler login`）：

```bash
npx wrangler r2 bucket create touhou-cards
npx wrangler r2 bucket list     # 验证
```

### 步骤 2 — 生成 S3 凭据（rclone 必需）

控制台：**R2 → Manage R2 API tokens → Create API token**  
→ 权限选 **Object Read & Write** → 限定到刚建的桶 → 创建  
→ **立刻复制 `Access Key ID` 和 `Secret Access Key`**（Secret 只显示这一次）。

注意 `Account ID`（桶概览页右侧或 URL 里），endpoint 形如：

```
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

### 步骤 3 — 配置 rclone

> **本机现状（2026-10-08 实测）**：已经装好 **rclone v1.75.1**（winget 装的，在  
> `%LOCALAPPDATA%\Microsoft\WinGet\Links\rclone.exe`），并且 **`cloudflare-r2` remote 已配好**、  
> endpoint 是 `https://5102f3861137b0abc1a12e2c793c19d2.r2.cloudflarestorage.com`，  
> 桶 **`touhou-cards` 已建、当前为空**。  
> ⇒ **步骤 0~3 基本已经做完了**，你只需要跳到「步骤 4 上传」。  
> 下面保留完整配法，供换机器/换凭据时参考。

```bash
rclone config
# n) New remote
# name> cloudflare-r2
# Storage> s3                  （Amazon S3 Compliant Storage Providers）
# provider> Cloudflare          （选 Cloudflare R2）
# env_auth> 1 (Enter AWS credentials in the next step)
# access_key_id>     <粘贴>
# secret_access_key> <粘贴>
# region> auto
# endpoint> https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

或直接写配置文件（Windows：`%APPDATA%\rclone\rclone.conf`）：

```ini
[cloudflare-r2]
type = s3
provider = Cloudflare
access_key_id = <你的 Access Key ID>
secret_access_key = <你的 Secret Access Key>
endpoint = https://<ACCOUNT_ID>.r2.cloudflarestorage.com
region = auto
acl = private
no_check_bucket = true      # ← 见下方说明，本机这个 token 必须要
```

> ⚠️ 三个易错点：
>
> 1. **rclone 版本必须 ≥ 1.59** —— 低于此版本会 `HTTP 401: Unauthorized`（官方明确说明）。
> 2. **`no_check_bucket = true`（本机实测必需）** —— 本机的 API token 是**对象级权限**  
>    （只允许操作特定桶/前缀），rclone 默认会在启动时探测桶权限，于是：
>    - `rclone lsd cloudflare-r2:` ⇒ **`403 AccessDenied`**（token 无权 `ListBuckets`，正常现象）
>    - 上传时报 **`failed to prepare upload: S3: CreateBucket … 403 AccessDenied`**  
>      —— 它以为桶不存在、去尝试建桶，被拒。
>    - **加上 `no_check_bucket = true` 或命令追加 `--s3-no-check-bucket` 后立刻成功**  
>      （实测写入 / 删除 / `size` 全通）。  
>      ⇒ 别把上面那个 `403` 当成"凭据错了"。
> 3. **别用 `rclone lsd <remote>:` 判断 token 有效性** —— 对象级 token 列不了桶是正常的。  
>    要判断"这个桶能不能用"，直接 `rclone lsd <remote>:<桶名> --s3-no-check-bucket`。

验证连通（**带上 `--s3-no-check-bucket`**）：

```bash
rclone lsd  cloudflare-r2:touhou-cards --s3-no-check-bucket    # 列桶内顶层
rclone size cloudflare-r2:touhou-cards --s3-no-check-bucket    # 对象数（空桶 = 0）
```

### 步骤 4 — 上传

**目录结构必须与上游一致** —— R2 的对象键（key）就是你上传时的相对路径。

#### 4a. 先把素材弄到本地

```bash
git clone --depth 1 https://github.com/lightbulb128/touhou-card-player-v3.git upstream
ls upstream/public/
# cards  cards-dairi  cards-enbu  cards-enbu-dolls  cards-thwiki  cards-zun
```

#### 4b. 上传（bash）

```bash
for d in cards cards-dairi cards-enbu cards-enbu-dolls cards-thwiki cards-zun; do
  rclone copy "upstream/public/$d" "cloudflare-r2:touhou-cards/$d" \
    -P --transfers=16 --s3-no-check-bucket
done

# 验证对象数（应为 6 × 127 = 762）
rclone size cloudflare-r2:touhou-cards --s3-no-check-bucket
rclone tree cloudflare-r2:touhou-cards --s3-no-check-bucket
```

#### 4c. 上传（PowerShell 7，等价写法）

PowerShell 没有 bash 的 `for … do … done`，用 `foreach`。**变量要在 `foreach` 外层定义**  
（PowerShell 的 `foreach` 作用域与 bash 不同，但这里用管道更直观）：

```powershell
# 前置：让 rclone 可见（winget 装的位置，本机实测）
$env:Path = "$env:LOCALAPPDATA\Microsoft\WinGet\Links;$env:Path"

# 六个目录
$dirs = 'cards','cards-dairi','cards-enbu','cards-enbu-dolls','cards-thwiki','cards-zun'

foreach ($d in $dirs) {
    rclone copy "upstream/public/$d" "cloudflare-r2:touhou-cards/$d" `
        -P --transfers=16 --s3-no-check-bucket
}

# 验证
rclone size cloudflare-r2:touhou-cards --s3-no-check-bucket
rclone tree cloudflare-r2:touhou-cards --s3-no-check-bucket
```

**PowerShell 写法的三个坑**：

| 坑                          | 说明                                                            | 写法                         |
| -------------------------- | ------------------------------------------------------------- | -------------------------- |
| **续行符是反引号** `` ` ``，不是 `\` | bash 用 `\`，PowerShell 用 `` ` ``（反引号，且**必须是行尾最后一个字符**，后面不能有空格） | 见上面 \`rclone copy ... \`\` |
| **一行写完更稳**                 | 反引号对缩进/尾随空格极敏感，容易报 `Missing expression after '&'`             | 宁可写成一行长命令                  |
| **`$d` 在双引号里会展开**          | 这点与 bash 一致，`"upstream/public/$d"` 正常插值                       | 无需改动                       |

> 一行版（最不容易出错，推荐直接粘贴）：
>
> ```powershell
> foreach ($d in 'cards','cards-dairi','cards-enbu','cards-enbu-dolls','cards-thwiki','cards-zun') { rclone copy "upstream/public/$d" "cloudflare-r2:touhou-cards/$d" -P --transfers=16 --s3-no-check-bucket }
> ```

> **⚠️ PowerShell 的 `rclone` 输出带进度条**：`-P` 在 PowerShell 里会画满屏进度条，  
> 若嫌刷屏，把 `-P` 换成 `--stats-one-line --stats=5s`，或干脆去掉（静默跑完）。

> **上传即"原文件名"**：不要重命名、不要转格式。前端会对文件名做  
> `encodeURIComponent`，桶里存原文（含日文）即可。
>
> 单个对象都很小（实测 54 KB ~ 395 KB），**不会触发 multipart**，  
> 所以官方那些 `--s3-chunk-size` / `--s3-upload-cutoff` 调优**这里用不到**。  
> 只加上 `--transfers` 提高并发就够。

**不必放全六套**：缺的那几套，浏览器请求会 404 ⇒ 前端 `onError` 自动切到下一个 origin  
（GitHub Pages / jsDelivr / raw）。**放一半也是能用的**，只是那一半多一次 404 往返。

### 步骤 5 — 开公开访问

两条路，**可按需都开**（官方原文：这些选项可独立使用，开自定义域不要求开 r2.dev）：

**A. r2.dev 开发子域（最快，但有速率限制，官方注明仅限非生产）**

控制台：桶 → **Settings** → **Public Development URL** → **Enable**  
→ 弹窗里输入 `allow` 确认。得到形如 `https://pub-<hash>.r2.dev` 的地址。

**B. 自定义域（生产推荐，可配缓存 / WAF / Access）**

控制台：桶 → **Settings** → **Custom Domains** → **Connect Domain**  
→ 填域名 → 确认将写入的 DNS 记录 → **Connect Domain**。  
状态从 `Initializing` 变 `Active` 需几分钟（不变就点 `...` → **Retry connection**）。

> ⚠️ 前提：**该域名必须与 R2 桶在同一个 Cloudflare 账号**（官方明确限制）。  
> 域名不在 Cloudflare 管理的，要用 **partial (CNAME) setup** 先加进来。  
> ⚠️ 官方明说：**不要给 r2.dev 子域建 CNAME**（不支持的访问路径，不保证可靠性）。

### 步骤 6 — CORS：**本项目不需要配**

已实测确认：

```bash
grep -rn "crossOrigin" src/          # 无任何结果
grep -rn "getImageData\|toDataURL\|drawImage" src/   # 无任何结果
```

前端只用**普通 `<img src>`** 取图、**从不读像素**。普通 `<img>` 加载**不受同源策略约束**  
（图片可以跨域显示），只有 `crossOrigin` 属性或 canvas 读像素才需要 CORS 响应头。  
⇒ **你的桶不配 CORS 也能正常显示卡面。**

> 什么时候才需要配：将来如果要做"卡面导出成一张图"（canvas 合成）或"取图片做纹理"，  
> 那时才需要给桶加 `AllowedOrigins` / `AllowedMethods: [GET]`。  
> 配法：控制台桶 → Settings → **CORS Policy** → **Add CORS policy**（JSON 页签粘贴），  
> 或 `npx wrangler r2 bucket cors set <BUCKET> --file cors.json`。  
> ⚠️ 注意 `AllowedOrigins` **不能带路径、不能带结尾斜杠**（`https://static.example.com/` 是非法值）。

### 步骤 7 — 把站点指向新桶

改 `data/card-sets.toml` 顶部一行：

```toml
origin_r2 = "https://touhou-music-cards-storage.dustymind.cc/"     # ← 结尾必须带 `/`
```

然后重新生成 + 验证：

```bash
pnpm gate            # 重新生成 cardsets.json 并跑全套校验
```

✅ **本仓库已执行**：生成后六套 `origins` 各 **5 项**，`[0]` 均为自建桶
（其余依次是上游 R2 → GitHub Pages → jsDelivr → raw）；`otomads` / `otomads-cover` 仍为 0 项。
`pnpm gate` **`GATE_EXIT=0`**、引用集合指纹**仍是 `9eecf074138b`**（证明改图床不影响联机握手）。

**生成物 `data/public/data/cardsets.json` 不进仓库**，`pnpm dev` 会自动热更  
（`cardsets.json` 是启动时 fetch 的，刷一下页面更保险）。

---

## 3. 验证清单

```bash
# ① 桶内对象数正确（应为 762 = 6 × 127）
rclone size r2:touhou-cards

# ② 抽一个真实文件（含日文名）用 curl 验（浏览器/curl 都要能拿到）
curl -sD - -o /dev/null "https://<你的域名>/cards/%E3%83%81%E3%83%AB%E3%83%8E.png" | head -8
#   期待：HTTP/1.1 200 + Content-Type: image/png

# ③ 生成物里六套的首个 origin 是新桶（origins 应为 4：新桶 + 上游桶 + 三个镜像）
node -e 'const c=require("./data/public/data/cardsets.json");(Array.isArray(c)?c:c.cardSets).forEach(s=>console.log(s.id, s.origins.length, s.origins[0]))'

# ④ 起站看实际渲染
pnpm dev
```

浏览器里另可 `F12 → Network`：卡面请求应打在你的域名上、返回 200、`Content-Type: image/png`。  
若看到某个卡面从 GitHub Pages 回来 ⇒ 说明桶里**这个目录缺了**（正常回落，不是 bug）。

---

## 4. 常见坑（对照症状）

| 症状                            | 成因            | 解法         |
| ----------------------------- | ------------- | ---------- |
| `rclone` 报 `401 Unauthorized` | rclone < 1.59 | 升级到 ≥ 1.59 |


| `rclone` 报 bucket 权限/404 探测失败 | token 是对象级权限 | 配置里加 `no_check_bucket = true` |  
| 卡面全白、Network 里新域名请求 404 | 目录层级错了（多为漏了中间一层） | 桶内 key 必须是 `<dir>/<文件名>`，**没有额外的 `public/` 前缀** |  
| 卡面文件名乱码 / 404 | 上传时文件名被改（转码/重命名） | 必须原样保留日文文件名，编码交给前端 `encodeURIComponent` |  
| 站点仍走旧源 | `origin_r2` 结尾漏了 `/`，或没重新生成 | 补 `/`，重跑 `pnpm gate` |  
| `curl https://<桶>/cards/` 返 404 | R2 公开桶**不列目录** | 属正常现象，改用具体文件路径验证 |  
| `curl` 看不到 CORS 头 | 请求没带 `Origin` 头 | 官方明说：无 `Origin` 就不返回 CORS 头；用 `curl -H "Origin: https://x.com"` 复现 |  
| 自定义域一直 `Initializing` | DNS 未生效 / 域名不在同账号 | 等几分钟后点 `... → Retry connection`；确认域名与桶同账号 |

---

## 5. 顺手修掉的一处历史笔误

改造前 `zun` 那套的 `origins` 首项把桶域名写成了  
`r2bucket-touhou-hgjertkljw.org`（`hgjertkljw` **前后是连字符而非点号**），实测 curl 返 `000`。  
它**排在第一位**，意味着 ZUN 原画那套的第一手来源一直是死的，只是靠 `onError` 兜底切到  
GitHub Pages，**界面上完全看不出来**。

D190 之后这两个地址由构建期统一注入（见 `build.py` 的 `_card_set_origins`），  
六套不再各写一遍 ⇒ **同一处不可能只改一半**。

---

## 6. 与联机握手的关系：**无影响**

进 `packHash` 的是 `covers`（源封面，音MAD 用），**内置六套的 `origins` 不进哈希**  
（`packSnapshot.ts` 的 `packHash`）。实测改造前后 `pnpm gate` 的引用集合指纹**都是 `9eecf074138b`**。

⇒ 换图床**不会**造成联机不兼容，双方版本不需要同步。

---

## 7. 成本与运维备注

- R2 定价：存储按 GB 计、**出站流量免费**（这是选它的主要理由）。  
  762 个小对象总体量约百 MB 量级，存储成本可忽略。
- **Class A/B 操作费**：上传是 Class A 操作；正常浏览量级下费用极低。
- 缓存：走自定义域时 Cloudflare Cache 默认只缓存**特定文件类型**，  
  要让全部类型都走缓存需加 **Cache Everything** 页面规则（官方文档说明）。
- **不要删 `origin_upstream_r2`**：它是"自建桶还没好 / 哪天挂了"这段时间的现实图源。
