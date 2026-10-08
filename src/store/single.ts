/** 仅单曲模式：总开关 + 每角色手选曲目 + 按角色禁用。
 *
 * **按音乐模式分键**（B）：`tmc.v1.single-track.originals` / `.otomads` 各一把。
 * 手选的是"某个角色唱哪首"，而两个模式的曲目集合不同 —— 共用一份会让音MAD 侧
 * 手选的曲目在原曲模式里"存在但不合法"，只能靠回退逻辑兜着。
 */
import { create } from "zustand";

import { type MusicEntry } from "../data/types";
import { EXTRAS } from "../data/types";
import { defineStore, isRecord, pickBoolean, type StoreSpec } from "../persist";
import type { MusicMode } from "../music/mode";
import { makeModeStores, type ModeHook } from "./modeScope";
import { useSession } from "./session";

interface SingleTrackState {
  enabled: boolean;
  pins: Record<string, MusicEntry>;
  disabledCharacters: Record<string, boolean>;
}

const EXTRAS_SET = new Set<string>(EXTRAS);

const FRESH: SingleTrackState = { enabled: false, pins: {}, disabledCharacters: {} };

/** 手选条目（S2：对象）：`id / album / title / extra`，`author` 是**可选作者**（音MAD 那批基本都有）、
 *  `authors` 是字符串数组（D135 起跟着存档走）。 */
function isEntry(raw: unknown): raw is MusicEntry {
  return isRecord(raw)
    && typeof raw.id === "string" && raw.id.length > 0
    && typeof raw.album === "string" && typeof raw.title === "string"
    && EXTRAS_SET.has(String(raw.extra))
    && (raw.author === undefined || typeof raw.author === "string")
    && (raw.authors === undefined
      || (Array.isArray(raw.authors) && raw.authors.length > 0
          && raw.authors.every((name) => typeof name === "string")));
}

/** 只留校验过的字段；**作者与多作者都跟着走** ——
 *  丢掉它们，播放页那一行对 pin 的曲目就只剩专辑名。 */
function copyEntry(value: MusicEntry): MusicEntry {
  return {
    id: value.id, album: value.album, title: value.title, extra: value.extra,
    ...(value.author !== undefined ? { author: value.author } : {}),
    ...(value.authors !== undefined ? { authors: value.authors } : {}),
  };
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

/** 某个音乐模式的存档规格（测试直接用它验校验）。 */
export function singleTrackSpec(mode: MusicMode): StoreSpec<SingleTrackState> {
  return {
    name: `single-track.${mode}`, version: 1, fallback: FRESH, validate: validateSingleTrack,
  };
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
      const disabledCharacters: Record<string, boolean> = {};
      let dropped = false;
      for (const [key, value] of Object.entries(get().pins)) {
        if (known.has(key)) pins[key] = value;
        else dropped = true;
      }
      for (const key of Object.keys(get().disabledCharacters)) {
        if (known.has(key)) disabledCharacters[key] = true;
        else dropped = true;
      }
      // 没有死条目：不动 store、不写盘（与 `sources.prune` 同一口径）—— Shell 里那个 effect
      // 每次换模式 / 每次列表点播都会调它，白写一遍盘还会把这两个对象的引用换掉。
      if (!dropped) return;
      set({ pins, disabledCharacters });
      persist({ ...pick(get()), pins, disabledCharacters });
    },
  }));
}

const singleStores = makeModeStores<SingleTrackSlice>(makeSlice);

/** 某个音乐模式那把（测试与非组件代码用）。 */
export const singleStoreFor = singleStores.storeFor;

/** 当前音乐模式那把（组件用；切模式即换表）。 */
export const useSingleTrack: ModeHook<SingleTrackSlice> = singleStores.useStore;
