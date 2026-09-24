/** 作者名的排序（**一处实现，两处用**：关于页的外置曲库署名、播放页的作者行）。
 *
 * ---- 排序：英文 / 拼音首字母（用户要求）----
 *
 * 直接拿 `Intl.Collator("zh-Hans-u-co-pinyin")` 排**不够**：ICU 的中文排序把**拉丁名排在所有汉字之后**
 * （实测 `Chyan_184` 落在 `张伟` 后面），那就不是"首字母混排"了。所以这里自己造排序键：
 *
 * 1. 拉丁字母开头 → 首字母就是它自己（`Chyan_184` → `c`）；
 * 2. 汉字开头 → 用 **ICU 的拼音序当数轴**，在 23 个"锚点字"（每个拼音首字母取该字母的**最小音节**，
 *    如 a=阿、b=八、c=擦…）里找**最后一个 ≤ 它**的锚点，那个锚点的字母就是它的拼音首字母；
 * 3. 认不出的（假名等）→ 排在字母之后，内部按 ICU 序（假名要拉丁化得内置五十音表，先不做）。
 *
 * 这样得到的键**是 ICU 序的细化**（同键内仍按 ICU 拼音序排），所以不会和它打架；
 * 而且与多音字无关 —— 锚点比较用的就是 ICU 自己给的读音。
 * 两个浏览器实测同序（`collation` 都解析成 `pinyin`）。
 */

/** 拼音排序器：`sensitivity: "base"` 忽略大小写；`numeric` 让 `_184` 这类后缀按数字比。 */
const collator = new Intl.Collator("zh-Hans-u-co-pinyin", { sensitivity: "base", numeric: true });

/** 每个拼音首字母的"最小音节"锚点字（a=阿(ā)、b=八(bā)、c=擦(cā)…）。zh/ch/sh 归 z/c/s。 */
const PINYIN_ANCHORS: readonly (readonly [char: string, initial: string])[] = [
  ["阿", "a"], ["八", "b"], ["擦", "c"], ["搭", "d"], ["鹅", "e"], ["发", "f"], ["嘎", "g"],
  ["哈", "h"], ["击", "j"], ["卡", "k"], ["拉", "l"], ["妈", "m"], ["那", "n"], ["哦", "o"],
  ["趴", "p"], ["七", "q"], ["然", "r"], ["撒", "s"], ["他", "t"], ["挖", "w"], ["西", "x"],
  ["压", "y"], ["匝", "z"],
];

/** 认不出首字母的（假名等）用这个键：排在 a–z 之后。 */
const OTHER_KEY = "~";

/** 一个名字的排序键：拉丁首字母 / 汉字拼音首字母 / `~`（认不出）。 */
export function sortKeyOf(name: string): string {
  // 取第一个**字母或数字**字符（跳过 `_Karacher_` / `·xxx` 这类开头标点与空白）
  const first = name.match(/[\p{L}\p{N}]/u)?.[0] ?? "";
  if (/[a-z]/i.test(first)) return first.toLowerCase();
  // 只有**汉字**能靠拼音锚点推首字母；假名/数字/别的文字一律排到最后
  // （注：ICU 的中文排序把假名排在汉字之后，所以不做这一步判断的话假名会落进 `z` 桶）
  if (!/\p{Script=Han}/u.test(first)) return OTHER_KEY;
  // 汉字：在锚点里找最后一个 ≤ 它的（锚点表按拼音序排列，逐个比即可）
  let key = OTHER_KEY;
  for (const [anchor, initial] of PINYIN_ANCHORS) {
    if (collator.compare(first, anchor) >= 0) key = initial;
    else break;
  }
  return key;
}

/** 按上面的规则排序一份作者名单（不改原数组）。同一个首字母内部按 ICU 序。 */
export function sortAuthors(authors: readonly string[]): string[] {
  return [...authors].sort(compareAuthors);
}

/** 排序比较函数（`Array.prototype.sort` 直接可用）。 */
export function compareAuthors(left: string, right: string): number {
  const leftKey = sortKeyOf(left);
  const rightKey = sortKeyOf(right);
  if (leftKey !== rightKey) return leftKey < rightKey ? -1 : 1;
  return collator.compare(left, right) || left.localeCompare(right);
}

/** 多个作者显示时的连接符（关于页与播放页共用一套排版口径）。 */
export const AUTHOR_SEPARATOR = "、";

/** 一份署名数组 → 用来显示的一行字（**先按拼音/字母排序**，再用「、」连接）。 */
export function formatAuthors(authors: readonly string[]): string {
  return sortAuthors(authors).join(AUTHOR_SEPARATOR);
}
