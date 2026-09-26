/** 音乐模式：原曲（originals）/ 音MAD（otomads）。
 *
 * C 之后这里只剩**"当前在用哪份数据集"**这一件事：两个模式各自有一份完整数据集
 * （`public/data/index.json` 与 `public/data/otomads/index.json`，契约见
 * `docs/otomads-separation-v1.md`），运行时靠 `src/data/useDataset.ts` 选一份，
 * **不再**按 `album.pack` 逐条过滤曲目（原先那 6 个判定函数已随 C 删除）。
 *
 * 行为照旧（对齐改版仓库 v2）：
 * - 模式只决定"接下来能选哪些曲目"，**不打断正在播放的这一首**；
 * - 换模式不改动已保存的单曲选择（每个模式各自的存档，见 D110）；
 * - 当前模式下没有曲目的角色不进轮播（现在等于"数据集里没有这个角色"）。
 */
export type MusicMode = "originals" | "otomads";

export const MUSIC_MODES: MusicMode[] = ["originals", "otomads"];
export const DEFAULT_MUSIC_MODE: MusicMode = "originals";

/** **自带卡面**的模式：这个模式的卡面由它自己的源给，`cardsets.json` 里的图集一概不列出（D155）。
 *
 *  今天两个模式都不是 —— 它们共用上游那几套内置图集（`CardSetRecord.mode` 缺省 = 每个模式都能选）。
 *  判据放在这里而不是 `cardFaces.ts`：`set.mode === undefined` 对**所有**内置图集都成立，
 *  新增一个模式时"能不能用这些图集"必须是一次**明写的决定**，不能靠"没人写 mode"默认放行。 */
export const OWN_FACE_MODES: readonly MusicMode[] = [];

/** 这个模式的卡面是不是**自己的源**给的（见 `OWN_FACE_MODES`）。 */
export function usesOwnCardFaces(mode: MusicMode): boolean {
  return OWN_FACE_MODES.includes(mode);
}
