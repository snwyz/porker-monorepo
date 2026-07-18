import type { ManagerOptions, SocketOptions } from "socket.io-client";

import {
  defaultReconnectPolicy,
  type ReconnectPolicy,
} from "./reconnect-policy.js";
import {
  socketIoTransportFactory,
  type SocketEventListener,
  type SocketTransport,
  type SocketTransportFactory,
} from "./transport.js";

export {
  defaultReconnectPolicy,
  ExponentialBackoffReconnectPolicy,
  type ReconnectPolicy,
  type SocketIoReconnectOptions,
} from "./reconnect-policy.js";
export {
  socketIoTransportFactory,
  type SocketEventListener,
  type SocketTransport,
  type SocketTransportFactory,
  type TransportLifecycleEvent,
} from "./transport.js";

export type ConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export interface ReliableEmitOptions {
  timeoutMs?: number;
  queue?: boolean;
  ttlMs?: number;
}

export interface ManagedSocketOptions {
  url?: string;
  socketOptions?: Partial<ManagerOptions & SocketOptions>;
  reconnectPolicy?: ReconnectPolicy;
  transportFactory?: SocketTransportFactory;
  maxQueuedOperations?: number;
  queuedOperationTtlMs?: number;
}

interface QueuedOperation<T> {
  event: string;
  payload: unknown;
  options: Required<ReliableEmitOptions>;
  expiresAt: number;
  resolve: (ack: T) => void;
  reject: (error: Error) => void;
}

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_QUEUE_TTL_MS = 8_000;
const DEFAULT_MAX_QUEUE = 20;

function connectionError(message: string): Error {
  return new Error(message);
}

/**
 * 浏览器端 Socket.IO 连接管理：显式重连策略、连接状态、事件订阅和有界可靠队列。
 * 队列只应接收已具备服务端幂等键的业务操作。
 */
export class ManagedSocket {
  readonly socket: SocketTransport;
  private state: ConnectionState = "connecting";
  private readonly stateListeners = new Set<(state: ConnectionState) => void>();
  private readonly queue: QueuedOperation<unknown>[] = [];
  private readonly maxQueuedOperations: number;
  private readonly queuedOperationTtlMs: number;

  constructor(options: ManagedSocketOptions = {}) {
    this.maxQueuedOperations = options.maxQueuedOperations ?? DEFAULT_MAX_QUEUE;
    this.queuedOperationTtlMs =
      options.queuedOperationTtlMs ?? DEFAULT_QUEUE_TTL_MS;
    const reconnectPolicy = options.reconnectPolicy ?? defaultReconnectPolicy;
    const transportFactory = options.transportFactory ?? socketIoTransportFactory;
    this.socket = transportFactory.create(options.url, {
      path: "/socket.io",
      transports: ["websocket"],
      withCredentials: true,
      ...reconnectPolicy.toSocketOptions(),
      ...options.socketOptions,
    });
    this.socket.onLifecycle("connect", () => {
      this.setState("connected");
      void this.flushQueue();
    });
    this.socket.onLifecycle("disconnect", () => this.setState("disconnected"));
    this.socket.onLifecycle("reconnect_attempt", () => this.setState("reconnecting"));
    this.socket.onLifecycle("reconnect_error", () => this.setState("reconnecting"));
    this.socket.onLifecycle("reconnect_failed", () => this.setState("disconnected"));
  }

  getState(): ConnectionState {
    return this.state;
  }

  onStateChange(listener: (state: ConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  on(event: string, listener: SocketEventListener): this {
    this.socket.on(event, listener);
    return this;
  }

  off(event: string, listener?: SocketEventListener): this {
    this.socket.off(event, listener);
    return this;
  }

  subscribe(event: string, listener: SocketEventListener): () => void {
    this.on(event, listener);
    return () => this.off(event, listener);
  }

  emitAck<T>(
    event: string,
    payload: unknown,
    options: ReliableEmitOptions = {},
  ): Promise<T> {
    const resolvedOptions: Required<ReliableEmitOptions> = {
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      queue: options.queue ?? false,
      ttlMs: options.ttlMs ?? this.queuedOperationTtlMs,
    };
    if (this.socket.connected) {
      return this.sendAck<T>(event, payload, resolvedOptions.timeoutMs);
    }
    if (!resolvedOptions.queue) {
      return Promise.reject(connectionError("SOCKET_DISCONNECTED"));
    }
    if (this.queue.length >= this.maxQueuedOperations) {
      return Promise.reject(connectionError("SOCKET_QUEUE_FULL"));
    }
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        event,
        payload,
        options: resolvedOptions,
        expiresAt: Date.now() + resolvedOptions.ttlMs,
        resolve: resolve as (ack: unknown) => void,
        reject,
      });
    });
  }

  disconnect(): void {
    this.rejectQueuedOperations("SOCKET_DISCONNECTED");
    this.socket.disconnect();
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    for (const listener of this.stateListeners) listener(state);
  }

  private async flushQueue(): Promise<void> {
    while (this.socket.connected && this.queue.length > 0) {
      const operation = this.queue.shift();
      if (!operation) return;
      if (operation.expiresAt <= Date.now()) {
        operation.reject(connectionError("SOCKET_QUEUE_EXPIRED"));
        continue;
      }
      try {
        operation.resolve(
          await this.sendAck(
            operation.event,
            operation.payload,
            operation.options.timeoutMs,
          ),
        );
      } catch (error) {
        operation.reject(
          error instanceof Error ? error : connectionError("SOCKET_ACK_FAILED"),
        );
      }
    }
  }

  private sendAck<T>(event: string, payload: unknown, timeoutMs: number): Promise<T> {
    return this.socket.emitAck<T>(event, payload, timeoutMs);
  }

  private rejectQueuedOperations(code: string): void {
    for (const operation of this.queue.splice(0)) {
      operation.reject(connectionError(code));
    }
  }
}

export function createManagedSocket(options?: ManagedSocketOptions): ManagedSocket {
  return new ManagedSocket(options);
}
