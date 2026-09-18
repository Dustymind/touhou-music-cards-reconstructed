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
import type { MusicMode } from "../music/mode";
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
  /** 音乐模式（原曲 / 音MAD）：只抽当前模式下可用的曲目 */
  mode: MusicMode;
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
  /** 立刻起播这一首（不响铃）；曲目若还在解析，解析完自动起播。对局里用。 */
  playImmediate: () => void;
  /** 只响一声倒计时铃（会先停掉正曲）。对局倒计时用。 */
  ringBell: () => void;
  /** 倒计时用的短促一声（三声响用） */
  tick: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  setSetting: (patch: Partial<PlaybackSetting>) => void;
  reload: () => void;
}

/** 倒计时"滴答"时长（毫秒）：短促，三声之间不糊在一起。 */
const BELL_TICK_MS = 320;

export function usePlayer(inputs: PlayerInputs): PlayerApi {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bellRef = useRef<BellHandle | null>(null);
  /** 每次 `play` 一个令牌：铃响期间按了暂停/关了页面就不再自动起播 */
  const playTokenRef = useRef(0);
  /** 换歌后是否要接着放（上游 `handleAudioLoadedData` 的语义：Playing/TimeoutPause 时自动续播） */
  const pendingPlayRef = useRef(false);
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
    // 音乐模式过滤：音MAD 模式下对局只会抽到音MAD 曲目（v2 的 f9305f5 同一件事）
    const { entries } = allowedTracks(inputs.preset, character, pinned, inputs.albums, inputs.mode);
    if (entries.length === 0) return null;
    if (entries.length === 1) return entries[0]!;
    const seedKey = inputs.seed + character.order * 7919;
    return pickWithSeed(entries, seedKey);
  }, [character, inputs.pinned, inputs.preset, inputs.albums, inputs.mode, inputs.seed]);

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
    if (pendingPlayRef.current) {
      // 曲目在解析中就点了播放/对局进入回合：等这一首挂上再起播
      const token = playTokenRef.current;
      void audio.play().then(() => {
        if (playTokenRef.current === token) setPlayback("playing");
      }).catch(() => setPlayback("stopped"));
    }
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

  /** 切歌：保留"正在播"的意愿（上游切歌后会继续播；暂停状态下切歌保持暂停）。 */
  const switchTrack = useCallback((key: string) => {
    const wasPlaying = pendingPlayRef.current
      || playback === "playing" || playback === "timeoutPause";
    playTokenRef.current += 1;
    pendingPlayRef.current = wasPlaying;
    bellRef.current?.stop();
    audioRef.current?.pause();
    inputs.setCurrent(key);
  }, [inputs, playback]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const token = (playTokenRef.current += 1);
    pendingPlayRef.current = true;
    if (!resolved) return; // 解析完由加载 effect 起播
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

  /** 立刻起播（不响铃）。对局回合开始用：倒计时铃在 countdown 阶段已经响过。 */
  const playImmediate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const token = (playTokenRef.current += 1);
    pendingPlayRef.current = true;
    if (!resolved) return;
    setPlayback("playing");
    void audio.play().then(() => {
      if (playTokenRef.current === token) setPlayback("playing");
    }).catch(() => setPlayback("stopped"));
  }, [resolved]);

  /** 只响铃：先停掉正曲，再响一声（铃声结束时不做任何事，由调用方决定何时起播）。 */
  /** 倒计时滴答：比换歌铃短，且不打断"响铃结束再起播"的时序（倒计时结束时才 ringBell） */
  const tick = useCallback(() => {
    bellRef.current?.ring(undefined, BELL_TICK_MS);
  }, []);

  const ringBell = useCallback(() => {
    playTokenRef.current += 1;
    pendingPlayRef.current = false;
    audioRef.current?.pause();
    setPlayback("countingDown");
    bellRef.current?.ring();
  }, []);

  const pause = useCallback(() => {
    playTokenRef.current += 1;
    pendingPlayRef.current = false;
    bellRef.current?.stop();
    audioRef.current?.pause();
    setPlayback("stopped");
  }, []);

  const next = useCallback(() => {
    const key = inputs.step(1);
    if (key === null) return;
    switchTrack(key);
  }, [inputs, switchTrack]);

  const previous = useCallback(() => {
    const key = inputs.step(-1);
    if (key === null) return;
    switchTrack(key);
  }, [inputs, switchTrack]);

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
    playImmediate,
    ringBell,
    tick,
    pause,
    next,
    previous,
    setSetting,
    reload,
  };
}

export { newSeed };
