/** 曲目互斥：一局里**同一首歌只对应一个角色**，**同一角色的多张卡面也只允许一张**。
 *
 * 为什么需要它：抢卡的答案是"当前角色"（`rules.notifyPickEvent` 只认 `currentKey`），
 * 但卡池是"角色 × 卡面"，于是两类重复会让两张卡都听起来是对的：
 *
 * 1. **两个角色共用一首曲子**（原曲模式实测 10 首，涉及 17 个角色）：琪露诺 / 若鹭姬共用
 *    《ミストレイク》、十六夜咲夜 / 蕾米莉亚共用《ツェペシュの幼き末裔》…
 * 2. **一个 key 的多张卡面其实是多个角色**：`prismriver-sisters`（露娜萨 / 梅露兰 / 莉莉卡）、
 *    `tsukumo-benben-yatsuhashi`（弁弁 / 八桥）、`teireida-mai-nishida-satono`（舞 / 里乃）、
 *    `yorigami-joon-shion`（女苑 / 紫苑）—— 她们各自的曲目挂在同一个角色 key 上，
 *    所以任意一张卡面都能被任意一位的歌"答对"。
 *
 * 口径**与对局里真实会放的歌一致**：对局忽略音乐预设（`AppShell` 传 `ignorePreset`），
 * 只按**音乐模式**过滤（`src/music/mode.ts`）。单曲模式（pins）不在口径里 ——
 * 那是播放页的特性，这里按"全曲库"算：宁可多挡一张，也不会漏挡。
 *
 * 互斥是**按歌**而不是"连通分量"：`tatara-kogasa` 分别与 `houjuu-nue`、`miyako-yoshika`
 * 各共用一首，但后两者之间没有共同曲目 → 它们可以同时在场上，只有 kogasa 进不来。
 *
 * D153 之后"同一角色多张卡面"多了一种来源：音MAD 侧**一首曲目一张卡**（`covers`）。
 * 判定按 `maxCardCount`（两种口径取最大，**与当前图集无关**）走，见下面的注释。
 */
import type { CharacterRecord } from "../data/types";
import { maxCardCount } from "../data/cardFaces";

import type { SongConflicts } from "../game/types";

/** 派生互斥表；表里没有的角色 = 与谁都不互斥（不必查表）。
 *
 * C 之后传进来的就是**当前模式的数据集**（只含本模式曲目），所以这里不再需要按模式过滤。 */
export function buildSongConflicts(characters: readonly CharacterRecord[]): SongConflicts {
  /** 曲目 → 用它的角色 */
  const ownersOfTrack = new Map<string, Set<string>>();
  /** 数据集里有曲目的角色（= 会进卡池的那些） */
  const playable = new Set<string>();
  for (const character of characters) {
    for (const entry of character.music) {
      playable.add(character.key);
      const id = entry.id;
      const owners = ownersOfTrack.get(id) ?? new Set<string>();
      owners.add(character.key);
      ownersOfTrack.set(id, owners);
    }
  }

  const related = new Map<string, Set<string>>();
  const link = (a: string, b: string): void => {
    const targets = related.get(a) ?? new Set<string>();
    targets.add(b);
    related.set(a, targets);
  };

  for (const owners of ownersOfTrack.values()) {
    if (owners.size < 2) continue;
    for (const a of owners) for (const b of owners) if (a !== b) link(a, b);
  }
  // 同一角色的多张卡面：它们共用该角色的全部曲目 → 一局里只允许一张
  // （只给当前模式下真的会进卡池的角色建自链接）
  //
  // **"几张卡"按 `maxCardCount` 算：两种口径取最大，与"当前选了哪套图集"无关**。
  // 两处都不能想当然：
  //   * 只看 `card.length`（D153 之前）会漏掉音MAD 的"一首一张"⇒ 两张同角色变体同时在场，
  //     都对同一首歌"答对"；
  //   * 只看当前图集（行为优化之后）会变成"随偏好而定的互斥表"⇒ 联机两端选了不同图集时，
  //     一边能放第二张、另一边不能 —— 同一份数据算出两张不同的表。
  // 取最大之后不变式与改动前**逐字相同**：一个角色在整张桌子上最多一张卡。
  for (const character of characters) {
    if (maxCardCount(character) > 1 && playable.has(character.key)) link(character.key, character.key);
  }

  const table: Record<string, string[]> = {};
  for (const key of [...related.keys()].sort()) {
    table[key] = [...related.get(key)!].sort();
  }
  return table;
}
