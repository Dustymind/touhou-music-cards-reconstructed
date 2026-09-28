/** 播放页第二行（`creditLine`）：多作者要按关于页那套"英文/拼音首字母"排序后再显示。
 *
 * 纯函数，不用挂组件 —— 与 `src/ui/player/UpcomingFan.test.ts` 同一个口径。
 */
import { describe, expect, it } from "vitest";

import type { AlbumRecord, MusicEntry } from "../../data/types";
import { AUTHOR_SEPARATOR } from "../../music/authorOrder";
import { creditLine } from "./PlayerPanel";

const ALBUM: AlbumRecord = { key: "otomads", name: "otomads", kind: "other", pack: "otomads", order: 100 };
const ALBUM_NO_NAME: AlbumRecord = { ...ALBUM, showAlbumName: false };

describe("creditLine（播放页的作者/作品行）", () => {
  it("多作者（第 5 位）→ 按首字母排序、用「、」连接", () => {
    const entry: MusicEntry = { id: "x_otomad_001", album: "otomads", title: "某曲", extra: "角色曲", author: "张伟 & 鞍山侯国玉电乐团", authors: ["张伟", "鞍山侯国玉电乐团"] };
    expect(creditLine(entry, [ALBUM])).toBe(`鞍山侯国玉电乐团${AUTHOR_SEPARATOR}张伟`);
  });

  it("多作者只有一位时＝原样显示（与单作者写法一致）", () => {
    const entry: MusicEntry = { id: "x_otomad_001", album: "otomads", title: "某曲", extra: "角色曲", author: "川先僧", authors: ["川先僧"] };
    expect(creditLine(entry, [ALBUM])).toBe("川先僧");
  });

  it("只有整串 `author`（老写法）→ 原样显示，**不按 `&` 拆**", () => {
    const entry: MusicEntry = { id: "x_otomad_001", album: "otomads", title: "某曲", extra: "角色曲", author: "乙 & 甲" };
    expect(creditLine(entry, [ALBUM])).toBe("乙 & 甲");
  });

  it("没作者 → 回退到专辑名；`showAlbumName = false` 时整行不显示", () => {
    const entry: MusicEntry = { id: "x_otomad_001", album: "otomads", title: "某曲", extra: "角色曲" };
    expect(creditLine(entry, [ALBUM])).toBe("otomads");
    expect(creditLine(entry, [ALBUM_NO_NAME])).toBeNull();
  });

  it("没有曲目 → null", () => {
    expect(creditLine(null, [ALBUM])).toBeNull();
  });
});
