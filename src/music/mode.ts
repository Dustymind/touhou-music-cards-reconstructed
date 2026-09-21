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
import type { SourceRecord } from "../data/types";

export type MusicMode = "originals" | "otomads";

export const MUSIC_MODES: MusicMode[] = ["originals", "otomads"];
export const DEFAULT_MUSIC_MODE: MusicMode = "originals";

/**
 * 模式对音源的隐含要求：音MAD 曲目的地址来自**本地曲库**（`kind === "local"`），
 * 所以 otomads 模式下必须把本地源打开，否则那批曲目解析不出地址。
 *
 * 与 v2 一致：本地专辑源"不参与镜像切换"——这里也不改写用户的开关，只是在
 * 传给加载器时**临时**打开本地源（用户看到的状态仍是自己的设置）。
 */
export function effectiveSourceOverrides(
  sources: readonly SourceRecord[],
  overrides: Record<string, { enabled: boolean; order: number }>,
  mode: MusicMode,
): Record<string, { enabled: boolean; order: number }> {
  if (mode !== "otomads") return overrides;
  const next: Record<string, { enabled: boolean; order: number }> = {};
  for (const [id, value] of Object.entries(overrides)) next[id] = { ...value };
  for (const source of sources) {
    if (source.kind !== "local") continue;
    next[source.id] = { enabled: true, order: next[source.id]?.order ?? source.order };
  }
  return next;
}
