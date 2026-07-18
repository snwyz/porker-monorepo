# 任务 1：移除 catalog 并迁移消息编号

## 实现

- 删除 `packages/i18n/src/catalog.json`，移除其导入、导出与 `Catalog`/`validateCatalog` 类型接口。
- 新增 `validateDictionaries(zh, en)`：校验两份字典的键集合、`P` 加六位数字格式，以及占位符集合。
- 启动时仅以 `zh-CN` 与 `en` 字典进行校验；`t(locale, code, params)` 的调用形式未变。
- 将 `apps`、`packages` 内的消息编号统一补零为六位；唯一剩余的 `P2002` 是 Prisma 错误码，并非应用消息编号。

## TDD 证据

### RED

命令：`rtk pnpm --filter @poker/i18n test`

结果：失败，7 个测试中 5 个失败。关键错误为 `Unknown message code: P000042`；新加的键集合与占位符不一致断言也因 `validateDictionaries` 尚未提供而失败。

### GREEN

命令：`rtk pnpm --filter @poker/i18n test`

结果：通过，1 个测试文件、7 个测试全部通过。

## 验证

- `rtk pnpm --filter @poker/i18n typecheck`：通过。
- `rtk pnpm --filter @poker/i18n lint`：通过。
- `rtk pnpm --filter @poker/i18n build`：通过。
- `rtk pnpm --filter @poker/i18n format`：通过。
- `rtk pnpm --filter @poker/web test`：通过，16 个文件、52 个测试。
- `rtk pnpm --filter @poker/agents test`：通过，4 个文件、28 个测试。
- `rtk pnpm --filter @poker/tms test`：通过，1 个文件、4 个测试。
- `rtk pnpm --filter @poker/tms-api test`：通过，6 个文件、21 个测试。
- `rtk pnpm --filter @poker/game-server test`：未通过，环境缺少 `DATABASE_URL`，Prisma 初始化失败；与本次改动无关，未重复执行。
- `rtk git diff --check`：通过。
- `rtk rg -n -P 'P[0-9]{1,5}(?![0-9])' apps packages`：仅匹配 `apps/game-server/src/identity/guest.service.ts` 的 Prisma `P2002`，无旧应用消息编号。

## 文件

- i18n：`messages.ts`、`index.ts`、两份 locale 字典、`translate.test.ts`，并删除 `catalog.json`。
- 调用点：游戏服务、Web、TMS 测试/页面、agents、contracts、db 中的消息编号均已补零。

## 自查

- 未修改或暂存 `apps/tms/package.json`、`pnpm-lock.yaml`、`docs/superpowers/plans/2026-07-18-source-first-i18n-review.md`。
- 提交前将检查暂存清单、文件体积、忽略规则与生成目录，且仅暂存本任务文件。
- `t` 的三参数调用方式保持不变。

## 问题与关注点

- `apps/tms-api` 的生产实现仍包含 catalog 文件路径和 catalog 领域逻辑；按任务边界未提前重构该后续 API 工作。因此在其后续迁移完成前，不能据此任务单独宣称整个生产发布链已完全摆脱 catalog。
- 游戏服务端 E2E 需提供测试数据库的 `DATABASE_URL` 才能运行。

## 编号下界修复

### 修复

- `validateDictionaries` 的消息编号校验由 `^P\\d{6}$` 收紧为 `^P(?!000000$)\\d{6}$`，仅接受 `P000001`–`P999999`。
- 在 `translate.test.ts` 增加最小回归测试：两份字典均包含 `P000000` 时，必须抛出 `Invalid message code: P000000`。
- 未处理 TMS API catalog 或发布链；该范围保留给任务 2。

### TDD 证据

#### RED

命令：`rtk pnpm --filter @poker/i18n test`

结果：失败，1 个测试文件中 8 个测试有 1 个失败；`rejects message codes below P000001` 预期抛出 `Invalid message code: P000000`，实际未抛错。退出状态 1。

#### GREEN

命令：`rtk pnpm --filter @poker/i18n test`

结果：通过，1 个测试文件、8 个测试全部通过。退出状态 0。

### 文件

- `packages/i18n/src/messages.ts`
- `packages/i18n/src/translate.test.ts`
- `.superpowers/sdd/task-1-report.md`

## 关键缺陷修复：非应用标识符误补零

### 修复

- 还原 `PokerEscrow.sol` 的 OpenZeppelin `EIP712` 导入、继承与构造器调用；还原 ABI 中 `EIP712DomainChanged` 事件名，未改变合约 ABI 语义。
- 还原 Task 1 变更涉及的全部 Prisma 错误码 `P2002`、`P2034`，以及 PostgreSQL SQLSTATE `57P01`、`57P02`、`57P03`；同时还原 `ledger.unit.test.ts` 的真实 Prisma 错误码期望。
- 删除 i18n 已失效的 `extract-catalog` 公开脚本和 `scripts/extract-catalog.ts`，使 locale 字典成为唯一消息来源。

### TDD 证据

#### RED

- `rtk pnpm --filter @poker/db exec vitest run src/ledger.unit.test.ts`：失败，恢复为 `P2002` 的唯一约束冲突断言实际得到 `false`，证明运行时代码仍错误使用 `P002002`。
- Node 静态不变量断言（覆盖合约源、ABI、6 个 db 实现文件）失败：`packages/contracts/src/PokerEscrow.sol missing EIP712`。
- `rtk pnpm --filter @poker/contracts test -- --match-contract PokerEscrowTest` 无法执行：环境缺少 `forge`，报 `forge: command not found`；未安装工具。

#### GREEN

- `rtk pnpm --filter @poker/db exec vitest run src/ledger.unit.test.ts`：通过，1 个文件、1 个测试。
- 同一 Node 静态不变量断言通过，确认源与 ABI 均使用正确的 EIP712 名称，db 中的 Prisma/SQLSTATE 均恢复且无补零残留。

### 验证

- `rtk run -c 'pnpm --filter @poker/i18n typecheck'`：通过。
- `rtk run -c 'pnpm --filter @poker/i18n test'`：通过，1 个文件、8 个测试。
- `rtk run -c 'pnpm --filter @poker/db typecheck'`：通过。
- `rtk rg -n 'EIP000712|P00(?:2002|2034)' packages apps`：零命中。
- `rtk rg -n 'catalog\\.json|extract-catalog' packages/i18n`：零命中。

### 文件

- `packages/contracts/src/PokerEscrow.sol`
- `packages/contracts/abi/PokerEscrow.json`
- `packages/db/src/chain.ts`
- `packages/db/src/game-server.ts`
- `packages/db/src/ledger.ts`
- `packages/db/src/ledger.unit.test.ts`
- `packages/db/src/withdrawal.ts`
- `packages/i18n/package.json`
- 删除 `packages/i18n/scripts/extract-catalog.ts`
- `.superpowers/sdd/task-1-report.md`

### 剩余问题

- 不能运行合约 Foundry 测试或编译，因为本环境未安装 `forge`；静态不变量已直接覆盖本次错误的导入、继承、构造器及 ABI 事件名。
- `apps/tms-api` 的生产 catalog 迁移仍由任务 2 负责，未在本修复中提前改动。

## 最终独立修复：i18n 自有键与失效脚本路径

### 修复

- `packages/i18n/package.json` 的 `lint` 与 `format` 命令不再将已删除的 `scripts` 目录作为输入，其他检查目标保持不变。
- `validateDictionaries` 使用 `Object.hasOwn(en, code)` 比较字典自有键，避免原型链上的同名键使不一致的键集合错误通过。
- `translate.test.ts` 增加最小回归用例：中文字典自有 `P000042`，英文仅从原型继承该键且自有 `P000043` 时，必须拒绝。

### TDD 证据

#### RED

命令：`rtk pnpm --filter @poker/i18n test`

结果：失败，9 个测试中 1 个失败；新增原型链键用例预期抛出 `Dictionary keys do not match`，实际未抛错。退出状态 1。

#### GREEN 与验证

- `rtk pnpm --filter @poker/i18n test`：通过，1 个文件、9 个测试。
- `rtk pnpm --filter @poker/i18n lint`：通过。
- `rtk pnpm --filter @poker/i18n format`：通过。

### 文件

- `packages/i18n/package.json`
- `packages/i18n/src/messages.ts`
- `packages/i18n/src/translate.test.ts`
- `.superpowers/sdd/task-1-report.md`
