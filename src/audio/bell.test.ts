/** 铃声：现场合成 + "响铃结束再回调"的时序 + **上下文没跑起来时的补响规则**（D125）。
 *
 *  跑在真实浏览器里（vitest 浏览器模式）。要观察"没跑起来"这条分支，就用一个假的 `AudioContext`
 *  替掉真的 —— 它不发声，只记录排了几个振荡器、以及 `resume()` 什么时候落地。
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createBell } from "./bell";

/** 一声 = 4 个泛音振荡器（`PARTIALS` 的长度）。 */
const PARTIALS_PER_SOUND = 4;

/** 假 AudioContext：状态可控、只记振荡器数量。 */
function installFakeAudioContext(initial: AudioContextState = "suspended") {
  const state = { current: initial };
  const counts = { oscillators: 0, closes: 0 };
  let allowResume: (() => void) | null = null;

  const param = (): AudioParam => ({
    value: 0,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  }) as unknown as AudioParam;
  const connectable = () => ({ connect: () => undefined, disconnect: () => undefined });

  class FakeContext {
    get state(): AudioContextState { return state.current; }
    get currentTime(): number { return 0; }
    get destination(): AudioDestinationNode { return connectable() as unknown as AudioDestinationNode; }
    createGain(): GainNode { return { ...connectable(), gain: param() } as unknown as GainNode; }
    createOscillator(): OscillatorNode {
      counts.oscillators += 1;
      return { ...connectable(), type: "sine", frequency: param(), start: () => undefined, stop: () => undefined } as unknown as OscillatorNode;
    }
    resume(): Promise<void> {
      return new Promise<void>((resolve) => { allowResume = () => { state.current = "running"; resolve(); }; });
    }
    close(): Promise<void> { state.current = "closed"; counts.closes += 1; return Promise.resolve(); }
  }

  const w = window as unknown as { AudioContext?: unknown };
  const real = w.AudioContext;
  w.AudioContext = FakeContext as unknown;
  return {
    sounds: (): number => counts.oscillators / PARTIALS_PER_SOUND,
    closes: (): number => counts.closes,
    /** 让 `resume()` 落地：模拟浏览器终于允许出声。 */
    allow(): void { allowResume?.(); },
    restore(): void { w.AudioContext = real; },
  };
}

describe("createBell", () => {
  afterEach(() => vi.useRealTimers());

  it("pulse 不打断 ring 的回调（倒计时滴答不该吞掉「铃响完再起播」）", () => {
    vi.useFakeTimers();
    const probe = installFakeAudioContext("running");   // 发声走同步分支，这条只关心回调时序
    const bell = createBell();
    const done = vi.fn();
    try {
      bell.ring(done, 300);
      expect(done).not.toHaveBeenCalled();
      bell.pulse(60);                                  // 期间来一声滴答
      vi.advanceTimersByTime(299);
      expect(done).not.toHaveBeenCalled();              // 没被滴答提前、也没被取消
      vi.advanceTimersByTime(1);
      expect(done).toHaveBeenCalledTimes(1);
    } finally {
      bell.dispose();
      probe.restore();
    }
  });

  it("ring 仍然会顶掉上一次的回调（重复摇铃的既有语义不变）", () => {
    vi.useFakeTimers();
    const probe = installFakeAudioContext("running");
    const bell = createBell();
    const first = vi.fn();
    const second = vi.fn();
    try {
      bell.ring(first, 300);
      vi.advanceTimersByTime(100);
      bell.ring(second, 300);
      vi.advanceTimersByTime(250);                      // 越过第一声的 300ms
      expect(first).not.toHaveBeenCalled();
      expect(second).not.toHaveBeenCalled();
      vi.advanceTimersByTime(50);
      expect(second).toHaveBeenCalledTimes(1);
    } finally {
      bell.dispose();
      probe.restore();
    }
  });

  it("stop 打断回调且不触发它；dispose 放掉上下文（之后摇铃只是静音等待，不抛）", () => {
    vi.useFakeTimers();
    const probe = installFakeAudioContext("running");
    const bell = createBell();
    const done = vi.fn();
    try {
      bell.ring(done, 300);                             // 这一下把上下文建起来
      bell.stop();
      vi.advanceTimersByTime(1000);
      expect(done).not.toHaveBeenCalled();

      bell.dispose();
      expect(probe.closes()).toBe(1);
      expect(() => { bell.ring(vi.fn(), 300); bell.pulse(320); }).not.toThrow();
      vi.advanceTimersByTime(1000);
    } finally {
      probe.restore();
    }
  });

  it("上下文没跑起来时不排声音：几声不会堆在同一时刻，恢复后也不补放积压的", async () => {
    vi.useFakeTimers();
    const probe = installFakeAudioContext("suspended");
    const bell = createBell();
    try {
      bell.ring(undefined, 320);                        // 第 1 声
      expect(probe.sounds()).toBe(0);                   // 挂起时一个振荡器都不排（回归：以前排一堆）
      vi.advanceTimersByTime(1000);
      bell.pulse(320);                                  // 第 2 声
      vi.advanceTimersByTime(1000);
      bell.pulse(320);                                  // 第 3 声
      expect(probe.sounds()).toBe(0);

      vi.advanceTimersByTime(5000);                     // 5 秒后浏览器才允许出声
      probe.allow();
      await vi.advanceTimersByTimeAsync(0);
      expect(probe.sounds()).toBe(0);                   // 过期的一声都不补：不叠、也不在错的时间响
    } finally {
      bell.dispose();
      probe.restore();
    }
  });

  it("上下文很快恢复：这一声照样补上（不是一律静音）", async () => {
    vi.useFakeTimers();
    const probe = installFakeAudioContext("suspended");
    const bell = createBell();
    try {
      bell.pulse(320);
      expect(probe.sounds()).toBe(0);
      probe.allow();                                    // 没推进时间 → 还在补响窗内
      await vi.advanceTimersByTimeAsync(0);
      expect(probe.sounds()).toBe(1);
    } finally {
      bell.dispose();
      probe.restore();
    }
  });
});
