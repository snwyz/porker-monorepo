# @poker/trace

极小的链路追踪工具包,解决"一次操作(比如一次下注请求)在日志/数据库里怎么串起来"的问题,不依赖任何 APM 系统,只是生成结构化的追踪上下文对象。

## 内容(单文件 `index.ts`)

- `TraceContext`:`traceId`(随机 UUID)+ `sequence` + `operation` + 可选的 `roomId`/`userId`/`actionId`。
- `createTraceContext(input)`:生成一个新的 trace(自动填 `traceId`/`sequence: 0`)。
- `createSocketTraceContext(operation, raw)`:专门给 WebSocket 请求用,从任意 payload 里**只提取** `roomId`/`actionId` 这两个已知安全字段,明确不会把请求正文或凭据带入日志(见源码注释)。
- `withTraceUser(context, userId)`:事后补充 `userId`(比如鉴权通过后才知道是谁)。
- `traceMetadata(metadata)`:过滤掉 `undefined` 字段,给日志/数据库存储用的 metadata 做清理。

## 使用方式

`@poker/db` 的 `trace.ts`(`appendOperationTraceEvent`)负责把这里生成的 `TraceContext` 落库;本包本身不做任何 I/O。
