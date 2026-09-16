import { describe, expect, it } from "vitest";

import { Localization, getLocale, resolveInitialLocale, setLocale, t } from "./localization";

describe("localization", () => {
  it("?locale 优先于浏览器语言", () => {
    expect(resolveInitialLocale("?locale=zh", "en-US")).toBe("zh");
    expect(resolveInitialLocale("?locale=en", "zh-CN")).toBe("en");
    expect(resolveInitialLocale("?locale=fr", "zh-CN")).toBe("zh");
    expect(resolveInitialLocale("", "zh-Hans")).toBe("zh");
    expect(resolveInitialLocale("", "de")).toBe("en");
  });

  it("切语言后取对应文案并替换占位符", () => {
    setLocale("zh");
    expect(getLocale()).toBe("zh");
    expect(t(Localization.ConfigTabSourceLoaded, { count: "5" })).toBe("已载入 5 首");
    setLocale("en");
    expect(t(Localization.ConfigTabSourceLoaded, { count: "5" })).toBe("Loaded 5 tracks");
  });

  it("文案表 en/zh 都非空", () => {
    for (const [key, value] of Object.entries(Localization)) {
      expect(value.en.length, key).toBeGreaterThan(0);
      expect(value.zh.length, key).toBeGreaterThan(0);
    }
  });
});
