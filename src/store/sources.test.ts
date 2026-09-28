/** 音源开关与回退顺序（用户存档）：**按音乐模式分键**（契约 `docs/sources-separation-v1.md` §4）。 */
import { beforeEach, describe, expect, it } from "vitest";

import { defineStore } from "../persist";
import { useSession } from "./session";
import { effectiveOrder, sourceSpec, sourceStoreFor } from "./sources";

// 夹具：三源注册表。第三个用**合成 id**，免得真实音源一变这些用例就跟着红
// （真实注册表见 `data/sources/originals.toml`，现在只有 netease163 与 thbwiki 两个远程镜像）。
const ids = ["netease163", "mirror_b", "thbwiki"];
/** 注册表里的默认开关（各自的 toml 决定） */
const defaults: Record<string, boolean> = { netease163: true, mirror_b: true, thbwiki: true };

const originals = sourceStoreFor("originals");
const otomads = sourceStoreFor("otomads");

describe("effectiveOrder", () => {
  beforeEach(() => localStorage.clear());

  it("覆盖过的按 order 排前，未覆盖的保持注册顺序在后", () => {
    expect(effectiveOrder({}, ["a", "b", "c"])).toEqual(["a", "b", "c"]);
    expect(effectiveOrder(
      { c: { enabled: true, order: 1 }, a: { enabled: false, order: 2 } },
      ["a", "b", "c"],
    )).toEqual(["c", "a", "b"]);
  });
});

describe("音乐源顺序与开关（用户反馈后的回归）", () => {
  beforeEach(() => {
    localStorage.clear();
    useSession.setState({ musicMode: "originals" });
    originals.setState({ overrides: {} });
    otomads.setState({ overrides: {} });
  });

  it("开关某个源不会打乱已经排好的顺序", () => {
    const { move, toggle } = originals.getState();
    // 把 thbwiki 移到最前
    move("thbwiki", -1, ids, defaults);
    move("thbwiki", -1, ids, defaults);
    expect(effectiveOrder(originals.getState().overrides, ids))
      .toEqual(["thbwiki", "netease163", "mirror_b"]);

    // 现在关掉 mirror_b：顺序必须保持
    toggle("mirror_b", false, ids);
    const after = originals.getState().overrides;
    expect(effectiveOrder(after, ids)).toEqual(["thbwiki", "netease163", "mirror_b"]);
    expect(after.mirror_b!.enabled).toBe(false);
    // 位置不重复
    expect(new Set(Object.values(after).map((entry) => entry.order)).size).toBe(3);
  });

  it("重排不会把默认关闭的源打开", () => {
    // 用一份"本地源默认关"的注册表来验：重排时没覆盖过的源必须沿用默认开关
    const withLocal = [...ids, "local"];
    const localDefaults = { ...defaults, local: false };
    const { move } = originals.getState();
    move("thbwiki", -1, withLocal, localDefaults);
    const after = originals.getState().overrides;
    expect(after.local!.enabled).toBe(false);          // 仍是关的
    expect(after.local!.order).toBe(4);                // 只是位置信息
    expect(after.netease163!.enabled).toBe(true);
  });

  it("开关只改 enabled，不改 order", () => {
    const { move, toggle } = originals.getState();
    move("thbwiki", -1, ids, defaults);
    const before = originals.getState().overrides.thbwiki!.order;
    toggle("thbwiki", false, ids);
    expect(originals.getState().overrides.thbwiki!.order).toBe(before);
  });

  it("清理注册表里已经没有的源，留着的那几项开关与顺序原样保留", () => {
    // 用户排过序（thbwiki 最前）+ 关掉一个源，之后注册表里去掉了 mirror_b
    const { move, toggle, prune } = originals.getState();
    move("thbwiki", -1, ids, defaults);
    move("thbwiki", -1, ids, defaults);
    toggle("mirror_b", false, ids);
    const before = originals.getState().overrides;
    expect(before.thbwiki!.order).toBe(1);
    expect(before.mirror_b!.enabled).toBe(false);

    // 数据集里的注册表只剩两个源（音MAD 那份只有本地源 —— 与本条无关，用的是当前数据集的 id）
    const remaining = ["thbwiki", "netease163"];
    prune(remaining);
    const after = originals.getState().overrides;
    expect(Object.keys(after).sort()).toEqual([...remaining].sort());   // 只剩还在注册表里的
    expect(after.thbwiki).toEqual(before.thbwiki);          // 顺序原样
    expect(after.netease163).toEqual(before.netease163);    // 开关原样
  });

  it("清理只动当前模式那一把：音MAD 侧的存档不受影响", () => {
    const localOnly = { tmc_local: { enabled: true, order: 1 } };
    otomads.setState({ overrides: localOnly });
    originals.getState().toggle("netease163", false, ids);

    // 原曲那把按它的注册表清（没有音MAD 的本地源 —— 这正是"按注册表 id 清"的用法）
    originals.getState().prune(["thbwiki", "netease163"]);
    expect(otomads.getState().overrides).toEqual(localOnly);   // 另一模式原样
    expect(localStorage.getItem("tmc.v1.sources.otomads")).toBeNull();   // 也没被顺手写盘
  });

  it("没有死条目时不写盘（别的操作留下的存档不被无谓改写）", () => {
    const { toggle, prune } = originals.getState();
    toggle("netease163", false, ids);
    const saved = localStorage.getItem("tmc.v1.sources.originals");
    prune(ids);                                   // 注册表里全都在：无事可做
    expect(localStorage.getItem("tmc.v1.sources.originals")).toBe(saved);
  });

  it("清理落盘：死条目不再留在 localStorage 里", () => {
    const { toggle, prune } = originals.getState();
    toggle("netease163", false, ids);
    // 原样写一条"注册表里已经没有"的源：老存档从上一个数据版本带过来的那种
    const stale = { ...originals.getState().overrides, gone: { enabled: false, order: 9 } };
    originals.setState({ overrides: stale });
    defineStore(sourceSpec("originals")).save(stale);
    expect(localStorage.getItem("tmc.v1.sources.originals")).toContain("gone");

    prune(ids);
    expect(originals.getState().overrides.gone).toBeUndefined();
    // 落盘的那份也清了（下次启动 load() 读回来的就是干净的）—— 死条目不会复活
    const saved = JSON.parse(localStorage.getItem("tmc.v1.sources.originals")!) as
      { data: Record<string, unknown> };
    expect(saved.data.gone).toBeUndefined();
    expect(saved.data.netease163).toEqual({ enabled: false, order: 1 });
  });

  it("音源被移出注册表不会让 UI 编号跳号：编号只跟着注册表走", () => {
    // 订正 §四 那句"UI 编号跳号"：effectiveOrder 只遍历 allIds（= 注册表 id），
    // 覆盖表里多余的死条目既进不了顺序、也占不到编号
    const stale = {
      netease163: { enabled: true, order: 1 },
      mirror_b: { enabled: true, order: 2 },
      gone: { enabled: false, order: 3 },
    };
    const remaining = ["netease163", "mirror_b"];
    expect(effectiveOrder(stale, remaining)).toEqual(remaining);
    // 界面编号就是这个下标 + 1（SourceSection 的 order.map((id, index) => index + 1)）
    expect(effectiveOrder(stale, remaining).map((_id, index) => index + 1)).toEqual([1, 2]);
    // 排序同值也不跳号（死条目的 order 与在场项撞车时不会顶掉谁）
    const collided = { ...stale, gone: { enabled: false, order: 1 } };
    expect(effectiveOrder(collided, remaining)).toEqual(remaining);
  });

  it("两模式各记各的：原曲侧关掉一个源，音MAD 侧不受影响", () => {
    originals.getState().toggle("netease163", false, ids);
    expect(originals.getState().overrides.netease163!.enabled).toBe(false);
    expect(otomads.getState().overrides).toEqual({});
    // 落盘也是两把键
    expect(localStorage.getItem("tmc.v1.sources.originals")).toContain("netease163");
    expect(localStorage.getItem("tmc.v1.sources.otomads")).toBeNull();
  });
});

describe("老存档迁移（单键 → .originals）", () => {
  beforeEach(() => localStorage.clear());

  it("老键搬到 .originals，音MAD 从空表长起，老键不删", () => {
    localStorage.setItem("tmc.v1.sources", JSON.stringify({
      v: 1, data: { thbwiki: { enabled: false, order: 1 } },
    }));
    expect(defineStore(sourceSpec("originals")).load()).toEqual({ thbwiki: { enabled: false, order: 1 } });
    expect(localStorage.getItem("tmc.v1.sources.originals")).toContain("thbwiki");
    expect(localStorage.getItem("tmc.v1.sources")).toContain("thbwiki");     // 老键保留
    expect(defineStore(sourceSpec("otomads")).load()).toEqual({});           // 音MAD 是空表
  });
});
