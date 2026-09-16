/** 配置页交互：秘封父复选框是批量控制、三态开关、单曲模式（真实数据 + 真实 store）。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";

import type { DataBundle } from "../../../data/types";
import { loadRealBundle, renderHook } from "../../../test-utils";
import { usePreset } from "../../../store/preset";
import { useSession } from "../../../store/session";
import { useSingleTrack } from "../../../store/single";
import { ConfigPanel } from "../ConfigPanel";

let bundle: DataBundle;

async function renderPanel(): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ConfigPanel bundle={bundle} tables={{}} />);
  });
  return { container, root };
}

function input(container: HTMLElement, label: string): HTMLInputElement {
  const element = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!element) throw new Error(`找不到输入：${label}`);
  return element;
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function toggle(element: HTMLInputElement): Promise<void> {
  await act(async () => {
    element.click();
  });
}

describe("ConfigPanel", () => {
  beforeEach(async () => {
    localStorage.clear();
    bundle = await loadRealBundle();
    usePreset.setState({
      albums: {}, hifuu: {},
      category: { 角色曲: "unset", 道中曲: "unset", 更多道中曲: "unset" },
    });
    useSingleTrack.setState({ enabled: false, pins: {}, disabledCharacters: {} });
    useSession.setState({ locale: "en", tab: "config", cardCollection: "dairi-sd", sourceOverrides: {} });
    usePreset.getState().sync(bundle.albums);
  });

  it("渲染统计、秘封组、三态开关与 CD / 官作分组", async () => {
    const { container } = await renderPanel();
    const text = container.textContent ?? "";
    expect(text).toContain("357");                    // 可用/全库
    expect(text).toContain("Hifuu tracks");
    expect(text).toContain("Official games");
    expect(text).toContain("蓬莱人形 ～ Dolls in Pseudo Paradise");
    expect(text).toContain("東方錦上京 ～ Fossilized Wonders");   // CD/官作最后一格
  });

  it("秘封父复选框是批量控制（取消 → 12 张子项全取消；父项显示态派生）", async () => {
    const { container } = await renderPanel();
    const parent = input(container, "hifuu-parent");
    expect(parent.checked).toBe(true);
    await toggle(parent);
    const state = usePreset.getState();
    expect(Object.values(state.hifuu).every((value) => value === false)).toBe(true);
    expect(input(container, "hifuu-parent").checked).toBe(false);

    // 只勾回一张 → 父项半选
    await toggle(input(container, "hifuu-hr01"));
    // MUI 用 aria-checked="mixed" + data-indeterminate 表达半选（DOM 的 indeterminate 属性不暴露）
    expect(input(container, "hifuu-parent").getAttribute("aria-checked")).toBe("mixed");
    expect(usePreset.getState().hifuu["蓬莱人形 ～ Dolls in Pseudo Paradise"]).toBe(true);
  });

  it("三态开关写入预设，并且统计随之变化", async () => {
    const { container } = await renderPanel();
    const before = usePreset.getState();
    expect(before.category.角色曲).toBe("unset");
    await click(container.querySelector('[data-testid="tri-角色曲-off"]')!);
    expect(usePreset.getState().category.角色曲).toBe("off");
    // 221 条角色曲被否决 → 可用数下降（357 - 221 = 136）
    const stats = container.querySelector('[data-testid="preset-stats"]')!.textContent ?? "";
    expect(stats).toContain("136 / 357");
  });

  it("取消一张官作专辑只影响它自己的曲目", async () => {
    const { container } = await renderPanel();
    await toggle(input(container, "album-th20"));
    expect(usePreset.getState().albums["東方錦上京 ～ Fossilized Wonders"]).toBe(false);
    const stats = container.querySelector('[data-testid="preset-stats"]')!.textContent ?? "";
    expect(stats).toContain("343 / 357");
  });

  it("仅单曲模式：开关落盘；下拉只列预设启用的曲目；可禁用角色", async () => {
    const { container } = await renderPanel();
    await toggle(input(container, "single-mode-enabled"));
    expect(useSingleTrack.getState().enabled).toBe(true);

    // 关掉「角色曲」后，下拉里不应再出现角色曲
    await click(container.querySelector('[data-testid="tri-角色曲-off"]')!);
    const combobox = container
      .querySelector('[data-testid="single-select-chirizuka-ubame"]')!
      .querySelector('[role="combobox"]')!;
    await act(async () => {
      combobox.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    const options = Array.from(document.querySelectorAll('[role="option"]'))
      .map((node) => node.textContent ?? "");
    expect(options.length).toBeGreaterThan(0);
    // 尘塚ウバメ 有 1 条角色曲 + 1 条道中曲；关掉角色曲后只剩道中曲
    expect(options.some((label) => label.includes("角色曲"))).toBe(false);
    expect(options.some((label) => label.includes("愛おしき塵の住処"))).toBe(true);
  });

  it("禁用角色后它从可用队列里消失", async () => {
    const { container } = await renderPanel();
    const hook = await renderHook(() => useSingleTrack((state) => state.disabledCharacters));
    await click(container.querySelector('[data-testid="single-disable-cirno"]')!);
    expect(hook.result.current.cirno).toBe(true);
    await click(container.querySelector('[data-testid="single-disable-cirno"]')!);
    expect(hook.result.current.cirno).toBeUndefined();
  });
});
