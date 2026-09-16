/** 主机/客户端引擎的收敛测试：用进程内总线把两端连起来，逐条断言状态摘要一致。 */
import { describe, expect, it } from "vitest";

import * as rules from "../game/rules";
import { emptyState, type GameState } from "../game/types";
import { createClientEngine, createHostEngine, helloIntent } from "./engines";
import { stateDigest, type ClientIntent, type PeerInfo } from "./protocol";
import { BusHub } from "./transport";

/** 一台"机器"：持有自己的 GameState，可选地跑主机/客户端引擎。 */
class Endpoint {
  state: GameState;
  peers: PeerInfo[] = [];
  errors: string[] = [];
  chat: string[] = [];

  constructor(readonly name: string, state?: GameState) {
    this.state = state ?? rules.adjustDeckSize(emptyState(), 2, 2);
  }

  deps() {
    return {
      getState: () => this.state,
      applyState: (state: GameState) => { this.state = state; },
      applyIntent: (intent: ClientIntent, from: number) => { this.apply(intent, from); },
      dataHash: "hash-aaaaaaaaaaaa",
      selfName: this.name,
      onChat: (_from: number, text: string) => this.chat.push(text),
      onError: (message: string) => this.errors.push(message),
      onPeers: (peers: PeerInfo[]) => { this.peers = peers; },
    };
  }

  /** 主机把客户端意图落到权威状态（这里直接复用规则函数）。 */
  apply(intent: ClientIntent, from: number): void {
    switch (intent.kind) {
      case "pick": {
        const card = this.state.players[intent.side]?.deck[intent.slot];
        if (!card) return;
        const result = rules.notifyPickEvent(this.state, {
          timestamp: intent.timestamp, player: from, card, side: intent.side, slot: intent.slot,
        });
        if (result.accepted) this.state = result.state;
        return;
      }
      case "confirmStart": {
        this.state = rules.confirmStart(this.state, from);
        return;
      }
      case "confirmNext": {
        this.state = rules.confirmNext(this.state, from);
        return;
      }
      case "adjustDeckSize": {
        this.state = rules.adjustDeckSize(this.state, intent.rows, intent.columns);
        return;
      }
      default:
        return;
    }
  }
}

function connect(hub: BusHub) {
  const hostEndpoint = new Endpoint("Host");
  const clientEndpoint = new Endpoint("Guest");
  hostEndpoint.state = { ...hostEndpoint.state, order: ["a", "b"], currentKey: "a" };

  const hostTransport = hub.connect("host");
  const clientTransport = hub.connect("client");
  const host = createHostEngine(hostTransport, hostEndpoint.deps());
  const client = createClientEngine(clientTransport, clientEndpoint.deps());
  return { hostEndpoint, clientEndpoint, hostTransport, clientTransport, host, client };
}

describe("联机引擎", () => {
  it("握手后客户端拿到主机快照与自己的下标", () => {
    const hub = new BusHub();
    const { hostEndpoint, clientEndpoint, clientTransport, host } = connect(hub);
    clientTransport.sendToHost(helloIntent("Guest", false, "hash-aaaaaaaaaaaa"));

    expect(clientEndpoint.state.deckRows).toBe(2);
    expect(clientEndpoint.peers.map((peer) => peer.name)).toEqual(["Host", "Guest"]);
    expect(hostEndpoint.chat.some((line) => line.includes("connected"))).toBe(true);
    expect(clientEndpoint.errors).toEqual([]);
    expect(host.peers().length).toBe(2);
  });

  it("客户端的抢拍意图经主机落地后，两端摘要一致", () => {
    const hub = new BusHub();
    const { hostEndpoint, clientEndpoint, clientTransport } = connect(hub);
    clientTransport.sendToHost(helloIntent("Guest", false, "hash-aaaaaaaaaaaa"));

    // 主机把当前角色的卡放到客户端那侧（1 号牌桌）
    hostEndpoint.state = rules.setCard(hostEndpoint.state, 1, 0, { characterKey: "a", cardIndex: 0 });
    hostEndpoint.state = {
      ...hostEndpoint.state, state: "turnStart", turnStartTimestamp: Date.now(),
    };

    clientTransport.sendToHost({ kind: "pick", side: 1, slot: 0, timestamp: 120 });
    expect(hostEndpoint.state.players[1]!.collected).toHaveLength(1);
    expect(stateDigest(hostEndpoint.state)).toBe(stateDigest(clientEndpoint.state));
  });

  it("数据哈希不一致 → 拒绝加入并给出可读原因", () => {
    const hub = new BusHub();
    const { clientEndpoint, clientTransport } = connect(hub);
    clientTransport.sendToHost(helloIntent("Guest", false, "hash-bbbbbbbbbbbb"));
    expect(clientEndpoint.errors.join(" ")).toContain("静态数据不一致");
    expect(clientEndpoint.peers).toEqual([]);
  });

  it("协议版本不一致 → 拒绝加入", () => {
    const hub = new BusHub();
    const { clientEndpoint, clientTransport } = connect(hub);
    clientTransport.sendToHost(
      { ...helloIntent("Guest", false, "hash-aaaaaaaaaaaa"), protocol: 99 } as ClientIntent);
    expect(clientEndpoint.errors.join(" ")).toContain("协议版本不一致");
  });

  it("未握手就发意图 → 提示重连", () => {
    const hub = new BusHub();
    const { clientEndpoint, clientTransport } = connect(hub);
    clientTransport.sendToHost({ kind: "pick", side: 0, slot: 0, timestamp: 1 });
    expect(clientEndpoint.errors.join(" ")).toContain("与主机断开");
  });

  it("重连（requestSync）后状态重新对齐", () => {
    const hub = new BusHub();
    const { hostEndpoint, clientEndpoint, clientTransport, client } = connect(hub);
    clientTransport.sendToHost(helloIntent("Guest", false, "hash-aaaaaaaaaaaa"));

    // 主机推进若干步，客户端错过其中一次广播
    hostEndpoint.state = rules.adjustDeckSize(hostEndpoint.state, 1, 3);
    hostEndpoint.state = rules.setCard(hostEndpoint.state, 0, 0, { characterKey: "x", cardIndex: 0 });
    client.requestSync();
    expect(stateDigest(hostEndpoint.state)).toBe(stateDigest(clientEndpoint.state));
    expect(clientEndpoint.state.deckRows).toBe(1);
  });

  it("旧快照（seq 更小）被忽略，不会把状态打回去", () => {
    const hub = new BusHub();
    const { hostEndpoint, clientEndpoint, clientTransport } = connect(hub);
    clientTransport.sendToHost(helloIntent("Guest", false, "hash-aaaaaaaaaaaa"));

    // 先收到一份较新的快照（seq 5）
    const newer = rules.adjustDeckSize(hostEndpoint.state, 3, 3);
    hub.deliver(1, 0, { kind: "snapshot", state: newer, seq: 5 });
    expect(clientEndpoint.state.deckRows).toBe(3);
    // 再收到乱序的旧快照（seq 1）→ 必须忽略
    hub.deliver(1, 0, { kind: "snapshot", state: hostEndpoint.state, seq: 1 });
    expect(clientEndpoint.state.deckRows).toBe(3);
  });
});
