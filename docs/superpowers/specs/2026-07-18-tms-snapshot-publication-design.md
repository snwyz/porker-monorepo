# TMS 快照发布设计

## 目标

让 TMS 审批发布在文件系统层面具备单文件原子性，同时保持生产 Web 与 game-server 只消费仓库内的 i18n 源文件。

## 边界

- TMS 的发布快照位于仓库外 `TMS_DATA_DIR/published/current.json`。
- 快照包含 catalog、英文基线、中文词典、版本和校验元数据。
- 审批将完整快照写入同目录临时文件，`fsync` 后通过一次 `rename` 替换 `current.json`。
- TMS 不直接替换 `packages/i18n/src/catalog.json` 或 `packages/i18n/src/locales/zh-CN.json`。
- 快照审批成功后，TMS 可生成仓库内 i18n 源文件的候选改动；该改动仍需经过 Git 门禁与提交，生产运行时不读取 `TMS_DATA_DIR`。

## 失败语义

- 快照写入、fsync 或 rename 失败：保留旧 `current.json`，job 标为 `PUBLISH_FAILED`。
- 快照成功但候选源文件生成失败：保留快照，记录生成失败，不修改仓库源文件。
- 快照载入失败或校验不通过：TMS 拒绝继续发布，保留最后一个有效快照。

## 验证

- 模拟临时写入、fsync、rename 失败，断言 `current.json` 字节不变。
- 审批后断言快照包含完整且占位符一致的 catalog/词典集合。
- 断言生产 Web/game-server 路径不访问 `TMS_DATA_DIR`。
- 断言候选源文件生成失败不会改变快照或仓库 i18n 源文件。
