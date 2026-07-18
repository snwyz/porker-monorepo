# Task 3：中文 Ant Design 审核表格实现报告

## 结论

已将 TMS 审核页从英文原生卡片界面改为中文 Ant Design 表格。表格固定为“编号｜英文原文｜中文译文｜审核状态”四列，英文与中文字段均可编辑；审核决定通过 Task 2 的提案更新接口提交，最终写入通过 Modal 二次确认后调用审批接口。服务返回的 `proposal.code` 直接展示，并由测试约束为 `P` 加六位数字，前端不自行分配编号。

## TDD 过程

### RED

先重写 `apps/tms/src/features/review/review-page.test.tsx`，覆盖以下契约：

- 中文固定四列；
- DOM 来自 Ant Design `Table`，英中字段来自 Ant Design `Input`；
- 待审核状态标签与审核按钮；
- 不出现占位符列；
- 展示服务返回的六位编号；
- 显式付费兜底确认仍传给 API；
- Modal 二次确认后调用确认写入 API；
- 中文成功与失败反馈。

执行：

```text
pnpm --filter @poker/tms test -- review-page.test.tsx
```

结果：1 个测试文件失败，4/4 测试失败；失败原因为旧界面仍使用英文按钮、英文标签与原生卡片，符合预期 RED。

### GREEN

完成最小实现后，首次运行进入 Ant Design 时发现 jsdom 缺少 `ResizeObserver` 与 `matchMedia`。根因明确后只在组件测试内增加最小浏览器 API 桩，没有修改依赖或测试配置。随后修正 user-event 对花括号键盘语法的测试输入方式，并使用项目现有 Chai 断言能力。

最终定向测试与全量 TMS 测试均为 4/4 通过。

## 实现内容

- `review-page.tsx`
  - 页面文案全部改为中文；
  - 使用 Ant Design `Table`、`Input`、`Button`、`Modal`，控制区同时使用 `Select` 与 `Checkbox`；
  - 表格只定义四个固定列，不渲染占位符、来源、模型等占位列；
  - 英中编辑先更新当前审核草稿；点击“通过”或“驳回”时提交完整的 `en`、`zh-CN` 与 `decision`；
  - 所有条目通过且占位符一致后，才允许打开确认写入 Modal；
  - 写入成功、启动失败、状态更新失败与写入失败均显示中文反馈。
- `review-row.tsx`
  - 使用 Ant Design `Tag` 展示“待审核／已通过／已驳回”；
  - 使用 Ant Design `Button` 提供通过与驳回操作；
  - 保留占位符一致性校验，但只以内联错误提示呈现，不新增表格列。
- `api.ts`
  - 提案更新类型与 Task 2 API 对齐，包含 `en`、`zh-CN`、`decision`；
  - HTTP 错误改为中文。
- `globals.css`
  - 移除会覆盖 Ant Design 控件的通用原生控件样式；
  - 增加表格页、控制区、反馈与移动端布局样式。

## Task 2 API 对接说明

当前后端公开接口为任务创建、运行、提案更新和审批写入；`allocateNextCode()` 只存在于后端服务内部，没有公开 HTTP 路由。因此本任务没有虚构新接口，也没有在前端本地计算编号，而是直接展示运行结果中由服务返回的 `proposal.code`，测试要求其格式为 `^P\d{6}$`。

## 验证结果

| 验证项 | 结果 | 摘要 |
| --- | --- | --- |
| 定向组件测试 | 通过 | 1 文件，4/4 测试通过 |
| TMS 全量测试 | 通过 | 1 文件，4/4 测试通过 |
| TMS typecheck | 通过 | `tsc --noEmit`，退出码 0 |
| TMS lint | 通过 | `eslint .`，0 错误、0 警告 |
| TMS build | 通过 | Next.js 生产构建完成，静态页面生成成功 |

构建约 17 秒，无长耗时问题。测试期间 jsdom 会输出 Ant Design 查询伪元素样式时的 `getComputedStyle` 非实现提示；该提示不影响断言和退出码，不属于浏览器运行时错误。

构建后预检还发现当前 Git 忽略规则未覆盖 `apps/tms/.next/` 与 `apps/tms/tsconfig.tsbuildinfo`，Next.js 也会自动改写 `next-env.d.ts`。本次已清理两个生成物并还原由构建造成的 `next-env.d.ts` 变化；由于 Task 3 不允许扩大到仓库配置，没有修改忽略规则。

## 范围与隔离

- 未修改 TMS API 后端、agent、i18n 文件；
- 未修改或暂存 `apps/tms/package.json`、`pnpm-lock.yaml`、`docs/superpowers/plans/2026-07-18-source-first-i18n-review.md`；
- 未读取 `.gitignore`；
- 未执行 push、merge、tag 或历史重写。
