/** 曲目互斥表（D108）：同一首歌只能对应一个角色、同一角色只允许一张卡面。 */
import { describe, expect, it } from "vitest";

import type { CharacterRecord, MusicEntry } from "../data/types";
import { loadRealBundle } from "../test-utils";
import { buildSongConflicts } from "./songConflicts";

const character = (
  key: string,
  music: MusicEntry[],
  card: string[] = [`${key}.png`],
): CharacterRecord => ({ key, name: key, order: 0, card, searchNames: [key], music });


describe("buildSongConflicts", () => {
  it("共用一首曲子的角色互相排斥；只间接相连的不算（按歌，不是连通分量）", () => {
    const table = buildSongConflicts([
      character("a", [["原曲盘", "x", "角色曲"]]),
      character("b", [["原曲盘", "x", "角色曲"], ["原曲盘", "y", "角色曲"]]),
      character("c", [["原曲盘", "y", "角色曲"]]),
      character("d", [["原曲盘", "z", "角色曲"]]),
    ]);

    expect(table["a"]).toEqual(["b"]);
    expect(table["b"]).toEqual(["a", "c"]);
    expect(table["c"]).toEqual(["b"]);
    // 与谁都不共用曲目的角色不进表（不必查）
    expect(table["d"]).toBeUndefined();
    // a 与 c 没有共同曲目 → 可以同时在场上
    expect(table["a"]).not.toContain("c");
  });

  it("同一角色的多张卡面互相排斥（自链接）", () => {
    const table = buildSongConflicts([
      character("sisters", [["原曲盘", "x", "角色曲"]], ["l.png", "m.png", "r.png"]),
      character("single", [["原曲盘", "y", "角色曲"]]),
    ]);

    expect(table).toEqual({ sisters: ["sisters"] });
  });

  it("同一专辑里两个角色共用一首曲目照样互斥（模式过滤已不在这一层）", () => {
    const characters = [
      character("a", [["音MAD盘", "m", "角色曲"]]),
      character("b", [["音MAD盘", "m", "角色曲"]]),
    ];
    // C：数据集自己就是"某个模式的那份"，所以同样的角色表交给它即可
    expect(buildSongConflicts([characters[0]!])).toEqual({});
    expect(buildSongConflicts(characters)).toEqual({ a: ["b"], b: ["a"] });
  });

  // C 之后没有"在数据集里但本模式不可播"的角色了：数据集只含本模式有曲目的角色
  // （由 `tmc.validate` 的 check_datasets 守），所以"空转自链接"这一类不可能再出现。
});

describe("真实数据（public/data）", () => {
  it("原曲模式的 10 首共用曲目全在表里，且不误伤只间接相连的角色", async () => {
    const bundle = await loadRealBundle();
    const table = buildSongConflicts(bundle.datasets.originals.characters);

    // 琪露诺 / 若鹭姬 共用《ミストレイク》
    expect(table["cirno"]).toEqual(["wakasagihime"]);
    expect(table["wakasagihime"]).toEqual(["cirno"]);

    // 一个 key 多个角色（Prismriver 三姐妹、弁弁/八桥、舞/里乃、女苑/紫苑）
    // 与同角色多形态（慧音）都只能选一张 → 自链接
    for (const key of [
      "prismriver-sisters", "tsukumo-benben-yatsuhashi", "teireida-mai-nishida-satono",
      "yorigami-joon-shion", "kamishirasawa-keine",
    ]) {
      expect(table[key], key).toContain(key);
    }

    // kogasa 分别与 nue / yoshika 各共用一首，后两者之间没有共同曲目 → 不互斥
    expect(table["tatara-kogasa"]).toEqual(["houjuu-nue", "miyako-yoshika"]);
    expect(table["houjuu-nue"]).toEqual(["tatara-kogasa"]);
    expect(table["miyako-yoshika"]).toEqual(["tatara-kogasa"]);
  });

  it("音MAD 模式没有跨角色重复（只剩多卡面的自链接）", async () => {
    const bundle = await loadRealBundle();
    const table = buildSongConflicts(bundle.datasets.otomads.characters);
    for (const [key, related] of Object.entries(table)) {
      expect(related.every((other) => other === key), key).toBe(true);
    }
  });
});
