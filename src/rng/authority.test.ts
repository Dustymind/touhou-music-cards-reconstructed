/** 权威性守卫（D104）：用扫源码的方式把"随机数只有一套实现、种子只有权威端生成"钉死在测试里。
 *
 * 这两条规则靠自觉很容易破（随手 `Math.random()` 最省事），但破了两端就会静默分叉 ——
 * 表现为"偶尔两端选了不同的曲子 / 抢到不同的牌"，很难查。所以在 CI 里扫一遍。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

/** vitest 的工作目录就是仓库根，所以直接从 `src/` 扫。 */
const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** 只看代码，不看注释：这些规则本身就在注释里被反复解释。
 *  `(^|[^:])` 是为了别把字符串里的 `https://` 当行注释。 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const files = sourceFiles(SRC).map((path) => ({
  path: relative(process.cwd(), path).split(sep).join("/"),
  text: stripComments(readFileSync(path, "utf8")),
}));

describe("随机数来源的守卫", () => {
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
