/** 播放层：解析当前曲目、切歌、倒计时、随机起播、播放时长与音量。
 *
 * 与上游的差别：
 * - 换歌 effect 的依赖里包含"音源表版本"，换源/加载完成后会重新解析（修上游换源不生效）；
 * - 取不到 URL 时给出可见错误，而不是 `src=""` 静默；
 * - 音频 `error` 事件会把 `(源, 曲目)` 记入失败集合并自动换下一个源。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createBell, type BellHandle } from "./bell";
import type { AlbumRecord, CharacterRecord, MusicEntry } from "../data/types";
import { displayTitle, trackId } from "../data/types";
import { newSeed, pickWithSeed, randomStartPosition } from "../music/rng";
import { allowedTracks, type PresetState } from "../music/selection";
import { resolveTrack, type TableMap } from "../music/sources";

export type PlaybackState = "stopped" | "countingDown" | "playing" | "timeoutPause";

export interface PlaybackSetting {
  /** 播放位置随机（跳过最后 10 秒） */
  randomStart: boolean;
  /** 换歌前先响一声倒计时铃 */
  countdown: boolean;
  /** 播放多少秒后自动暂停；0 = 无限 */
  durationSeconds: number;
}

export const DEFAULT_PLAYBACK_SETTING: PlaybackSetting = {
  randomStart: false,
  countdown: false,
  durationSeconds: 0,
};

export interface PlayerInputs {
  characters: readonly CharacterRecord[];
  albums: readonly AlbumRecord[];
  tables: TableMap;
  sourceOrder: readonly string[];
  preset: PresetState;
  /** 单曲模式：角色 key → 固定的曲目 */
  pinned: Record<string, MusicEntry | undefined>;
  currentKey: string | null;
  seed: number;
  setCurrent: (key: string | null) => void;
  /** 环形推进（跳过临时禁用） */
  step: (direction: 1 | -1) => string | null;
}

export interface PlayerApi {
  entry: MusicEntry | null;
  url: string | null;
  sourceId: string | null;
  error: string | null;
  playback: PlaybackState;
  currentTime: number;
  duration: number;
  volume: number;
  setting: PlaybackSetting;
  setVolume: (value: number) => void;
  seek: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  setSetting: (patch: Partial<PlaybackSetting>) => void;
  reload: () => void;
}

export function usePlayer(inputs: PlayerInputs): PlayerApi {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bellRef = useRef<BellHandle | null>(null);
  /** 每次 `play` 一个令牌：铃响期间按了暂停/关了页面就不再自动起播 */
  const playTokenRef = useRef(0);
  const failedRef = useRef<Set<string>>(new Set());
  const timeoutRef = useRef<number | null>(null);
  const [version, setVersion] = useState(0);
  /** `error` 事件里要用来记"哪个源的哪首失败了" */
  const nowPlayingRef = useRef<{ sourceId: string; trackKey: string } | null>(null);

  const [playback, setPlayback] = useState<PlaybackState>("stopped");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [setting, setSettingState] = useState<PlaybackSetting>(DEFAULT_PLAYBACK_SETTING);
  const [resolved, setResolved] = useState<{ url: string; sourceId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const character = useMemo(
    () => inputs.characters.find((item) => item.key === inputs.currentKey) ?? null,
    [inputs.characters, inputs.currentKey],
  );

  /** 当前角色在本预设下选中的曲目：多首时按种子取一首（联机同种子 → 同曲目）。 */
  const entry = useMemo<MusicEntry | null>(() => {
    if (!character) return null;
    const pinned = inputs.pinned[character.key] ?? null;
    const { entries } = allowedTracks(inputs.preset, character, pinned);
    if (entries.length === 0) return null;
    if (entries.length === 1) return entries[0]!;
    const seedKey = inputs.seed + character.order * 7919;
    return pickWithSeed(entries, seedKey);
  }, [character, inputs.pinned, inputs.preset, inputs.seed]);

  // ---- 创建 <audio> 与铃（都不挂进 DOM 也能播） ----
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;
    const bell = createBell();
    bellRef.current = bell;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onPlaying = () => setPlayback("playing");
    const onPause = () => setPlayback((state) => (state === "timeoutPause" ? state : "stopped"));
    const onError = () => {
      // 运行时换源：把 (源, 曲目) 记入失败集合，再触发重新解析；
      // 候选耗尽后 resolveTrack 返回 null，界面给出可见错误（不再无限重试）。
      const playing = nowPlayingRef.current;
      if (playing) failedRef.current.add(`${playing.sourceId}\u0000${playing.trackKey}`);
      setVersion((value) => value + 1);
    };
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onDuration);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onDuration);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
      audio.pause();
      bell.dispose();
      bellRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // ---- 换歌：解析 URL ----
  // 调用方（React 组件）常常每次渲染都传新的数组/对象，所以这里只在**值真的变了**时更新 state，
  // 否则 setState → 重渲染 → 依赖变化 → 再 setState，会变成无限渲染。
  const applyResolved = useCallback((found: { url: string; sourceId: string } | null, message: string | null) => {
    setResolved((current) => {
      if (current === null && found === null) return current;
      if (current && found && current.url === found.url && current.sourceId === found.sourceId) return current;
      return found;
    });
    setError((current) => (current === message ? current : message));
  }, []);

  useEffect(() => {
    if (!entry) {
      applyResolved(null, character ? "当前预设下这个角色没有可用曲目" : null);
      return;
    }
    const [album, title] = entry;
    const found = resolveTrack(inputs.tables, inputs.sourceOrder, album, title, failedRef.current);
    if (!found) {
      applyResolved(null, `所有已启用的音源都取不到：${displayTitle(title)}`);
      return;
    }
    applyResolved(found, null);
  }, [entry, inputs.tables, inputs.sourceOrder, character, version, applyResolved]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !resolved) {
      nowPlayingRef.current = null;
      return;
    }
    nowPlayingRef.current = entry
      ? { sourceId: resolved.sourceId, trackKey: trackId(entry[0], entry[1]) }
      : null;
    audio.src = resolved.url;
    audio.load();
    setCurrentTime(0);
    if (setting.randomStart) {
      const applyRandomStart = () => {
        audio.currentTime = randomStartPosition(audio.duration, inputs.seed);
        audio.removeEventListener("loadedmetadata", applyRandomStart);
      };
      audio.addEventListener("loadedmetadata", applyRandomStart);
      return () => audio.removeEventListener("loadedmetadata", applyRandomStart);
    }
    return undefined;
  }, [resolved, entry, setting.randomStart, inputs.seed]);

  // ---- 播放时长到点自动暂停 ----
  useEffect(() => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    if (playback !== "playing" || setting.durationSeconds <= 0) return undefined;
    timeoutRef.current = window.setTimeout(() => {
      audioRef.current?.pause();
      setPlayback("timeoutPause");
    }, setting.durationSeconds * 1000);
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, [playback, setting.durationSeconds]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !resolved) return;
    const token = (playTokenRef.current += 1);
    const startMusic = () => {
      if (playTokenRef.current !== token) return; // 期间被暂停/卸载
      void audio.play().then(() => setPlayback("playing")).catch(() => setPlayback("stopped"));
    };
    if (setting.countdown) {
      setPlayback("countingDown");
      bellRef.current?.ring(startMusic);
      return;
    }
    startMusic();
  }, [resolved, setting.countdown]);

  const pause = useCallback(() => {
    playTokenRef.current += 1;
    bellRef.current?.stop();
    audioRef.current?.pause();
    setPlayback("stopped");
  }, []);

  const next = useCallback(() => {
    const key = inputs.step(1);
    if (key === null) return;
    playTokenRef.current += 1;
    bellRef.current?.stop();
    audioRef.current?.pause();
    inputs.setCurrent(key);
  }, [inputs]);

  const previous = useCallback(() => {
    const key = inputs.step(-1);
    if (key === null) return;
    playTokenRef.current += 1;
    bellRef.current?.stop();
    audioRef.current?.pause();
    inputs.setCurrent(key);
  }, [inputs]);

  const setVolume = useCallback((value: number) => {
    setVolumeState(Math.min(1, Math.max(0, value)));
  }, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setCurrentTime(seconds);
  }, []);

  const setSetting = useCallback((patch: Partial<PlaybackSetting>) => {
    setSettingState((current) => ({ ...current, ...patch }));
  }, []);

  const reload = useCallback(() => {
    failedRef.current.clear();
    setVersion((value) => value + 1);
  }, []);

  return {
    entry,
    url: resolved?.url ?? null,
    sourceId: resolved?.sourceId ?? null,
    error,
    playback,
    currentTime,
    duration,
    volume,
    setting,
    setVolume,
    seek,
    play,
    pause,
    next,
    previous,
    setSetting,
    reload,
  };
}

export { newSeed };
