/** 传输层抽象：把"谁发给谁"从对局逻辑里剥离出来。
 *
 * 三个实现：
 * - `BusTransport`：同一页面内的内存总线（单测与本地多实例）；
 * - `BroadcastChannelTransport`：同浏览器多标签页（无需服务器，适合本地对战）；
 * - `PeerTransport`：PeerJS（真实 WebRTC，跨机器）。
 *
 * 未来接后端权威服务端时，只需要再加一个实现（`send` 走 WebSocket），规则层零改动。
 */
import type { Message } from "./protocol";

export type Role = "host" | "client" | "observer";

export interface Transport {
  readonly role: Role;
  /** 本端在房间里的下标（主机固定 0） */
  readonly myIndex: number;
  sendToHost(message: Message): void;
  /** 仅主机可用：广播（可排除某个下标） */
  broadcast(message: Message, except?: number): void;
  /** 主机专用：只发给某个客户端 */
  sendTo(index: number, message: Message): void;
  onMessage(handler: (from: number, message: Message) => void): () => void;
  onPeerLeave(handler: (index: number) => void): () => void;
  close(): void;
}

type MessageHandler = (from: number, message: Message) => void;
type LeaveHandler = (index: number) => void;

/** 进程内总线：`BusHub` 负责把多端连起来，测试里可断言收敛。 */
export class BusHub {
  private readonly members = new Map<number, BusTransport>();
  private nextIndex = 1;

  connect(role: Role): BusTransport {
    const index = role === "host" ? 0 : this.nextIndex++;
    const transport = new BusTransport(this, index, role);
    this.members.set(index, transport);
    return transport;
  }

  deliver(to: number | "all", from: number, message: Message, except?: number): void {
    const targets = to === "all" ? [...this.members.keys()] : [to];
    for (const index of targets) {
      if (index === from || index === except) continue;
      this.members.get(index)?.receive(from, message);
    }
  }

  drop(index: number): void {
    const transport = this.members.get(index);
    this.members.delete(index);
    for (const member of this.members.values()) member.notifyLeave(index);
    transport?.closeLocal();
  }

  indices(): number[] {
    return [...this.members.keys()].sort((a, b) => a - b);
  }
}

class BusTransport implements Transport {
  private readonly messageHandlers = new Set<MessageHandler>();
  private readonly leaveHandlers = new Set<LeaveHandler>();

  constructor(private readonly hub: BusHub, readonly myIndex: number, readonly role: Role) {}

  sendToHost(message: Message): void {
    this.hub.deliver(0, this.myIndex, message);
  }

  broadcast(message: Message, except?: number): void {
    if (this.role !== "host") return;
    this.hub.deliver("all", this.myIndex, message, except);
  }

  sendTo(index: number, message: Message): void {
    if (this.role !== "host") return;
    this.hub.deliver(index, this.myIndex, message);
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onPeerLeave(handler: LeaveHandler): () => void {
    this.leaveHandlers.add(handler);
    return () => this.leaveHandlers.delete(handler);
  }

  close(): void {
    this.hub.drop(this.myIndex);
  }

  receive(from: number, message: Message): void {
    for (const handler of this.messageHandlers) handler(from, message);
  }

  notifyLeave(index: number): void {
    for (const handler of this.leaveHandlers) handler(index);
  }

  closeLocal(): void {
    this.messageHandlers.clear();
    this.leaveHandlers.clear();
  }
}

/** 同浏览器多标签页：`BroadcastChannel`（不支持时由调用方回落到 Bus）。 */
export class BroadcastChannelTransport implements Transport {
  private readonly channel: BroadcastChannel;
  private readonly messageHandlers = new Set<MessageHandler>();
  private readonly leaveHandlers = new Set<LeaveHandler>();

  constructor(readonly role: Role, readonly myIndex: number, roomId: string) {
    this.channel = new BroadcastChannel(`tmc-room-${roomId}`);
    this.channel.onmessage = (event: MessageEvent<{ from: number; message: Message }>) => {
      const { from, message } = event.data;
      for (const handler of this.messageHandlers) handler(from, message);
    };
  }

  sendToHost(message: Message): void {
    this.post(0, message);
  }

  broadcast(message: Message, except?: number): void {
    void except;
    this.post(this.myIndex, message);
  }

  sendTo(index: number, message: Message): void {
    this.post(index, message);
  }

  private post(from: number, message: Message): void {
    this.channel.postMessage({ from, message, to: undefined });
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onPeerLeave(handler: LeaveHandler): () => void {
    this.leaveHandlers.add(handler);
    return () => this.leaveHandlers.delete(handler);
  }

  close(): void {
    this.channel.close();
    this.messageHandlers.clear();
    this.leaveHandlers.clear();
  }
}

export function supportsBroadcastChannel(): boolean {
  return typeof BroadcastChannel !== "undefined";
}
