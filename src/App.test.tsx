/** 冒烟：真实数据（public/data/*.json）经载入器渲染出外壳与列表。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { TICK_LATE_TOLERANCE_MS, aliceLabel, tickDue } from "./ui/shell/AppShell";
import { installDataFetchStub, installFakeAudio } from "./test-utils";
import { TURN_COUNTDOWN_MS } from "./game/useGameLoop";
import { useGame } from "./game/useGame";
import { emptyState } from "./game/types";
import { useSession } from "./store/session";
import { singleStoreFor } from "./store/single";
import { sourceStoreFor } from "./store/sources";

/** 本文件挂载过的实例：`afterEach` 必须**卸载**（只清 DOM 不够 —— 旧的 React 树还活着，
 *  它和当前用例共享同一个 `useGame`，开局时会跟着一起响一声）。 */
const mounted: { container: HTMLElement; root: Root }[] = [];

async function renderApp(): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<App />);
  });
  mounted.push({ container, root });
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

/** 点一个按钮：按文字找，或按选择器找（没有选择器时优先文字）。 */
async function clickIn(container: HTMLElement, label: string, selector?: string): Promise<void> {
  const element = selector
    ? container.querySelector(selector)
    : Array.from(container.querySelectorAll("button")).find((button) => button.textContent === label);
  await act(async () => {
    element!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** 只数"排了几声"的假 AudioContext：一声 = 4 个泛音振荡器（`bell.ts` 的 `PARTIALS`）。 */
function installCountingAudioContext() {
  const counts = { oscillators: 0 };
  const param = (): AudioParam => ({
    value: 0,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  }) as unknown as AudioParam;
  const connectable = () => ({ connect: () => undefined, disconnect: () => undefined });

  class Counting {
    get state(): AudioContextState { return "running"; }
    get currentTime(): number { return 0; }
    get destination(): AudioDestinationNode { return connectable() as unknown as AudioDestinationNode; }
    createGain(): GainNode { return { ...connectable(), gain: param() } as unknown as GainNode; }
    createOscillator(): OscillatorNode {
      counts.oscillators += 1;
      return { ...connectable(), type: "sine", frequency: param(), start: () => undefined, stop: () => undefined } as unknown as OscillatorNode;
    }
    resume(): Promise<void> { return Promise.resolve(); }
    close(): Promise<void> { return Promise.resolve(); }
  }

  const w = window as unknown as { AudioContext?: unknown };
  const real = w.AudioContext;
  w.AudioContext = Counting as unknown;
  return { sounds: (): number => counts.oscillators / 4, restore: (): void => { w.AudioContext = real; } };
}

describe("App 冒烟（真实数据）", () => {
  beforeEach(() => {
    // 对局 store 是模块级单例：每个用例都从"选牌阶段"开始，免得上一个用例的
    // 倒计时/回合状态与计时器串味（GamePanel.test.tsx 同口径）
    useGame.setState({ game: emptyState() });
  });

  afterEach(async () => {
    await act(async () => { mounted.forEach(({ root }) => root.unmount()); });
    mounted.length = 0;
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
      await clickIn(container, label, selector);
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

  it("倒计时三声：正常时序下真的响三声（第 0 / 1 / 2 秒各一声）", async () => {
    installDataFetchStub();
    installFakeAudio();
    const { container } = await renderApp();
    await waitFor(container, (value) => value.includes("Player"));
    await clickIn(container, "Match");
    await clickIn(container, "Random Fill", '[data-testid="random-fill"]');

    vi.useFakeTimers();                                   // 数据载入完成后再接管计时器
    const probe = installCountingAudioContext();
    try {
      await clickIn(container, "Start", '[data-testid="start-game"]');
      expect(useGame.getState().game.state).toBe("countdown");
      expect(probe.sounds()).toBe(1);                     // 进入倒计时立刻一声
      for (let step = 0; step < 20; step += 1) {
        await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      }
      expect(probe.sounds()).toBe(3);                     // 1s / 2s 各一声 → 共三声
    } finally {
      probe.restore();
    }
  });

  it("回归：倒计时期间在播放页按 ▶（换歌前响铃开着）→ 铃响完正曲照样起播（D125）", async () => {
    installDataFetchStub();
    const audios = installFakeAudio();
    const { container } = await renderApp();
    await waitFor(container, (value) => value.includes("Player"));

    // 补满自家牌库，再回到播放页 —— 等价于"客机停在播放页时主机开赛"：开局后页签会被锁，
    // 但已经停在播放页的面板不会卸载，它的 ▶ 照样能点（"部分情况下"就是从这来的）
    await clickIn(container, "Match");
    await clickIn(container, "Random Fill", '[data-testid="random-fill"]');
    await clickIn(container, "Player");
    const countdown = container.querySelector<HTMLInputElement>('input[aria-label="player-countdown"]')!;
    await act(async () => { countdown.click(); });         // 打开"换歌前先响铃"
    expect(countdown.checked).toBe(true);

    vi.useFakeTimers();
    await act(async () => { useGame.getState().start(); });  // 单机 UI 只能在游戏页开局，这里用 store 复现错位的那一帧
    expect(useGame.getState().game.state).toBe("countdown");

    const button = (label: string): HTMLButtonElement | null =>
      container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    await act(async () => { button("play")!.click(); });     // 倒计时里按 ▶：排一条 1100ms 的铃，铃后起播
    expect(button("pause")).not.toBeNull();                  // countingDown 在界面上显示成"在播"

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });   // 第 1 秒的滴答（以前会把起播回调一起吞掉）
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });    // 铃早该响完（1100ms）
    expect(audios[0]!.paused).toBe(false);                   // 正曲真的起来了，没有卡在 countingDown
    expect(button("pause")).not.toBeNull();
  });

  it("数据缺失时给出可读错误而不是白屏", async () => {
    globalThis.fetch = (async () => new Response("not found", { status: 404 })) as typeof fetch;
    const { container } = await renderApp();
    const text = await waitFor(container, (value) => value.includes("Failed to load data"));
    expect(text).toContain("Failed to load data");
    expect(text).toContain("404");
  });
});

/** 节流场景在单测里没法忠实复现（假定时器的队列时钟是**按点**触发的），所以把判定本身钉住。 */
describe("倒计时滴答的迟到判定（D125）", () => {
  it("正常抖动算准时；被节流过的迟到就跳过", () => {
    expect(tickDue(1000, 1000)).toBe(true);                                  // 准点
    expect(tickDue(1080, 1000)).toBe(true);                                  // 80ms 抖动
    expect(tickDue(1000 + TICK_LATE_TOLERANCE_MS, 1000)).toBe(true);         // 容忍边界
    expect(tickDue(1000 + TICK_LATE_TOLERANCE_MS + 1, 1000)).toBe(false);    // 越界
    expect(tickDue(2900, 1000)).toBe(false);                                 // 后台节流：回来时一次全放
    expect(tickDue(2900, 2000)).toBe(false);
  });
});
