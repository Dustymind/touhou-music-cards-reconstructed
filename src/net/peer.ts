/** PeerJS 传输：真实 WebRTC（跨机器）。信令走 PeerJS 公共服务器，也可换成自建。 */
import Peer, { type DataConnection } from "peerjs";

import type { Message } from "./protocol";
import type { Role, Transport } from "./transport";

const PREFIX = "tmc-cards-";

export class PeerTransport implements Transport {
  readonly myIndex = 0;
  private readonly peer: Peer;
  private readonly connections = new Map<number, DataConnection>();
  private readonly messageHandlers = new Set<(from: number, message: Message) => void>();
  private readonly leaveHandlers = new Set<(index: number) => void>();
  private nextIndex = 1;

  constructor(readonly role: Role, private readonly roomId: string) {
    this.peer = new Peer(PREFIX + roomId, { debug: 1 });
    if (role === "host") this.acceptIncoming();
    else this.connectToHost();
  }

  /** 主机：接受连接并分配下标。 */
  private acceptIncoming(): void {
    this.peer.on("connection", (connection) => {
      const index = this.nextIndex++;
      this.connections.set(index, connection);
      connection.on("data", (data) => this.dispatch(index, data));
      connection.on("close", () => {
        this.connections.delete(index);
        for (const handler of this.leaveHandlers) handler(index);
      });
    });
  }

  /** 客户端：连上主机（0）。 */
  private connectToHost(): void {
    const attach = (connection: DataConnection) => {
      this.connections.set(0, connection);
      connection.on("data", (data) => this.dispatch(0, data));
      connection.on("close", () => {
        for (const handler of this.leaveHandlers) handler(0);
      });
    };
    const connect = () => {
      const connection = this.peer.connect(PREFIX + this.roomId, { reliable: true });
      connection.on("open", () => attach(connection));
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
    this.connections.get(0)?.send(JSON.stringify(message));
  }

  broadcast(message: Message, except?: number): void {
    for (const [index, connection] of this.connections) {
      if (index === except) continue;
      connection.send(JSON.stringify(message));
    }
  }

  sendTo(index: number, message: Message): void {
    this.connections.get(index)?.send(JSON.stringify(message));
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
    this.peer.destroy();
    this.messageHandlers.clear();
    this.leaveHandlers.clear();
  }
}
