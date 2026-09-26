/** 模式 3「自定义」的选曲语义（契约 `docs/custom-mode-v1.md` C4/C5）—— 纯函数，界面只负责喂状态。
 *
 * 这个模式**没有**类别开关（角色曲 / 道中曲 / 更多道中曲）也没有秘封碟：一卡一首、卡名自定，
 * 原曲那套分类对它没有意义。它能筛的只有两维：
 *
 * - **专辑三元**：清单里的专辑名（按首次出现顺序）；
 * - **作者三元**：清单里写过的作者（**空作者不进列表**，这类卡只看专辑那一维，Q7）。
 *
 * 真值表（Q4）：
 *
 * | 专辑 | 作者 | 结果 | 说明 |
 * |---|---|---|---|
 * | unset | unset | ✅ | 默认全开 |
 * | on | unset | ✅ | `on` 压住"另一维未配置" |
 * | unset | on | ✅ | 同上 |
 * | on | on | ✅ | |
 * | off | 任意 | ❌ | **一票否决** |
 * | 任意 | off | ❌ | 同上 |
 *
 * 即 `启用 = 专辑 !== "off" && 作者 !== "off"`（只有三个取值时，上面那张表与这条等价）；
 * 写成完整判据是为了让"为什么 `on` 不需要额外处理"这件事在代码里看得见。
 */
import type { AlbumRecord, CharacterRecord } from "../data/types";
import { displayTitle } from "../data/types";
import { sortAuthors } from "./authorOrder";
import type { Tri } from "./selection";

export interface CustomPresetState {
  /** 专辑名 → 三态（缺省 = `unset`，即"没配置过"） */
  albums: Record<string, Tri>;
  /** 作者名 → 三态（缺省 = `unset`）。**空作者不在表里**（不适用，不是"未配置"） */
  authors: Record<string, Tri>;
}

/** 空预设：两维都没配置 ⇒ 按真值表**全开**（与"一个都没勾"的另两个模式相反，这是刻意的）。 */
export const EMPTY_CUSTOM_PRESET: CustomPresetState = { albums: {}, authors: {} };

/** 这一维允许吗：只有显式的 `off` 挡人（`unset` 与 `on` 都放行，见文件头的真值表）。 */
export function triAllows(value: Tri | undefined): boolean {
  return value !== "off";
}

/** 这张卡（= 这个模式的一个角色）在当前的专辑/作者三元下可用吗。 */
export function customCardEnabled(state: CustomPresetState, character: CharacterRecord): boolean {
  const entry = character.music[0];
  if (!entry) return false;
  const author = entry[3];
  // 没有作者的卡只看专辑那一维（作者维度对它不适用，Q7）
  return triAllows(state.albums[entry[0]])
    && (author === undefined || triAllows(state.authors[author]));
}

/** 清单里出现过的作者（**去重 + 按拼音/字母排序**，空作者不进）—— 作者三元列表就用它。 */
export function customAuthorsOf(characters: readonly CharacterRecord[]): string[] {
  const seen = new Set<string>();
  for (const character of characters) {
    const author = character.music[0]?.[3];
    if (author !== undefined) seen.add(author);
  }
  return sortAuthors([...seen]);
}

/** 统计行：可用卡 / 全库卡 / 专辑数 / 作者数。 */
export interface CustomPresetStats {
  enabled: number;
  total: number;
  albums: number;
  authors: number;
}

export function customPresetStats(
  state: CustomPresetState,
  characters: readonly CharacterRecord[],
): CustomPresetStats {
  let enabled = 0;
  for (const character of characters) {
    if (customCardEnabled(state, character)) enabled += 1;
  }
  return {
    enabled,
    total: characters.length,
    albums: new Set(characters.map((character) => character.music[0]?.[0]).filter(Boolean)).size,
    authors: customAuthorsOf(characters).length,
  };
}

/** 专辑行的显示顺序（清单给的 `order`，与"首次出现"一致）。 */
export function customAlbumRows(albums: readonly AlbumRecord[]): AlbumRecord[] {
  return [...albums].sort((a, b) => a.order - b.order);
}

/** 仅单曲模式（模式 3）的一行：一张卡 + 它那一首 + 是否被禁用。 */
export interface CustomSingleRow {
  character: CharacterRecord;
  disabled: boolean;
  /** 副标题：`曲名 · 专辑 · 作者`（作者为空就不出现那一段） */
  credit: string;
}

/** 逐曲禁用列表的行：按数据顺序（清单顺序）排，按卡名/别名过滤。 */
export function customSingleRows(
  characters: readonly CharacterRecord[],
  disabled: Readonly<Record<string, true>>,
  query = "",
): CustomSingleRow[] {
  const needle = query.trim().toLowerCase();
  return characters
    .filter((character) => !needle
      || [character.name, character.key, ...character.searchNames]
        .some((name) => name.toLowerCase().includes(needle)))
    .map((character) => ({
      character,
      disabled: disabled[character.key] === true,
      credit: customCardCredit(character),
    }));
}

/** 一张卡的副标题：`曲名 · 专辑 · 作者`（这个模式一卡一首，所以只有第一首）。 */
export function customCardCredit(character: CharacterRecord): string {
  const entry = character.music[0];
  if (!entry) return "";
  return [displayTitle(entry[1]), entry[0], entry[3]].filter(Boolean).join(" · ");
}
