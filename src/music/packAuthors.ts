/** 外置曲库（音MAD 曲包）曲目的**署名**：从已载入的数据里收集 → 去重 → 排序。
 *
 * 用来填「关于」弹窗里那一行 `{ auto: "pack-authors" }`（位置由用户在 `src/content/about.ts` 里定）。
 *
 * 数据侧只有每首曲子的 `author`（`MusicEntry[3]`，整串）或 `authors`（`MusicEntry[4]`，多作者数组，D135）、
 * **没有作者主页**，所以这一块只出名字、不给链接。原曲数据集里没有这些字段（378 条一条都没有），
 * 所以只有音MAD 曲包会贡献署名。
 *
 * 排序规则见 `./authorOrder.ts`（关于页与播放页**共用同一份实现**，不许各写一套）。
 */
import type { DataBundle, ModeDataset } from "../data/types";
import { compareAuthors } from "./authorOrder";
import type { TableMap } from "./sources";

/** 外置曲库的所有署名（去重、按英文/拼音首字母排序）；数据集里没有就返回空数组。
 *  同一个首字母内部仍按 ICU 序（**汉字会排在拉丁名之前**，例如 `芙兰厨…` 在 `FFFanwen` 前）——
 *  要做到逐字母精确得内置整张拼音表，对一份署名列表不值得。 */
export function collectPackAuthors(bundle: DataBundle): string[] {
  const names = new Set<string>();
  for (const character of bundle.datasets.otomads.characters) {
    for (const entry of character.music) {
      // 曲包写了 `authors = [...]` → 按数组逐个署名；只写了 `author = "A & B"` → 那一整串算一个署名
      // （不猜哪个 `&` 是分隔符：人名里也可能有 `&`，见 D135）
      for (const name of entry[4] ?? [entry[3] ?? ""]) {
        const author = name.trim();
        if (author !== "") names.add(author);
      }
    }
  }
  return [...names].sort(compareAuthors);
}

/**
 * 「关于」弹窗要显示的外置曲库署名 —— **本地曲库助手没在跑时返回空数组**（用户定的显示条件）。
 *
 * 判定用的是"当前音乐模式的**本地源**载入成功且表里有曲目"（`kind === "local"` + `status === "ready"`）：
 * 也就是设置页里那个源真的取到了 `manifest.json`。
 *
 * 注意由此带来的**可见性**：本地源只属于音MAD 数据集，原曲模式根本不加载它 ⇒
 * 原曲模式下这一段不显示（切到音MAD 模式、且助手在跑时才出现）。这正是"引入外置曲库时"的意思。
 */
export function packAuthorsFor(bundle: DataBundle, dataset: ModeDataset, tables: TableMap): string[] {
  const ready = dataset.sources.some((source) => {
    if (source.kind !== "local" || !source.enabled) return false;
    const table = tables[source.id];
    return table !== undefined && table.status === "ready" && table.entries.size > 0;
  });
  return ready ? collectPackAuthors(bundle) : [];
}
