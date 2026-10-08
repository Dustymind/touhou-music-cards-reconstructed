# 固化（vendored）的第三方代码：marked

**这不是本项目写的代码。** 它由上游原样分发，我们只是把它拷进仓库以避免运行时依赖。
改动它之前先读这里。

## 是什么 / 干什么用

[`marked`](https://github.com/markedjs/marked) —— 一个 Markdown 解析器。我们**只用它的
`Lexer`**（把 Markdown 切成 token AST），**不用它的 `Parser` / `Renderer`**（那两个产出 HTML 字符串）。

原因见 `docs/DECISIONS.md` D189：本仓库的许可模型（REUSE 聚合、`pnpm gate --check` 比对生产闭包）
与安全模型（**只产 React 节点、从不碰 `dangerouslySetInnerHTML`**）都不适合引入运行时依赖，
但手写解析器的边界处理又不如成熟实现可靠 —— 固化上游代码是同时满足两边的唯一办法。

## 溯源（升级时照着做）

| 项 | 值 |
|---|---|
| 包名 | `marked` |
| 版本 | **18.1.0** |
| 许可 | **MIT**（`package.json` 的 `license` 字段；文件 banner 也自称 MIT） |
| 取得日期 | 2026-10-08 |
| 上游仓库 | https://github.com/markedjs/marked |
| 上游源码分支 | `master`（`main` 不存在 —— 别搞错） |
| tarball | https://registry.npmjs.org/marked/-/marked-18.1.0.tgz |
| tarball 的 npm integrity | `sha512-PamYXWWWg2nboG3oX5Ffzpy3EFZROqZJK9hSlMmUnekp7TxPs5DcT95vwd46m73/exfKCRVMtgXoPMI4FEJL6w==` |
| 上游 tarball 内 `package/lib/marked.esm.js` 的 sha256 | `054d73b676031dc8e60e247ef228044fbeebe10af14bac1a6e53852f80f826e5` |
| **本仓库内 `marked.esm.js` 的 sha256** | `db9e8a2f07a084f68a5e40e258b69755af894f9df4ec47e06e7f9a309584871f` |

⚠️ **上面两个 sha256 不一样，这是有意的**：我们只做了一处改动 ——
删掉文件末尾那行 `//# sourceMappingURL=marked.esm.js.map`（我们不分发 `.map`，
留着它浏览器会去请求一个 404，控制台多一条噪音）。**除这一行外与上游字节一致**。

## 本仓库只保留两个文件（上游 tarball 里有 12 个）

| 文件 | 说明 |
|---|---|
| `marked.esm.js` | 上游 `lib/marked.esm.js` 原样（仅剥 `sourceMappingURL`）；单文件、**零依赖**、自带 MIT 版权 banner |
| `LICENSE` | 上游 `LICENSE` 原样（内含 MIT + 一份 John Gruber 的 Markdown BSD 许可，见下） |

**故意不带的**：`marked.umd.js`（另一套打包，我们只用 ESM）、两个 `.map`（体积大、无源码可指）、
`bin/`（CLI，用不到）、`man/`、`marked.d.ts`（我们不用它的类型，自己写了收窄的类型）。

## 许可说明（别想当然）

上游 `LICENSE` 里其实有**三段**许可：MIT（Marked）、MIT（Christopher Jeffrey）、
以及 John Gruber 的 **BSD 风格 "Markdown" 许可**。但后者是关于 *Markdown 这个名字与规范* 的，
**不是**约束 `marked.esm.js` 这份代码的 —— 依据：

- 上游 `package.json` 的 `license` 字段 = `"MIT"`（唯一权威声明）；
- `marked.esm.js` 自己的 banner 只写 MIT，且**全文件没有出现** `Gruber` / `daringfireball` / `BSD`。

所以本仓库把这份代码声明为 **MIT**；`LICENSE` 仍然原样保留（省得将来有人以为我们截了许可）。

## 怎么升级

```bash
# 1) 拉新版本，记下 integrity
curl -sS https://registry.npmjs.org/marked/latest          # 看 version / dist.integrity
curl -sSL https://registry.npmjs.org/marked/-/marked-<新版本>.tgz -o marked.tgz

# 2) 校验 integrity（拿上一步的 base64，跟下面比）
node -e "const b=require('fs').readFileSync('marked.tgz');console.log(require('crypto').createHash('sha512').update(b).digest('base64'))"

# 3) 解包，覆盖这两个文件
tar xzf marked.tgz
cp package/lib/marked.esm.js src/vendor/marked/marked.esm.js
cp package/LICENSE            src/vendor/marked/LICENSE

# 4) 剥掉 sourceMappingURL（否则 sha256 对不上本文件的记录）
#    然后更新本文件里所有版本号 / sha256 / 日期
sha256sum src/vendor/marked/marked.esm.js
```

升级后**必须**跑：`pnpm test:file src/ui/markdown.test.tsx`（token 形状变了会当场红）
与 `pnpm typecheck`（类型收窄了的话会报）。

## ⚠️ 固化的代价（写在这儿免得忘）

固化 = **上游的安全修复不会自动到你这儿**。上游发了新版、尤其修了 CVE 时，
要靠人（你）按上面步骤手动跟进。这是选"零运行时依赖"换来"上游投毒影响不到你"的**对价** ——
不能只要好处不要这半条。
