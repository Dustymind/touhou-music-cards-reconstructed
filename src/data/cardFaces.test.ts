/** 卡面选择（D153 + 2026-09-26 的行为优化）：卡数从哪来、每张卡用哪张图、图集什么时候**不该**出现。
 *
 * 四条最要紧的性质钉在这里：
 *
 * 1. **多重卡牌只在"自定义卡面"（`sourceOnly`）下生效**：封面集 ⇒ 一首一张；原版/本地图集 ⇒
 *    一个角色 `card.length` 张（否则打原版图集会看到同角色 N 张一样的立绘各占一张卡）；
 * 2. **渲染表按数据最大口径铺满**（`cardFaces` 比卡池长是故意的）—— 联机对面发来更大的
 *    `cardIndex` 也画得出图，不会变成空卡面；
 * 3. **源封面是整条绝对 URL**：不拼目录、不做 URL 编码（`cardUrl` 那一步同理）；
 * 4. **源不提供就不显示**：`sourceOnly` 图集在没有 covers 的数据集里既不可选、也不生效
 *    （回落只影响渲染，不动用户存的偏好）；
 * 5. **可选集是唯一入口**（D155）：回落只落在 `availableCardSets` 的结果里，越界查表回到第 0 张；
 * 6. **形状也跟着图集走**（D163）：模式 3 的合成图集声明 16:9 横版，其余图集缺省 = 原比例 703:1000。
 */
import { describe, expect, it } from "vitest";

import {
  availableCardSets, cardCount, cardFace, cardFaces, cardFileAt, CUSTOM_CARD_SET, customCardSet,
  hasSourceCovers, isCardUrl, maxCardCount, resolveCardSet, usesPerTrackFaces,
} from "./cardFaces";
import type { CardSetRecord, CharacterRecord, ModeDataset } from "./types";
import { usesOwnCardFaces, type MusicMode } from "../music/mode";
import { cardAspectRatio, CardAspectRatio, CARD_RATIO_VALUES } from "../theme/cardRatio";

/** 源封面图集（`data/card-sets.toml` 里那套 `otomads-cover` 的形状）。 */
const COVER_SET: CardSetRecord = {
  id: "otomads-cover", dir: "", label: { en: "Otomads (Bilibili covers)", zh: "音MAD（B 站封面）" },
  localPrefix: "./", origins: [], sourceOnly: true, mode: "otomads",
};
/** 上游那类普通远程图集。 */
const UPSTREAM_SET: CardSetRecord = {
  id: "dairi-sd", dir: "cards", label: { en: "dairi", zh: "dairi" },
  localPrefix: "./", origins: ["https://example.test/"],
};
/** 音MAD 本地图集（`local_only`）。 */
const LOCAL_SET: CardSetRecord = {
  id: "otomads", dir: "cards-otomads", label: { en: "Otomads", zh: "音MAD" },
  localPrefix: "./", origins: [], localOnly: true,
};

const COVERS = [
  "https://i0.hdslb.com/bfs/archive/aaa.jpg@703w_1000h_1c.webp",
  "https://i1.hdslb.com/bfs/archive/bbb.png@703w_1000h_1c.webp",
  "https://i2.hdslb.com/bfs/archive/ccc.jpg@703w_1000h_1c.webp",
];

function character(overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return {
    key: "cirno", name: "チルノ", order: 6, card: ["チルノ.png"],
    searchNames: ["チルノ"], music: [["otomads", "おてんば恋娘", "角色曲"]], ...overrides,
  };
}

function dataset(mode: MusicMode, characters: CharacterRecord[]): ModeDataset {
  return {
    mode,
    index: {
      schema: 1, mode, contentHash: "0123456789abcdef",
      counts: { characters: characters.length, albums: 0, trackEntries: 0, distinctTracks: 0 },
    },
    albums: [], characters, sources: [],
    characterByKey: new Map(characters.map((item) => [item.key, item])),
    albumByName: new Map(),
  };
}

describe("卡数（多重卡牌只在自定义卡面下生效）", () => {
  const cirno = character({ covers: COVERS });

  it("自定义卡面（源按曲目给的那套）⇒ 一首一张", () => {
    expect(usesPerTrackFaces(COVER_SET)).toBe(true);
    expect(cardCount(cirno, COVER_SET)).toBe(3);
  });

  it("原版图集 ⇒ 回到一个角色 `card.length` 张（本尊就是那条行为优化）", () => {
    expect(cardCount(cirno, UPSTREAM_SET)).toBe(1);          // cirno.card 只有一张立绘
    expect(cardCount(character({ covers: COVERS, card: ["慧音.png", "慧音2.png"] }), UPSTREAM_SET))
      .toBe(2);                                              // 合成角色照旧按立绘数
  });

  it("本地自放图集（`local_only`）**不算**自定义卡面：一张立绘就是一张卡", () => {
    // 它的卡面来自 `card`（没有按曲目给的素材）⇒ 撑成 N 张只会是同一张图重复 N 次
    expect(usesPerTrackFaces(LOCAL_SET)).toBe(false);
    expect(cardCount(cirno, LOCAL_SET)).toBe(1);
  });

  it("没有源封面时（原曲那份）两种口径一致", () => {
    expect(cardCount(character(), COVER_SET)).toBe(1);
    expect(cardCount(character(), UPSTREAM_SET)).toBe(1);
    expect(cardCount(character({ card: ["慧音.png", "慧音2.png"] }), UPSTREAM_SET)).toBe(2);
  });

  it("`maxCardCount` = 两种口径取最大，**与图集无关**（互斥表就靠它）", () => {
    expect(maxCardCount(cirno)).toBe(3);                     // covers 3 > card 1
    expect(maxCardCount(character({ covers: COVERS, card: ["a.png", "b.png", "c.png", "d.png"] })))
      .toBe(4);                                              // card 4 > covers 3
    expect(maxCardCount(character())).toBe(1);
  });
});

describe("渲染表（比卡池长是故意的）", () => {
  const cirno = character({ covers: COVERS });

  it("长度按数据最大口径铺满 ⇒ 对面用封面集发来 cardIndex=2 时仍画得出图", () => {
    // 本端打原版图集：卡池只有 1 张，但渲染表有 3 格（对面可能是"一首一张"）
    expect(cardFaces(cirno, UPSTREAM_SET)).toHaveLength(3);
    expect(cardFaces(cirno, UPSTREAM_SET)[2]).toBe("チルノ.png");
    expect(cardCount(cirno, UPSTREAM_SET)).toBe(1);          // 卡池仍然只有 1 张
  });

  it("封面集下逐格就是各首曲目的封面", () => {
    expect(cardFaces(cirno, COVER_SET)).toEqual(COVERS);
  });
});

describe("每张卡用哪张图", () => {
  it("源封面图集：第 i 张就是第 i 条直链（绝对 URL 原样）", () => {
    const cirno = character({ covers: COVERS });
    expect(cardFace(cirno, COVER_SET, 0)).toBe(COVERS[0]);
    expect(cardFace(cirno, COVER_SET, 2)).toBe(COVERS[2]);
  });

  it("原版图集：音MAD 角色多张卡时按原版卡面**轮转**（多立绘角色各轮到自己那张）", () => {
    const keine = character({ key: "kamishirasawa-keine", card: ["慧音.png", "慧音2.png"], covers: COVERS });
    expect(cardFace(keine, UPSTREAM_SET, 0)).toBe("慧音.png");
    expect(cardFace(keine, UPSTREAM_SET, 1)).toBe("慧音2.png");
    expect(cardFace(keine, UPSTREAM_SET, 2)).toBe("慧音.png");
  });

  it("越界/负数一律回到第一张，不返回 undefined", () => {
    const cirno = character({ covers: COVERS });
    expect(cardFace(cirno, COVER_SET, 9)).toBe("チルノ.png");
    expect(cardFace(cirno, COVER_SET, -1)).toBe(COVERS[0]);
    expect(cardFace(cirno, UPSTREAM_SET, Number.NaN)).toBe("チルノ.png");
  });

  it("源封面集遇上没有 covers 的角色：回落到原版卡面（不炸）", () => {
    expect(cardFace(character(), COVER_SET, 0)).toBe("チルノ.png");
  });

  it("绝对 URL 判定只管 http(s)", () => {
    expect(isCardUrl(COVERS[0]!)).toBe(true);
    expect(isCardUrl("チルノ.png")).toBe(false);
    expect(isCardUrl("./チルノ.png")).toBe(false);
  });
});

describe("图集可选性", () => {
  const otomads = dataset("otomads", [character({ covers: COVERS })]);
  const originals = dataset("originals", [character()]);

  it("源没给封面 ⇒ 源封面图集不出现（音MAD 也不行）", () => {
    const bare = dataset("otomads", [character()]);
    expect(hasSourceCovers(bare)).toBe(false);
    expect(availableCardSets([UPSTREAM_SET, COVER_SET], bare)).toEqual([UPSTREAM_SET]);
  });

  it("只在音MAD 模式出现；原曲那边照旧用上游那几套", () => {
    expect(hasSourceCovers(otomads)).toBe(true);
    expect(availableCardSets([UPSTREAM_SET, COVER_SET, LOCAL_SET], otomads))
      .toEqual([UPSTREAM_SET, COVER_SET, LOCAL_SET]);
    // 原曲：封面集 mode 不匹配 ⇒ 不列出；音MAD 本地图集没有 mode 限制 ⇒ 仍在（用户自己的素材）
    expect(availableCardSets([UPSTREAM_SET, COVER_SET, LOCAL_SET], originals))
      .toEqual([UPSTREAM_SET, LOCAL_SET]);
  });

  it("选中的图集在当前模式下不可选 ⇒ 回落到第一套可选的（偏好不动）", () => {
    expect(resolveCardSet([UPSTREAM_SET, COVER_SET], "otomads-cover", otomads).id).toBe("otomads-cover");
    expect(resolveCardSet([UPSTREAM_SET, COVER_SET], "otomads-cover", originals).id).toBe("dairi-sd");
    // 源突然不提供封面（换了老清单）⇒ 同样回落，不会白卡
    const bare = dataset("otomads", [character()]);
    expect(resolveCardSet([UPSTREAM_SET, COVER_SET], "otomads-cover", bare).id).toBe("dairi-sd");
  });

  it("一套都没有时不炸（测试里 `cardSets: []` 的形态）", () => {
    expect(resolveCardSet([], "whatever", originals).id).toBe("");
    expect(availableCardSets([], originals)).toEqual([]);
  });

  it("原曲 / 音MAD **共用**内置图集（`mode` 缺省的那几套照旧列出）", () => {
    // 判据只有一处（`usesOwnCardFaces`）：它只对模式 3 为真 ⇒ 上面几条用例的行为逐字不变
    for (const mode of ["originals", "otomads"] as const) {
      expect(usesOwnCardFaces(mode)).toBe(false);
      expect(availableCardSets([UPSTREAM_SET, LOCAL_SET], dataset(mode, [character()])))
        .toEqual([UPSTREAM_SET, LOCAL_SET]);
    }
  });

  it("模式 3（自带卡面）⇒ 只有代码里那套**合成图集**，内置的一律不列", () => {
    const custom = dataset("custom", [character({ card: ["https://x/a.jpg"], covers: ["https://x/a.jpg"] })]);
    expect(usesOwnCardFaces("custom")).toBe(true);
    expect(availableCardSets([UPSTREAM_SET, COVER_SET, LOCAL_SET], custom)).toEqual([CUSTOM_CARD_SET]);
    // 没数据时也还是那一套（这个模式的卡面来源就是清单本身，与"源有没有给素材"无关）
    expect(availableCardSets([UPSTREAM_SET], dataset("custom", []))).toEqual([CUSTOM_CARD_SET]);
  });

  it("模式 3：用户存的 `cardCollection` **被忽略但不改写**（偏好照旧留在存档里）", () => {
    const custom = dataset("custom", [character({ card: ["https://x/a.jpg"], covers: ["https://x/a.jpg"] })]);
    expect(resolveCardSet([UPSTREAM_SET, COVER_SET], "dairi-sd", custom).id).toBe(CUSTOM_CARD_SET.id);
    expect(resolveCardSet([], "dairi-sd", custom).id).toBe(CUSTOM_CARD_SET.id);
  });

  it("模式 3 是严格 1:1 ⇒ 卡数恒为 1（不写卡面数那些代码，靠数据形状保证）", () => {
    const face = "https://x/a.jpg";
    const card = character({ card: [face], covers: [face] });
    expect(cardCount(card, CUSTOM_CARD_SET)).toBe(1);
    expect(maxCardCount(card)).toBe(1);
    expect(cardFaces(card, CUSTOM_CARD_SET)).toEqual([face]);
    expect(cardFace(card, CUSTOM_CARD_SET, 7)).toBe(face);       // 取模轮转在 1 张下天然安全
  });

  it("画幅跟着图集走（D163/D165）：不能换档的图集永远原比例，能换的按用户档位（模式 3 默认 16:9、其余默认常规）", () => {
    // 合成图集写的是 `ratios`（第一项 = 它的默认档 = 16:9），不是写死的 `ratio`
    expect(CUSTOM_CARD_SET.ratio).toBeUndefined();
    expect(CUSTOM_CARD_SET.ratios).toEqual(["16x9", "4x3", "original"]);
    const custom = dataset("custom", [character({ card: ["https://x/a.jpg"], covers: ["https://x/a.jpg"] })]);
    const customSet = (pref: "" | "16x9" | "4x3" | "original") =>
      resolveCardSet([], "dairi-sd", custom, pref);
    expect(cardAspectRatio(customSet("16x9"))).toBeCloseTo(CARD_RATIO_VALUES["16x9"], 12);
    expect(cardAspectRatio(customSet("4x3"))).toBeCloseTo(CARD_RATIO_VALUES["4x3"], 12);
    expect(cardAspectRatio(customSet("original"))).toBeCloseTo(CARD_RATIO_VALUES.original, 12);
    expect(cardAspectRatio(customSet(""))).toBeCloseTo(CARD_RATIO_VALUES["16x9"], 12);

    // 内置图集（既不是 localOnly 也不是 sourceOnly）**不能换档**：传什么偏好都是原比例
    const originals2 = dataset("originals", [character()]);
    expect(UPSTREAM_SET.ratio).toBeUndefined();
    const builtIn = resolveCardSet([UPSTREAM_SET], "dairi-sd", originals2, "4x3");
    expect(builtIn.ratio).toBeUndefined();
    expect(cardAspectRatio(builtIn)).toBe(CardAspectRatio);

    // 音MAD 的 B 站封面集与本地自放图集**能换**（素材是源/使用者给的）；
    // 没选过 ⇒ 默认常规 = 今天的观感（那批 703×1000 的裁切图正好用得上）
    const otomads2 = dataset("otomads", [character({ covers: ["https://x/a.jpg"] })]);
    const coverResolved = resolveCardSet([COVER_SET], "otomads-cover", otomads2, "");
    expect(coverResolved.ratio).toBe("original");
    expect(cardAspectRatio(coverResolved)).toBeCloseTo(CardAspectRatio, 12);
    expect(resolveCardSet([LOCAL_SET], "otomads", otomads2, "16x9").ratio).toBe("16x9");
    expect(cardAspectRatio(resolveCardSet([LOCAL_SET], "otomads", otomads2, "16x9")))
      .toBeCloseTo(CARD_RATIO_VALUES["16x9"], 12);
  });

  it("`resolveCardSet` 的返回**引用稳定**（同图集/同档 ⇒ 同一个对象）—— `GamePanel` 靠它不空转", () => {
    const custom = dataset("custom", [character()]);
    const originals2 = dataset("originals", [character()]);
    const otomads2 = dataset("otomads", [character({ covers: ["https://x/a.jpg"] })]);
    // 模式 3：同一档位两次调用必须**同一个对象**（改了这里 GamePanel 会 "Maximum update depth exceeded"）
    for (const pref of ["16x9", "4x3", "original", ""] as const) {
      expect(resolveCardSet([], "x", custom, pref)).toBe(resolveCardSet([], "x", custom, pref));
    }
    expect(resolveCardSet([], "x", custom, "16x9")).not.toBe(resolveCardSet([], "x", custom, "4x3"));
    // 带档位的是**另一个**（缓存里的）对象，基线常量本身不带档位
    expect(customCardSet("16x9")).not.toBe(CUSTOM_CARD_SET);
    expect(customCardSet("16x9").ratio).toBe("16x9");
    // 能换档的普通图集同理（封面集 / 本地图集各一份缓存）
    for (const pref of ["original", "16x9", "4x3", ""] as const) {
      expect(resolveCardSet([COVER_SET], "otomads-cover", otomads2, pref))
        .toBe(resolveCardSet([COVER_SET], "otomads-cover", otomads2, pref));
    }
    // 不能换档的图集：返回的就是 `bundled` 里那一套（身份也是稳定的）
    expect(resolveCardSet([UPSTREAM_SET], "dairi-sd", originals2))
      .toBe(resolveCardSet([UPSTREAM_SET], "dairi-sd", originals2));
    // 空图集同样是同一个常量
    expect(resolveCardSet([], "x", originals2)).toBe(resolveCardSet([], "x", originals2));
  });

  it("逐档卡面链接（D165）：按当前档取那一份，只有一份时三档都用它（前端运行时裁）", () => {
    const original = "https://x/a.jpg";
    const wide = "https://x/a.16x9.jpg";
    const tall = "https://x/a.4x3.jpg";
    const all = character({
      card: [original], covers: [original],
      coversByRatio: { original: [original], "16x9": [wide], "4x3": [tall] },
    });
    const custom = dataset("custom", [all]);
    const at = (pref: "original" | "16x9" | "4x3") => resolveCardSet([], "dairi-sd", custom, pref);
    expect(cardFace(all, at("original"), 0)).toBe(original);
    expect(cardFace(all, at("16x9"), 0)).toBe(wide);
    expect(cardFace(all, at("4x3"), 0)).toBe(tall);
    expect(cardFaces(all, at("4x3"))).toEqual([tall]);

    // 只有一份（旧数据 / 手放的图 / 单直链）：三个档位都画它，形状不对时交给 `object-fit: cover` 裁
    const single = character({ card: [wide], covers: [wide] });
    for (const pref of ["original", "16x9", "4x3"] as const) {
      expect(cardFace(single, resolveCardSet([], "dairi-sd", dataset("custom", [single]), pref), 0))
        .toBe(wide);
    }
    // 只写了 4:3 一份：别的档回落到主链接（解析时 `covers` / `card` 放的就是它）
    const onlyTall = character({ card: [tall], covers: [tall], coversByRatio: { "4x3": [tall] } });
    const backToWide = resolveCardSet([], "dairi-sd", dataset("custom", [onlyTall]), "16x9");
    expect(cardFace(onlyTall, backToWide, 0)).toBe(tall);
    // 音MAD 的封面集没有 coversByRatio ⇒ 不受影响
    expect(cardFace(character({ covers: [wide] }), COVER_SET, 0)).toBe(wide);
  });

  it("一套可选的都没有 ⇒ **空图集**，不再回头用原始 `sets[0]` 那套内置立绘", () => {
    // 封面集是音MAD 专用：在原曲下它不可选，而候选里只有它 ⇒ 空集（改动前会回落到它自己 = 画 B 站封面）
    expect(availableCardSets([COVER_SET], originals)).toEqual([]);
    expect(resolveCardSet([COVER_SET], "otomads-cover", originals).id).toBe("");
  });
});

describe("越界卡面的查表（渲染表铺满之后的取法）", () => {
  const files = { cirno: ["チルノ.png", "チルノ2.png"] };

  it("正常下标逐字照旧", () => {
    expect(cardFileAt(files, "cirno", 0)).toBe("チルノ.png");
    expect(cardFileAt(files, "cirno", 1)).toBe("チルノ2.png");
  });

  it("越界 / 负数 / 非数字一律回到第 0 张（不白卡）", () => {
    expect(cardFileAt(files, "cirno", 9)).toBe("チルノ.png");
    expect(cardFileAt(files, "cirno", -1)).toBe("チルノ.png");
    expect(cardFileAt(files, "cirno", Number.NaN)).toBe("チルノ.png");
  });

  it("表里没有这个角色才是空串（交给 `CharacterCard` 的占位行为）", () => {
    expect(cardFileAt(files, "marisa", 0)).toBe("");
    expect(cardFileAt({}, "cirno", 0)).toBe("");
    expect(cardFileAt({ cirno: [] }, "cirno", 0)).toBe("");
  });
});
