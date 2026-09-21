/** 联机 React 层：开房/加入/聊天/意图落地（真实 GamePanel + 进程内总线）。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DataBundle } from "../data/types";
import { loadRealBundle } from "../test-utils";
import { useGame } from "../game/useGame";

/** 两端握手比的是两个模式各一个哈希（协议 v4 / 契约 §6 C3）。 */
function dataHashes(): { originals: string; otomads: string } {
  return (window as unknown as { __TMC_DATA_HASH__: { originals: string; otomads: string } }).__TMC_DATA_HASH__;
}
import * as rules from "../game/rules";
import { emptyState } from "../game/types";
import { GamePanel } from "../ui/panels/GamePanel";
import { __busHub, __setTransportFactory, useNet } from "./useNet";
import { helloIntent } from "./engines";
import type { Message } from "./protocol";

let bundle: DataBundle;
let root: Root | null = null;

async function renderPanel(): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<GamePanel bundle={bundle} />);
  });
  return container;
}

async function click(container: HTMLElement, testId: string): Promise<void> {
  const element = container.querySelector(`[data-testid="${testId}"]`);
  if (!element) throw new Error(`缺少元素 ${testId}`);
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}



describe("联机（React 层）", () => {
  beforeEach(async () => {
    localStorage.clear();
    bundle = await loadRealBundle();
    (window as unknown as { __TMC_DATA_HASH__?: { originals: string; otomads: string } }).__TMC_DATA_HASH__ = {
      originals: bundle.datasets.originals.index.contentHash,
      otomads: bundle.datasets.otomads.index.contentHash,
    };
    __setTransportFactory((role) => __busHub().connect(role));
    // 联机栏只在"多人"模式下出现（用户要求），联机用例都从多人模式起
    useGame.setState({
      game: { ...rules.adjustDeckSize(emptyState(), 2, 2), mode: "multi" },
      pool: [],
    });
    useNet.getState().leave();
  });

  afterEach(async () => {
    await act(async () => {
      useNet.getState().leave();
      root?.unmount();
    });
    root = null;
    document.body.innerHTML = "";
  });

  it("开房后展示分享码与参与者列表", async () => {
    const container = await renderPanel();
    await click(container, "net-host");
    const net = useNet.getState();
    expect(net.role).toBe("host");
    expect(net.shareCode).toBeTruthy();
    expect(container.querySelector('[data-testid="net-share-code"]')?.textContent).toContain("code:");
    expect(container.querySelector('[data-testid="net-status"]')?.textContent).toContain("hosting");
  });

  it("第二端握手成功后收到快照与参与者列表", async () => {
    const container = await renderPanel();
    await click(container, "net-host");
    const roomId = useNet.getState().roomId;

    // 用总线模拟另一端
    const peer = __busHub().connect("client");
    const received: Message[] = [];
    peer.onMessage((_from, message) => received.push(message));
    peer.sendToHost(helloIntent("Guest", false, dataHashes()));

    const welcome = received.find((message) => message.kind === "welcome");
    expect(welcome).toBeDefined();
    if (welcome?.kind !== "welcome") throw new Error("没有收到 welcome");
    expect(welcome.yourIndex).toBe(1);
    expect(welcome.peers.map((entry) => entry.name)).toEqual(["Player", "Guest"]);
    expect(welcome.state.deckRows).toBe(2);
    expect(useNet.getState().peers).toHaveLength(2);
    void roomId;
  });

  it("数据哈希不一致时拒绝并显示错误", async () => {
    const container = await renderPanel();
    await click(container, "net-host");
    const peer = __busHub().connect("client");
    const received: Message[] = [];
    peer.onMessage((_from, message) => received.push(message));
    peer.sendToHost(helloIntent("Guest", false, { originals: "another-hash-xxxx", otomads: "another-hash-yyyy" }));

    expect(received.some((message) => message.kind === "reject")).toBe(true);
    // 主机不把被拒绝的连接算进参与者
    expect(useNet.getState().peers).toHaveLength(0);
  });

  it("客户端的抢拍意图到达主机后落到本地状态", async () => {
    const container = await renderPanel();
    await click(container, "net-host");
    const peer = __busHub().connect("client");
    peer.sendToHost(helloIntent("Guest", false, dataHashes()));

    // 让主机处于回合中，并把当前角色的卡放在 1 号牌桌
    await act(async () => {
      useGame.setState((slice) => {
        const players = slice.game.players.map((player) => ({ ...player, deck: player.deck.slice() }));
        // 两边都留牌，避免"抢到最后一张"直接终局
        players[0]!.deck[1] = { characterKey: "z", cardIndex: 0 };
        players[1]!.deck[0] = { characterKey: "a", cardIndex: 0 };
        players[1]!.deck[1] = { characterKey: "z", cardIndex: 1 };
        return {
          game: {
            ...slice.game, players, order: ["a"], currentKey: "a", mode: "multi",
            state: "turnStart", turnStartTimestamp: Date.now(),
          },
        };
      });
    });
    await act(async () => {
      peer.sendToHost({ kind: "pick", side: 1, slot: 0, timestamp: 100 });
    });
    expect(useGame.getState().game.players[1]!.collected).toHaveLength(1);
    expect(useGame.getState().game.state).toBe("turnWinner");
    expect(useGame.getState().game.turnWinner).toBe(1);
  });

  it("聊天双向可达", async () => {
    const container = await renderPanel();
    await click(container, "net-host");
    const peer = __busHub().connect("client");
    const received: Message[] = [];
    peer.onMessage((_from, message) => received.push(message));
    peer.sendToHost(helloIntent("Guest", false, dataHashes()));

    await act(async () => {
      peer.sendToHost({ kind: "chat", text: "hi host" });
    });
    expect(useNet.getState().chat.some((line) => line.text === "hi host")).toBe(true);

    await act(async () => {
      useNet.getState().sendChat("hi guest");
    });
    const chatToClient = received.find((message) => message.kind === "chat" && message.text === "hi guest");
    expect(chatToClient).toBeDefined();
    void container;
  });

  it("离开房间后回到离线状态", async () => {
    const container = await renderPanel();
    await click(container, "net-host");
    await click(container, "net-leave");
    expect(useNet.getState().role).toBeNull();
    expect(useNet.getState().status).toBe("offline");
  });
});
