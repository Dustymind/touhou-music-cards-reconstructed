/** 主机/客户端引擎的收敛测试：用进程内总线把两端连起来，逐条断言状态摘要一致。 */
import { describe, expect, it } from "vitest";

import * as rules from "../game/rules";
import { emptyState, type GameState } from "../game/types";
import { createRng } from "../rng";
import { createClientEngine, createHostEngine, helloIntent } from "./engines";
import type { DataHashes } from "./protocol";

/** 握手比的是**三个模式各一个**哈希（协议 v5 / 契约 §6 C3）。 */
const HASH: DataHashes = {
  originals: "hash-aaaaaaaaaaaa", otomads: "hash-cccccccccccc", custom: "hash-dddddddddddd",
};
import { stateDigest, type ClientIntent, type PeerInfo, type SessionConfigWire } from "./protocol";
import { peerServerOptions } from "./useNet";
import { BusHub } from "./transport";

/** 一台"机器"：持有自己的 GameState 与"主机下发的会话配置"，可选地跑主机/客户端引擎。 */
class Endpoint {
  state: GameState;
  peers: PeerInfo[] = [];
  errors: string[] = [];
  chat: string[] = [];
  /** 主机端：本机生成的权威种子；客户端：采用主机下发的种子（D104） */
  seed: number;
  config: SessionConfigWire | null = null;
  /** 主机端：当前"生效的自定义源链接"（模式 3 才随 reject/config 下发，F3） */
  customSourceUrl = "";
  /** 主机端：当前音乐模式 */
  musicMode: SessionConfigWire["musicMode"] = "originals";
  /** 客户端：主机给过来的自定义源提示（url + detail） */
  sourceHints: [string, string][] = [];

  constructor(readonly name: string, state?: GameState, seed = 1) {
    this.state = state ?? rules.adjustDeckSize(emptyState(), 2, 2);
    this.seed = seed;
  }

  /** 两端**共用**的那部分依赖：客户端引擎只拿得到这些（R4：`getConfig` 不属于它）。 */
  deps() {
    return {
      getState: () => this.state,
      applyState: (state: GameState) => { this.state = state; },
      applyIntent: (intent: ClientIntent, from: number) => { this.apply(intent, from); },
      applyConfig: (config: SessionConfigWire) => {
        this.config = config;
        this.seed = config.sessionSeed;      // 客户端采用主机种子
      },
      dataHash: HASH,
      selfName: this.name,
      onChat: (_from: number, text: string) => this.chat.push(text),
      onError: (message: string) => this.errors.push(message),
      onPeers: (peers: PeerInfo[]) => { this.peers = peers; },
      onCustomSourceHint: (url: string, detail: string) => this.sourceHints.push([url, detail]),
    };
  }

  /** 主机引擎：多一项"读会话配置"（快照带着它下发，D104）。 */
  hostDeps() {
    return {
      ...this.deps(),
      getConfig: (): SessionConfigWire => ({
        musicMode: this.musicMode, sessionSeed: this.seed, customSourceUrl: this.customSourceUrl,
      }),
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
        this.state = rules.confirmStart(this.state, from, createRng(this.seed));
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
  const host = createHostEngine(hostTransport, hostEndpoint.hostDeps());
  const client = createClientEngine(clientTransport, clientEndpoint.deps());
  return { hostEndpoint, clientEndpoint, hostTransport, clientTransport, host, client };
}

describe("联机引擎", () => {
  it("握手后客户端拿到主机快照与自己的下标", () => {
    const hub = new BusHub();
    const { hostEndpoint, clientEndpoint, clientTransport, host } = connect(hub);
    clientTransport.sendToHost(helloIntent("Guest", false, HASH));

    expect(clientEndpoint.state.deckRows).toBe(2);
    expect(clientEndpoint.peers.map((peer) => peer.name)).toEqual(["Host", "Guest"]);
    expect(hostEndpoint.chat.some((line) => line.includes("connected"))).toBe(true);
    expect(clientEndpoint.errors).toEqual([]);
    expect(host.peers().length).toBe(2);
  });

  it("客户端的抢拍意图经主机落地后，两端摘要一致", () => {
    const hub = new BusHub();
    const { hostEndpoint, clientEndpoint, clientTransport } = connect(hub);
    clientTransport.sendToHost(helloIntent("Guest", false, HASH));

    // 主机把当前角色的卡放到客户端那侧（1 号牌桌）
    hostEndpoint.state = rules.setCard(hostEndpoint.state, 1, 0, { characterKey: "a", cardIndex: 0 });
    hostEndpoint.state = {
      ...hostEndpoint.state, state: "turnStart", turnStartTimestamp: Date.now(),
    };

    clientTransport.sendToHost({ kind: "pick", side: 1, slot: 0, timestamp: 120 });
    expect(hostEndpoint.state.players[1]!.collected).toHaveLength(1);
    expect(stateDigest(hostEndpoint.state)).toBe(stateDigest(clientEndpoint.state));
  });

  it("会话配置（音乐模式 + 会话种子）由主机下发，客户端采用（D104）", () => {
    const hub = new BusHub();
    const { hostEndpoint, clientEndpoint, clientTransport } = connect(hub);
    hostEndpoint.seed = 987654;

    clientTransport.sendToHost(helloIntent("Guest", false, HASH));

    // 会话配置里还带着主机当前生效的自定义源链接（模式 3 才非空；这里是空串）
    expect(clientEndpoint.config)
      .toEqual({ musicMode: "originals", sessionSeed: 987654, customSourceUrl: "" });
    expect(clientEndpoint.seed).toBe(987654);        // 客户端换成主机的种子
  });

  it("主机换种子后，下一份快照把新配置带给客户端（重新抽选）", () => {
    const hub = new BusHub();
    const { hostEndpoint, clientEndpoint, clientTransport, host } = connect(hub);
    clientTransport.sendToHost(helloIntent("Guest", false, HASH));
    expect(clientEndpoint.seed).toBe(hostEndpoint.seed);

    hostEndpoint.seed = 55555;
    host.broadcastSnapshot();
    expect(clientEndpoint.config!.sessionSeed).toBe(55555);
    expect(clientEndpoint.seed).toBe(55555);
  });

  it("重连（requestSync）也会带上会话配置", () => {
    const hub = new BusHub();
    const { hostEndpoint, clientEndpoint, clientTransport, client } = connect(hub);
    hostEndpoint.seed = 246810;
    clientTransport.sendToHost(helloIntent("Guest", false, HASH));
    hostEndpoint.seed = 135791;
    client.requestSync();
    expect(clientEndpoint.config!.sessionSeed).toBe(135791);
  });

  it("数据哈希不一致 → 拒绝加入并给出可读原因", () => {
    const hub = new BusHub();
    const { clientEndpoint, clientTransport } = connect(hub);
    clientTransport.sendToHost(helloIntent("Guest", false, { ...HASH, otomads: "hash-bbbbbbbbbbbb" }));
    expect(clientEndpoint.errors.join(" ")).toContain("静态数据不一致");
    expect(clientEndpoint.errors.join(" ")).toContain("音MAD");     // 点名是哪个模式
    expect(clientEndpoint.peers).toEqual([]);
  });

  it("模式 3 + 主机有源：拒的时候把它一起发过来，人话里点名是哪个模式不同（F3）", () => {
    const hub = new BusHub();
    const { hostEndpoint, clientEndpoint, clientTransport } = connect(hub);
    hostEndpoint.musicMode = "custom";
    hostEndpoint.customSourceUrl = "https://host.example.com/manifest.json";
    clientTransport.sendToHost(helloIntent(
      "Guest", false, { ...HASH, custom: "other-custom-hash" }, "https://mine.example.com/x.json"));

    expect(clientEndpoint.errors.join(" ")).toContain("自定义");
    expect(clientEndpoint.sourceHints)
      .toEqual([["https://host.example.com/manifest.json", "自定义"]]);
  });

  it("主机**没有**源 / 不在模式 3 ⇒ 拒的时候不带那个字段（客户端没有可采用的）", () => {
    for (const [mode, url] of [["custom", ""], ["originals", "https://host.example.com/m.json"]] as const) {
      const hub = new BusHub();
      const { hostEndpoint, clientEndpoint, clientTransport } = connect(hub);
      hostEndpoint.musicMode = mode;
      hostEndpoint.customSourceUrl = url;
      clientTransport.sendToHost(helloIntent("Guest", false, { ...HASH, custom: "other-custom-hash" }));
      expect(clientEndpoint.errors.join(" ")).toContain("静态数据不一致");
      expect(clientEndpoint.sourceHints).toEqual([]);
    }
  });

  it("协议版本不一致 → 拒绝加入", () => {
    const hub = new BusHub();
    const { clientEndpoint, clientTransport } = connect(hub);
    clientTransport.sendToHost(
      { ...helloIntent("Guest", false, HASH), protocol: 99 } as ClientIntent);
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
    clientTransport.sendToHost(helloIntent("Guest", false, HASH));

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
    clientTransport.sendToHost(helloIntent("Guest", false, HASH));

    // 先收到一份较新的快照（seq 5）
    const newer = rules.adjustDeckSize(hostEndpoint.state, 3, 3);
    hub.deliver(1, 0, { kind: "snapshot", state: newer, seq: 5 });
    expect(clientEndpoint.state.deckRows).toBe(3);
    // 再收到乱序的旧快照（seq 1）→ 必须忽略
    hub.deliver(1, 0, { kind: "snapshot", state: hostEndpoint.state, seq: 1 });
    expect(clientEndpoint.state.deckRows).toBe(3);
  });
});

describe("自建信令的连接参数（https 页面别用 ws://）", () => {
  it("peersecure 省略时跟页面协议走", () => {
    expect(peerServerOptions("?peerhost=cards.example.com&peerport=443&peerpath=/peerjs", "https:").secure)
      .toBe(true);
    expect(peerServerOptions("?peerhost=127.0.0.1&peerport=9100&peerpath=/", "http:").secure).toBe(false);
  });

  it("显式 peersecure 优先", () => {
    expect(peerServerOptions("?peerhost=x&peersecure=0", "https:").secure).toBe(false);
    expect(peerServerOptions("?peerhost=x&peersecure=1", "http:").secure).toBe(true);
  });

  it("host/port/path 照旧解析", () => {
    expect(peerServerOptions("?peerhost=h&peerport=9000&peerpath=/peerjs", "http:"))
      .toEqual({ host: "h", port: 9000, path: "/peerjs", secure: false });
  });
});
