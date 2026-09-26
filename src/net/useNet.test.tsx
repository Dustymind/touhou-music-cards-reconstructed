/** 联机 React 层：开房/加入/聊天/意图落地（真实 GamePanel + 进程内总线）。 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DataBundle } from "../data/types";
import { clickTestId, loadRealBundle, renderGamePanel } from "../test-utils";
import { useGame } from "../game/useGame";

/** 两端握手比的是三个模式各一个哈希（协议 v5 / 契约 §6 C3）。 */
function dataHashes(): DataHashes {
  return (window as unknown as { __TMC_DATA_HASH__: DataHashes }).__TMC_DATA_HASH__;
}
import * as rules from "../game/rules";
import { emptyState } from "../game/types";
import { __busHub, __setTransportFactory, useNet } from "./useNet";
import { effectiveCustomSourceUrl, useSession } from "../store/session";
import { createHostEngine, helloIntent } from "./engines";
import type { DataHashes, Message } from "./protocol";

let bundle: DataBundle;
let root: Root | null = null;

async function renderPanel(): Promise<HTMLElement> {
  const mounted = await renderGamePanel(bundle);
  root = mounted.root;
  return mounted.container;
}



describe("联机（React 层）", () => {
  beforeEach(async () => {
    localStorage.clear();
    bundle = await loadRealBundle();
    // `AppShell` 平时把它挂在 window 上（这里渲染的是游戏页，所以自己挂一份）
    (window as unknown as { __TMC_DATA_HASH__?: DataHashes }).__TMC_DATA_HASH__ = {
      originals: bundle.datasets.originals.index.contentHash,
      otomads: bundle.datasets.otomads.index.contentHash,
      custom: bundle.datasets.custom.index.contentHash,
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
    await clickTestId(container, "net-host");
    const net = useNet.getState();
    expect(net.role).toBe("host");
    expect(net.shareCode).toBeTruthy();
    expect(container.querySelector('[data-testid="net-share-code"]')?.textContent).toContain("code:");
    expect(container.querySelector('[data-testid="net-status"]')?.textContent).toContain("hosting");
  });

  it("第二端握手成功后收到快照与参与者列表", async () => {
    const container = await renderPanel();
    await clickTestId(container, "net-host");
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
    await clickTestId(container, "net-host");
    const peer = __busHub().connect("client");
    const received: Message[] = [];
    peer.onMessage((_from, message) => received.push(message));
    peer.sendToHost(helloIntent("Guest", false,
      { originals: "another-hash-xxxx", otomads: "another-hash-yyyy", custom: "another-hash-zzzz" }));

    const reject = received.find((message) => message.kind === "reject");
    expect(reject).toBeDefined();
    // 人话：**指明是哪个模式**的数据不同（三个都不同就都列出来）
    expect((reject as { detail: string }).detail).toBe("原曲 + 音MAD + 自定义");
    // 主机不把被拒绝的连接算进参与者
    expect(useNet.getState().peers).toHaveLength(0);
  });

  // ---- 自定义源（F3）：主机在模式 3 下把它随 reject 发过来，本地怎么处理 ----

  /** 在总线上摆一台**真的主机**（不经 useNet）：这样才能让 useNet 去当**客户端**，
   *  走完整的 `client engine → onCustomSourceHint → 采用/待确认` 那条路。
   *  主机的 custom 哈希与客户端不同 ⇒ 必然被拒，正合这条用例要的现场。 */
  function startRawHost(customSourceUrl: string): { hellos: Message[]; reply: (message: Message) => void } {
    const transport = __busHub().connect("host");
    const hellos: Message[] = [];
    let clientIndex = 0;
    transport.onMessage((from, message) => {
      if (message.kind !== "hello") return;
      hellos.push(message);
      clientIndex = from;
    });
    createHostEngine(transport, {
      getState: () => rules.adjustDeckSize(emptyState(), 2, 2),
      applyState: () => undefined,
      applyIntent: () => undefined,
      getConfig: () => ({ musicMode: "custom", sessionSeed: 42, customSourceUrl }),
      dataHash: { ...dataHashes(), custom: "host-only-hash" },
      selfName: "Host",
    });
    /** 以主机的身份回一条消息给最后那个握手的客户端（总线里主机是下标 0）。 */
    return { hellos, reply: (message: Message) => __busHub().deliver(clientIndex, 0, message) };
  }

  it("本地没有自己的源 ⇒ 自动采用主机那份，并且只重发一次 hello（F3）", async () => {
    const hostUrl = "https://host.example.com/manifest.json";
    const { hellos } = startRawHost(hostUrl);
    await act(async () => { useSession.setState({ musicMode: "custom", customSourceUrl: "" }); });

    await act(async () => { useNet.getState().join({ roomId: "room", name: "Guest" }); });
    expect(hellos).toHaveLength(1);
    expect((hellos[0] as { customSourceUrl?: string }).customSourceUrl).toBeUndefined();  // 空串不发

    // 主机的 reject 里带着它自己的源 ⇒ 本地空 ⇒ **自动采用**（只写会话级覆盖，不写回存档）
    expect(useSession.getState().customSourceOverride).toEqual({ url: hostUrl, from: "host" });
    expect(useSession.getState().customSourceUrl).toBe("");
    expect(useNet.getState().pendingCustomSource).toMatchObject({ url: hostUrl, adopted: true });

    // 数据重建后 AppShell 调它 ⇒ 重发一次，并且带上刚采用的源
    await act(async () => { useNet.getState().retryHello(); });
    expect(hellos).toHaveLength(2);
    expect((hellos[1] as { customSourceUrl?: string }).customSourceUrl).toBe(hostUrl);

    // **只重发一次**：再调多少次都不发（否则"采用 → 还是不同 → 再采用"会死循环）
    await act(async () => { useNet.getState().retryHello(); });
    await act(async () => { useNet.getState().retryHello(); });
    expect(hellos).toHaveLength(2);
  });

  it("本地有自己的源且不同 ⇒ 挂起等用户点头；采用只改会话级覆盖（F3）", async () => {
    const { hellos } = startRawHost("https://host.example.com/m.json");
    await act(async () => {
      useSession.setState({ musicMode: "custom", customSourceUrl: "https://mine.example.com/m.json" });
    });

    await act(async () => { useNet.getState().join({ roomId: "room", name: "Guest" }); });
    // 有别的值 ⇒ **不自动采用**，等用户确认
    expect(useNet.getState().pendingCustomSource)
      .toMatchObject({ url: "https://host.example.com/m.json", adopted: false, detail: "自定义" });
    expect(useSession.getState().customSourceOverride).toBeNull();
    expect(effectiveCustomSourceUrl(useSession.getState())).toBe("https://mine.example.com/m.json");

    // 用户点头 ⇒ 采用（会话级）+ 可以重发
    await act(async () => { useNet.getState().adoptHostCustomSource(); });
    expect(useSession.getState().customSourceOverride)
      .toEqual({ url: "https://host.example.com/m.json", from: "host" });
    expect(useSession.getState().customSourceUrl).toBe("https://mine.example.com/m.json");  // 存档没动
    await act(async () => { useNet.getState().retryHello(); });
    expect(hellos).toHaveLength(2);
  });

  it("用户拒绝 ⇒ 清掉待办，自己的源一个字不改（留在房外）", async () => {
    startRawHost("https://host.example.com/m.json");
    await act(async () => {
      useSession.setState({ musicMode: "custom", customSourceUrl: "https://mine.example.com/m.json" });
    });
    await act(async () => { useNet.getState().join({ roomId: "room", name: "Guest" }); });
    expect(useNet.getState().pendingCustomSource).not.toBeNull();

    await act(async () => { useNet.getState().dismissHostCustomSource(); });
    expect(useNet.getState().pendingCustomSource).toBeNull();
    expect(effectiveCustomSourceUrl(useSession.getState())).toBe("https://mine.example.com/m.json");
  });

  it("主机会话配置里的源只**显示**（`hostCustomSourceUrl`），离开房间清掉", async () => {
    const hostUrl = "https://host.example.com/m.json";
    const { hellos, reply } = startRawHost(hostUrl);
    await act(async () => {
      useSession.setState({ musicMode: "custom", customSourceUrl: "https://mine.example.com/m.json" });
    });
    await act(async () => { useNet.getState().join({ roomId: "room", name: "Guest" }); });
    expect(hellos).toHaveLength(1);

    // 喂一份"主机接受"的 welcome：配置里带着主机那份源 —— 它只该被**显示**，不该改本地存档
    await act(async () => {
      reply({
        kind: "welcome", yourIndex: 1, peers: [], state: rules.adjustDeckSize(emptyState(), 2, 2),
        seq: 1, melee: false,
        config: { musicMode: "custom", sessionSeed: 7, customSourceUrl: hostUrl },
      });
    });
    expect(useNet.getState().hostCustomSourceUrl).toBe(hostUrl);
    expect(useSession.getState().customSourceUrl).toBe("https://mine.example.com/m.json");

    await act(async () => { useNet.getState().leave(); });
    expect(useNet.getState().hostCustomSourceUrl).toBe("");
  });

  it("客户端的抢拍意图到达主机后落到本地状态", async () => {
    const container = await renderPanel();
    await clickTestId(container, "net-host");
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

  it("客户端的 `confirmStart` 意图让主机开赛，新快照照常广播", async () => {
    const container = await renderPanel();
    await clickTestId(container, "net-host");
    const peer = __busHub().connect("client");
    const received: Message[] = [];
    peer.onMessage((_from, message) => received.push(message));
    peer.sendToHost(helloIntent("Guest", false, dataHashes()));
    received.length = 0;

    await act(async () => {
      peer.sendToHost({ kind: "confirmStart" });
    });
    // 广播靠 `start()` 自己写 store（订阅在 useNet 里），不是靠那句多余的 setState
    expect(received.some((message) => message.kind === "snapshot")).toBe(true);
    expect(useGame.getState().game.state).toBe("countdown");
  });

  it("聊天双向可达", async () => {
    const container = await renderPanel();
    await clickTestId(container, "net-host");
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
    await clickTestId(container, "net-host");
    await clickTestId(container, "net-leave");
    expect(useNet.getState().role).toBeNull();
    expect(useNet.getState().status).toBe("offline");
  });
});
