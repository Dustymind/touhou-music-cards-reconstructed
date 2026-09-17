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

/** 展开某个分区（分区默认折叠 → 内容不挂载，测试要交互得先展开）。 */
async function expand(container: HTMLElement, id: string): Promise<void> {
  const summary = container.querySelector(`[data-testid="section-${id}-summary"]`);
  if (!summary) throw new Error(`找不到分区：${id}`);
  await click(summary);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 320)); });
}

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

  it("设置分区默认折叠，展开后才挂载内容（MD2 扩展面板）", async () => {
    const { container } = await renderPanel();
    for (const id of ["data", "cardset", "source", "preset", "single"]) {
      expect(container.querySelector(`[data-testid="section-${id}"]`)).not.toBeNull();
      expect(container.querySelector(`[data-testid="section-${id}-content"]`)).toBeNull();   // 折叠时不挂载
    }
    // 标题始终可见（五个分区标题）
    expect(container.textContent).toContain("Card Collection");
    expect(container.textContent).toContain("Music Source");

    await expand(container, "single");
    expect(container.querySelector('[data-testid="section-single-content"]')).not.toBeNull();
    // 仅单曲模式只有一个开关（原版只有一个；之前头部与内容区各放了一个）
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(1);
  });

  it("卡面图集菜单：每套一行（名称 + 使用按钮 + 原版说明 + 三张示例卡）", async () => {
    const { container } = await renderPanel();
    await expand(container, "cardset");
    const rows = [...container.querySelectorAll('[data-testid^="cardset-row-"]')];
    expect(rows.length).toBe(6);

    // 当前图集：按钮是 contained 且禁用，文案用原版的 Selected/正在使用
    const current = container.querySelector('[data-testid="cardset-dairi-sd"]') as HTMLButtonElement;
    expect(current.disabled).toBe(true);
    expect(current.textContent).toContain("Selected");
    expect(current.className).toContain("contained");

    // 其它图集：可点（outlined）
    const other = container.querySelector('[data-testid="cardset-zun"]') as HTMLButtonElement;
    expect(other.disabled).toBe(false);
    expect(other.textContent).toContain("Select");

    // 原版说明文案 + 三张示例卡
    expect(rows[0]!.textContent).toContain("Free super-deformed tachies from dairi Twitter");
    for (const row of rows) {
      expect(row.querySelectorAll("img").length).toBe(3);
    }
  });

  it("渲染统计、秘封组、三态开关与 CD / 官作分组", async () => {
    const { container } = await renderPanel();
    await expand(container, "data");
    await expand(container, "preset");
    const text = container.textContent ?? "";
    expect(text).toContain("378");                    // 可用/全库（含 21 条补配）
    expect(text).toContain("Hifuu tracks");
    expect(text).toContain("Official games");
    expect(text).toContain("蓬莱人形 ～ Dolls in Pseudo Paradise");
    expect(text).toContain("東方錦上京 ～ Fossilized Wonders");   // CD/官作最后一格
  });

  it("秘封父复选框是批量控制（取消 → 12 张子项全取消；父项显示态派生）", async () => {
    const { container } = await renderPanel();
    await expand(container, "preset");
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
    await expand(container, "preset");
    const before = usePreset.getState();
    expect(before.category.角色曲).toBe("unset");
    await click(container.querySelector('[data-testid="tri-角色曲-off"]')!);
    expect(usePreset.getState().category.角色曲).toBe("off");
    // 236 条角色曲被否决 → 可用数下降（378 - 236 = 142）
    const stats = container.querySelector('[data-testid="preset-stats"]')!.textContent ?? "";
    expect(stats).toContain("142 / 378");
  });

  it("取消一张官作专辑只影响它自己的曲目", async () => {
    const { container } = await renderPanel();
    await expand(container, "preset");
    await toggle(input(container, "album-th20"));
    expect(usePreset.getState().albums["東方錦上京 ～ Fossilized Wonders"]).toBe(false);
    const stats = container.querySelector('[data-testid="preset-stats"]')!.textContent ?? "";
    expect(stats).toContain("364 / 378");   // 取消 th20 的 14 条
  });

  it("仅单曲模式：开关落盘；下拉只列预设启用的曲目；可禁用角色", async () => {
    const { container } = await renderPanel();
    await expand(container, "single");
    await expand(container, "preset");   // 该用例还要关掉「角色曲」预设
    await toggle(input(container, "single-mode"));
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
    await expand(container, "single");
    const hook = await renderHook(() => useSingleTrack((state) => state.disabledCharacters));
    await click(container.querySelector('[data-testid="single-disable-cirno"]')!);
    expect(hook.result.current.cirno).toBe(true);
    await click(container.querySelector('[data-testid="single-disable-cirno"]')!);
    expect(hook.result.current.cirno).toBeUndefined();
  });
});
