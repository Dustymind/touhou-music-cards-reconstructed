/** B：运行状态按音乐模式分键 —— 老存档迁移、两模式互不干扰、钩子跟着会话模式换表。
 *
 * 分键的目标（用户）：切模式不再互相污染 —— 预设 / 单曲手选 / 禁用角色 / 队列顺序 / 当前角色
 * 各归各的；老存档（单键 `tmc.v1.<name>`）归**原曲**。
 */
import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { create } from "zustand";

import { defineStore } from "../persist";
import { renderHook } from "../test-utils";
import type { MusicEntry } from "../data/types";
import type { MusicMode } from "../music/mode";
import type { PresetState } from "../music/selection";
import { makeModeStores } from "./modeScope";
import { presetSpec, presetStoreFor, usePreset } from "./preset";
import { queueSpec, queueStoreFor } from "./queue";
import { singleStoreFor, singleTrackSpec } from "./single";
import { useSession } from "./session";

const ALBUM = "東方紅魔郷 ～ the Embodiment of Scarlet Devil";
const PIN: MusicEntry = { id: "th06_03", album: ALBUM, title: "おてんば恋娘", extra: "角色曲" };

const preset = { originals: presetStoreFor("originals"), otomads: presetStoreFor("otomads") };
const single = { originals: singleStoreFor("originals"), otomads: singleStoreFor("otomads") };
const queue = { originals: queueStoreFor("originals"), otomads: queueStoreFor("otomads") };

const FRESH_PRESET: PresetState = {
  albums: {}, hifuu: {}, category: { 角色曲: "unset", 道中曲: "unset", 更多道中曲: "unset" },
};
const FRESH_SINGLE = { enabled: false, pins: {}, disabledCharacters: {} };
const FRESH_QUEUE = { order: [], temporaryDisabled: {}, currentKey: null };

/** `makeModeStores` 工厂的最小验证对象（用例在文件末尾）：四个真 store 用的就是这个工厂。 */
interface Probe {
  mode: MusicMode;
  hits: number;
  bump: () => void;
}
const probe = makeModeStores<Probe>((mode) => create<Probe>((set) => ({
  mode,
  hits: 0,
  bump: () => set((state) => ({ hits: state.hits + 1 })),
})));

beforeEach(() => {
  localStorage.clear();
  useSession.setState({ musicMode: "originals", entryRequest: null });
  preset.originals.setState(FRESH_PRESET);
  preset.otomads.setState(FRESH_PRESET);
  single.originals.setState(FRESH_SINGLE);
  single.otomads.setState(FRESH_SINGLE);
  queue.originals.setState(FRESH_QUEUE);
  queue.otomads.setState(FRESH_QUEUE);
  probe.storeFor("originals").setState({ hits: 0 });
  probe.storeFor("otomads").setState({ hits: 0 });
});

describe("老存档迁移（单键 → .originals）", () => {
  it("预设/单曲/队列的老键都搬到 .originals，音MAD 从默认值长起，老键不删", () => {
    localStorage.setItem("tmc.v1.preset", JSON.stringify({ v: 1, data: { ...FRESH_PRESET, albums: { [ALBUM]: false } } }));
    // 单曲那把是 v2（S4 起）：这条用例验的是**键名迁移**，不是 v1 元组 pin 的迁移（那在 single.test.ts）
    localStorage.setItem("tmc.v1.single-track", JSON.stringify({ v: 2, data: { ...FRESH_SINGLE, enabled: true, pins: { cirno: PIN } } }));
    localStorage.setItem("tmc.v1.queue", JSON.stringify({ v: 1, data: { ...FRESH_QUEUE, order: ["cirno"], currentKey: "cirno" } }));

    expect(defineStore(presetSpec("originals")).load().albums[ALBUM]).toBe(false);
    expect(defineStore(singleTrackSpec("originals")).load()).toMatchObject({ enabled: true, pins: { cirno: PIN } });
    expect(defineStore(queueSpec("originals")).load()).toMatchObject({ order: ["cirno"], currentKey: "cirno" });

    // 新键已经写好（下次不再搬），老键保留（回退旧版本还读得到）
    expect(localStorage.getItem("tmc.v1.preset.originals")).toContain(ALBUM);
    expect(localStorage.getItem("tmc.v1.single-track.originals")).toContain("cirno");
    expect(localStorage.getItem("tmc.v1.queue.originals")).toContain("cirno");
    expect(localStorage.getItem("tmc.v1.preset")).toContain(ALBUM);

    // 音MAD 那把没有老键可继承 → 默认值
    expect(defineStore(presetSpec("otomads")).load()).toEqual(FRESH_PRESET);
    expect(defineStore(singleTrackSpec("otomads")).load()).toEqual(FRESH_SINGLE);
    expect(defineStore(queueSpec("otomads")).load()).toEqual(FRESH_QUEUE);
  });

  it("新键已存在时不被老键覆盖", () => {
    localStorage.setItem("tmc.v1.preset.originals", JSON.stringify({ v: 1, data: { ...FRESH_PRESET, albums: { [ALBUM]: true } } }));
    localStorage.setItem("tmc.v1.preset", JSON.stringify({ v: 1, data: { ...FRESH_PRESET, albums: { [ALBUM]: false } } }));
    expect(defineStore(presetSpec("originals")).load().albums[ALBUM]).toBe(true);
  });
});

describe("两模式互不干扰", () => {
  it("原曲侧改预设 / 手选 / 禁用 / 队列，音MAD 侧一点不动", () => {
    preset.originals.getState().setAlbum(ALBUM, false);
    single.originals.getState().setPin("cirno", PIN);
    single.originals.getState().toggleCharacter("rumia");
    queue.originals.getState().syncKeys(["cirno", "rumia"]);

    expect(preset.otomads.getState().albums[ALBUM]).toBeUndefined();
    expect(single.otomads.getState().pins).toEqual({});
    expect(single.otomads.getState().disabledCharacters).toEqual({});
    expect(queue.otomads.getState().order).toEqual([]);

    // 落盘也是两把键（刷新后各还原各的）
    expect(localStorage.getItem("tmc.v1.single-track.originals")).toContain("cirno");
    expect(localStorage.getItem("tmc.v1.single-track.otomads")).toBeNull();
  });

  it("音MAD 侧改，反过来也不动原曲（手选同一个角色也不会串）", () => {
    single.originals.getState().setPin("cirno", PIN);
    single.otomads.getState().setPin("cirno", { id: "cirno_otomad_001", album: "otomads", title: "音MAD 一首", extra: "角色曲" });

    expect(single.originals.getState().pins.cirno?.title).toBe("おてんば恋娘");
    expect(single.otomads.getState().pins.cirno?.title).toBe("音MAD 一首");
  });
});

describe("列表页点播（entryRequest）不跨模式", () => {
  const OTOMAD: MusicEntry = { id: "cirno_otomad_001", album: "音MAD 专辑", title: "音MAD 一首", extra: "角色曲" };

  it("切音乐模式时清掉点播：旧请求指向另一个数据集的曲目，留着会把播放器带进死路", () => {
    useSession.getState().setEntryRequest({ key: "cirno", entry: PIN });
    expect(useSession.getState().entryRequest).toEqual({ key: "cirno", entry: PIN });

    useSession.getState().setMusicMode("otomads");
    expect(useSession.getState().entryRequest).toBeNull();
  });

  it("同一模式内重新设模式（值没变）不动点播：那是用户刚点的那一首", () => {
    useSession.getState().setEntryRequest({ key: "cirno", entry: OTOMAD });
    useSession.getState().setMusicMode("originals");
    expect(useSession.getState().entryRequest).toEqual({ key: "cirno", entry: OTOMAD });
  });
});

describe("makeModeStores 工厂（四个 store 共用的那点装配）", () => {
  it("两个模式各建一把：同一个模式每次拿到同一把，改一边不动另一边", () => {
    expect(probe.storeFor("originals")).not.toBe(probe.storeFor("otomads"));
    expect(probe.storeFor("originals")).toBe(probe.storeFor("originals"));

    probe.storeFor("originals").getState().bump();
    expect(probe.storeFor("originals").getState().hits).toBe(1);
    expect(probe.storeFor("otomads").getState().hits).toBe(0);
    expect(probe.storeFor("otomads").getState().mode).toBe("otomads");
  });

  it("currentStore / useStore 跟着会话模式换表：无参取整份，传选择器取那一段", async () => {
    useSession.setState({ musicMode: "originals" });
    expect(probe.currentStore()).toBe(probe.storeFor("originals"));

    const hook = await renderHook(() => ({
      whole: probe.useStore(), selector: probe.useStore((state) => state.mode),
    }));
    expect(hook.result.current.whole).toMatchObject({ mode: "originals", hits: 0 });
    expect(hook.result.current.selector).toBe("originals");

    // 切模式：钩子与 currentStore 一起换到另一把（不缓存"上一次的模式"）
    await act(async () => { useSession.getState().setMusicMode("otomads"); });
    await hook.rerender();
    expect(hook.result.current.whole.mode).toBe("otomads");
    expect(hook.result.current.selector).toBe("otomads");
    expect(probe.currentStore()).toBe(probe.storeFor("otomads"));
    // 卸载：挂着的钩子会订阅会话，下一次 `beforeEach` 改模式会在 act 之外触发它
    await hook.unmount();
  });
});

describe("钩子跟着会话模式换表", () => {
  it("usePreset 在切模式后读到另一把", async () => {
    preset.originals.getState().setAlbum("原曲专辑", true);
    preset.otomads.getState().setAlbum("音MAD专辑", true);

    const hook = await renderHook(() => usePreset((state) => state.albums));
    expect(hook.result.current).toEqual({ 原曲专辑: true });

    await act(async () => { useSession.getState().setMusicMode("otomads"); });
    await hook.rerender();
    expect(hook.result.current).toEqual({ 音MAD专辑: true });
  });
});
