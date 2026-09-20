/** 按音乐模式分键的 store 共用的一点点装配（B）。
 *
 * 原曲 / 音MAD 各自一把持久化键（`tmc.v1.<name>.originals` / `tmc.v1.<name>.otomads`），
 * 组件用 `useXxx()` 拿"当前模式那把"，非组件代码用 `xxxStoreFor(mode)`；
 * 模式本身只有一份（`useSession.musicMode`，就是那个切换开关）。
 */
import type { MusicMode } from "../music/mode";
import { useSession } from "./session";

/** 当前音乐模式（组件里用；它是 hook，切模式会重渲染）。 */
export function useMusicMode(): MusicMode {
  return useSession((slice) => slice.musicMode);
}

/** 当前音乐模式（store 工厂 / 事件处理里用，不进 React 依赖）。 */
export function currentMusicMode(): MusicMode {
  return useSession.getState().musicMode;
}
