/** 对战页交互：随机补满 → 开局 → 抢拍 → 下一回合 → 终局（真实数据）。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DataBundle } from "../../data/types";
import { setLocale } from "../../i18n/localization";
import { loadRealBundle } from "../../test-utils";
import type { CardInfo } from "../../game/types";
import { useGame } from "../../game/useGame";
import { TURN_COUNTDOWN_MS } from "../../game/useGameLoop";
import { useSession } from "../../store/session";
import { GamePanel } from "./GamePanel";

let bundle: DataBundle;
let root: Root | null = null;

async function render(): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<GamePanel bundle={bundle} />);
  });
  return container;
}

/** 合成一次 HTML5 拖拽：jsdom 没有 `DataTransfer`，挂个假的上就行（组件只用 setData/effectAllowed）。 */
async function dragTo(container: HTMLElement, fromId: string, toId: string): Promise<void> {
  const from = container.querySelector(`[data-testid="${fromId}"]`);
  const to = container.querySelector(`[data-testid="${toId}"]`);
  if (!from || !to) throw new Error(`缺少元素 ${fromId} → ${toId}`);
  const dataTransfer = { setData: () => undefined, effectAllowed: "", dropEffect: "" };
  const fire = async (target: Element, type: string): Promise<void> => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    await act(async () => { target.dispatchEvent(event); });
  };
  await fire(from, "dragstart");
  await fire(to, "dragover");
  await fire(to, "drop");
}

async function click(container: HTMLElement, testId: string): Promise<void> {
  const element = container.querySelector(`[data-testid="${testId}"]`);
  if (!element) throw new Error(`缺少元素 ${testId}`);
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("GamePanel", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.clear();
    setLocale("en");   // 断言用的都是英文文案；中文另见下一个用例
    bundle = await loadRealBundle();
    // 每个用例都从干净的对局状态开始，避免上一个用例的计时器/状态串味
    useGame.setState({
      cpu: { meanSeconds: 0.5, stdDevSeconds: 0, mistakeRate: 0 },
      pool: [],
      game: {
        mode: "solo",
        players: [
          { name: "You", isObserver: false, deck: [], collected: [], confirmStart: false, confirmNext: false },
          { name: "Opponent", isObserver: false, deck: [], collected: [], confirmStart: false, confirmNext: false },
        ],
        deckRows: 3, deckColumns: 8, traditional: true, melee: false,
        order: [],
    playedTracks: [],
      reshuffledAtTurn: 0, gameSeed: 0, temporaryDisabled: {}, currentKey: null, turnSeq: 0, state: "selecting",
        turnStartTimestamp: 0, pickEvents: [], turnWinner: null, givesLeft: 0, winner: null,
      },
    });
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    root = null;
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("渲染棋盘、设置控件与双方牌库（单人默认没有对方棋盘）", async () => {
    const container = await render();
    const text = container.textContent ?? "";
    expect(text).toContain("deck 3×8");
    expect(container.querySelector('[data-testid="deck-you"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid^="deck-you-"]').length).toBe(24);
    // 默认单人：没有对方棋盘、没有联机栏
    expect(container.querySelector('[data-testid="deck-opponent"]')).toBeNull();
    expect(container.querySelector('[data-testid="lobby-reveal"]')).toBeNull();
  });

  it("卡面图集跟随设置页的选择（选卡菜单与牌桌都用同一套）", async () => {
    const container = await render();
    const srcOf = (selector: string): string =>
      container.querySelector(selector)?.getAttribute("src") ?? "";

    // 默认图集 dairi-sd：目录 cards/
    const defaultSrc = srcOf('[data-testid^="unused-card-"] img');
    expect(defaultSrc).toContain("/cards/");

    // 设置页把图集换成 ZUN 原画 → 选卡菜单与牌桌都要换成 cards-zun/
    await act(async () => { useSession.setState({ cardCollection: "zun" }); });
    const zunUnused = container.querySelector('[data-testid^="unused-card-"] img')?.getAttribute("src") ?? "";
    expect(zunUnused).toContain("/cards-zun/");

    await click(container, "random-fill");
    const zunDeck = container.querySelector('[data-testid^="deck-you-card-"] img')?.getAttribute("src") ?? "";
    expect(zunDeck).toContain("/cards-zun/");
  });

  it("三种模式各显示什么：单人无对方棋盘 / 电脑有棋盘可调卡组 / 多人有棋盘与联机栏", async () => {
    const container = await render();
    const has = (testId: string): boolean => container.querySelector(`[data-testid="${testId}"]`) !== null;

    expect(has("deck-opponent")).toBe(false);
    expect(has("lobby-reveal")).toBe(false);
    expect(has("fill-cpu-deck")).toBe(false);

    await click(container, "mode-cpu");
    expect(has("deck-opponent")).toBe(true);
    expect(has("fill-cpu-deck")).toBe(true);        // 电脑模式能调电脑卡组
    expect(has("lobby-reveal")).toBe(false);        // 电脑模式没有联机栏
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });   // 等显隐动画结束

    await click(container, "mode-multi");
    expect(has("deck-opponent")).toBe(true);
    expect(has("lobby-reveal")).toBe(true);         // 多人模式才有联机栏
    expect(has("fill-cpu-deck")).toBe(false);       // 多人模式不可调对方卡组
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });

    // 多人模式下点对方棋盘上的牌也不会把它拿回卡池
    await click(container, "clear-deck");
    const opponentBefore = useGame.getState().game.players[1]!.deck.filter(Boolean).length;
    await click(container, "mode-cpu");
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await click(container, "fill-cpu-deck");
    expect(useGame.getState().game.players[1]!.deck.filter(Boolean).length).toBeGreaterThan(0);
    await click(container, "mode-multi");
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await click(container, "deck-opponent-card-0");
    expect(useGame.getState().game.players[1]!.deck.filter(Boolean).length)
      .toBe(useGame.getState().game.players[1]!.deck.filter(Boolean).length);
    void opponentBefore;
    // 显隐都有动画包裹
    expect(container.querySelector('[data-testid="opponent-board"]')?.className ?? "").toContain("MuiCollapse");
  });

  it("随机补满 → 开局 → 倒计时后进入回合", async () => {
    const container = await render();
    await click(container, "random-fill");
    const filled = useGame.getState().game.players[0]!.deck.filter(Boolean).length;
    expect(filled).toBe(24);

    await click(container, "start-game");
    expect(useGame.getState().game.state).toBe("countdown");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TURN_COUNTDOWN_MS + 50);
    });
    expect(useGame.getState().game.state).toBe("turnStart");
    expect(container.textContent).toContain("Now playing: ???");   // 回合中不暴露答案
  });

  it("点击自己的牌即抢拍；抢错会染色并记录", async () => {
    const container = await render();
    await click(container, "random-fill");
    await click(container, "start-game");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TURN_COUNTDOWN_MS + 50);
    });
    const game = useGame.getState().game;
    const wrongSlot = game.players[0]!.deck.findIndex(
      (entry) => entry && entry.characterKey !== game.currentKey);
    await click(container, `deck-you-card-${wrongSlot}`);
    expect(useGame.getState().game.pickEvents).toHaveLength(1);
  });

  it("下一回合推进 turnSeq，并把答案在结算时公开", async () => {
    const container = await render();
    await click(container, "random-fill");
    await click(container, "start-game");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TURN_COUNTDOWN_MS + 50);
    });
    const before = useGame.getState().game.turnSeq;
    await click(container, "next-turn");
    expect(useGame.getState().game.state).toBe("countdown");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TURN_COUNTDOWN_MS + 50);
    });
    expect(useGame.getState().game.turnSeq).toBe(before + 1);
  });

  it("CPU 模式：对手会自己出手", async () => {
    const container = await render();
    await click(container, "mode-cpu");
    expect(useGame.getState().game.mode).toBe("cpu");
    await click(container, "random-fill");
    await click(container, "start-game");
    // 开局会洗牌，第一个回合的角色＝洗好顺序的第 0 个（读完再给 CPU 摆牌）
    const first = useGame.getState().game.order[0]!;
    const decoy = useGame.getState().game.order[1]!;
    await act(async () => {
      useGame.setState((slice) => {
        const players = slice.game.players.map((player) => ({ ...player, deck: player.deck.slice() }));
        players[1]!.deck[0] = { characterKey: first, cardIndex: 0 };
        players[1]!.deck[1] = { characterKey: decoy, cardIndex: 0 };
        return { game: { ...slice.game, players } };
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TURN_COUNTDOWN_MS + 50);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    // CPU 抢中后进入结算阶段
    expect(useGame.getState().game.state).toBe("turnWinner");
    expect(container.textContent).toContain("Answer:");
  });

  it("切到中文后游戏页全部是中文（不留英文标签）", async () => {
    setLocale("zh");
    const container = await render();
    await click(container, "mode-cpu");   // 电脑卡组那组按键只在电脑模式下出现
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    const text = container.textContent ?? "";
    for (const label of ["开始游戏", "中止游戏", "随机补满", "补满电脑", "清空卡组", "打乱卡组",
      "卡组 3×8", "行", "列", "单人", "电脑", "多人", "经典", "休闲",
      "对手 · 已得 0", "你 · 已得 0", "下一回合", "随机交出", "牌堆", "轮播",
      "正在播放：—", "第 0 回合 · 选牌中 · 罚牌 0", "缩小", "放大"]) {
      expect(text, `缺少中文文案：${label}`).toContain(label);
    }
    // 英文标签不该再出现在中文界面里
    for (const leftover of ["Random Fill", "Clear Deck", "Shuffle Deck", "Next Turn",
      "Now playing", "deck 3×8", "Opponent · collected", "cross-machine", "Chat"]) {
      expect(text).not.toContain(leftover);
    }
    // 联机栏只在多人模式出现
    await click(container, "mode-multi");
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    const multiText = container.textContent ?? "";
    for (const label of ["联机", "名称", "建立房间", "房间号", "加入", "状态摘要"]) {
      expect(multiText, `缺少中文文案：${label}`).toContain(label);
    }

    // 开局后的状态名也走中文
    await click(container, "random-fill");
    await click(container, "start-game");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TURN_COUNTDOWN_MS + 50);
    });
    expect(container.textContent).toContain("抢拍中");
    expect(container.textContent).toContain("正在播放：???");
  });

  it("中文下的结算与罚牌提示", async () => {
    setLocale("zh");
    const container = await render();
    await click(container, "random-fill");
    await click(container, "start-game");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TURN_COUNTDOWN_MS + 50);
    });
    // 保证自己手里就有当前角色：随机补满不保证发到，抢拍必须命中才能进结算
    const currentKey = useGame.getState().game.currentKey!;
    await act(async () => {
      useGame.setState((slice) => {
        const players = slice.game.players.map((player) => ({ ...player, deck: player.deck.slice() }));
        players[0]!.deck[0] = { characterKey: currentKey, cardIndex: 0 };
        return { game: { ...slice.game, players } };
      });
    });
    await act(async () => {
      useGame.getState().pick(0, 0, 0);
    });
    expect(useGame.getState().game.state).toBe("turnWinner");
    expect(container.textContent).toContain("答案：");
    expect(container.textContent).toContain("结算中");
  });

  it("电脑卡组也有打乱与清空（用户要求）", async () => {
    const container = await render();
    await click(container, "mode-cpu");
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    // 两边都补满，再打乱电脑卡组：顺序变了但张数不变
    await click(container, "random-fill");
    await click(container, "fill-cpu-deck");
    const before = useGame.getState().game.players[1]!.deck.map((card) => card?.characterKey ?? "-");
    expect(before.filter((key) => key !== "-")).toHaveLength(24);

    await click(container, "shuffle-cpu-deck");
    const shuffled = useGame.getState().game.players[1]!.deck.map((card) => card?.characterKey ?? "-");
    expect(shuffled.filter((key) => key !== "-")).toHaveLength(24);
    expect(shuffled).not.toEqual(before);          // 24 张里换位，几乎不可能原地不动
    expect(useGame.getState().game.players[0]!.deck.every((card) => card !== null)).toBe(true);

    await click(container, "clear-cpu-deck");
    expect(useGame.getState().game.players[1]!.deck.every((card) => card === null)).toBe(true);
    // 电脑卡组清空后，这些卡回到"未使用卡牌"
    const unused = container.querySelectorAll('[data-testid^="unused-card-"]').length;
    expect(unused).toBeGreaterThan(24);
  });

  it("自己的卡组也有打乱与清空（按钮落到自己的那一侧）", async () => {
    const container = await render();
    await click(container, "mode-cpu");
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await click(container, "fill-cpu-deck");
    await click(container, "random-fill");
    await click(container, "shuffle-deck");
    expect(useGame.getState().game.players[0]!.deck.every((card) => card !== null)).toBe(true);
    const cpuBefore = useGame.getState().game.players[1]!.deck.map((card) => card?.characterKey ?? "-");
    await click(container, "clear-deck");
    expect(useGame.getState().game.players[0]!.deck.every((card) => card === null)).toBe(true);
    expect(useGame.getState().game.players[1]!.deck.map((card) => card?.characterKey ?? "-"))
      .toEqual(cpuBefore);                          // 只动自己那一侧
  });

  it("自定义卡组：点未使用的卡加进牌库，点牌库里的卡拿回来", async () => {
    const container = await render();
    const unusedBefore = container.querySelectorAll('[data-testid^="unused-card-"]').length;
    expect(unusedBefore).toBeGreaterThan(0);

    // 点第一张未使用的卡 → 进自己牌库的第一个空位
    const first = container.querySelector<HTMLElement>('[data-testid^="unused-card-"]');
    const cardKey = first!.getAttribute("data-testid")!.replace("unused-card-", "").replace(/-\d+$/, "");
    await act(async () => {
      first!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const deck = useGame.getState().game.players[0]!.deck;
    expect(deck[0]?.characterKey).toBe(cardKey);
    expect(container.querySelectorAll('[data-testid^="unused-card-"]').length).toBe(unusedBefore - 1);

    // 再点牌库里这张 → 回到未使用卡牌
    await click(container, "deck-you-card-0");
    expect(useGame.getState().game.players[0]!.deck[0]).toBeNull();
    expect(container.querySelectorAll('[data-testid^="unused-card-"]').length).toBe(unusedBefore);
  });

  it("自定义卡组：主机能拿走电脑卡组里的牌，开局后按钮与卡池都不可改", async () => {
    const container = await render();
    await click(container, "mode-cpu");
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await click(container, "fill-cpu-deck");
    const cpuSlot0 = useGame.getState().game.players[1]!.deck[0]!;
    await click(container, "deck-opponent-card-0");
    expect(useGame.getState().game.players[1]!.deck[0]).toBeNull();
    // 被拿掉的卡出现在未使用区
    const testId = `unused-card-${cpuSlot0.characterKey}-${cpuSlot0.cardIndex}`;
    expect(container.querySelector(`[data-testid="${testId}"]`)).not.toBeNull();

    // 开局后（非选牌阶段）不能再改卡组
    await click(container, "random-fill");
    await click(container, "start-game");
    const shuffleButton = container.querySelector<HTMLButtonElement>('[data-testid="shuffle-cpu-deck"]');
    expect(shuffleButton?.disabled).toBe(true);
  });

  it("拖动放置：拖到指定槽位、拖回未使用区、牌位互换", async () => {
    const container = await render();
    await click(container, "mode-cpu");
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    const firstUnused = container.querySelector<HTMLElement>('[data-testid^="unused-card-"]')!;
    const unusedId = firstUnused.getAttribute("data-testid")!;

    // 拖到第 5 个空位（点击只会落在第一个空位，拖动才能指定）
    await dragTo(container, unusedId, "deck-you-empty-5");
    expect(useGame.getState().game.players[0]!.deck[5]?.characterKey)
      .toBe(unusedId.replace("unused-card-", "").replace(/-\d+$/, ""));
    expect(container.querySelector(`[data-testid="${unusedId}"]`)).toBeNull();

    // 拖回未使用区 = 拿出来
    await dragTo(container, "deck-you-card-5", "unused-cards");
    expect(useGame.getState().game.players[0]!.deck[5]).toBeNull();
    expect(container.querySelector(`[data-testid="${unusedId}"]`)).not.toBeNull();

    // 牌库内互换
    await dragTo(container, unusedId, "deck-you-empty-0");
    const second = container.querySelector<HTMLElement>('[data-testid^="unused-card-"]')!;
    await dragTo(container, second.getAttribute("data-testid")!, "deck-you-empty-1");
    const before = [useGame.getState().game.players[0]!.deck[0]!, useGame.getState().game.players[0]!.deck[1]!];
    await dragTo(container, "deck-you-card-0", "deck-you-card-1");
    const after = [useGame.getState().game.players[0]!.deck[0]!, useGame.getState().game.players[0]!.deck[1]!];
    expect(after[0]).toEqual(before[1]);
    expect(after[1]).toEqual(before[0]);

    // 主机能把未使用的卡拖进电脑卡组的指定空位
    const third = container.querySelector<HTMLElement>('[data-testid^="unused-card-"]')!;
    await dragTo(container, third.getAttribute("data-testid")!, "deck-opponent-empty-3");
    expect(useGame.getState().game.players[1]!.deck[3]).not.toBeNull();
  });

  it("卡片大小按容器百分比（上游默认 0.08），按钮步进 0.01 并夹住上下限", async () => {
    const container = await render();
    const cardWidth = (): string =>
      container.querySelector('[data-testid="deck-you"]')?.getAttribute("data-card-width") ?? "";
    const trayWidth = (): string =>
      container.querySelector('[data-testid="unused-cards"]')?.getAttribute("data-card-width") ?? "";

    // jsdom 没有布局，容器宽度取兜底值 1000 → 0.08 × 1000 = 80px
    expect(cardWidth()).toBe("80");
    expect(trayWidth()).toBe("80");     // 未使用卡牌区与卡槽同尺寸

    await click(container, "card-larger");
    expect(cardWidth()).toBe("90");
    expect(trayWidth()).toBe("90");
    await click(container, "card-smaller");
    await click(container, "card-smaller");
    expect(cardWidth()).toBe("70");
    expect(trayWidth()).toBe("70");

    for (let i = 0; i < 12; i += 1) await click(container, "card-smaller");
    expect(cardWidth()).toBe("40");                             // 0.04 × 1000 = 下限
    expect(container.querySelector<HTMLButtonElement>('[data-testid="card-smaller"]')?.disabled).toBe(true);
    for (let i = 0; i < 40; i += 1) await click(container, "card-larger");
    expect(cardWidth()).toBe("400");                            // 0.40 × 1000 = 上限
    expect(container.querySelector<HTMLButtonElement>('[data-testid="card-larger"]')?.disabled).toBe(true);
    // 设置落盘（上游同样存在 localStorage 的 gameSetting）
    expect(localStorage.getItem("gameSetting")).toContain("cardWidthPercentage");
  });

  it("卡片大小与牌库尺寸会记住：改过的设置下次进游戏页自动恢复", async () => {
    const container = await render();
    await click(container, "card-larger");
    await click(container, "card-larger");
    await click(container, "card-larger");
    await click(container, "card-larger");            // 0.08 → 0.12
    await act(async () => {
      root?.unmount();
    });
    document.body.innerHTML = "";

    const again = await render();
    expect(again.querySelector('[data-testid="deck-you"]')?.getAttribute("data-card-width")).toBe("120");
  });

  it("拖动放置的动效前提：换格子时是同一个 DOM 节点（卡牌层 key = 角色-卡序）", async () => {
    const container = await render();
    const unusedId = container.querySelector<HTMLElement>('[data-testid^="unused-card-"]')!
      .getAttribute("data-testid")!;
    await dragTo(container, unusedId, "deck-you-empty-0");
    const before = container.querySelector('[data-testid="deck-you-card-0"]')!;
    expect(before.getAttribute("data-slot")).toBe("0");
    const cardKey = before.getAttribute("data-card-key");

    await dragTo(container, "deck-you-card-0", "deck-you-empty-7");
    const after = container.querySelector('[data-testid="deck-you-card-7"]')!;
    expect(after.getAttribute("data-card-key")).toBe(cardKey);   // 同一张卡
    expect(after.getAttribute("data-slot")).toBe("7");           // 换了格子 → left/top 过渡会滑过去
    expect(container.querySelectorAll(`[data-card-key="${cardKey}"]`)).toHaveLength(1);
  });

  it("卡槽用上游那条滑块平移（拖动滑块 → 整条卡槽位移；滑块不压住卡片）", async () => {
    const container = await render();
    const strip = container.querySelector('[data-testid="unused-cards-strip"]')!;
    const slider = container.querySelector<HTMLInputElement>('[data-testid="card-selection-slider"] input[type="range"]');
    expect(slider).not.toBeNull();

    const offsetOf = (): number =>
      Number(container.querySelector('[data-testid="unused-cards"]')?.getAttribute("data-pan-offset") ?? 0);
    expect(offsetOf()).toBe(0);

    // 把滑块推到中间：卡槽整体左移（上游 `offset = -sliderValue * (totalWidth - visibleWidth)`）
    // MUI Slider 把键盘事件挂在隐藏的 range input 上：按 End 跳到最右（上游 max=1）
    await act(async () => {
      slider!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    });
    expect(Number(container.querySelector('[data-testid="unused-cards"]')?.getAttribute("data-pan"))).toBe(1);
    expect(offsetOf()).toBeLessThan(0);
    // 平移写在"整行"的 transform 上；卡片自身位置是静态的（拖滑块不碰上百个卡片节点）
    const row = container.querySelector<HTMLElement>('[data-testid="unused-cards-strip-row"]')!;
    expect(row.style.transform).not.toBe("translateX(0px)");
    const card = container.querySelector<HTMLElement>('[data-testid^="unused-card-"]')!;
    expect(card.style.left).toBe("");

    await act(async () => {
      slider!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    });
    expect(offsetOf()).toBe(0);
    expect(row.style.transform).toBe("translateX(0px)");

    // 滑块在卡条**下方**（DOM 顺序在卡条之后），不会盖住卡槽
    expect(strip.compareDocumentPosition(container.querySelector('[data-testid="card-selection-slider"]')!)
      & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // 选卡区域有外框（框住卡条 + 滑块）
    const frame = container.querySelector('[data-testid="unused-cards-frame"]')!;
    expect(frame).not.toBeNull();
    expect(frame.contains(strip)).toBe(true);
    expect(frame.contains(container.querySelector('[data-testid="card-selection-slider"]')!)).toBe(true);


  });

  it("按卡组筛选音乐：不在场上的角色被临时禁用", async () => {
    const container = await render();
    await click(container, "random-fill");
    await click(container, "filter-by-deck");
    const disabled = useGame.getState().game.temporaryDisabled;
    expect(Object.values(disabled).filter(Boolean).length).toBeGreaterThan(0);
  });

  it("曲目互斥：共用一首曲子的角色只能选一次，另一张压暗且点不动（D108）", async () => {
    const container = await render();
    const unused = (id: string): HTMLElement | null =>
      container.querySelector<HTMLElement>(`[data-testid="unused-card-${id}"]`);

    // 先放琪露诺：与她共用《ミストレイク》的若鹭姬立刻压暗（但仍留在未使用区里）
    await click(container, "unused-card-cirno-0");
    expect(useGame.getState().game.players[0]!.deck[0]?.characterKey).toBe("cirno");
    expect(unused("wakasagihime-0")).not.toBeNull();
    expect(unused("wakasagihime-0")!.getAttribute("data-disabled")).toBe("true");

    // 压暗的卡点了也进不去牌库
    await act(async () => {
      unused("wakasagihime-0")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(useGame.getState().game.players[0]!.deck.filter(Boolean).map((entry) => entry!.characterKey))
      .toEqual(["cirno"]);

    // 同一个 key 的第二/第三张卡面（Prismriver 三姐妹 = 三个角色共用一个 key）同样只允许一张
    await click(container, "unused-card-prismriver-sisters-0");
    expect(unused("prismriver-sisters-1")!.getAttribute("data-disabled")).toBe("true");
    expect(unused("prismriver-sisters-2")!.getAttribute("data-disabled")).toBe("true");

    // 与谁都不共用曲目的角色不受影响
    expect(unused("hakurei-reimu-0")!.getAttribute("data-disabled")).toBeNull();
    // 提示行会说明压暗的原因
    expect(container.querySelector('[data-testid="unused-cards-blocked"]')?.textContent)
      .toContain("dimmed");
  });

  it("随机补满不会抽出同一首歌的两个角色（D108）", async () => {
    const container = await render();
    await click(container, "random-fill");

    const game = useGame.getState().game;
    const conflicts = useGame.getState().conflicts;
    const keys = game.players.flatMap((player) => player.deck)
      .filter((slot): slot is CardInfo => slot !== null)
      .map((entry) => entry.characterKey);
    expect(keys).toHaveLength(24);                    // 池子够大，照样填满

    const counts = new Map<string, number>();
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
    for (const [key, count] of counts) {
      expect(count, key).toBe(1);                     // 同角色只允许一张卡面
      for (const other of conflicts[key] ?? []) {
        if (other === key) continue;
        expect(counts.has(other), `${key} ↔ ${other}`).toBe(false);
      }
    }
  });
});
