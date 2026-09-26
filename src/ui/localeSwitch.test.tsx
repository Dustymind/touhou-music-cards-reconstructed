/** 语言切换：**每个已经挂载的面板**都要跟着换，不许有字段卡住。
 *
 * 守的是一类真踩过的 bug：面板普遍 `memo(...)` 过，而 `t()` 读的是**模块级** locale ——
 * 切语言时 AppShell 重渲染了，但这些面板的 props 一个都没变 ⇒ `memo` 直接跳过渲染，
 * 里面的文案就停在旧语言（要等它因为别的原因重渲染才跟上，表现成"部分字段卡住"）。
 * 修法见 `src/ui/memoLocalized.tsx`。
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { installDataFetchStub, installFakeAudio } from "../test-utils";
import { useSession } from "../store/session";
import { useGame } from "../game/useGame";
import { emptyState } from "../game/types";

const mounted: { container: HTMLElement; root: Root }[] = [];

async function renderApp(): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<App />); });
  mounted.push({ container, root });
  return container;
}

/** 等界面就绪（异步断言不固定 sleep）。 */
async function waitFor(container: HTMLElement, predicate: (text: string) => boolean,
                       timeoutMs = 4000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let text = "";
  while (Date.now() < deadline) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    text = container.textContent ?? "";
    if (predicate(text)) return text;
  }
  return text;
}

async function click(container: HTMLElement, selector: string): Promise<void> {
  const element = container.querySelector(selector);
  if (!element) throw new Error(`找不到 ${selector}`);
  await act(async () => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}

/** 切语言（与右上角那对 chip 走的是同一条路）。 */
async function setLocale(locale: "en" | "zh"): Promise<void> {
  await act(async () => { useSession.getState().setLocale(locale); });
}

async function expandSection(container: HTMLElement, id: string): Promise<void> {
  await click(container, `[data-testid="section-${id}-summary"]`);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 320)); });
}

describe("切语言：挂载着的面板都要跟着换", () => {
  beforeEach(() => {
    localStorage.clear();
    installDataFetchStub();
    installFakeAudio();
    useGame.setState({ game: emptyState() });
    useSession.setState({ musicMode: "originals", tab: "config", locale: "en" });
  });

  afterEach(async () => {
    await act(async () => { mounted.forEach(({ root }) => root.unmount()); });
    mounted.length = 0;
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("设置页：五个分区里的文字在 zh ↔ en 之间反复切换都跟着走", async () => {
    const container = await renderApp();
    await waitFor(container, (text) => text.includes("Music Source"));
    for (const id of ["data", "cardset", "source", "preset", "single"]) {
      await expandSection(container, id);
    }

    // 每个分区挑一处只在某一语言里出现的字
    const probes: [string, string][] = [
      ["数据指纹", "Data hash"],              // 数据分区
      ["卡面图集", "Card Collection"],         // 卡面分区
      ["回退顺序", "Fallback order"],          // 音源分区
      ["可用", "Available"],                   // 预设分区的统计行
      ["开启后每个角色只播一首", "each character plays exactly one track"],   // 单曲分区
    ];

    for (const [zh, en] of probes) {
      await setLocale("zh");
      expect(container.textContent, `${zh}（zh）`).toContain(zh);
      await setLocale("en");
      expect(container.textContent, `${en}（en）`).toContain(en);
    }

    // 反复来回（用户报的场景）：最后一次切回中文，每一处都要回来
    for (let round = 0; round < 3; round += 1) {
      await setLocale("en");
      await setLocale("zh");
    }
    for (const [zh] of probes) {
      expect(container.textContent, `${zh}（来回三轮后）`).toContain(zh);
    }
  });

  it("播放页 / 列表页 / 游戏页：切语言时同样不卡", async () => {
    const container = await renderApp();
    await waitFor(container, (text) => text.includes("Player"));

    // 播放页
    await click(container, '[data-testid="tab-player"]');
    await setLocale("zh");
    expect(container.textContent).toContain("重新抽选");
    await setLocale("en");
    expect(container.textContent).toContain("Shuffle");

    // 列表页：这一页只有搜索框带文案（placeholder 不进 textContent，直接读属性）
    await click(container, '[data-testid="tab-list"]');
    const placeholder = (): string | null | undefined =>
      container.querySelector<HTMLInputElement>('input[aria-label="list-search"]')?.placeholder;
    await setLocale("zh");
    expect(placeholder()).toBe("搜索角色");
    await setLocale("en");
    expect(placeholder()).toBe("Search Character");

    // 游戏页
    await click(container, '[data-testid="tab-game"]');
    await setLocale("zh");
    expect(container.textContent).toContain("单人");
    await setLocale("en");
    expect(container.textContent).toContain("Solo");
  });
});
