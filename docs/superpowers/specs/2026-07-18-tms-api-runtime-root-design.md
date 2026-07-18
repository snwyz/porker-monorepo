# TMS API 运行时仓库根目录解析设计

## 目标

确保 TMS API 无论从源码模块还是 `dist/src/main.js` 编译产物启动，都能定位仓库根目录，并读取默认 i18n 文件。

## 范围

- 新增一个纯路径解析函数：从给定模块文件所在目录开始逐级向上查找 `pnpm-workspace.yaml`。
- `main.ts` 使用该函数生成默认 i18n 文件路径。
- 增加回归测试，覆盖编译产物的 `dist/src/main.js` 布局。

## 非目标

- 不修改快照发布、候选文件生成或审批逻辑。
- 不改变 `TMS_DATA_DIR` 的仓库外约束。
- 不新增环境变量，也不改变前端 API 地址或 Codex 提供商配置。

## 设计

解析函数接收模块文件路径，先取得其目录，再逐级检查当前目录及父目录是否存在 `pnpm-workspace.yaml`。找到后返回该目录；到文件系统根目录仍未找到时抛出明确错误。

`createApp` 在未注入 i18n 文件路径时，使用解析出的仓库根目录拼接 `packages/i18n/src/catalog.json`、`packages/i18n/src/locales/en.json` 与 `packages/i18n/src/locales/zh-CN.json`。

该方案不依赖固定的 `../` 层级，因此 `src/main.ts` 与 `dist/src/main.js` 具有相同语义。测试仅构造临时目录结构，不读取或写入真实 i18n 源文件。

## 验证

1. 先增加针对 `dist/src/main.js` 路径的失败测试，证明当前固定相对路径不能找到工作区标记文件。
2. 实现解析函数后运行同一测试，确认通过。
3. 运行 TMS API 的相关 E2E、类型检查与 lint。
4. 重新构建并启动本地 API，通过 UI 创建 `codex-cli` 任务，确认不再因默认 i18n 文件路径失败。
