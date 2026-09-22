/** 冒烟：真实数据（public/data/*.json）经载入器渲染出外壳与列表。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { aliceLabel } from "./ui/shell/AppShell";
import { installDataFetchStub, installFakeAudio } from "./test-utils";
import { TURN_COUNTDOWN_MS } from "./game/useGameLoop";
import { useGame } from "./game/useGame";
import { useSession } from "./store/session";
import { singleStoreFor } from "./store/single";
import { sourceStoreFor } from "./store/sources";

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
    installDataFetchStub();
    const { container } = await renderApp();
    // 等到音源表载入完成（解析成功后才会出现音源标签）
    const text = await waitFor(container, (value) => value.includes("netease163"));
    expect(text).toContain("Player");
    expect(text).toContain("List");
    expect(text).toContain("Config");
    expect(text).toContain(aliceLabel(false));
    // 播放页默认显示 order #1 的角色（霧雨魔理沙），曲目显示名已去掉序号
    expect(text).toContain("霧雨魔理沙");
    // 播放卡片按新规格（D91）只显示：曲名 / 作者或作品 / 角色名 —— 音源 id 不再出现在卡片上，
    // 但"解析出来的曲目来自网易云"这件事仍由本地曲库/数据指纹一并覆盖
    expect(text).toContain("Touhou Music Cards");
    expect(text).not.toContain("所有已启用的音源都取不到");
    expect(text).toContain("121 in rotation");
  });

  it("首次进入配置页：预设默认全选（父项勾选、统计 全库可用）", async () => {
    installDataFetchStub();
    const { container } = await renderApp();
    await waitFor(container, (value) => value.includes("Player"));
    const config = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Config");
    await act(async () => {
      config!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // 设置分区默认折叠（D47），先展开"音乐选择预设"
    await act(async () => {
      container.querySelector('[data-testid="section-preset-summary"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 320));
    });
    const parent = container.querySelector<HTMLInputElement>('input[aria-label="hifuu-parent"]');
    expect(parent?.checked).toBe(true);
    expect(container.querySelector('[data-testid="preset-stats"]')?.textContent).toContain("378 / 378");
  });

  it("开局后真的会出声：回合开始把当前角色的曲子播起来（回归：实际游戏无声）", async () => {
    installDataFetchStub();
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

  it("数据更新后清理存档里的死条目（single.prune 真的被调到）", async () => {
    localStorage.clear();
    // 上一个数据版本留下的：一个数据集里没有的角色 + 一个注册表里没有的音源
    const single = singleStoreFor("originals");
    const sources = sourceStoreFor("originals");
    await act(async () => {
      useSession.setState({ musicMode: "originals" });
      single.setState({ ...single.getState(), pins: { "gone-key": ["专辑", "曲目", "角色曲"] } });
      sources.setState({ overrides: { gone: { enabled: false, order: 9 } } });
    });

    installDataFetchStub();
    await renderApp();
    // 数据集就位 → 两把存档按**当前数据集**的 id 各清一次
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(single.getState().pins["gone-key"]).toBeUndefined();
    expect(sources.getState().overrides.gone).toBeUndefined();
    // 清理落盘：下次启动 load() 读回来的是干净的
    expect(localStorage.getItem("tmc.v1.single-track.originals")).not.toContain("gone-key");
    expect(localStorage.getItem("tmc.v1.sources.originals")).not.toContain("gone");

    // 点播清的是"没有的角色"，不是"没有的音源 id"：从真实数据集里取一个还在的角色。
    // （点播请求存的就是**角色 key**；拿音源注册表去比对会把它误清掉）
    const characters = (await (await fetch("/data/characters.json")).json()) as {
      characters: { key: string }[];
    };
    const liveKey = characters.characters[0]!.key;
    const request = async (key: string): Promise<void> => {
      await act(async () => {
        useSession.setState({ entryRequest: { key, entry: ["专辑", "曲目", "角色曲"] } });
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    };

    await request("gone-key");
    expect(useSession.getState().entryRequest).toBeNull();   // 没有的角色：请求让位（B2 的同一条原则）

    await request(liveKey);
    expect(useSession.getState().entryRequest?.key).toBe(liveKey);
  });

  it("数据缺失时给出可读错误而不是白屏", async () => {
    globalThis.fetch = (async () => new Response("not found", { status: 404 })) as typeof fetch;
    const { container } = await renderApp();
    const text = await waitFor(container, (value) => value.includes("Failed to load data"));
    expect(text).toContain("Failed to load data");
    expect(text).toContain("404");
  });
});
