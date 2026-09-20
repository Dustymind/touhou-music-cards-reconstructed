/** 权威性守卫（D104）：用扫源码的方式把"随机数只有一套实现、种子只有权威端生成"钉死在测试里。
 *
 * 这两条规则靠自觉很容易破（随手 `Math.random()` 最省事），但破了两端就会静默分叉 ——
 * 表现为"偶尔两端选了不同的曲子 / 抢到不同的牌"，很难查。所以在 CI 里扫一遍。
 *
 * 测试跑在**真实浏览器**里（没有 Node 的 fs），所以源码用 Vite 的
 * `import.meta.glob(..., { query: "?raw" })` 在**构建期**读成字符串 ——
 * 与"扫 src/ 目录"是同一件事（排除测试文件），只是扫描发生在打包时。
 */
import { describe, expect, it } from "vitest";

/** 全部源码，键是从**项目根**算起的绝对路径（`/src/rng/index.ts`）——
 *  用绝对模式而不是相对本文件的 `../**`：相对模式的键会长成 `.././index.ts` 这类形态，映射不唯一。 */
const SOURCES = import.meta.glob("/src/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** 只看代码，不看注释：这些规则本身就在注释里被反复解释。
 *  `(^|[^:])` 是为了别把字符串里的 `https://` 当行注释。 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const files = Object.entries(SOURCES)
  .filter(([path]) => !/\.test\.tsx?$/.test(path))
  .map(([path, text]) => ({ path: path.replace(/^\//, ""), text: stripComments(text) }));

describe("随机数来源的守卫", () => {
  it("确实扫到了 src/ 下的源码（glob 失效时这里先红）", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((file) => file.path === "src/game/rules.ts")).toBe(true);
    expect(files.some((file) => file.path === "src/rng/index.ts")).toBe(true);
    // 测试文件本身不算在内
    expect(files.some((file) => /\.test\.tsx?$/.test(file.path))).toBe(false);
  });

  it("src/ 下（除 src/rng/）不出现 Math.random", () => {
    const offenders = files
      .filter((file) => !file.path.startsWith("src/rng/"))
      .filter((file) => /\bMath\.random\b/.test(file.text))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("生成种子的 newSeed() 只能出现在 rng 模块与种子权威里", () => {
    const allowed = ["src/rng/index.ts", "src/store/seeds.ts"];
    const offenders = files
      .filter((file) => !allowed.includes(file.path))
      .filter((file) => /\bnewSeed\s*\(/.test(file.text))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("种子派生只走 deriveSeed（不再有 seed % N / seed + n * k 这类近似写法）", () => {
    const offenders = files
      .filter((file) => !file.path.startsWith("src/rng/"))
      .filter((file) => /seed\s*[%+*]|%\s*2147483647/.test(file.text))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("规则层的随机函数不再有 Math.random 默认值（必须显式传 rng）", () => {
    const rules = files.find((file) => file.path === "src/game/rules.ts");
    expect(rules).toBeDefined();
    expect(rules!.text).not.toMatch(/rng\s*:\s*Rng\s*=/);
    expect(rules!.text).toMatch(/rng:\s*Rng[,)]/);
  });
});
