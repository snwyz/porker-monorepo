import {
  io,
  type ManagerOptions,
  type Socket,
  type SocketOptions,
} from "socket.io-client";

export type SocketEventListener = Parameters<Socket["on"]>[1];
export type TransportLifecycleEvent =
  | "connect"
  | "disconnect"
  | "reconnect_attempt"
  | "reconnect_error"
  | "reconnect_failed";

/**
 * ManagedSocket 依赖的最小传输能力。
 * 未来 Worker 实现只需代理这些方法，无须暴露 Socket.IO 实例。
 */
export interface SocketTransport {
  readonly connected: boolean;
  on(event: string, listener: SocketEventListener): void;
  off(event: string, listener?: SocketEventListener): void;
  onLifecycle(
    event: TransportLifecycleEvent,
    listener: () => void,
  ): () => void;
  emitAck<T>(event: string, payload: unknown, timeoutMs: number): Promise<T>;
  disconnect(): void;
}

export interface SocketTransportFactory {
  create(
    url: string | undefined,
    options: Partial<ManagerOptions & SocketOptions>,
  ): SocketTransport;
}

class SocketIoTransport implements SocketTransport {
  constructor(private readonly socket: Socket) {}

  get connected(): boolean {
    return this.socket.connected;
  }

  on(event: string, listener: SocketEventListener): void {
    this.socket.on(event, listener);
  }

  off(event: string, listener?: SocketEventListener): void {
    this.socket.off(event, listener);
  }

  onLifecycle(event: TransportLifecycleEvent, listener: () => void): () => void {
    if (event === "reconnect_attempt") {
      this.socket.io.on(event, listener);
      return () => this.socket.io.off(event, listener);
    }
    if (event === "reconnect_error") {
      this.socket.io.on(event, listener);
      return () => this.socket.io.off(event, listener);
    }
    if (event === "reconnect_failed") {
      this.socket.io.on(event, listener);
      return () => this.socket.io.off(event, listener);
    }
    this.socket.on(event, listener);
    return () => this.socket.off(event, listener);
  }

  emitAck<T>(event: string, payload: unknown, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.socket
        .timeout(timeoutMs)
        .emit(event, payload, (error: Error | null, ack: T) => {
          if (error) reject(error);
          else resolve(ack);
        });
    });
  }

  disconnect(): void {
    this.socket.disconnect();
  }
}

export const socketIoTransportFactory: SocketTransportFactory = {
  create(url, options): SocketTransport {
    return new SocketIoTransport(io(url, options));
  },
};
