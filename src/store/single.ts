/** 仅单曲模式：总开关 + 每角色手选曲目 + 按角色禁用。
 *
 * **按音乐模式分键**（B）：`tmc.v1.single-track.originals` / `.otomads` 各一把。
 * 手选的是"某个角色唱哪首"，而两个模式的曲目集合不同 —— 共用一份会让音MAD 侧
 * 手选的曲目在原曲模式里"存在但不合法"，只能靠回退逻辑兜着。
 * 老存档（单键 `tmc.v1.single-track`）归**原曲**（`legacyName`）。
 */
import { create } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";

import type { MusicEntry } from "../data/types";
import { EXTRAS } from "../data/types";
import { defineStore, isRecord, pickBoolean, type StoreSpec } from "../persist";
import type { MusicMode } from "../music/mode";
import { useMusicMode } from "./modeScope";
import { useSession } from "./session";

interface SingleTrackState {
  enabled: boolean;
  pins: Record<string, MusicEntry>;
  disabledCharacters: Record<string, boolean>;
}

const EXTRAS_SET = new Set<string>(EXTRAS);

const FRESH: SingleTrackState = { enabled: false, pins: {}, disabledCharacters: {} };

/** 手选条目：3 元（专辑 / 曲目 / 附加信息）或 4 元（第 4 位是**可选作者**，音MAD 那批基本都有）。 */
function isEntry(raw: unknown): raw is MusicEntry {
  return Array.isArray(raw) && (raw.length === 3 || raw.length === 4)
    && typeof raw[0] === "string" && typeof raw[1] === "string"
    && EXTRAS_SET.has(String(raw[2]))
    && (raw.length === 3 || typeof raw[3] === "string");
}

/** 只留校验过的位置；**第 4 位作者跟着走** —— 丢掉它，播放页那一行对 pin 的曲目就只剩专辑名。 */
function copyEntry(value: MusicEntry): MusicEntry {
  return value.length === 4
    ? [value[0], value[1], value[2], value[3]]
    : [value[0], value[1], value[2]];
}

function validateSingleTrack(raw: unknown): SingleTrackState | null {
  if (!isRecord(raw)) return null;
  const enabled = pickBoolean(raw.enabled);
  if (enabled === null) return null;
  const pins: Record<string, MusicEntry> = {};
  if (isRecord(raw.pins)) {
    for (const [key, value] of Object.entries(raw.pins)) {
      if (isEntry(value)) pins[key] = copyEntry(value);
    }
  }
  const disabledCharacters: Record<string, boolean> = {};
  if (isRecord(raw.disabledCharacters)) {
    for (const [key, value] of Object.entries(raw.disabledCharacters)) {
      const flag = pickBoolean(value);
      if (flag) disabledCharacters[key] = true;
    }
  }
  return { enabled, pins, disabledCharacters };
}

/** 某个音乐模式的存档规格（测试直接用它验校验与迁移）。 */
export function singleTrackSpec(mode: MusicMode): StoreSpec<SingleTrackState> {
  const base: StoreSpec<SingleTrackState> = {
    name: `single-track.${mode}`, version: 1, fallback: FRESH, validate: validateSingleTrack,
  };
  return mode === "originals" ? { ...base, legacyName: "single-track" } : base;
}

interface SingleTrackSlice extends SingleTrackState {
  setEnabled: (enabled: boolean) => void;
  setPin: (key: string, entry: MusicEntry | null) => void;
  toggleCharacter: (key: string) => void;
  /** 清理已不存在的角色（数据更新后调用）。 */
  prune: (knownKeys: readonly string[]) => void;
}

/** 设置页动了某个角色 → 清掉它那条列表页点播。
 *
 * 点播是"我现在要听这一首"的临时覆盖，压在手选之上；一旦用户在设置页明确重新配置**同一个角色**
 * （手选或禁用），这条旧请求就该让位 —— 否则它会一直盖住刚做的配置（B2）。
 * 只清这一个角色：动别的角色时把点播一起清掉，会把正在播的那一首换掉。
 */
function dropEntryRequest(key: string): void {
  useSession.getState().clearEntryRequest(key);
}

/** 造"某个音乐模式的单曲模式状态"这把 store。 */
function makeSlice(mode: MusicMode) {
  const handle = defineStore(singleTrackSpec(mode));
  const initial = handle.load();

  const pick = (state: SingleTrackState): SingleTrackState => ({
    enabled: state.enabled, pins: state.pins, disabledCharacters: state.disabledCharacters,
  });
  const persist = (state: SingleTrackState): void => { handle.save(pick(state)); };

  return create<SingleTrackSlice>((set, get) => ({
    ...initial,

    setEnabled(enabled) {
      const next = { ...pick(get()), enabled };
      set({ enabled });
      persist(next);
    },

    setPin(key, entry) {
      const pins = { ...get().pins };
      if (entry) pins[key] = entry;
      else delete pins[key];
      // 手选之后不再禁用该角色（用户意图明确）
      const disabledCharacters = { ...get().disabledCharacters };
      if (entry) delete disabledCharacters[key];
      set({ pins, disabledCharacters });
      persist({ ...pick(get()), pins, disabledCharacters });
      dropEntryRequest(key);
    },

    toggleCharacter(key) {
      const disabledCharacters = { ...get().disabledCharacters };
      if (disabledCharacters[key]) delete disabledCharacters[key];
      else disabledCharacters[key] = true;
      set({ disabledCharacters });
      persist({ ...pick(get()), disabledCharacters });
      dropEntryRequest(key);
    },

    prune(knownKeys) {
      const known = new Set(knownKeys);
      const pins: Record<string, MusicEntry> = {};
      for (const [key, value] of Object.entries(get().pins)) if (known.has(key)) pins[key] = value;
      const disabledCharacters: Record<string, boolean> = {};
      for (const key of Object.keys(get().disabledCharacters)) if (known.has(key)) disabledCharacters[key] = true;
      set({ pins, disabledCharacters });
      persist({ ...pick(get()), pins, disabledCharacters });
    },
  }));
}

const slices: Record<MusicMode, UseBoundStore<StoreApi<SingleTrackSlice>>> = {
  originals: makeSlice("originals"),
  otomads: makeSlice("otomads"),
};

/** 某个音乐模式那把（测试与非组件代码用）。 */
export function singleStoreFor(mode: MusicMode): UseBoundStore<StoreApi<SingleTrackSlice>> {
  return slices[mode];
}

/** 当前音乐模式那把（组件用；切模式即换表）。 */
export function useSingleTrack(): SingleTrackSlice;
export function useSingleTrack<T>(selector: (state: SingleTrackSlice) => T): T;
export function useSingleTrack<T>(selector?: (state: SingleTrackSlice) => T): SingleTrackSlice | T {
  const store = slices[useMusicMode()];
  return selector ? store(selector) : store();
}
