/** `cover` 字段的共用解析（D165）—— 清单与曲包两条路都走它，形状是应用的契约。
 *
 * 这一层只钉"什么算合法、主链接取谁"：字符串 = 三档共用；对象 = 逐档链接（写哪档算哪档）；
 * 认不得的键 / 空值 / 空对象一律 `undefined`（调用方整份拒掉，fail-closed）。
 */
import { describe, expect, it } from "vitest";

import { parseCoverField } from "./coverField";

describe("parseCoverField", () => {
  it("字符串 = 单链接：三个档位共用它（前端按 object-fit 运行时裁）", () => {
    expect(parseCoverField("https://x/a.jpg")).toEqual({
      primary: "https://x/a.jpg", byRatio: {},
    });
    // 相对路径（模式 3 的清单形态）也照收：解析成绝对地址是**调用方**的事
    expect(parseCoverField("cover/a.jpg")!.primary).toBe("cover/a.jpg");
  });

  it("对象 = 逐档链接：写了的档位都在，主链接按 original → 16x9 → 4x3 取第一个", () => {
    expect(parseCoverField({
      "4x3": "https://x/t.jpg", "16x9": "https://x/w.jpg", original: "https://x/a.jpg",
    })).toEqual({
      primary: "https://x/a.jpg",
      byRatio: { "4x3": "https://x/t.jpg", "16x9": "https://x/w.jpg", original: "https://x/a.jpg" },
    });
    expect(parseCoverField({ "4x3": "https://x/t.jpg" })!.primary).toBe("https://x/t.jpg");
    expect(parseCoverField({ "4x3": "https://x/t.jpg", "16x9": "https://x/w.jpg" })!.primary)
      .toBe("https://x/w.jpg");
    expect(parseCoverField({ "16x9": "https://x/w.jpg" })!.byRatio).toEqual({ "16x9": "https://x/w.jpg" });
  });

  it("坏形状一律 undefined（认不得的键 / 空值 / 非字符串 / 空对象 / 不是这两种）", () => {
    for (const bad of [
      {},                                      // 空对象 = 没有卡面
      { "16:9": "https://x/a.jpg" },           // 旧写法（冒号）
      { "703x1000": "https://x/a.jpg" },
      { original: "" },
      { original: "   " },
      { original: 7 },
      { original: null },
      { original: "https://x/a.jpg", extra: "https://x/b.jpg" },
      null, undefined, 7, [], true,
    ]) {
      expect(parseCoverField(bad), JSON.stringify(bad)).toBeUndefined();
    }
  });
});
