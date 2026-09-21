/** 取"当前音乐模式的数据集"（C：两个模式各一份完整数据集，运行时不再按 `album.pack` 过滤）。
 *
 * 组件用 `useCurrentDataset(bundle)`；非组件代码（事件处理、联机回调）用 `datasetFor(bundle, mode)`。
 * 数据本身在启动时两份都取好（契约 §4 策略 A），所以这里只是选一份，不会失败、也没有异步。
 */
import type { DataBundle, ModeDataset } from "./types";
import type { MusicMode } from "../music/mode";
import { useMusicMode } from "../store/modeScope";

/** 某个模式的数据集（纯函数，测试与非组件代码用）。 */
export function datasetFor(bundle: DataBundle, mode: MusicMode): ModeDataset {
  return bundle.datasets[mode];
}

/** 当前音乐模式的数据集（组件用；切模式即换一份，会重渲染）。 */
export function useCurrentDataset(bundle: DataBundle): ModeDataset {
  return datasetFor(bundle, useMusicMode());
}
