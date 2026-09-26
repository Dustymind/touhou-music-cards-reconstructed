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
 *    （回落只影响渲染，不动用户存的偏好）。
 */
import { describe, expect, it } from "vitest";

import {
  availableCardSets, cardCount, cardFace, cardFaces, hasSourceCovers, isCardUrl, maxCardCount,
  resolveCardSet, usesPerTrackFaces,
} from "./cardFaces";
import type { CardSetRecord, CharacterRecord, ModeDataset } from "./types";
import type { MusicMode } from "../music/mode";

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
});
