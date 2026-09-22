/** 换歌前的倒计时铃声。
 *
 * 上游用的是仓库里的二进制 `Bell3.mp3`；重建版**不搬运上游的二进制素材**（授权不明），
 * 改成用 Web Audio 现场合成一个音色接近的"叮"：一组非谐泛音 + 指数衰减。
 * 环境不支持 Web Audio（jsdom、老浏览器、无音频设备）时退化成**静音等待**，
 * 计时长度一致，所以"先响铃、再放正曲"的时序在任何环境下都成立。
 */

/** 铃声长度（毫秒）。正曲在这之后再起播。 */
export const BELL_DURATION_MS = 1100;

export interface BellHandle {
  /** 摇一次铃；铃声结束（或被 `stop` 打断）后回调一次。重复调用会打断上一次。
   *  `durationMs` 可覆盖时长：倒计时的三声"滴答"比换歌铃短。 */
  ring: (onDone?: () => void, durationMs?: number) => void;
  /** 只发声，**不碰**"响铃结束再回调"那条时序（对局倒计时的三声滴答用它）。
   *  与 `ring` 的唯一区别：`ring` 会把上一次排好的回调顶掉，`pulse` 不会（D125）。 */
  pulse: (durationMs?: number) => void;
  /** 打断当前铃声（不触发回调）。 */
  stop: () => void;
  /** 释放 AudioContext。 */
  dispose: () => void;
}

type AudioContextCtor = new () => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const candidate = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return candidate.AudioContext ?? candidate.webkitAudioContext ?? null;
}

/** 铃声的泛音结构：`[相对基频的倍数, 音量, 相对衰减时长]`。 */
const PARTIALS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0.6, 1],
  [2.02, 0.32, 0.75],
  [2.78, 0.18, 0.5],
  [4.1, 0.08, 0.3],
];

const BASE_FREQUENCY = 1318.5; // E6，清脆但不刺耳

/** 上下文"恢复后补响"的时间窗（毫秒）。
 *
 * 上下文没跑起来时（自动播放策略 / 切后台 / 设备被中断）`currentTime` **不前进**，照它排声音会把
 * 好几声堆在同一个冻结时刻，等真正恢复的那一刻一起炸出来 —— 实测三声滴答叠成峰值 2.24 的削波爆音 ✗。
 * 所以这里改成：先请 `resume()`，恢复了再排；补的时候已经过了这个窗就**丢掉** ——
 * 宁可不响，也不在错的时间响（D125）。 */
const RESUME_CATCH_UP_MS = 150;

function synthesize(context: AudioContext, durationSeconds: number): void {
  const start = context.currentTime;
  const master = context.createGain();
  master.gain.value = 0.7;
  master.connect(context.destination);
  for (const [ratio, peak, decay] of PARTIALS) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(BASE_FREQUENCY * ratio, start);
    const end = start + durationSeconds * decay;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(peak, start + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }
  // master 用完即弃：振荡器 stop 后 graph 会自然被回收
  void master;
}

export function createBell(durationMs = BELL_DURATION_MS): BellHandle {
  let context: AudioContext | null = null;
  let timer: number | null = null;
  let pending: (() => void) | null = null;
  /** 发声请求的代数：只有**最新**那一次请求才允许补响 —— 否则恢复时会把积压的几声一起放出来 ✗。 */
  let generation = 0;

  const clearTimer = (): void => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    pending = null;
  };

  /** 发声（不管回调那一摊）：上下文跑着就直接排；没跑起来就等它跑起来再补，过期就丢。 */
  const sound = (lengthMs: number): void => {
    const Ctor = audioContextCtor();
    if (Ctor === null) return; // 静音等待
    const mine = (generation += 1);
    try {
      context ??= new Ctor();
    } catch {
      return; // 音频设备不可用等情况：保持静音，时序不变
    }
    const audio = context;
    if (audio.state === "running") {
      synthesize(audio, lengthMs / 1000);
      return;
    }
    const askedAt = Date.now();
    void audio.resume().then(() => {
      if (mine !== generation) return;                       // 已经被更新的一声顶掉
      if (audio.state !== "running") return;                 // 还是没跑起来
      if (Date.now() - askedAt > RESUME_CATCH_UP_MS) return;  // 过期：不补响
      synthesize(audio, lengthMs / 1000);
    }).catch(() => undefined);
  };

  return {
    ring(onDone, overrideMs) {
      clearTimer();
      pending = onDone ?? null;
      const length = Math.max(60, overrideMs ?? durationMs);
      timer = window.setTimeout(() => {
        const done = pending;
        clearTimer();
        done?.();
      }, length);
      sound(length);
    },
    pulse(overrideMs) {
      sound(Math.max(60, overrideMs ?? durationMs));
    },
    stop() {
      clearTimer();
      generation += 1; // 还没发声（或在等 resume）的那一声也一并作废
    },
    dispose() {
      clearTimer();
      generation += 1;
      const closing = context;
      context = null;
      if (closing !== null) void closing.close().catch(() => undefined);
    },
  };
}
