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
  /** 摇一次铃；铃声结束（或被 `stop` 打断）后回调一次。重复调用会打断上一次。 */
  ring: (onDone?: () => void) => void;
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

  const clearTimer = (): void => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    pending = null;
  };

  return {
    ring(onDone) {
      clearTimer();
      pending = onDone ?? null;
      timer = window.setTimeout(() => {
        const done = pending;
        clearTimer();
        done?.();
      }, durationMs);

      const Ctor = audioContextCtor();
      if (Ctor === null) return; // 静音等待
      try {
        context ??= new Ctor();
        if (context.state === "suspended") void context.resume();
        synthesize(context, durationMs / 1000);
      } catch {
        // 音频设备不可用等情况：保持静音，时序不变
      }
    },
    stop() {
      clearTimer();
    },
    dispose() {
      clearTimer();
      const closing = context;
      context = null;
      if (closing !== null) void closing.close().catch(() => undefined);
    },
  };
}
