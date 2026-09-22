/** 播放层：解析当前曲目、切歌、倒计时、随机起播、播放时长与音量。
 *
 * 与上游的差别：
 * - 换歌 effect 的依赖里包含"音源表版本"，换源/加载完成后会重新解析（修上游换源不生效）；
 * - 取不到 URL 时给出可见错误，而不是 `src=""` 静默；
 * - 音频 `error` 事件会把 `(源, 曲目)` 记入失败集合并自动换下一个源。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createBell, type BellHandle } from "./bell";
import type { ModeDataset, MusicEntry } from "../data/types";
import { displayTitle, trackId } from "../data/types";
import { pickWithSeed, randomStartPosition } from "../rng";
import { allowedTracks, defaultPreset, type PresetState } from "../music/selection";
import { resolveTrack, type TableMap } from "../music/sources";

type PlaybackState = "stopped" | "countingDown" | "playing" | "timeoutPause";

interface PlaybackSetting {
  /** 播放位置随机（跳过最后 10 秒） */
  randomStart: boolean;
  /** 换歌前先响一声倒计时铃 */
  countdown: boolean;
  /** 播放多少秒后自动暂停；0 = 无限 */
  durationSeconds: number;
}

const DEFAULT_PLAYBACK_SETTING: PlaybackSetting = {
  randomStart: false,
  countdown: false,
  durationSeconds: 0,
};

export interface PlayerInputs {
  /** 当前模式的**数据集**（C：只含本模式的角色与曲目，不再按模式过滤） */
  dataset: ModeDataset;
  /** 逐曲音量均衡的系数表地址：与数据集同一个 `base`（`SharedData.loudnessUrl` ✓） */
  loudnessUrl: string;
  tables: TableMap;
  sourceOrder: readonly string[];
  preset: PresetState;
  /** 单曲模式：角色 key → 固定的曲目 */
  pinned: Record<string, MusicEntry | undefined>;
  /** 对局中：忽略"音乐预设"，候选 = 该角色在当前音乐模式下的**全部**曲目（用户要求：默认启用全曲库） */
  ignorePreset?: boolean;
  /** 本局已播曲目（trackId）：候选里排除掉，避免重复 ✓ */
  played?: readonly string[];
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

/** 均衡系数：曲包曲目的清单标题就是磁盘文件名（`作者 - 曲名` ✓），其它源没有这张表 → 1 ✓ */
export function gainKeyOf(entry: MusicEntry | null): string | null {
  if (!entry) return null;
  return entry[3] ? `${entry[3]} - ${entry[1]}` : entry[1];
}

/** 本地曲库的源 id（`data/sources/otomads.toml` 里那条 `kind = "local"`，契约 sources-separation-v1.md） */
const LOCAL_SOURCE_ID = "local";

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
    () => inputs.dataset.characters.find((item) => item.key === inputs.currentKey) ?? null,
    [inputs.dataset.characters, inputs.currentKey],
  );

  /** 当前角色在本预设下选中的曲目：多首时按种子取一首（联机同种子 → 同曲目）。 */
  /** 逐曲音量均衡：`<base>/loudness.json` 里是"文件名 → 衰减系数"（见 tools/measure_loudness.py）。
   *  地址由输入给（`loudnessUrl` = 数据集那一份 `base` ✓）—— 原来是写死的 `./data/loudness.json`，
   *  按**文档地址**解析 ✗，base 一变（子目录部署 / 文档比应用根深）就取不到表、静默按 1 播 ✗。
   *  只衰减不放大 ✓ —— 让每首听感一样响，抢答才公平 ✓。表拿到之前系数按 1 处理 ✓。 */
  const [gains, setGains] = useState<{ targetDb?: number; gains: Record<string, number> }>({ gains: {} });
  useEffect(() => {
    let cancelled = false;
    fetch(inputs.loudnessUrl, { cache: "no-cache" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!cancelled && payload && typeof payload.gains === "object") setGains(payload);
      })
      .catch(() => undefined);            // 没有这张表（例如没跑过测量脚本）就按原音量播 ✓
    return () => { cancelled = true; };
  }, [inputs.loudnessUrl]);

  /** 只对**本地曲库**（音MAD 那批）生效 ✓ —— 别的镜像源没有这张表，也不该被改音量 ✓ */
  const gainOf = useCallback((target: MusicEntry | null): number => {
    if (resolved?.sourceId !== LOCAL_SOURCE_ID) return 1;
    const key = gainKeyOf(target);
    return (key && gains.gains[key]) || 1;
  }, [gains, resolved?.sourceId]);

  const entry = useMemo<MusicEntry | null>(() => {
    if (!character) return null;
    const pinned = inputs.pinned[character.key] ?? null;
    // 对局中忽略预设（= 全曲库 ✓）；播放页仍按预设过滤 ✓。音乐模式两者都生效 ✓
    const preset = inputs.ignorePreset ? defaultPreset(inputs.dataset.albums) : inputs.preset;
    const { entries } = allowedTracks(preset, character, pinned);
    if (entries.length === 0) return null;
    if (entries.length === 1) return entries[0]!;
    // 已播过的不再选（全播过就允许重复，否则这个角色没得放 ✗）
    const played = new Set(inputs.played ?? []);
    const fresh = entries.filter((entry) => !played.has(trackId(entry[0], entry[1])));
    const pool = fresh.length > 0 ? fresh : entries;
    // 由 (会话种子, 角色) 派生：不同角色落到不同曲目，而同一角色在两端的取舍完全一致（D104）
    return pickWithSeed(pool, inputs.seed, "track", character.key);
  }, [character, inputs.pinned, inputs.preset, inputs.dataset, inputs.seed,
      inputs.ignorePreset, inputs.played]);

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
    if (audioRef.current) audioRef.current.volume = Math.min(1, volume * gainOf(entry));
  }, [volume, entry, gainOf]);

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
      // 起播位置由 (会话种子, 曲目) 派生：同一首歌每次都落在同一处，不同歌各自不同（D104）
      const trackKey = entry ? trackId(entry[0], entry[1]) : "";
      const applyRandomStart = () => {
        audio.currentTime = randomStartPosition(audio.duration, inputs.seed, trackKey);
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
