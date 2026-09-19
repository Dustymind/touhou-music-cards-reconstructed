/** PeerJS 传输：真实 WebRTC（跨机器）。信令走 PeerJS 公共服务器，也可换成自建。 */
import Peer, { type DataConnection } from "peerjs";

import { randomToken } from "../rng";
import type { Message } from "./protocol";
import type { Role, Transport } from "./transport";

const PREFIX = "tmc-cards-";

/** 主机占 `tmc-cards-<room>`；其他人必须用**别的** id，否则信令服务器会以
 *  `ID ... is taken` 拒绝连接（客户端仍然连到主机 id）。后缀只是标识，不用种子（D104）。 */
function peerIdFor(role: Role, roomId: string): string {
  if (role === "host") return PREFIX + roomId;
  return `${PREFIX}${roomId}-${randomToken(6)}`;
}

interface PeerServerOptions {
  host?: string;
  port?: number;
  path?: string;
  secure?: boolean;
}

export class PeerTransport implements Transport {
  readonly myIndex = 0;
  private readonly peer: Peer;
  private readonly connections = new Map<number, DataConnection>();
  private readonly messageHandlers = new Set<(from: number, message: Message) => void>();
  private readonly leaveHandlers = new Set<(index: number) => void>();
  private nextIndex = 1;
  /** 连接打开前先攒着：握手消息（hello）往往比 WebRTC 通道就绪更早 */
  private readonly pending = new Map<number, string[]>();
  private readonly openConnections = new Set<number>();

  constructor(readonly role: Role, private readonly roomId: string, options: PeerServerOptions = {}) {
    this.peer = new Peer(peerIdFor(role, roomId), {
      debug: 1,
      ...(options.host ? { host: options.host } : {}),
      ...(options.port ? { port: options.port } : {}),
      ...(options.path ? { path: options.path } : {}),
      ...(options.secure !== undefined ? { secure: options.secure } : {}),
    });
    if (role === "host") this.acceptIncoming();
    else this.connectToHost();
  }

  /** 主机：接受连接并分配下标。 */
  private acceptIncoming(): void {
    this.peer.on("connection", (connection) => {
      const index = this.nextIndex++;
      this.connections.set(index, connection);
      this.track(connection, index);
    });
  }

  /** 跟踪一条连接：记录 data / close，并在 open 之后把攒下的消息发出去。 */
  private track(connection: DataConnection, index: number): void {
    connection.on("data", (data) => this.dispatch(index, data));
    const markOpen = () => {
      this.openConnections.add(index);
      const queued = this.pending.get(index);
      if (queued === undefined) return;
      this.pending.delete(index);
      for (const message of queued) connection.send(message);
    };
    if (connection.open) markOpen();
    else connection.on("open", markOpen);
    connection.on("close", () => {
      this.openConnections.delete(index);
      this.pending.delete(index);
      this.connections.delete(index);
      for (const handler of this.leaveHandlers) handler(index);
    });
  }

  /** 客户端：连上主机（0）。 */
  private connectToHost(): void {
    const connect = () => {
      const connection = this.peer.connect(PREFIX + this.roomId, { reliable: true });
      this.connections.set(0, connection);
      this.track(connection, 0);
    };
    if (this.peer.open) connect();
    else this.peer.on("open", connect);
  }

  private dispatch(from: number, data: unknown): void {
    let message: Message;
    try {
      message = typeof data === "string" ? (JSON.parse(data) as Message) : (data as Message);
    } catch {
      return;
    }
    for (const handler of this.messageHandlers) handler(from, message);
  }

  sendToHost(message: Message): void {
    this.send(0, message);
  }

  private send(index: number, message: Message): void {
    const connection = this.connections.get(index);
    const payload = JSON.stringify(message);
    if (connection !== undefined && this.openConnections.has(index)) {
      connection.send(payload);
      return;
    }
    // 连接对象可能都还没建出来（`peer.connect` 要等信令 socket 打开），一样先排队
    // 通道还没开：先排队，`track` 会在 open 后按序补发（最多留 64 条，防内存泄漏）
    const queue = this.pending.get(index) ?? [];
    queue.push(payload);
    if (queue.length > 64) queue.shift();
    this.pending.set(index, queue);
  }

  broadcast(message: Message, except?: number): void {
    for (const index of this.connections.keys()) {
      if (index === except) continue;
      this.send(index, message);
    }
  }

  sendTo(index: number, message: Message): void {
    this.send(index, message);
  }

  onMessage(handler: (from: number, message: Message) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onPeerLeave(handler: (index: number) => void): () => void {
    this.leaveHandlers.add(handler);
    return () => this.leaveHandlers.delete(handler);
  }

  close(): void {
    for (const connection of this.connections.values()) connection.close();
    this.connections.clear();
    this.pending.clear();
    this.openConnections.clear();
    this.peer.destroy();
    this.messageHandlers.clear();
    this.leaveHandlers.clear();
  }
}
