import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AlbumRecord, CharacterRecord } from "../data/types";
import { defaultPreset } from "../music/selection";
import { buildEntries, type TableMap } from "../music/sources";
import { BELL_DURATION_MS } from "./bell";
import { fakeTables, installFakeAudio, renderHook, type FakeAudio } from "../test-utils";
import { usePlayer, type PlayerInputs } from "./usePlayer";

const albums: AlbumRecord[] = [{ key: "th06", name: "紅魔郷", kind: "game", pack: "originals", order: 1 }];
const cirno: CharacterRecord = {
  key: "cirno", name: "チルノ", order: 1, card: ["c.png"], searchNames: ["チルノ"],
  music: [["紅魔郷", "おてんば恋娘", "角色曲"]],
};
const marisa: CharacterRecord = {
  key: "kirisame-marisa", name: "霧雨魔理沙", order: 2, card: ["m.png"], searchNames: ["霧雨魔理沙"],
  music: [
    ["紅魔郷", "恋色マスタースパーク", "角色曲"],
    ["紅魔郷", "オリエンタルダークフライト", "角色曲"],
  ],
};

function inputs(overrides: Partial<PlayerInputs> = {}): PlayerInputs {
  return {
    characters: [cirno, marisa],
    albums,
    tables: fakeTables([[["紅魔郷", "おてんば恋娘"], ["紅魔郷", "恋色マスタースパーク"], ["紅魔郷", "オリエンタルダークフライト"]]]),
    sourceOrder: ["fake"],
    mode: "originals",
    preset: defaultPreset(albums),
    pinned: {},
    currentKey: "cirno",
    seed: 42,
    setCurrent: vi.fn(),
    step: vi.fn(() => null),
    ...overrides,
  };
}

describe("usePlayer", () => {
  let audios: FakeAudio[];
  beforeEach(() => {
    audios = installFakeAudio();
    localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it("解析出 URL 并写进 audio.src", async () => {
    const hook = await renderHook(() => usePlayer(inputs()));
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.sourceId).toBe("fake");
    expect(decodeURIComponent(hook.result.current.url ?? "")).toContain("おてんば恋娘");
    expect(decodeURIComponent(audios[0]!.src)).toContain("おてんば恋娘");
  });

  it("所有源都取不到时给出可读错误", async () => {
    const hook = await renderHook(() => usePlayer(inputs({ tables: fakeTables([]) })));
    expect(hook.result.current.url).toBeNull();
    expect(hook.result.current.error).toContain("取不到");
  });

  it("多曲目按种子稳定选一首（同种子 → 同曲目）", async () => {
    const a = await renderHook(() => usePlayer(inputs({ currentKey: "kirisame-marisa", seed: 7 })));
    const first = a.result.current.entry?.[1];
    const b = await renderHook(() => usePlayer(inputs({ currentKey: "kirisame-marisa", seed: 7 })));
    expect(b.result.current.entry?.[1]).toBe(first);
  });

  it("播放时长到点自动暂停", async () => {
    vi.useFakeTimers();
    const hook = await renderHook(() => usePlayer(inputs()));
    await vi.waitFor(() => expect(hook.result.current.url).not.toBeNull());
    hook.result.current.setSetting({ durationSeconds: 1 });
    await hook.rerender();
    hook.result.current.play();
    await hook.rerender();
    expect(hook.result.current.playback).toBe("playing");
    await vi.advanceTimersByTimeAsync(1100);
    expect(audios[0]!.paused).toBe(true);
  });

  it("开启倒计时时先响铃再播正曲（铃是现场合成，仓库里没有二进制铃声）", async () => {
    vi.useFakeTimers();
    const hook = await renderHook(() => usePlayer(inputs()));
    await vi.waitFor(() => expect(hook.result.current.url).not.toBeNull());
    hook.result.current.setSetting({ countdown: true });
    await hook.rerender();
    hook.result.current.play();
    await hook.rerender();
    expect(hook.result.current.playback).toBe("countingDown");
    expect(audios).toHaveLength(1);              // 只有一个 <audio>：正曲
    expect(audios[0]!.paused).toBe(true);        // 铃还没响完，正曲不抢跑
    await vi.advanceTimersByTimeAsync(BELL_DURATION_MS + 20);
    await hook.rerender();
    expect(audios[0]!.paused).toBe(false);
    expect(hook.result.current.playback).toBe("playing");
  });

  it("铃响期间按暂停，正曲不会偷偷起播", async () => {
    vi.useFakeTimers();
    const hook = await renderHook(() => usePlayer(inputs()));
    await vi.waitFor(() => expect(hook.result.current.url).not.toBeNull());
    hook.result.current.setSetting({ countdown: true });
    await hook.rerender();
    hook.result.current.play();
    await hook.rerender();
    hook.result.current.pause();
    await vi.advanceTimersByTimeAsync(BELL_DURATION_MS + 20);
    await hook.rerender();
    expect(audios[0]!.paused).toBe(true);
    expect(hook.result.current.playback).toBe("stopped");
  });

  it("playImmediate：不响铃直接起播（对局回合开始用）", async () => {
    const hook = await renderHook(() => usePlayer(inputs()));
    await vi.waitFor(() => expect(hook.result.current.url).not.toBeNull());
    hook.result.current.setSetting({ countdown: true });   // 即使玩家开了倒计时也不该再响铃
    await hook.rerender();
    hook.result.current.playImmediate();
    await hook.rerender();
    expect(audios[0]!.paused).toBe(false);
    expect(hook.result.current.playback).toBe("playing");
  });

  it("ringBell：只响铃，不停在正曲上（对局倒计时用）", async () => {
    const hook = await renderHook(() => usePlayer(inputs()));
    await vi.waitFor(() => expect(hook.result.current.url).not.toBeNull());
    hook.result.current.playImmediate();
    await hook.rerender();
    expect(audios[0]!.paused).toBe(false);

    hook.result.current.ringBell();
    await hook.rerender();
    expect(hook.result.current.playback).toBe("countingDown");
    expect(audios[0]!.paused).toBe(true);

    // 铃响完不会自己起播：起播时机由对局决定
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, BELL_DURATION_MS + 50));
    });
    await hook.rerender();
    expect(audios[0]!.paused).toBe(true);
  });

  it("tick：倒计时用的短促一声，不改变播放状态（三声响靠连调三次）", async () => {
    const hook = await renderHook(() => usePlayer(inputs()));
    await vi.waitFor(() => expect(hook.result.current.url).not.toBeNull());
    hook.result.current.playImmediate();
    await hook.rerender();
    const before = hook.result.current.playback;

    for (let index = 0; index < 3; index += 1) hook.result.current.tick();
    await hook.rerender();
    // 滴答只是提示音，不打断正曲、也不进入 countingDown（那是换歌前的长铃）
    expect(hook.result.current.playback).toBe(before);
    expect(audios[0]!.paused).toBe(false);
  });

  it("切歌时保留播放意愿：正在播就接着播，暂停状态切歌保持暂停", async () => {
    let current = "cirno";
    const step = vi.fn(() => "kirisame-marisa");
    const setCurrent = vi.fn((key: string | null) => { current = key ?? current; });
    const hook = await renderHook(() => usePlayer(inputs({ currentKey: current, step, setCurrent })));
    await vi.waitFor(() => expect(hook.result.current.url).not.toBeNull());
    hook.result.current.playImmediate();
    await hook.rerender();
    expect(audios[0]!.paused).toBe(false);

    await act(async () => { hook.result.current.next(); });
    // 两次 rerender：第一次选曲、第二次把新 URL 挂到 audio 上
    await hook.rerender();
    await hook.rerender();
    expect(setCurrent).toHaveBeenCalledWith("kirisame-marisa");
    expect(audios[0]!.paused).toBe(false);                    // 换歌后继续播

    hook.result.current.pause();
    await hook.rerender();
    expect(audios[0]!.paused).toBe(true);
  });

  it("step 返回 null 时不切换角色", async () => {
    const setCurrent = vi.fn();
    const hook = await renderHook(() => usePlayer(inputs({ setCurrent, step: () => null })));
    hook.result.current.next();
    expect(setCurrent).not.toHaveBeenCalled();
  });

  it("step 给出新 key 时切歌", async () => {
    const setCurrent = vi.fn();
    const hook = await renderHook(() => usePlayer(inputs({ setCurrent, step: () => "kirisame-marisa" })));
    hook.result.current.next();
    expect(setCurrent).toHaveBeenCalledWith("kirisame-marisa");
  });

  it("单曲模式固定曲目优先于随机", async () => {
    const pinned = { cirno: ["紅魔郷", "おてんば恋娘", "角色曲"] as const };
    const hook = await renderHook(() => usePlayer(inputs({
      pinned: { cirno: [...pinned.cirno] as CharacterRecord["music"][number] },
    })));
    expect(hook.result.current.entry?.[1]).toBe("おてんば恋娘");
  });

  it("播放失败时自动换到下一个源（运行时回退）", async () => {
    const rows = [["紅魔郷", "おてんば恋娘", "https://first/1.mp3"]];
    const tables = {
      s1: { id: "s1", status: "ready" as const, entries: buildEntries(rows) },
      s2: { id: "s2", status: "ready" as const, entries: buildEntries([["紅魔郷", "おてんば恋娘", "https://second/1.mp3"]]) },
    };
    const hook = await renderHook(() => usePlayer(inputs({ tables, sourceOrder: ["s1", "s2"] })));
    expect(hook.result.current.sourceId).toBe("s1");
    await act(async () => {
      audios[0]!.dispatchEvent(new Event("error"));
    });
    await hook.rerender();
    expect(hook.result.current.sourceId).toBe("s2");
    expect(audios[0]!.src).toContain("second");
  });

  it("候选源都失败后给出可见错误", async () => {
    const rows = [["紅魔郷", "おてんば恋娘", "https://only/1.mp3"]];
    const tables = { s1: { id: "s1", status: "ready" as const, entries: buildEntries(rows) } };
    const hook = await renderHook(() => usePlayer(inputs({ tables, sourceOrder: ["s1"] })));
    await act(async () => {
      audios[0]!.dispatchEvent(new Event("error"));
    });
    await hook.rerender();
    expect(hook.result.current.url).toBeNull();
    expect(hook.result.current.error).toContain("取不到");
  });

  it("音源表为空但角色有曲目 → 报错而不是静默", async () => {
    const hook = await renderHook(() => usePlayer(inputs({ tables: {} as TableMap })));
    expect(hook.result.current.error).toContain("取不到");
  });
});
