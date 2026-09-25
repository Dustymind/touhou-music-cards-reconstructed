/** 按音乐模式分键的 store 共用的一点点装配（B）。
 *
 * 原曲 / 音MAD 各自一把持久化键（`tmc.v1.<name>.originals` / `tmc.v1.<name>.otomads`），
 * 组件用 `useXxx()` 拿"当前模式那把"，非组件代码用 `xxxStoreFor(mode)`；
 * 模式本身只有一份（`useSession.musicMode`，就是那个切换开关）。
 *
 * "两个模式各建一把 + 跟着会话模式换表的选择器钩子"这套样板，四个 store
 * （preset / single / queue / sources）原先各写一遍，现在收在 `makeModeStores()` 里 ——
 * 各 store 只写自己的 state 与行为（`makeSlice`）。
 */
import type { StoreApi, UseBoundStore } from "zustand";

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

/** 某个模式的 store：`create()` 的返回值（`getState` / `setState` / `subscribe` 都在这上面）。 */
export type ModeStore<S> = UseBoundStore<StoreApi<S>>;

/** "当前模式那把"的选择器钩子：**无参 = 整份 state**，传选择器 = 那一段（`undefined` 也算"没传"，
 *  与各 store 原先写的三重载签名一致）。
 *
 *  写成接口而不是每个 store 各写一遍 `export function useXxx()` 重载：调用方看到的两个签名
 *  （`(): S` 与 `<T>(selector): T`）逐字相同，而"取哪一把"只实现一次。 */
export interface ModeHook<S> {
  (): S;
  <T>(selector: (state: S) => T): T;
}

export interface ModeStores<S> {
  /** 某个音乐模式那把（测试与非组件代码用）。 */
  storeFor: (mode: MusicMode) => ModeStore<S>;
  /** 当前音乐模式那把（**非组件**代码用：事件处理、联机回调）。 */
  currentStore: () => ModeStore<S>;
  /** 当前音乐模式那把（组件用；切模式即换表）。 */
  useStore: ModeHook<S>;
}

/** 把"每个模式一把 + 取用方式"这套样板收在一处：`makeSlice(mode)` 负责造一把（读自己的存档键、
 *  写自己的校验与行为），这里造两把并给出三种取法。
 *
 *  `makeSlice` 在**模块加载时**被调用两次（originals / otomads 各一次），所以两把 store 是常驻的：
 *  `useStore()` / `currentStore()` 每次都现取当前模式那一把，不缓存"上一次的模式"
 *  （缓存的话切模式后会拿到旧表）。 */
export function makeModeStores<S>(makeSlice: (mode: MusicMode) => ModeStore<S>): ModeStores<S> {
  // 模式逐一点名，不走 `MUSIC_MODES` 循环：漏一个键 `Record<MusicMode, …>` 当场不成立
  const slices: Record<MusicMode, ModeStore<S>> = {
    originals: makeSlice("originals"),
    otomads: makeSlice("otomads"),
  };

  const useStore = ((selector?: (state: S) => unknown) => {
    const store = slices[useMusicMode()];
    return selector ? store(selector) : store();
  }) as ModeHook<S>;

  return {
    storeFor: (mode) => slices[mode],
    currentStore: () => slices[currentMusicMode()],
    useStore,
  };
}
