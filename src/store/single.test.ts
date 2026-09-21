import { beforeEach, describe, expect, it } from "vitest";

import type { MusicEntry } from "../data/types";
import { defineStore } from "../persist";
import { singleStoreFor, singleTrackSpec } from "./single";

const fresh = { enabled: false, pins: {}, disabledCharacters: {} };

/** 固定用**原曲那把**（B：单曲模式状态按音乐模式分键）。 */
const useSingleTrack = singleStoreFor("originals");

describe("single track store", () => {
  beforeEach(() => {
    localStorage.clear();
    useSingleTrack.setState(fresh);
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
    useSingleTrack.getState().setPin("cirno", ["紅魔郷", "おてんば恋娘", "角色曲"]);
    expect(useSingleTrack.getState().pins.cirno?.[1]).toBe("おてんば恋娘");
    expect(useSingleTrack.getState().disabledCharacters.cirno).toBeUndefined();
  });

  it("清除手选", () => {
    useSingleTrack.getState().setPin("cirno", ["紅魔郷", "おてんば恋娘", "角色曲"]);
    useSingleTrack.getState().setPin("cirno", null);
    expect(useSingleTrack.getState().pins.cirno).toBeUndefined();
  });

  it("prune 清理已消失的角色", () => {
    useSingleTrack.getState().setPin("cirno", ["紅魔郷", "おてんば恋娘", "角色曲"]);
    useSingleTrack.getState().toggleCharacter("gone");
    useSingleTrack.getState().prune(["cirno"]);
    expect(useSingleTrack.getState().pins.gone).toBeUndefined();
    expect(useSingleTrack.getState().disabledCharacters.gone).toBeUndefined();
    expect(useSingleTrack.getState().pins.cirno).toBeDefined();
  });

  it("带作者的 4 元手选落盘后可完整读回（音MAD 侧手选刷新即丢的那条）", () => {
    // 音MAD 那批曲目基本都带作者（真数据 86 条里 85 条是 4 元），手选存进去的就是 4 元组
    const pin: MusicEntry = ["音MAD", "音MAD 一首", "角色曲", "作者"];
    const otomads = singleStoreFor("otomads");
    otomads.setState(fresh);
    otomads.getState().setPin("cirno", pin);

    const saved = JSON.parse(localStorage.getItem("tmc.v1.single-track.otomads")!) as
      { data: { pins: Record<string, MusicEntry> } };
    expect(saved.data.pins.cirno).toEqual(pin);

    // 刷新（重新读档）后仍然完整：作者留着，播放页那一行才显示得出作者
    expect(defineStore(singleTrackSpec("otomads")).load().pins.cirno).toEqual(pin);
  });

  it("损坏的存档逐项丢弃，合法项保留", () => {
    localStorage.setItem("tmc.v1.single-track.originals", JSON.stringify({
      v: 1,
      data: {
        enabled: true,
        pins: {
          good: ["紅魔郷", "おてんば恋娘", "角色曲"],
          withAuthor: ["紅魔郷", "おてんば恋娘", "角色曲", "作者"],
          bad: ["a"],
          worse: ["a", "b", "非法"],
          badAuthor: ["a", "b", "角色曲", 7],
        },
        disabledCharacters: { x: true, y: "no" },
      },
    }));
    const loaded = defineStore(singleTrackSpec("originals")).load();
    expect(loaded.enabled).toBe(true);
    expect(Object.keys(loaded.pins)).toEqual(["good", "withAuthor"]);
    expect(loaded.pins.withAuthor?.[3]).toBe("作者");
    expect(loaded.disabledCharacters).toEqual({ x: true });
  });

  it("整体不是对象时回落默认值", () => {
    localStorage.setItem("tmc.v1.single-track.originals", JSON.stringify({ v: 1, data: 42 }));
    expect(defineStore(singleTrackSpec("originals")).load()).toEqual(fresh);
  });
});
