import { beforeEach, describe, expect, it } from "vitest";

import type { MusicEntry } from "../data/types";
import { defineStore } from "../persist";
import { presetSpec } from "./preset";
import { installPinIndex, singleStoreFor, singleTrackSpec } from "./single";
import { useSession } from "./session";

const fresh = { enabled: false, pins: {}, disabledCharacters: {} };

/** 固定用**原曲那把**（B：单曲模式状态按音乐模式分键）。 */
const useSingleTrack = singleStoreFor("originals");

describe("single track store", () => {
  beforeEach(() => {
    localStorage.clear();
    useSingleTrack.setState(fresh);
    useSession.setState({ entryRequest: null });
  });

  it("开关落盘并可读回", () => {
    useSingleTrack.getState().setEnabled(true);
    const raw = localStorage.getItem("tmc.v1.single-track.originals");
    expect(raw).toContain('"enabled":true');
    expect(useSingleTrack.getState().enabled).toBe(true);
  });

  it("手选一曲后不再禁用该角色", () => {
    useSingleTrack.getState().toggleCharacter("cirno");
    expect(useSingleTrack.getState().disabledCharacters.cirno).toBe(true);
    useSingleTrack.getState().setPin("cirno", { id: "th06_03", album: "紅魔郷", title: "おてんば恋娘", extra: "角色曲" });
    expect(useSingleTrack.getState().pins.cirno?.title).toBe("おてんば恋娘");
    expect(useSingleTrack.getState().disabledCharacters.cirno).toBeUndefined();
  });

  it("清除手选", () => {
    useSingleTrack.getState().setPin("cirno", { id: "th06_03", album: "紅魔郷", title: "おてんば恋娘", extra: "角色曲" });
    useSingleTrack.getState().setPin("cirno", null);
    expect(useSingleTrack.getState().pins.cirno).toBeUndefined();
  });

  it("prune 清理已消失的角色", () => {
    useSingleTrack.getState().setPin("cirno", { id: "th06_03", album: "紅魔郷", title: "おてんば恋娘", extra: "角色曲" });
    useSingleTrack.getState().toggleCharacter("gone");
    useSingleTrack.getState().prune(["cirno"]);
    expect(useSingleTrack.getState().pins.gone).toBeUndefined();
    expect(useSingleTrack.getState().disabledCharacters.gone).toBeUndefined();
    expect(useSingleTrack.getState().pins.cirno).toBeDefined();
  });

  it("prune 没有死条目时不动 store、不写盘（与 sources.prune 同一口径）", () => {
    useSingleTrack.getState().setPin("cirno", { id: "th06_03", album: "紅魔郷", title: "おてんば恋娘", extra: "角色曲" });
    const pins = useSingleTrack.getState().pins;
    const disabled = useSingleTrack.getState().disabledCharacters;
    const saved = localStorage.getItem("tmc.v1.single-track.originals");

    // Shell 里那个 effect 每次换模式 / 每次列表点播都会调它 ⇒ 无事可做时不该换引用、也不该写盘
    useSingleTrack.getState().prune(["cirno", "reimu"]);

    expect(useSingleTrack.getState().pins).toBe(pins);                    // 同一引用 = 没 set
    expect(useSingleTrack.getState().disabledCharacters).toBe(disabled);
    expect(localStorage.getItem("tmc.v1.single-track.originals")).toBe(saved);
  });

  it("带作者的手选落盘后可完整读回（音MAD 侧手选刷新即丢的那条）", () => {
    // 音MAD 那批曲目基本都带作者，手选存进去的就是带 author 的对象
    const pin: MusicEntry = { id: "cirno_otomad_001", album: "音MAD", title: "音MAD 一首", extra: "角色曲", author: "作者" };
    const otomads = singleStoreFor("otomads");
    otomads.setState(fresh);
    otomads.getState().setPin("cirno", pin);

    const saved = JSON.parse(localStorage.getItem("tmc.v1.single-track.otomads")!) as
      { data: { pins: Record<string, MusicEntry> } };
    expect(saved.data.pins.cirno).toEqual(pin);

    // 刷新（重新读档）后仍然完整：作者留着，播放页那一行才显示得出作者
    expect(defineStore(singleTrackSpec("otomads")).load().pins.cirno).toEqual(pin);
  });

  it("手选/禁用同一角色时清掉列表页那条旧点播（否则手选被它盖住）", () => {
    const requested: MusicEntry = { id: "th06_03", album: "紅魔郷", title: "おてんば恋娘", extra: "角色曲" };
    const repicked: MusicEntry = { id: "th06_02", album: "紅魔郷", title: "ルーミアのテーマ", extra: "角色曲" };

    // 设置页手选：用户明确改的就是这个角色 → 旧点播必须让位，否则播放器还按旧的那首解析
    useSession.setState({ entryRequest: { key: "cirno", entry: requested } });
    useSingleTrack.getState().setPin("cirno", repicked);
    expect(useSession.getState().entryRequest).toBeNull();

    // 禁用同一个角色也一样（点播绕过"预设允许"这条判断，留着它就还会继续按点播解析）
    useSession.setState({ entryRequest: { key: "cirno", entry: requested } });
    useSingleTrack.getState().toggleCharacter("cirno");
    expect(useSession.getState().entryRequest).toBeNull();

    // 动的是别的角色：不碰这条点播（清掉会把正在播的那一首换掉）
    useSession.setState({ entryRequest: { key: "cirno", entry: requested } });
    useSingleTrack.getState().setPin("rumia", repicked);
    expect(useSession.getState().entryRequest).toEqual({ key: "cirno", entry: requested });
  });

  it("损坏的存档逐项丢弃，合法项保留（v2 走 validate 不走 migrate）", () => {
    localStorage.setItem("tmc.v1.single-track.originals", JSON.stringify({
      v: 2,
      data: {
        enabled: true,
        pins: {
          good: { id: "th06_03", album: "紅魔郷", title: "おてんば恋娘", extra: "角色曲" },
          withAuthor: { id: "cirno_otomad_001", album: "音MAD", title: "音MAD 一首", extra: "角色曲", author: "作者" },
          bad: ["a"],                       // 元组在 v2 里是坏形状：validate 直接丢（migrate 只认 v1）
          worse: ["a", "b", "非法"],
          badAuthor: { id: "x", album: "a", title: "b", extra: "角色曲", author: 7 },
        },
        disabledCharacters: { x: true, y: "no" },
      },
    }));
    const loaded = defineStore(singleTrackSpec("originals")).load();
    expect(loaded.enabled).toBe(true);
    expect(Object.keys(loaded.pins)).toEqual(["good", "withAuthor"]);
    expect(loaded.pins.withAuthor?.author).toBe("作者");
    expect(loaded.disabledCharacters).toEqual({ x: true });
  });

  it("整体不是对象时回落默认值", () => {
    localStorage.setItem("tmc.v1.single-track.originals", JSON.stringify({ v: 1, data: 42 }));
    expect(defineStore(singleTrackSpec("originals")).load()).toEqual(fresh);
  });
});

describe("v1 → v2 迁移（S4）", () => {
  const PIN_A: MusicEntry = { id: "th06_03", album: "紅魔郷", title: "おてんば恋娘", extra: "角色曲" };
  const PIN_B: MusicEntry = { id: "cirno_otomad_001", album: "音MAD", title: "音MAD 一首", extra: "角色曲", author: "作者" };

  const saveV1 = (pins: unknown): void => {
    localStorage.setItem("tmc.v1.single-track.originals", JSON.stringify({
      v: 1, data: { enabled: true, pins, disabledCharacters: { x: true } },
    }));
  };

  beforeEach(() => localStorage.clear());

  it("① v1 三元组 pins 正常迁移（查 TrackIndex 换成对象）", () => {
    installPinIndex([PIN_A, PIN_B]);
    saveV1({ cirno: ["紅魔郷", "おてんば恋娘", "角色曲"] });
    const loaded = defineStore(singleTrackSpec("originals")).load();
    expect(loaded.enabled).toBe(true);
    expect(loaded.pins.cirno).toEqual(PIN_A);
    expect(loaded.disabledCharacters).toEqual({ x: true });
  });

  it("② 查不到的 pin 被丢弃（不猜）", () => {
    installPinIndex([PIN_A]);
    saveV1({ cirno: ["紅魔郷", "おてんば恋娘", "角色曲"], gone: ["不存在", "没这首", "角色曲"] });
    const loaded = defineStore(singleTrackSpec("originals")).load();
    expect(Object.keys(loaded.pins)).toEqual(["cirno"]);
  });

  it("③ 坏数据逐项丢弃、不抛", () => {
    installPinIndex([PIN_A]);
    saveV1({ bad: ["a"], worse: 42, mixed: ["紅魔郷", "おてんば恋娘", "道中曲"] });  // extra 不一致也丢
    const loaded = defineStore(singleTrackSpec("originals")).load();
    expect(loaded).toEqual({ enabled: true, pins: {}, disabledCharacters: { x: true } });
  });

  it("④ v:2 走 validate 不走 migrate（元组在 v2 里是坏形状，逐项丢弃）", () => {
    installPinIndex([PIN_A]);
    localStorage.setItem("tmc.v1.single-track.originals", JSON.stringify({
      v: 2, data: { enabled: true, pins: { good: PIN_A, legacy: ["紅魔郷", "おてんば恋娘", "角色曲"] }, disabledCharacters: {} },
    }));
    const loaded = defineStore(singleTrackSpec("originals")).load();
    expect(loaded.pins).toEqual({ good: PIN_A });
  });

  it("⑤ 版本号没变的其它键读 v1 仍成功", () => {
    localStorage.setItem("tmc.v1.preset.originals", JSON.stringify({
      v: 1, data: { albums: { "紅魔郷": true }, hifuu: {}, category: {} },
    }));
    const loaded = defineStore(presetSpec("originals")).load();
    expect(loaded.albums["紅魔郷"]).toBe(true);
  });
});
