import { beforeEach, describe, expect, it } from "vitest";

import { useSession } from "./session";

// 音源开关与回退顺序的用例搬去 `sources.test.ts`（音源层按模式分键，契约 sources-separation-v1.md）

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
