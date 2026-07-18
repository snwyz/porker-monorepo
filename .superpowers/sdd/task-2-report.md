# Task 2 实现报告

## 结论

Task 2 已完成：TMS API 现以 `zh-CN.json` 为中文源文和编号来源，AI 执行契约改为根据中文生成英文建议；审核确认只把已批准行增量写入 `en.json` 与 `zh-CN.json`，并在完整字典校验通过后执行带 `fsync` 的两文件替换。第二份 locale 替换失败时会原子恢复第一份原始内容。

catalog、发布快照、候选生成和 `TMS_DATA_DIR` 的强制生产依赖已移除。应用仍允许显式传入 `TMS_DATA_DIR` 作为兼容配置，但未设置时使用仓库外的系统临时数据目录。监听地址、请求来源和 CORS 继续限制为本机。

## TDD 证据

### RED

先重写 `apps/tms-api/test/approval.e2e-spec.ts`，覆盖：

- 中文源文作为英文建议输入；
- 仅批准行增量写入两份 locale；
- 占位符不一致时两份文件不变；
- 第二次替换失败时恢复第一份；
- 最大编号加一、六位范围及耗尽拒绝。

运行：

`pnpm --filter @poker/tms-api test -- approval.e2e-spec.ts`

结果：5 个新增用例全部失败，首个根因是旧实现仍强制要求 `TMS_DATA_DIR`；符合旧生产依赖尚未移除的预期 RED。

### GREEN

完成最小实现并构建更新后的 `@poker/agents` 运行产物后，聚焦命令通过：5 个测试文件、16 个测试全部通过。

## 实现摘要

- `TranslationsService` 直接读取中文 locale，提取占位符并把中文源文交给英文建议执行器。
- 新增 `allocateNextCode()`：基于中文字典最大六位编号分配 `max + 1`，拒绝 `P000000`、非法编号和超过 `P999999` 的分配。
- 审核 PATCH 严格接收 `en`、`zh-CN` 与审核状态。
- 确认时忽略未批准行，只合并批准行；随后校验英中键集合、六位编号、字符串值和逐条占位符集合。
- 两个目标文件先在各自目录写临时文件并 `fsync`；第一份替换成功、第二份失败时，使用预先同步的回滚文件恢复第一份，并同步目录。
- 删除发布快照、候选写入器、候选 CLI 及其专属测试/脚本。
- `createApp()` 不再强制读取 `TMS_DATA_DIR`；增加请求远端地址的 loopback 门禁，并保留 loopback 监听与本地 CORS 白名单。
- 生产代理 prompt/schema/validation 改为“中文源文 → 英文建议”，避免只在 E2E 测试桩中实现方向切换。

## 文件范围

简报内主要文件：

- `apps/tms-api/src/jobs/job.schema.ts`
- `apps/tms-api/src/translations/translations.service.ts`
- `apps/tms-api/src/approvals/approval.schema.ts`
- `apps/tms-api/src/approvals/approval.service.ts`
- `apps/tms-api/src/app.module.ts`
- `apps/tms-api/src/main.ts`
- `apps/tms-api/test/approval.e2e-spec.ts`
- 删除 `apps/tms-api/src/publication/`

简报遗漏但为接口闭环所必需的最小改动：

- `apps/tms-api/package.json`：删除已不存在的 candidate 脚本。
- `apps/tms-api/test/candidate-cli.e2e-spec.ts`：删除已移除功能的专属测试。
- `apps/tms-api/test/jobs.e2e-spec.ts`、`test/agents-executor.spec.ts`：适配无 catalog 和中文源契约。
- `packages/agents/src/agents/translation/*`、`packages/agents/src/cli.test.ts`：同步生产英文建议 prompt/schema/校验及测试。

未修改或暂存用户已有的 `apps/tms/package.json`、`pnpm-lock.yaml`、`docs/superpowers/plans/2026-07-18-source-first-i18n-review.md`。

## 验证

- TMS API test：通过，5 个文件 / 16 个测试。
- TMS API typecheck：通过。
- TMS API lint：通过。
- TMS API build：通过。
- `@poker/agents` test：通过，4 个文件 / 28 个测试。
- `@poker/agents` typecheck、lint、build：通过。
- 本次修改文件限定 Prettier check：通过。
- `git diff --check`：通过。

额外执行的 TMS API 全目录 format check 仍被 3 个本次未修改的既有文件阻塞：`src/translations/agents.executor.ts`、`test/repository-root.spec.ts`、`test/repository-root.test.ts`。为避免扩大范围未格式化这些文件；这不影响要求的 test/typecheck/lint/build。

## 自审与风险

- 原子替换明确覆盖“第二次失败、第一份恢复”，且回滚失败不会掩盖，会以包含双异常的 `AggregateError` 上报。
- 只有 `APPROVED` 行进入合并；测试使用已编辑但拒绝的现有行证明其不会写入。
- 字典完整性在任何目标替换前校验，因此占位符或键集合异常不会留下部分写入。
- 编号分配保留在服务层，未擅自新增公开端点；后续 Task 3 整合新增条目 UI/API 契约时可直接调用。
- `TMS_DATA_DIR` 保留为可选兼容配置而非强制依赖；默认任务数据目录是系统临时目录，跨系统清理策略仍由运行环境负责。
