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
