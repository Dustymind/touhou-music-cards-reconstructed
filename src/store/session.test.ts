import { beforeEach, describe, expect, it } from "vitest";

import { CARD_RATIOS } from "../theme/cardRatio";
import { effectiveCustomSourceUrl, useSession } from "./session";

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

  it("第三个模式（custom）也能选中并落盘：`pickString(..., MUSIC_MODES)` 自动接受新值", () => {
    useSession.getState().setMusicMode("custom");
    expect(useSession.getState().musicMode).toBe("custom");
    const raw = Object.keys(localStorage).map((key) => localStorage.getItem(key) ?? "").join("|");
    expect(raw).toContain("custom");
  });
});

describe("卡面比例档位（模式 3 的「卡面设置」，D164）", () => {
  beforeEach(() => localStorage.clear());

  it("默认 16:9；切到 4:3 后落盘，重新读档能拿回来", () => {
    expect(useSession.getState().customCardRatio).toBe("16x9");
    useSession.getState().setCustomCardRatio("4x3");
    expect(useSession.getState().customCardRatio).toBe("4x3");
    const raw = Object.keys(localStorage).map((key) => localStorage.getItem(key) ?? "").join("|");
    expect(raw).toContain("4x3");
    // 落盘的是**逐字列在 `pickSession` 里**的字段（漏了就"能切、刷新就丢"）
    expect(raw).toContain("customCardRatio");
  });

  it("落盘的载荷里就是 `CARD_RATIOS` 里的那一档（读档时 `pickString(..., CARD_RATIOS)` 才认它）", () => {
    useSession.getState().setCustomCardRatio("4x3");
    const payload = Object.keys(localStorage)
      .map((key) => JSON.parse(localStorage.getItem(key) ?? "{}"))
      .find((item) => item?.data?.customCardRatio !== undefined);
    expect(payload.data.customCardRatio).toBe("4x3");
    expect(CARD_RATIOS).toContain(payload.data.customCardRatio);
  });
});

describe("自定义源链接（模式 3：默认空 / 重置 = 清空 / 覆盖不落盘）", () => {
  beforeEach(() => localStorage.clear());

  it("默认空；应用后落盘，重新读档能拿回来", () => {
    expect(useSession.getState().customSourceUrl).toBe("");
    useSession.getState().setCustomSourceUrl("https://cards.example.com");
    expect(effectiveCustomSourceUrl(useSession.getState())).toBe("https://cards.example.com");
    const raw = Object.keys(localStorage).map((key) => localStorage.getItem(key) ?? "").join("|");
    expect(raw).toContain("cards.example.com");
  });

  it("重置 = 写空串（不是「回默认值」：这个模式的默认值本来就是空）", () => {
    useSession.getState().setCustomSourceUrl("https://cards.example.com");
    useSession.getState().setCustomSourceUrl("");
    expect(useSession.getState().customSourceUrl).toBe("");
    expect(effectiveCustomSourceUrl(useSession.getState())).toBe("");
  });

  it("主机下发的源优先级最高，且**不写回存档**；离开房间即恢复自己的源（F3）", () => {
    useSession.getState().setCustomSourceUrl("https://mine.example.com");
    useSession.getState().adoptCustomSourceUrl("https://host.example.com");
    expect(effectiveCustomSourceUrl(useSession.getState())).toBe("https://host.example.com");
    // 存档**没被改写**（采用只在本次会话生效）
    expect(useSession.getState().customSourceUrl).toBe("https://mine.example.com");
    const raw = Object.keys(localStorage).map((key) => localStorage.getItem(key) ?? "").join("|");
    expect(raw).not.toContain("host.example.com");

    useSession.getState().clearHostCustomSource();
    expect(effectiveCustomSourceUrl(useSession.getState())).toBe("https://mine.example.com");
  });

  it("自己在设置页应用一个地址 ⇒ 会话级覆盖让位（用户刚亲手指定了地址）", () => {
    useSession.getState().adoptCustomSourceUrl("https://host.example.com");
    useSession.getState().setCustomSourceUrl("https://mine.example.com");
    expect(effectiveCustomSourceUrl(useSession.getState())).toBe("https://mine.example.com");
    expect(useSession.getState().customSourceOverride).toBeNull();
  });
});
