# TMS 快照发布 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用单一仓库外快照原子保存 TMS 审批结果，并在后续显式 Git 门禁中生成仓库 i18n 候选文件。

**Architecture:** `SnapshotPublisher` 只写 `TMS_DATA_DIR/published/current.json`；审批从快照或种子字典建立下一版本，校验后单次 fsync+rename。仓库内 catalog/zh-CN 仅由显式候选生成步骤写入，生产不读取 TMS 数据目录。

**Tech Stack:** NestJS、Node fs/promises、Zod、Vitest。

## Global Constraints

- 快照和任务数据必须在仓库外的真实路径。
- 发布必须是单文件 fsync+rename；失败不得改变 `current.json`。
- 生产 Web/game-server 不读取 `TMS_DATA_DIR`。
- 测试只写系统临时目录副本；不修改实际 i18n 源文件。

---

### Task 1: 单快照审批发布

**Files:**
- Create: `apps/tms-api/src/publication/snapshot.schema.ts`, `apps/tms-api/src/publication/snapshot.repository.ts`
- Modify: `apps/tms-api/src/approvals/approval.service.ts`, `apps/tms-api/src/app.module.ts`, `apps/tms-api/test/approval.e2e-spec.ts`

**Interfaces:** `PublishedSnapshot = { version: number; catalog: Record<string, number[]>; en: Record<string,string>; "zh-CN": Record<string,string> }`；`SnapshotRepository.publish(snapshot): Promise<void>`。

- [ ] **Step 1: 写失败测试。** 模拟 rename 失败，断言原 `current.json` 字节不变且 job 为 `PUBLISH_FAILED`；审批成功后断言快照包含完整 catalog/en/zh-CN。
- [ ] **Step 2: 验证 RED。** 运行 `pnpm --config.verify-deps-before-run=ignore --filter @poker/tms-api test -- approval.e2e-spec.ts`，预期因 SnapshotRepository 不存在失败。
- [ ] **Step 3: 实现最小快照仓储。** 在 `published` 子目录写同目录临时 JSON，写入后 `handle.sync()`，一次 `rename` 到 `current.json`；读取时由 Zod 校验。ApprovalService 校验所有 proposal 后只发布快照，不写仓库 i18n 文件。
- [ ] **Step 4: 验证 GREEN。** 运行同一 E2E，预期通过；再运行 tms-api test/typecheck/lint。
- [ ] **Step 5: Git 门禁与提交。** 检查暂存文件、大小、ignore 生效和 `git diff --check`，只提交 TMS API 源码/测试。

### Task 2: 显式候选源文件生成

**Files:**
- Create: `apps/tms-api/src/publication/candidate-writer.ts`
- Modify: `apps/tms-api/src/approvals/approval.service.ts`, `apps/tms-api/test/approval.e2e-spec.ts`

**Interfaces:** `writeCandidate(snapshot, target: { catalogFile; zhFile }): Promise<void>`；仅由显式受控命令/测试调用，返回候选路径与内容摘要。

- [ ] **Step 1: 写失败测试。** 快照成功后模拟候选生成失败，断言 `current.json` 不变、仓库源文件未写入。
- [ ] **Step 2: 验证 RED。** 运行 approval E2E，预期候选 writer 缺失失败。
- [ ] **Step 3: 实现候选写入。** 从已验证快照生成目标内容；默认目标必须由调用方显式提供，拒绝仓库内隐式自动发布；失败记录 job 生成状态但不回滚快照。
- [ ] **Step 4: 验证 GREEN。** 运行 tms-api test/typecheck/lint，确认生产模块未读取 TMS_DATA_DIR。
- [ ] **Step 5: Git 门禁与提交。** 仅提交源码和测试；不得提交任何快照或候选输出。
