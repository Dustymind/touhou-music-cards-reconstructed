/** 模式 3 的两把 store：落盘键、坏存档的收窄、以及与"另两个模式那套形状"的键隔离。
 *
 * 键隔离那条是**回归**用例：`makeModeStores()` 会为每个模式生成 `preset.custom` /
 * `single-track.custom`（模式 2 的形状），而这两个 store 是模式 3 的形状 —— 挤同一个键会互相清空，
 * 而且**不报错**（两边的校验器都只会把对方的字段读成空表）。
 */
import { beforeEach, describe, expect, it } from "vitest";

import { customPresetSpec, useCustomPreset, validateCustomPreset } from "./customPreset";
import { customSingleSpec, useCustomSingle, validateCustomSingle } from "./customSingle";
import { presetStoreFor } from "./preset";
import { singleStoreFor } from "./single";
import { useSession } from "./session";

/** 当前 localStorage 里所有键（用来断言"写到了哪一把键"）。 */
function keys(): string[] {
  return Object.keys(localStorage);
}

function raw(prefix: string): string {
  const key = keys().find((item) => item === prefix);
  return key ? localStorage.getItem(key) ?? "" : "";
}

const PRESET_KEY = "tmc.v1.custom-preset";
const SINGLE_KEY = "tmc.v1.custom-single-track";

describe("customPreset（专辑三元 + 作者三元）", () => {
  beforeEach(() => {
    localStorage.clear();
    useCustomPreset.setState({ albums: {}, authors: {} });
  });

  it("默认两维都空 = 全开；改一维后落盘，读档能拿回来", () => {
    expect(useCustomPreset.getState().albums).toEqual({});
    useCustomPreset.getState().setAlbumTri("旧作", "off");
    useCustomPreset.getState().setAuthorTri("甲", "on");

    const stored = JSON.parse(raw(PRESET_KEY)) as { v: number; data: unknown };
    expect(stored.v).toBe(1);
    expect(validateCustomPreset(stored.data)).toEqual({ albums: { 旧作: "off" }, authors: { 甲: "on" } });
  });

  it("`unset` 不落盘（缺省即 `unset`，不必把一堆空配置灌进存档）", () => {
    useCustomPreset.getState().setAlbumTri("旧作", "off");
    useCustomPreset.getState().setAlbumTri("旧作", "unset");
    expect(useCustomPreset.getState().albums).toEqual({ 旧作: "unset" });
    expect(raw(PRESET_KEY)).not.toContain("unset");
  });

  it("reset 回到「两维都没配置」= 全开", () => {
    useCustomPreset.getState().setAlbumTri("旧作", "off");
    useCustomPreset.getState().setAuthorTri("甲", "off");
    useCustomPreset.getState().reset();
    expect(useCustomPreset.getState().albums).toEqual({});
    expect(useCustomPreset.getState().authors).toEqual({});
  });

  it("坏存档收窄成空表（不炸、也不把垃圾带进内存）", () => {
    expect(validateCustomPreset(null)).toBeNull();
    expect(validateCustomPreset({ albums: { a: "maybe" }, authors: { b: 7 } })).toEqual({ albums: {}, authors: {} });
    expect(validateCustomPreset({ albums: { a: "on" } })).toEqual({ albums: { a: "on" }, authors: {} });
  });

  it("存档规格：键名是 `custom-preset`（**不是** `preset.custom` —— 那个键属于另两个模式那套形状）", () => {
    expect(customPresetSpec().name).toBe("custom-preset");
    expect(customPresetSpec().version).toBe(1);
    useCustomPreset.getState().setAlbumTri("旧作", "off");
    expect(keys()).toContain(PRESET_KEY);
    expect(keys()).not.toContain("tmc.v1.preset.custom");
  });

  it("**键隔离**：两把形状不同的表各写各的键，谁都不会把对方清空", () => {
    useCustomPreset.getState().setAlbumTri("旧作", "off");
    // 模式 2 形状的那把（模式 3 下队列与音源仍在用它那一套键）：sync 一份专辑进去
    presetStoreFor("custom").getState().sync(
      [{ key: "x", name: "旧作", kind: "other", pack: "custom", order: 1 }]);

    // 两把键都在，各自的内容都还能被**自己的**校验器读回来（挤同一个键时这里会读到空表）
    expect(keys()).toContain(PRESET_KEY);
    expect(keys()).toContain("tmc.v1.preset.custom");
    expect(validateCustomPreset(JSON.parse(raw(PRESET_KEY)).data))
      .toEqual({ albums: { 旧作: "off" }, authors: {} });
    expect(presetStoreFor("custom").getState().albums).toEqual({ 旧作: true });
  });
});

describe("customSingle（只有逐卡禁用）", () => {
  beforeEach(() => {
    localStorage.clear();
    useCustomSingle.setState({ disabled: {} });
    useSession.setState({ entryRequest: null });
  });

  it("没有总开关、没有手选：状态里只有 `disabled`", () => {
    expect(Object.keys(useCustomSingle.getState()).sort())
      .toEqual(["disabled", "prune", "toggle"].sort());
    expect(useCustomSingle.getState().disabled).toEqual({});
  });

  it("toggle 开关一张卡并落盘；再点一次取消", () => {
    useCustomSingle.getState().toggle("custom-爱丽丝");
    expect(useCustomSingle.getState().disabled).toEqual({ "custom-爱丽丝": true });
    const stored = JSON.parse(raw(SINGLE_KEY)) as { v: number; data: unknown };
    expect(stored.v).toBe(1);
    expect(validateCustomSingle(stored.data)).toEqual({ disabled: { "custom-爱丽丝": true } });

    useCustomSingle.getState().toggle("custom-爱丽丝");
    expect(useCustomSingle.getState().disabled).toEqual({});
  });

  it("禁用一张卡会清掉它那条列表页点播（否则点播会一直盖住「已禁用」，B2 的同一条）", () => {
    useSession.setState({ entryRequest: { key: "custom-爱丽丝", entry: ["旧作", "曲", "角色曲"] } });
    useCustomSingle.getState().toggle("custom-爱丽丝");
    expect(useSession.getState().entryRequest).toBeNull();
  });

  it("prune 清掉数据里已经没有的卡；没有死条目时不动 store、不写盘", () => {
    useCustomSingle.getState().toggle("custom-卡");
    localStorage.removeItem(SINGLE_KEY);                       // 假装这一轮还没写过盘
    // 卡还在 ⇒ 没有死条目 ⇒ 不写盘（Shell 里那个 effect 每次换模式都会调它）
    useCustomSingle.getState().prune(["custom-卡"]);
    expect(useCustomSingle.getState().disabled).toEqual({ "custom-卡": true });
    expect(keys()).not.toContain(SINGLE_KEY);

    // 卡没了 ⇒ 清掉并落盘
    useCustomSingle.getState().prune(["custom-别的卡"]);
    expect(useCustomSingle.getState().disabled).toEqual({});
    expect(keys()).toContain(SINGLE_KEY);
  });

  it("坏存档收窄成空表", () => {
    expect(validateCustomSingle(null)).toBeNull();
    expect(validateCustomSingle({ disabled: { a: false, b: true, c: "yes" } }))
      .toEqual({ disabled: { b: true } });
  });

  it("键名是 `custom-single-track`：与 `single-track.custom`（另两个模式那套）各写各的", () => {
    expect(customSingleSpec().name).toBe("custom-single-track");
    useCustomSingle.getState().toggle("custom-爱丽丝");
    singleStoreFor("custom").getState().toggleCharacter("alice");
    expect(keys()).toContain(SINGLE_KEY);
    expect(keys()).toContain("tmc.v1.single-track.custom");
    // 各自的内容互不污染
    expect(validateCustomSingle(JSON.parse(raw(SINGLE_KEY)).data))
      .toEqual({ disabled: { "custom-爱丽丝": true } });
    expect(singleStoreFor("custom").getState().disabledCharacters).toEqual({ alice: true });
  });
});
