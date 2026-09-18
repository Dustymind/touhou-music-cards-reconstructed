/** 仅单曲模式：总开关 + 每角色手选曲目 + 按角色禁用。 */
import { create } from "zustand";

import type { Extra, MusicEntry } from "../data/types";
import { EXTRAS } from "../data/types";
import { defineStore, isRecord, pickBoolean } from "../persist";

interface SingleTrackState {
  enabled: boolean;
  pins: Record<string, MusicEntry>;
  disabledCharacters: Record<string, boolean>;
}

const EXTRAS_SET = new Set<string>(EXTRAS);

function isEntry(raw: unknown): raw is MusicEntry {
  return Array.isArray(raw) && raw.length === 3
    && typeof raw[0] === "string" && typeof raw[1] === "string"
    && EXTRAS_SET.has(String(raw[2]));
}

export const singleTrackSpec = {
  name: "single-track",
  version: 1,
  fallback: { enabled: false, pins: {}, disabledCharacters: {} } as SingleTrackState,
  validate(raw: unknown): SingleTrackState | null {
    if (!isRecord(raw)) return null;
    const enabled = pickBoolean(raw.enabled);
    if (enabled === null) return null;
    const pins: Record<string, MusicEntry> = {};
    if (isRecord(raw.pins)) {
      for (const [key, value] of Object.entries(raw.pins)) {
        if (isEntry(value)) pins[key] = [value[0], value[1], value[2] as Extra];
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
  },
} satisfies import("../persist").StoreSpec<SingleTrackState>;

const singleStore = defineStore<SingleTrackState>(singleTrackSpec);

interface SingleTrackSlice extends SingleTrackState {
  setEnabled: (enabled: boolean) => void;
  setPin: (key: string, entry: MusicEntry | null) => void;
  toggleCharacter: (key: string) => void;
  /** 清理已不存在的角色（数据更新后调用）。 */
  prune: (knownKeys: readonly string[]) => void;
}

const initial = singleStore.load();

function persist(state: SingleTrackState): void {
  singleStore.save({
    enabled: state.enabled,
    pins: state.pins,
    disabledCharacters: state.disabledCharacters,
  });
}

export const useSingleTrack = create<SingleTrackSlice>((set, get) => ({
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
  },

  toggleCharacter(key) {
    const disabledCharacters = { ...get().disabledCharacters };
    if (disabledCharacters[key]) delete disabledCharacters[key];
    else disabledCharacters[key] = true;
    set({ disabledCharacters });
    persist({ ...pick(get()), disabledCharacters });
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

function pick(state: SingleTrackState): SingleTrackState {
  return { enabled: state.enabled, pins: state.pins, disabledCharacters: state.disabledCharacters };
}
