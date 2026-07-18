# @poker/poker-engine

无副作用的德州扑克规则引擎(纯函数 + 不可变 state),解决"一手牌该怎么发牌、下注是否合法、边池怎么分、谁赢了摊牌"这些游戏规则问题。不含网络、存储、并发控制——那些在 `@poker/db` 的 `game-server.ts` 里,靠 `TableState.version` 做乐观锁对接。

## 关键文件

| 文件 | 作用 |
|---|---|
| `cards.ts` | 牌的基本类型和解析:`parseCard("Ah")`、`validateDeck`(检测重复/非法牌)。 |
| `state.ts` | `TableState`(整桌状态,含 `version` 字段用于乐观并发控制)、`startHand`(发一手新牌,处理前注/大小盲/全下)、`headsUpHand`(单挑测试用简化构造)。 |
| `commands.ts` | 玩家可下达的命令(`fold`/`check`/`call`/`bet`/`raise`)和产生的事件(`GameEvent`)类型定义。 |
| `reducer.ts` | **规则核心**。`applyCommandResult`:校验命令合法性(轮次、下注额、raise 权利)→ 计算新 state → `finishOrPassAction` 判断该轮下注是否结束、要不要发下一条街、整手是否打完。`legalActions` 反过来算出某玩家当前能做哪些动作(供前端渲染按钮)。 |
| `pots.ts` | 边池计算(`buildPots`,按 `handCommitted` 分层)和摊牌结算(`settleShowdown`:补公共牌、比牌、分池、找 winner、处理分不尽的零头筹码按钮左手边优先)。 |
| `evaluator.ts` | 7 选 5 手牌评分(`evaluateSeven`,暴力枚举 C(7,5)=21 种组合取最大),`compareHands` 做大小比较。 |
| `invariants.ts` | `assertInvariants(state)`:一大堆状态自洽性检查(座位唯一、筹码非负、all-in 玩家筹码必须为 0 等),主要用在测试里防止 reducer 写出非法状态。 |
| `lifecycle.ts` | 手牌之间的过渡:`advanceHand`(结算完一手后开下一手,按钮位轮转、重新发牌)、`addOn`(补码)、`resolveTimeout`(超时自动 check/fold)。 |

## 设计要点

- **所有函数都是纯函数**,`TableState` 全程 `Object.freeze`,便于测试和回放(事件溯源存在 `@poker/db` 的 `HandEvent` 表)。
- `applyCommand` 会在非法操作时 `throw CommandError`;`applyCommandResult` 是不抛错的版本(返回 `{ ok: false, code, version }`),给需要区分错误类型返回给客户端的调用方用。
