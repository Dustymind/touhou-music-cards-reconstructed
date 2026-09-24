/** 作者名排序（关于页与播放页共用一份实现）：首字母键 + 排序 + 显示连接。 */
import { describe, expect, it } from "vitest";

import { AUTHOR_SEPARATOR, compareAuthors, formatAuthors, sortAuthors, sortKeyOf } from "./authorOrder";

describe("sortKeyOf（首字母键）", () => {
  it("拉丁取首字母、汉字取拼音首字母、假名与数字排最后", () => {
    expect(sortKeyOf("Chyan_184")).toBe("c");
    expect(sortKeyOf("_Karacher_")).toBe("k");      // 开头的下划线不算
    expect(sortKeyOf("鞍山侯国玉电乐团")).toBe("a");
    expect(sortKeyOf("张伟")).toBe("z");            // zh 归 z
    expect(sortKeyOf("川先僧")).toBe("c");          // ch 归 c
    expect(sortKeyOf("上海アリス幻樂団")).toBe("s"); // sh 归 s
    expect(sortKeyOf("きゅーみぅ")).toBe("~");      // 假名
    expect(sortKeyOf("184")).toBe("~");
    expect(sortKeyOf("")).toBe("~");
  });
});

describe("sortAuthors（英文 / 拼音首字母混排）", () => {
  it("汉字按拼音、拉丁名按字母，混在同一个 A→Z 里", () => {
    expect(sortAuthors(["张伟", "Chyan_184", "鞍山侯国玉电乐团", "打酱油的小火柴", "拔剑Sketon"]))
      .toEqual(["鞍山侯国玉电乐团", "拔剑Sketon", "Chyan_184", "打酱油的小火柴", "张伟"]);
  });

  it("假名排在字母之后；不改原数组", () => {
    const input = ["きゅーみぅ", "鞍山侯国玉电乐团"];
    expect(sortAuthors(input)).toEqual(["鞍山侯国玉电乐团", "きゅーみぅ"]);
    expect(input).toEqual(["きゅーみぅ", "鞍山侯国玉电乐团"]);
  });

  it("同一个人不会因为顺序不同而排成两种结果（比较函数是全序）", () => {
    const once = sortAuthors(["乙", "甲", "丙"]);
    expect(sortAuthors(once)).toEqual(once);
    expect([...once].sort(compareAuthors)).toEqual(once);
  });
});

describe("formatAuthors（显示用的一行）", () => {
  it("先排序、再用「、」连接", () => {
    expect(formatAuthors(["张伟", "鞍山侯国玉电乐团"])).toBe(`鞍山侯国玉电乐团${AUTHOR_SEPARATOR}张伟`);
  });

  it("单个作者原样输出（多作者支持不该改变单人曲目的显示）", () => {
    expect(formatAuthors(["川先僧"])).toBe("川先僧");
  });
});
