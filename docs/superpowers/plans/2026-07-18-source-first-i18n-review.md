# 中文源文优先审核台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除 catalog，迁移六位编号，并提供中文 Ant Design 表格以审核后直接增量写入英中文 locale 文件。

**Architecture:** `zh-CN.json` 是编号与中文源文的唯一来源；`en.json` 必须同键且占位符一致。TMS API 为审核改动生成英文建议并一次性、安全地写入两份 locale；React 页面使用 Ant Design 表格编辑与确认。

**Tech Stack:** TypeScript、NestJS、Next.js、Ant Design（用户已安装）、Vitest、Node.js fs/promises。

## Global Constraints

- 不修改或提交用户的 `apps/tms/package.json` 与 `pnpm-lock.yaml`。
- 所有消息编号采用 `P` 加六位数字，范围为 `P000001` 至 `P999999`。
- 不保留 `catalog.json`、快照发布、候选生成或 `TMS_DATA_DIR` 的生产发布依赖。
- 测试只写临时目录副本；不 push、部署、合并或重写 Git 历史。

---

### Task 1: 移除 catalog 并迁移所有消息编号

**Files:**
- Modify: `packages/i18n/src/messages.ts`, `packages/i18n/src/translate.ts`, `packages/i18n/src/index.ts`
- Delete: `packages/i18n/src/catalog.json`
- Modify: `packages/i18n/src/locales/en.json`, `packages/i18n/src/locales/zh-CN.json` 及所有 `P` 编号引用
- Test: `packages/i18n/src/translate.test.ts` 与受影响包测试

**Interfaces:** `validateDictionaries(zh: Dictionary, en: Dictionary): void` 校验键集合、六位编号和占位符；`t(locale, code, params)` 保持调用形式。

- [ ] **Step 1: 写失败测试。** 添加断言：`P000042` 成功翻译；英中文键或占位符不一致时 `validateDictionaries` 抛错。
- [ ] **Step 2: 验证 RED。** 运行 `pnpm --filter @poker/i18n test`，预期新六位编号测试失败。
- [ ] **Step 3: 实现迁移。** 将所有 `P` 键和引用零填充至六位；删除 catalog 导入和类型；以 `zh-CN`、`en` 的键集合与模板占位符实现验证。
- [ ] **Step 4: 验证 GREEN。** 运行 i18n 测试、typecheck、lint、build；使用 `rg 'P[0-9]{1,5}' apps packages` 确认无旧引用（迁移脚本/文档除外）。

### Task 2: API 以中文源文驱动英文建议并直接写 locale

**Files:**
- Modify: `apps/tms-api/src/jobs/job.schema.ts`, `apps/tms-api/src/translations/translations.service.ts`, `apps/tms-api/src/approvals/approval.schema.ts`, `apps/tms-api/src/approvals/approval.service.ts`, `apps/tms-api/src/approvals/approval.controller.ts`
- Delete: `apps/tms-api/src/publication/`
- Modify: `apps/tms-api/src/app.module.ts`, `apps/tms-api/src/main.ts`
- Test: `apps/tms-api/test/approval.e2e-spec.ts`

**Interfaces:** 审核条目可更新 `en`、`zh-CN` 和状态；确认接口校验完整字典后原子替换两份 locale，并在第二次失败时恢复第一份。

- [ ] **Step 1: 写失败 E2E。** 在临时 locale 副本中创建中文源文条目，断言英文建议使用中文输入；确认后仅批准行增量写入两份文件；占位符不一致或第二次替换失败时两文件保持原样。
- [ ] **Step 2: 验证 RED。** 运行 `pnpm --filter @poker/tms-api test -- approval.e2e-spec.ts`，预期缺少英文字段与直接写入行为。
- [ ] **Step 3: 实现。** 删除快照/候选依赖；实现最大编号分配、中文到英文翻译输入、两文件临时写入+fsync+替换及恢复；保留只允许本地 TMS API 访问。
- [ ] **Step 4: 验证 GREEN。** 运行 TMS API 测试、typecheck、lint、build。

### Task 3: 中文 Ant Design 审核表格

**Files:**
- Modify: `apps/tms/src/features/review/review-page.tsx`, `apps/tms/src/features/review/review-row.tsx`, `apps/tms/src/lib/api.ts`, `apps/tms/src/app/globals.css`
- Modify: `apps/tms/src/features/review/review-page.test.tsx`

**Interfaces:** 表格列固定为“编号｜英文原文｜中文译文｜审核状态”；英中文字段可编辑；“确认写入”调用 Task 2 API；新增中文条目显示服务分配的六位编号。

- [ ] **Step 1: 写失败组件测试。** 断言中文列名、Ant Design `Table`、两个可编辑输入、状态标签和确认写入按钮；不展示占位符列。
- [ ] **Step 2: 验证 RED。** 运行 `pnpm --filter @poker/tms test -- review-page.test.tsx`，预期当前英文原生卡片 UI 失败。
- [ ] **Step 3: 实现。** 使用现有 `antd` 的 `Table`、`Input`、`Button`、`Tag`、`Modal` 替换原生控件；更新 API 客户端类型和中文错误/成功反馈；不修改 package 或 lock 文件。
- [ ] **Step 4: 验证 GREEN。** 运行 TMS UI 测试、typecheck、lint、build。

### Task 4: 端到端迁移验证与 Git 门禁

**Files:**
- Modify: 必要的受影响测试与文档

- [ ] **Step 1: 运行全量相关验证。** 运行 i18n、agents、TMS API、TMS UI、game-server 与 web 的受影响测试，以及根 typecheck/lint。
- [ ] **Step 2: 浏览器验收。** 打开本地 TMS：录入中文、自动分配六位编号、生成英文、编辑两列、确认写入；检查 `en.json` 与 `zh-CN.json` 增量更新。
- [ ] **Step 3: Git 门禁。** 检查 staged 清单与体积、`git diff --check`、ignore 生效、无 `.next`/`dist`/`coverage`/`node_modules` 跟踪内容；不得暂存用户的 antd 与锁文件改动。
