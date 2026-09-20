import { beforeEach, describe, expect, it } from "vitest";

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

  it("损坏的存档逐项丢弃，合法项保留", () => {
    localStorage.setItem("tmc.v1.single-track.originals", JSON.stringify({
      v: 1,
      data: {
        enabled: true,
        pins: { good: ["紅魔郷", "おてんば恋娘", "角色曲"], bad: ["a"], worse: ["a", "b", "非法"] },
        disabledCharacters: { x: true, y: "no" },
      },
    }));
    const loaded = defineStore(singleTrackSpec("originals")).load();
    expect(loaded.enabled).toBe(true);
    expect(Object.keys(loaded.pins)).toEqual(["good"]);
    expect(loaded.disabledCharacters).toEqual({ x: true });
  });

  it("整体不是对象时回落默认值", () => {
    localStorage.setItem("tmc.v1.single-track.originals", JSON.stringify({ v: 1, data: 42 }));
    expect(defineStore(singleTrackSpec("originals")).load()).toEqual(fresh);
  });
});
