import type { ManagerOptions } from "socket.io-client";

/** Socket.IO 原生重连器使用的退避参数。 */
export type SocketIoReconnectOptions = Pick<
  ManagerOptions,
  | "reconnection"
  | "reconnectionAttempts"
  | "reconnectionDelay"
  | "reconnectionDelayMax"
  | "randomizationFactor"
>;

/**
 * 为连接注入重连参数。
 *
 * 策略只提供参数，实际调度仍完全由 Socket.IO 的 Manager 完成，避免出现两套
 * 重连计时器。
 */
export interface ReconnectPolicy {
  toSocketOptions(): SocketIoReconnectOptions;
}

export class ExponentialBackoffReconnectPolicy implements ReconnectPolicy {
  constructor(
    private readonly options: SocketIoReconnectOptions = {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 5_000,
      randomizationFactor: 0.5,
    },
  ) {}

  toSocketOptions(): SocketIoReconnectOptions {
    return { ...this.options };
  }
}

export const defaultReconnectPolicy = new ExponentialBackoffReconnectPolicy();
