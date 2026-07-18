# @poker/db

基于 Prisma 的数据访问层,承载德州扑克平台的账本、桌位、链上充值/提现等所有需要强一致性的写操作。解决的核心问题是:**多个并发请求同时改同一份钱/同一张桌子状态时,如何保证不多花、不少花、不重复执行**。

## 关键文件

| 文件 | 作用 |
|---|---|
| `client.ts` | 单例 `PrismaClient`(挂在 `globalThis` 防止热重载重复创建连接) |
| `ledger.ts` | **复式记账核心**。`postTransaction` 保证每笔交易 entries 之和为 0(不平就报错),`reference` 做幂等键,`payloadHash` 防止同 reference 传不同内容。`reserveBuyIn`/`settleCashOut` 是买入/提现的语义封装。全部用 `Serializable` 隔离级别 + 冲突重试(最多 5 次)对抗并发。 |
| `game-server.ts` | 桌面/房间/手牌的持久化:创建房间、抢座位(`claimTableSeat`)、断线宽限期、以及**手牌事件溯源**(`commitDurableAction` 用 `actionId` 去重、`expectedVersion` 做乐观锁,写 `HandEvent` + `GameSnapshot`)。也管访客登录发放初始筹码和钱包 nonce 登录。 |
| `withdrawal.ts` | 链上提现的两阶段流程:`reserveWithdrawal`(锁定余额 + 签名 + 幂等)→ `transitionWithdrawal`(COMPLETED/RELEASED 结算或退款)。 |
| `chain.ts` | 链上事件索引器的持久化:`withChainIndexerLock` 用 Postgres advisory lock + 租约世代号(fence)防止多实例竞争扫链;`creditChainDeposit`/`commitChainDepositRange` 记账充值,`rewindChainDeposits` 处理链重组(reorg)回滚。 |
| `trace.ts` | 操作链路追踪事件的读写(配合 `@poker/trace` 的 `TraceContext`)。 |
| `index.ts` | 统一导出以上所有公开 API。 |

## 设计要点(未来改动前必看)

- **所有跨行写操作都在 `Serializable` 事务里,并对 `P2034`(序列化冲突)重试**,对 `P2002`(唯一键冲突,通常是幂等键重复)做"查已有记录返回"而不是报错。
- **账本余额靠 `LedgerEntry` 聚合算出**(`getBalance` = sum),没有单独的余额字段,避免双写不一致。
- 数据模型定义在 `prisma/schema.prisma`,`build` 脚本会先 `prisma generate` 再 `tsc`,改了 schema 记得跑一遍 build 才能让类型生效。
