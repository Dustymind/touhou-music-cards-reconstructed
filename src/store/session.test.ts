import { beforeEach, describe, expect, it } from "vitest";

import { effectiveOrder, useSession } from "./session";

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
  const ids = ["netease163", "cloudflare_r2", "thbwiki", "local"];
  /** 注册表：「本地曲库」默认关闭 */
  const defaults: Record<string, boolean> = {
    netease163: true, cloudflare_r2: true, thbwiki: true, local: false,
  };

  beforeEach(() => {
    localStorage.clear();
    useSession.setState({ sourceOverrides: {} });
  });

  it("开关某个源不会打乱已经排好的顺序", () => {
    const { moveSource, toggleSource } = useSession.getState();
    // 把 local 移到最前
    moveSource("local", -1, ids, defaults);
    moveSource("local", -1, ids, defaults);
    moveSource("local", -1, ids, defaults);
    expect(effectiveOrder(useSession.getState().sourceOverrides, ids))
      .toEqual(["local", "netease163", "cloudflare_r2", "thbwiki"]);

    // 现在关掉 thbwiki：顺序必须保持
    toggleSource("thbwiki", false, ids);
    const after = useSession.getState().sourceOverrides;
    expect(effectiveOrder(after, ids)).toEqual(["local", "netease163", "cloudflare_r2", "thbwiki"]);
    expect(after.thbwiki!.enabled).toBe(false);
    // 位置不重复
    expect(new Set(Object.values(after).map((entry) => entry.order)).size).toBe(4);
  });

  it("重排不会把默认关闭的源打开", () => {
    const { moveSource } = useSession.getState();
    moveSource("thbwiki", -1, ids, defaults);
    const after = useSession.getState().sourceOverrides;
    expect(after.local!.enabled).toBe(false);          // 仍是关的
    expect(after.local!.order).toBe(4);                // 只是位置信息
    expect(after.netease163!.enabled).toBe(true);
  });

  it("开关只改 enabled，不改 order", () => {
    const { toggleSource, moveSource } = useSession.getState();
    moveSource("thbwiki", -1, ids, defaults);
    const before = useSession.getState().sourceOverrides.thbwiki!.order;
    toggleSource("thbwiki", false, ids);
    expect(useSession.getState().sourceOverrides.thbwiki!.order).toBe(before);
  });
});

describe("音乐模式持久化", () => {
  beforeEach(() => localStorage.clear());

  it("默认原曲；切换后落盘，重新读档能拿回来", () => {
    expect(useSession.getState().musicMode).toBe("originals");
    useSession.getState().setMusicMode("otomads");
    expect(useSession.getState().musicMode).toBe("otomads");
    // 落盘键名由 persist.ts 统一生成
    const raw = Object.keys(localStorage).map((key) => localStorage.getItem(key) ?? "").join("|");
    expect(raw).toContain("otomads");
  });
});
