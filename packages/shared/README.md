# @poker/shared

前后端(以及 WebSocket 消息)共用的类型定义和 zod 校验 schema,解决"客户端发的消息和服务端收的消息类型对不上"的问题——所有跨进程边界的数据形状都在这里定义一遍,双方一起用。

## 关键文件

| 文件 | 作用 |
|---|---|
| `ids.ts` | 用 zod `.brand<...>()` 做的名义类型(nominal typing):`RoomId`/`HandId`/`PlayerId`/`ActionId`,防止不同种类的字符串 ID 互相误传。`ClientActionIdSchema` 额外禁止客户端伪造 `server:` 前缀的 actionId(服务端保留命名空间)。 |
| `protocol.ts` | `PlayerActionSchema`:玩家动作(fold/check/call/bet/raise)的 discriminated union,每个动作都带 `roomId`/`handId`/`actionId`/`expectedVersion`(乐观锁版本号)。 |
| `rooms.ts` | `CreateRoomSchema`:创建房间的输入校验,带交叉字段校验(`smallBlind < bigBlind`、`bigBlind <= minBuyIn` 等业务规则)。 |
| `table.ts` | 入座/离座/加入房间的 schema:`TableJoinSchema`、`TableLeaveSchema`、`TableRoomRequestSchema`。 |
| `index.ts` | 统一导出。 |

## 使用方式

被 `poker-api`(校验入参)、`poker-web`(构造合法请求、拿到强类型的响应)和 `@poker/ws`(WebSocket 消息)共同依赖,是前后端类型契约的唯一来源——改协议先改这里。
