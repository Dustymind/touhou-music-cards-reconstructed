import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AlbumRecord, CharacterRecord, ModeDataset } from "../data/types";
import { defaultPreset } from "../music/selection";
import { buildEntries, type TableMap } from "../music/sources";
import { BELL_DURATION_MS } from "./bell";
import { GAME_FADE_MS } from "./fade";
import { gainKeyOf } from "./usePlayer";
import { fakeTables, installFakeAudio, loadRealBundle, renderHook, type FakeAudio } from "../test-utils";
import { usePlayer, type PlayerInputs } from "./usePlayer";
/** C：播放器现在收"当前模式的数据集"（只含本模式曲目），测试自己拼一份最小数据集。 */
function fakeDataset(characters: CharacterRecord[], albums: AlbumRecord[]): ModeDataset {
  return {
    mode: "originals",
    index: { schema: 1, mode: "originals", contentHash: "fake-hash-1234", counts: { characters: characters.length, albums: albums.length, trackEntries: 0, distinctTracks: 0 } },
    characters, albums, sources: [],
    characterByKey: new Map(characters.map((character) => [character.key, character])),
    albumByName: new Map(albums.map((album) => [album.name, album])),
  };
}

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
    dataset: fakeDataset([cirno, marisa], albums),
    tables: fakeTables([[["紅魔郷", "おてんば恋娘"], ["紅魔郷", "恋色マスタースパーク"], ["紅魔郷", "オリエンタルダークフライト"]]]),
    sourceOrder: ["fake"],
    // 系数表的地址由调用方给（AppShell 传 `bundle.shared.loudnessUrl` ✓）：单测里就指真实那张表
    loudnessUrl: "/data/loudness.json",
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

  it("tick 撞上「换歌前的铃」也不吞掉起播（回归：正曲曾永远卡在 countingDown）", async () => {
    vi.useFakeTimers();
    const hook = await renderHook(() => usePlayer(inputs()));
    await vi.waitFor(() => expect(hook.result.current.url).not.toBeNull());
    hook.result.current.setSetting({ countdown: true });   // 玩家开了"换歌前先响铃"
    await hook.rerender();
    hook.result.current.play();                            // ▶：排一条 1100ms 的铃，铃后起播
    await hook.rerender();
    expect(hook.result.current.playback).toBe("countingDown");

    await vi.advanceTimersByTimeAsync(1000);
    hook.result.current.tick();                            // 倒计时第 1 秒的滴答落进这条铃的窗口里
    await hook.rerender();
    expect(hook.result.current.playback).toBe("countingDown");   // 铃还没响完，正曲不抢跑

    await vi.advanceTimersByTimeAsync(BELL_DURATION_MS - 1000 + 20);
    await hook.rerender();
    expect(audios[0]!.paused).toBe(false);                 // 铃响完照样起播
    expect(hook.result.current.playback).toBe("playing");
  });

  it("对局起播：短淡入（0 → 目标音量）；点播不传 fadeMs 就是硬起", async () => {
    vi.useFakeTimers();
    const hook = await renderHook(() => usePlayer(inputs()));
    await vi.waitFor(() => expect(hook.result.current.url).not.toBeNull());
    hook.result.current.setVolume(0.5);
    await hook.rerender();
    expect(audios[0]!.volume).toBe(0.5);                 // 目标音量 = 用户音量 × 逐曲响度

    hook.result.current.playImmediate({ fadeMs: GAME_FADE_MS });
    await hook.rerender();
    expect(audios[0]!.volume).toBe(0);                   // 淡入的起点：静音起播（不"啪"一下）
    await vi.advanceTimersByTimeAsync(GAME_FADE_MS / 2);
    expect(audios[0]!.volume).toBeGreaterThan(0);
    expect(audios[0]!.volume).toBeLessThan(0.5);
    await vi.advanceTimersByTimeAsync(GAME_FADE_MS);
    expect(audios[0]!.volume).toBeCloseTo(0.5, 5);       // 走到目标音量
    expect(audios[0]!.paused).toBe(false);

    hook.result.current.pause();
    await hook.rerender();
    hook.result.current.playImmediate();                 // 点播：不淡入
    await hook.rerender();
    expect(audios[0]!.volume).toBe(0.5);                 // 直接就是目标音量
    expect(audios[0]!.paused).toBe(false);
  });

  it("对局停播：短淡出之后才暂停，停完包络复位（下次起播不是哑的）", async () => {
    vi.useFakeTimers();
    const hook = await renderHook(() => usePlayer(inputs()));
    await vi.waitFor(() => expect(hook.result.current.url).not.toBeNull());
    hook.result.current.playImmediate({ fadeMs: GAME_FADE_MS });
    await vi.advanceTimersByTimeAsync(GAME_FADE_MS + 30);
    await hook.rerender();
    expect(audios[0]!.volume).toBe(1);

    hook.result.current.fadeOutPause();
    await hook.rerender();
    expect(hook.result.current.playback).toBe("stopped");   // 界面立刻是"停了"
    expect(audios[0]!.paused).toBe(false);                  // 但声音还在淡出，没有硬切
    await vi.advanceTimersByTimeAsync(GAME_FADE_MS / 2);
    expect(audios[0]!.volume).toBeLessThan(1);
    expect(audios[0]!.volume).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(GAME_FADE_MS);
    expect(audios[0]!.paused).toBe(true);                   // 淡完才真的停
    expect(audios[0]!.volume).toBe(1);                      // 包络复位

    hook.result.current.playImmediate();
    await hook.rerender();
    expect(audios[0]!.volume).toBe(1);                      // 下次起播音量是满的
    expect(audios[0]!.paused).toBe(false);
  });

  it("淡出还没走完就又起播：不会被按停（回合切换不打架）", async () => {
    vi.useFakeTimers();
    const hook = await renderHook(() => usePlayer(inputs()));
    await vi.waitFor(() => expect(hook.result.current.url).not.toBeNull());
    hook.result.current.playImmediate({ fadeMs: GAME_FADE_MS });
    await vi.advanceTimersByTimeAsync(GAME_FADE_MS + 30);

    hook.result.current.fadeOutPause();
    await vi.advanceTimersByTimeAsync(GAME_FADE_MS / 2);
    hook.result.current.playImmediate({ fadeMs: GAME_FADE_MS });   // 又进回合了
    await vi.advanceTimersByTimeAsync(GAME_FADE_MS * 3);
    await hook.rerender();
    expect(audios[0]!.paused).toBe(false);                  // 淡出的定时器不许把新回合按掉
    expect(audios[0]!.volume).toBe(1);
  });

  it("用户按暂停仍是立即停（不淡出、不延迟）", async () => {
    const hook = await renderHook(() => usePlayer(inputs()));
    await vi.waitFor(() => expect(hook.result.current.url).not.toBeNull());
    hook.result.current.playImmediate({ fadeMs: GAME_FADE_MS });
    await hook.rerender();
    hook.result.current.pause();
    await hook.rerender();
    expect(audios[0]!.paused).toBe(true);                   // 马上停
    expect(hook.result.current.playback).toBe("stopped");
    expect(audios[0]!.volume).toBe(1);                      // 包络复位
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

describe("逐曲音量均衡（方案 A，只对本地音MAD 生效）", () => {
  let audios: FakeAudio[];
  beforeEach(() => {
    audios = installFakeAudio();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("曲包曲目用「作者 - 曲名」查系数（= 磁盘文件名），其它源用曲名", () => {
    expect(gainKeyOf(["otomads", "普通肥猫魔法使", "角色曲", "川先僧"])).toBe("川先僧 - 普通肥猫魔法使");
    expect(gainKeyOf(["東方永夜抄 ～ Imperishable Night", "恋色マスタースパーク", "角色曲"])).toBe("恋色マスタースパーク");
    expect(gainKeyOf(null)).toBeNull();
  });

  it("系数表按输入里的地址取，只落在本地曲库那首的 volume 上", async () => {
    // 表在**数据集的 base** 下（§6.4）：播放层拿表的地址只能来自 `loudnessUrl` 这个输入，
    // 原来写死的 `./data/loudness.json` 是按文档地址解析的 —— base 一变就取不到表（静默按 1 播 ✗）
    const asked: string[] = [];
    const realFetch = globalThis.fetch.bind(globalThis);
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.includes("loudness")) return realFetch(input as RequestInfo, init);
      asked.push(url);
      if (url !== "/sub/dir/loudness.json") return new Response("missing", { status: 404 });
      return new Response(JSON.stringify({ targetDb: -14, gains: { "川先僧 - 普通肥猫魔法使": 0.5 } }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch);

    const otomadAlbum: AlbumRecord[] = [{ key: "otomads", name: "otomads", kind: "other", pack: "otomads", order: 100 }];
    const otomad: CharacterRecord = {
      key: "cirno", name: "チルノ", order: 1, card: ["c.png"], searchNames: ["チルノ"],
      music: [["otomads", "普通肥猫魔法使", "角色曲", "川先僧"]],
    };
    const localTables = {
      local: { id: "local", status: "ready" as const, entries: buildEntries([["otomads", "普通肥猫魔法使", "https://fake/otomad.mp3"]]) },
    };
    const hook = await renderHook(() => usePlayer(inputs({
      dataset: fakeDataset([otomad], otomadAlbum),
      tables: localTables,
      sourceOrder: ["local"],
      preset: defaultPreset(otomadAlbum),
      loudnessUrl: "/sub/dir/loudness.json",
    })));

    await vi.waitFor(() => expect(audios[0]!.volume).toBe(0.5));
    expect(asked).toEqual(["/sub/dir/loudness.json"]);
    expect(hook.result.current.sourceId).toBe("local");
  });

  it("真表的键形状与系数范围（地址取 bundle 里那一份）", async () => {
    // 用真实的 loudness.json 校验键的形状：键都是「作者 - 曲名」
    // （浏览器模式下 `public/` 由 Vite 服务，直接取，不读盘）
    // 地址从 bundle 来：与数据集同一个 base，播放层拿到的就是它 ✓
    const bundle = await loadRealBundle();
    const table = (await (await fetch(bundle.shared.loudnessUrl)).json()) as { gains: Record<string, number> };
    const keys = Object.keys(table.gains);
    expect(keys.length).toBeGreaterThan(50);
    // 键就是磁盘文件名：多数是「作者 - 曲名」✓，但也有本来就只写曲名的 ✓，所以不强求分隔符
    expect(keys.some((key) => key.includes(" - "))).toBe(true);
    expect(Object.values(table.gains).every((g) => g > 0 && g <= 1)).toBe(true);
  });
});
