/** 冒烟：真实数据（public/data/*.json）经载入器渲染出外壳与列表。 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { aliceLabel } from "./ui/shell/AppShell";
import { installDataFetchStub, installFakeAudio } from "./test-utils";
import { TURN_COUNTDOWN_MS } from "./game/useGameLoop";
import { useGame } from "./game/useGame";

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/data");

async function renderApp(): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<App />);
  });
  return { container, root };
}

/** 轮询等待界面就绪（异步断言不固定 sleep —— v2 工作区的教训）。 */
async function waitFor(container: HTMLElement, predicate: (text: string) => boolean,
                       timeoutMs = 2000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let text = "";
  while (Date.now() < deadline) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    text = container.textContent ?? "";
    if (predicate(text)) return text;
  }
  return text;
}

describe("App 冒烟（真实数据）", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("载入数据后渲染页签、角色与数据指纹", async () => {
    installDataFetchStub(dataDir);
    const { container } = await renderApp();
    // 等到音源表载入完成（解析成功后才会出现音源标签）
    const text = await waitFor(container, (value) => value.includes("netease163"));
    expect(text).toContain("Player");
    expect(text).toContain("List");
    expect(text).toContain("Config");
    expect(text).toContain(aliceLabel(false));
    // 播放页默认显示 order #1 的角色（霧雨魔理沙），曲目显示名已去掉序号
    expect(text).toContain("霧雨魔理沙");
    expect(text).toContain("netease163");
    expect(text).not.toContain("所有已启用的音源都取不到");
    expect(text).toContain("121 in rotation");
  });

  it("首次进入配置页：预设默认全选（父项勾选、统计 全库可用）", async () => {
    installDataFetchStub(dataDir);
    const { container } = await renderApp();
    await waitFor(container, (value) => value.includes("Player"));
    const config = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Config");
    await act(async () => {
      config!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const parent = container.querySelector<HTMLInputElement>('input[aria-label="hifuu-parent"]');
    expect(parent?.checked).toBe(true);
    expect(container.querySelector('[data-testid="preset-stats"]')?.textContent).toContain("378 / 378");
  });

  it("开局后真的会出声：回合开始把当前角色的曲子播起来（回归：实际游戏无声）", async () => {
    installDataFetchStub(dataDir);
    const audios = installFakeAudio();
    const { container } = await renderApp();
    await waitFor(container, (value) => value.includes("Player"));
    // 载入完成后再接管计时器：前面的轮询要真实 timer
    vi.useFakeTimers();

    const click = async (label: string, selector?: string): Promise<void> => {
      const element = selector
        ? container.querySelector(selector)
        : Array.from(container.querySelectorAll("button")).find((button) => button.textContent === label);
      await act(async () => {
        element!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    };

    // 进游戏页 → 补满自家牌库 → 开局
    await click("Match");
    await click("Random Fill", '[data-testid="random-fill"]');
    await click("Start", '[data-testid="start-game"]');
    expect(useGame.getState().game.state).toBe("countdown");

    // 倒计时期间：铃在响，正曲必须停着
    expect(audios[0]!.paused).toBe(true);

    // 3 秒倒计时结束 → 回合开始 → 当前角色的曲子起播
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TURN_COUNTDOWN_MS + 50);
    });
    expect(useGame.getState().game.state).toBe("turnStart");
    const currentKey = useGame.getState().game.currentKey!;
    const character = useGame.getState().game.order.includes(currentKey);
    expect(character).toBe(true);
    expect(audios[0]!.src).not.toBe("");
    expect(audios[0]!.paused).toBe(false);
  });

  it("数据缺失时给出可读错误而不是白屏", async () => {
    globalThis.fetch = (async () => new Response("not found", { status: 404 })) as typeof fetch;
    const { container } = await renderApp();
    const text = await waitFor(container, (value) => value.includes("Failed to load data"));
    expect(text).toContain("Failed to load data");
    expect(text).toContain("404");
  });
});
