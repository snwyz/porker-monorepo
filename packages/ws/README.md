# @poker/ws

浏览器端 Socket.IO 连接管理封装(单文件 `index.ts`),解决"网络抖动/重连期间怎么不丢用户操作、怎么给上层一个稳定的连接状态"的问题。

## 核心:`ManagedSocket`

- **连接状态机**:`connecting` → `connected` / `reconnecting` → `disconnected`,通过 `onStateChange` 订阅,UI 可以据此显示"连接中/已断线"提示。
- **带 ack 的可靠 emit**:`emitAck(event, payload, options)` 用 `socket.timeout().emit()` 包装成 Promise,超时/服务端报错都会 reject。
- **断线队列(可选)**:`options.queue: true` 时,断线期间的操作不会立即失败,而是进队列等重连后自动重放(`flushQueue`),每条操作有 `ttlMs` 过期时间和 `maxQueuedOperations` 上限防止无限堆积。
  - **重要约束(见源码注释)**:队列只应该塞**服务端已经有幂等键**的业务操作(比如带 `actionId` 的下注请求),否则重放可能导致重复执行。
- 默认走 `transports: ["websocket"]`、`withCredentials: true`,重连最多 5 次、指数退避(1s ~ 5s,带随机抖动)。

## 扩展点

- **重连策略**：通过 `reconnectPolicy` 注入实现了 `ReconnectPolicy` 的对象。默认的 `ExponentialBackoffReconnectPolicy` 仅生成 Socket.IO Manager 的重连参数，实际退避和调度仍由 Socket.IO 完成；不要额外启动 `backo2`，以免形成双重重连计时器。
- **传输层**：通过 `transportFactory` 注入 `SocketTransportFactory`。`ManagedSocket` 只依赖 `SocketTransport` 的连接状态、事件订阅和带 ack 发送能力；未来可用 Worker 代理实现该接口，保持上层 `ManagedSocket` API 不变。

```ts
import {
  createManagedSocket,
  ExponentialBackoffReconnectPolicy,
} from "@poker/ws";

const socket = createManagedSocket({
  reconnectPolicy: new ExponentialBackoffReconnectPolicy({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 10_000,
    randomizationFactor: 0.25,
  }),
});
```

## 使用方式

被 `poker-web` 用来建立到 `poker-api` 的 WebSocket 连接,收发的消息体类型来自 `@poker/shared`。
