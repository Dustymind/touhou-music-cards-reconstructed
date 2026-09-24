/** 播放层：解析当前曲目、切歌、倒计时、随机起播、播放时长与音量。
 *
 * 与上游的差别：
 * - 换歌 effect 的依赖里包含"音源表版本"，换源/加载完成后会重新解析（修上游换源不生效）；
 * - 取不到 URL 时给出可见错误，而不是 `src=""` 静默；
 * - 音频 `error` 事件会把 `(源, 曲目)` 记入失败集合并自动换下一个源。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createBell, type BellHandle } from "./bell";
import { FADE_STEP_MS, GAME_FADE_MS, rampGain } from "./fade";
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
  /** 每个源自己的响度表：sourceId → 表地址。没声明表的源不在里面（系数按 1 ✓，契约 D130） */
  loudnessUrls: Readonly<Record<string, string>>;
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
  /** 立刻起播这一首（不响铃）；曲目若还在解析，解析完自动起播。
   *  `fadeMs` > 0 时从 0 音量短淡入 —— **对局回合开始**用它（D127）；点播不传 = 原样硬起 ✓。 */
  playImmediate: (options?: { fadeMs?: number }) => void;
  /** 只响一声倒计时铃（会先停掉正曲）。对局倒计时用。 */
  ringBell: () => void;
  /** 倒计时用的短促一声（三声响用） */
  tick: () => void;
  /** 立刻暂停（用户按暂停的语义：马上、可预期）。 */
  pause: () => void;
  /** 短淡出后再暂停 —— **对局停播**用它（倒计时开始 / 停局 / 终局），音乐不是被硬切掉的（D127）。 */
  fadeOutPause: (options?: { fadeMs?: number }) => void;
  next: () => void;
  previous: () => void;
  setSetting: (patch: Partial<PlaybackSetting>) => void;
  reload: () => void;
}

/** 倒计时"滴答"时长（毫秒）：短促，三声之间不糊在一起。 */
const BELL_TICK_MS = 320;

/** 均衡系数：曲包曲目的清单标题就是磁盘文件名（`作者 - 曲名` ✓），其它源没有这张表 → 1 ✓
 *
 *  ⚠️ 这里**必须用第 4 位那个整串**（`entry[3]`，多作者时就是 `" & ".join(authors)`）：
 *  它是磁盘 stem、manifest 的匹配键与响度表的键。第 5 位（`authors`，D135）是给**显示**排序用的，
 *  拿它拼 key 会查不到响度表（而且换写法就会失配）。 */
export function gainKeyOf(entry: MusicEntry | null): string | null {
  if (!entry) return null;
  return entry[3] ? `${entry[3]} - ${entry[1]}` : entry[1];
}

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
  /** 正在跑的淡入/淡出包络的取消函数（D127） */
  const fadeStopRef = useRef<(() => void) | null>(null);
  /** 当前包络值（0..1）：乘在"用户音量 × 逐曲响度"之上 ✓ */
  const fadeGainRef = useRef(1);
  /** 这次"待起播"要不要淡入（曲目还在解析时，起播发生在加载 effect 里，得把意图带过去） */
  const pendingFadeMsRef = useRef(0);

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
  /** 逐曲音量均衡：每个源自己的表里是"文件名 → 衰减系数"（表由源的所有者生成，见数据仓库 tools/）。
   *  地址由输入给（`loudnessUrls`：AppShell 从当前数据集的 sources 里取 ✓）—— 只衰减不放大，
   *  让每首听感一样响，抢答才公平 ✓。表没拿到 / 源没有表 ⇒ 系数按 1 ✓（契约 D130）。 */
  const [gains, setGains] = useState<Record<string, { targetDb?: number; gains: Record<string, number> }>>({});
  /** 表地址的**内容**指纹：调用方每次渲染都新建对象也能稳住 effect（否则会反复重取、状态打转 ✗） */
  const loudnessUrlsRef = useRef(inputs.loudnessUrls);
  loudnessUrlsRef.current = inputs.loudnessUrls;
  const loudnessKey = JSON.stringify(inputs.loudnessUrls);
  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(loudnessUrlsRef.current);
    if (!entries.length) {
      setGains({});
      return () => { cancelled = true; };
    }
    Promise.all(entries.map(async ([sourceId, url]) => {
      try {
        const response = await fetch(url, { cache: "no-cache" });
        if (!response.ok) return [sourceId, null] as const;
        const payload = await response.json();
        return [sourceId, payload && typeof payload.gains === "object" ? payload : null] as const;
      } catch {
        return [sourceId, null] as const;   // 没有这张表（例如还没量过响度）就按原音量播 ✓
      }
    })).then((rows) => {
      if (cancelled) return;
      const next: Record<string, { targetDb?: number; gains: Record<string, number> }> = {};
      for (const [sourceId, payload] of rows) if (payload) next[sourceId] = payload;
      setGains(next);
    });
    return () => { cancelled = true; };
  }, [loudnessKey]);

  /** 按**解析到的那个源**自己的表衰减 ✓ —— 没表的源（三个镜像）保持原音量 ✓ */
  const gainOf = useCallback((target: MusicEntry | null): number => {
    const table = resolved ? gains[resolved.sourceId] : undefined;
    if (!table) return 1;
    const key = gainKeyOf(target);
    return (key && table.gains[key]) || 1;
  }, [gains, resolved]);

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

  // ---- 淡入淡出（D127）：包络**乘在**"用户音量 × 逐曲响度"之上，那条线一行没动 ✓ ----
  /** 目标音量：用户音量 × 逐曲响度系数（只衰减不放大 ✓）。 */
  const targetVolume = Math.min(1, volume * gainOf(entry));
  /** 目标音量的镜像：包络回调用它算"此刻该多大声"，于是回调不必闭包捕获旧音量 ✓。 */
  const targetVolumeRef = useRef(targetVolume);

  /** 落一次包络值：写进 `<audio>.volume`（0 = 静音但**不**暂停，暂停由调用方决定 ✓）。
   *  依赖全走 ref ⇒ 它恒定，起播/停播那几处闭包永远拿到最新音量与包络 ✓ */
  const applyFade = useCallback((gain: number): void => {
    fadeGainRef.current = gain;
    if (audioRef.current) audioRef.current.volume = targetVolumeRef.current * gain;
  }, []);

  const cancelFade = useCallback((): void => {
    fadeStopRef.current?.();
    fadeStopRef.current = null;
  }, []);

  /** 从 0 淡入到目标音量（对局回合开始用）。 */
  const fadeIn = useCallback((ms: number): void => {
    cancelFade();
    fadeStopRef.current = rampGain(0, 1, ms, applyFade);
  }, [applyFade, cancelFade]);

  /** 不淡入，直接回到目标音量（点播 / 用户起播用：原样硬起 ✓）。 */
  const fadeNone = useCallback((): void => {
    cancelFade();
    applyFade(1);
  }, [applyFade, cancelFade]);

  useEffect(() => {
    targetVolumeRef.current = targetVolume;
    if (audioRef.current) audioRef.current.volume = targetVolume * fadeGainRef.current;
  }, [targetVolume]);

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
      // 对局的"待起播"要淡入（D127）：意图由 playImmediate 带过来，这里才真正起播 ✓
      if (pendingFadeMsRef.current > 0) fadeIn(pendingFadeMsRef.current);
      else fadeNone();
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
    pendingFadeMsRef.current = 0;      // 用户起播：不淡入（铃）✓
    fadeNone();
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
  }, [fadeNone, resolved, setting.countdown]);

  /** 立刻起播（不响铃）。对局回合开始用：倒计时铃在 countdown 阶段已经响过。
   *  `fadeMs` > 0 = 从 0 短淡入（D127）：回合切换很频繁，硬起会"啪"一下 ✗。 */
  const playImmediate = useCallback((options?: { fadeMs?: number }) => {
    const audio = audioRef.current;
    if (!audio) return;
    const token = (playTokenRef.current += 1);
    pendingPlayRef.current = true;
    const fadeMs = options?.fadeMs ?? 0;
    pendingFadeMsRef.current = fadeMs;     // 曲目还在解析时，起播发生在加载 effect 里 ✓
    if (fadeMs > 0) fadeIn(fadeMs);
    else fadeNone();
    if (!resolved) return;
    setPlayback("playing");
    void audio.play().then(() => {
      if (playTokenRef.current === token) setPlayback("playing");
    }).catch(() => setPlayback("stopped"));
  }, [fadeIn, fadeNone, resolved]);

  /** 倒计时滴答：比换歌铃短，**只发声** —— 不占用"响铃结束再起播"那条时序（D125）。
   *  以前这里走 `ring()`，会把 `play()` 排好的 `startMusic` 回调一起 `clearTimer` 掉 ✗：
   *  倒计时的滴答与"换歌前响铃"撞上时，正曲会永远卡在 `countingDown` 不起播。 */
  const tick = useCallback(() => {
    bellRef.current?.pulse(BELL_TICK_MS);
  }, []);

  /** 只响铃：先停掉正曲，再响一声（铃声结束时不做任何事，由调用方决定何时起播）。 */
  const ringBell = useCallback(() => {
    playTokenRef.current += 1;
    pendingPlayRef.current = false;
    audioRef.current?.pause();
    setPlayback("countingDown");
    bellRef.current?.ring();
  }, []);

  /** 立刻暂停（用户按暂停）：不淡出 —— 用户要的是"马上停" ✓。 */
  const pause = useCallback(() => {
    playTokenRef.current += 1;
    pendingPlayRef.current = false;
    pendingFadeMsRef.current = 0;
    cancelFade();
    bellRef.current?.stop();
    audioRef.current?.pause();
    applyFade(1);      // 先停再复位包络：停的瞬间音量不跳，下一次起播也不会是哑的 ✓
    setPlayback("stopped");
  }, [applyFade, cancelFade]);

  /** 短淡出后再暂停（对局停播：倒计时开始 / 停局 / 终局）。D127
   *
   *  `setPlayback("stopped")` 立刻落地（界面不需要等这 200ms ✓），真正 `pause()` 在包络走完之后 ——
   *  期间若又起播（令牌变了）就**不按停**，否则会把新回合的曲子按掉 ✗。 */
  const fadeOutPause = useCallback((options?: { fadeMs?: number }) => {
    const audio = audioRef.current;
    const token = (playTokenRef.current += 1);
    pendingPlayRef.current = false;
    pendingFadeMsRef.current = 0;
    bellRef.current?.stop();
    setPlayback("stopped");
    if (!audio) return;
    const ms = options?.fadeMs ?? GAME_FADE_MS;
    if (ms <= 0) {
      cancelFade();
      audio.pause();
      applyFade(1);
      return;
    }
    cancelFade();
    fadeStopRef.current = rampGain(fadeGainRef.current, 0, ms, applyFade);
    window.setTimeout(() => {
      if (playTokenRef.current !== token) return;   // 期间又起播了：别把它按停
      cancelFade();
      applyFade(0);      // 兜底：节流/丢帧也保证"停之前已经静音"（不然会"啪"一下 ✗）
      audio.pause();
      applyFade(1);      // 包络复位：下一次起播（用户暂停后按播放）不会是哑的 ✓
    }, ms + FADE_STEP_MS);
  }, [applyFade, cancelFade]);

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
    fadeOutPause,
    next,
    previous,
    setSetting,
    reload,
  };
}
