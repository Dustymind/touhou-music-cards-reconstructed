/** 外观偏好：亮/暗模式 + 主题色（D152）。全局一份，逐键校验、非法值退回默认。 */
import { beforeEach, describe, expect, it } from "vitest";

import { useAppearance } from "./appearance";

describe("外观偏好", () => {
  beforeEach(() => {
    localStorage.clear();
    useAppearance.setState({ mode: "dark", primary: "" });
  });

  it("默认深色 + MD2 基准色（primary 空串 = 用主题给的基准色）", () => {
    const state = useAppearance.getState();
    expect(state.mode).toBe("dark");
    expect(state.primary).toBe("");
  });

  it("切模式与选主题色都会落盘（供刷新后恢复）", () => {
    useAppearance.getState().setMode("light");
    expect(useAppearance.getState().mode).toBe("light");
    expect(localStorage.getItem("tmc.v1.appearance")).toContain("\"light\"");

    useAppearance.getState().setPrimary("#2196F3");
    expect(useAppearance.getState().primary).toBe("#2196f3");      // 统一小写
    expect(localStorage.getItem("tmc.v1.appearance")).toContain("#2196f3");
  });

  it("「自动」也是一条合法偏好（跟随系统由 UI 层解析）", () => {
    useAppearance.getState().setMode("auto");
    expect(useAppearance.getState().mode).toBe("auto");
    expect(localStorage.getItem("tmc.v1.appearance")).toContain("\"auto\"");
  });

  it("非法颜色被忽略（不把界面搞成 undefined 色）", () => {
    useAppearance.getState().setPrimary("#4caf50");
    useAppearance.getState().setPrimary("not-a-color");
    expect(useAppearance.getState().primary).toBe("#4caf50");
  });

  it("恢复默认：清空自定义色但不动模式", () => {
    useAppearance.getState().setMode("light");
    useAppearance.getState().setPrimary("#ff9800");
    useAppearance.getState().resetPrimary();
    expect(useAppearance.getState().primary).toBe("");
    expect(useAppearance.getState().mode).toBe("light");
  });
});
