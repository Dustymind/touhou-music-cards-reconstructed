/** 卡面选择（D153）：卡数从哪来、每张卡用哪张图、图集什么时候**不该**出现。
 *
 * 三条最要紧的性质钉在这里：
 *
 * 1. **卡数与图集无关**（`covers.length || card.length`）—— 换图集只换图不换牌；
 * 2. **源封面是整条绝对 URL**：不拼目录、不做 URL 编码（`cardUrl` 那一步同理）；
 * 3. **源不提供就不显示**：`sourceOnly` 图集在没有 covers 的数据集里既不可选、也不生效
 *    （回落只影响渲染，不动用户存的偏好）。
 */
import { describe, expect, it } from "vitest";

import {
  availableCardSets, cardCount, cardFace, cardFaces, hasSourceCovers, isCardUrl, resolveCardSet,
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

describe("卡数", () => {
  it("源封面优先：一首一张", () => {
    expect(cardCount(character({ covers: COVERS }))).toBe(3);
  });

  it("没有源封面时按原版卡面数（原曲那份就是这条）", () => {
    expect(cardCount(character())).toBe(1);
    expect(cardCount(character({ card: ["慧音.png", "慧音2.png"] }))).toBe(2);
  });

  it("**与图集无关**——换图集不能改卡数（否则牌库里的 cardIndex 会错位）", () => {
    const cirno = character({ covers: COVERS });
    expect(cardCount(cirno)).toBe(cardFaces(cirno, COVER_SET).length);
    expect(cardCount(cirno)).toBe(cardFaces(cirno, UPSTREAM_SET).length);
    expect(cardCount(cirno)).toBe(cardFaces(cirno, undefined).length);
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
