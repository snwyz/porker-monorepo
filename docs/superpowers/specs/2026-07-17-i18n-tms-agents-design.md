# 国际化、翻译 Agent 与 TMS 设计

日期：2026-07-17

## 目标与范围

将品牌与产品界面国际化，首期支持英语（`en`）和简体中文（`zh-CN`）。范围覆盖生产 Web 界面、无障碍文案、前端本地错误，以及游戏服务对客户端暴露的错误。测试与 `test-harness` 不纳入文案清单。

国际化的翻译工作由可复用的多 provider agent 平台完成；翻译结果必须经过独立 TMS 审阅后才会写入正式字典。TMS 首期仅用于本机或受控内网的可视化审阅，不实现登录、角色或公开部署。

## 文案编号与模板

所有可翻译文本使用连续的稳定编号，例如 `P00001`。调用形式固定为：

```ts
t("P00042", { 0: seconds });
```

消息模板使用位置参数 `{0}` 至 `{n}`：

```json
// en.json
{ "P00042": "{0} seconds remaining" }

// zh-CN.json
{ "P00042": "剩余 {0} 秒" }
```

业务源码不使用中文文本或英文文本作为键。编号的来源、英文基线、中文翻译、参数集合、调用位置及状态记录在机器可读 catalog 中，供审计和未来 VS Code 插件消费。

## 文案审计

实施的第一个步骤是仅扫描生产 Web 与游戏服务中面向用户的文本，并建立唯一编号清单。初筛发现 Web 有 114 处候选出现位置；该数包含重复、动态模板和非展示字符串，不能作为最终文案条数。

最终文案条数定义为 catalog 中去重后的 `P` 编号数量。审计将区分：界面文本、无障碍文本、前端本地错误、服务端错误，以及含参数模板的文本。服务端内部日志、错误常量、测试和开发辅助页面不分配用户可见文案编号。

## packages/i18n

`packages/i18n` 是语言、字典和模板语义的唯一来源：

```text
packages/i18n/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── locale.ts
    ├── messages.ts
    ├── translate.ts
    ├── catalog.json
    └── locales/
        ├── en.json
        └── zh-CN.json
```

它导出 locale 类型、浏览器语言归一化、`t(code, params?)` 和字典校验。`t` 对未知编号、缺失参数或模板不匹配在开发与测试中失败。两份字典必须具有完全相同的编号和位置参数集合。

Web 的语言优先级为用户选择 cookie、浏览器语言、英语默认值。界面提供 EN/中文切换器；选择会更新 cookie，并随 API 与 WebSocket 握手传递 locale。服务端对客户端只返回稳定错误编号和参数，例如 `{ code: "P00042", params: { "0": 15 } }`，由客户端按当前语言解析，避免把服务端自然语言直接显示给用户。

## packages/agents

`packages/agents` 提供通用的离线 agent 运行框架。`packages/i18n` 仅调用其公开的翻译能力，不依赖任何具体模型 provider。

```text
packages/agents/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── cli.ts
    ├── core/
    │   ├── agent.ts
    │   ├── provider.ts
    │   ├── runner.ts
    │   └── config.ts
    ├── providers/
    │   ├── codex-cli.ts
    │   ├── anthropic.ts
    │   ├── gemini.ts
    │   ├── openai-compatible.ts
    │   └── index.ts
    └── agents/translation/
        ├── index.ts
        ├── prompt.ts
        ├── schema.ts
        └── validate.ts
```

Provider 模式默认为 `auto`：优先探测已认证、可运行的本机 Codex CLI；不可用时按用户配置的优先级降级到 Claude、Gemini 或 OpenAI-compatible provider。用户可强制指定 provider。降级到外部模型前必须展示实际 provider/model、待翻译条数与可能费用，并要求配置显式允许付费降级或用户确认。

密钥不进入仓库、catalog 或日志，只通过环境变量或本机密钥管理提供。执行报告记录实际 provider、模型、降级原因、耗时与脱敏的失败信息。翻译 agent 输出结构化候选结果，不直接修改业务源码或正式字典。

## TMS 应用

翻译审阅拆分为两个应用：

```text
apps/
├── tms/                         # Next.js 审阅界面，唯一页面路由 /
└── tms-api/                     # 内部 API/worker：任务、agent 调用、审批和发布
```

依赖方向为：

```text
apps/tms-web → apps/tms-api → packages/agents
                         → packages/i18n
```

TMS 不读取 provider 密钥，也不直接写字典。TMS API 是创建翻译任务、查询任务状态和批准发布的唯一边界。审阅页面展示编号、英文基线、中文候选、`{n}` 参数、来源、provider 和任务状态。首期支持逐项批准或拒绝；批准时只应用已校验的任务快照，并原子更新 `zh-CN.json` 与 catalog，防止审阅内容和发布内容不一致。

完整流程为：

```text
审计并生成 catalog
→ 选择 provider 并启动翻译任务
→ agent 生成待审结果（不写正式字典）
→ TMS 可视化审阅
→ 批准
→ 校验编号、覆盖率和 {n} 模板
→ 原子更新 zh-CN.json 与 catalog
```

没有登录保护的 TMS/TMS API 不得部署至公网；其访问范围必须限制为本机或受控内网。

## 失败处理与测试

- 无可用 provider 或凭据时，任务在调用前失败并说明原因。
- 自动选择不得静默改用未配置的付费 provider。
- provider 超时、失败或输出非结构化结果时，保留任务失败状态，不发布任何字典变更。
- 翻译校验失败（编号缺失、未知编号、重复编号、参数不一致或语言覆盖不完整）时，审批被拒绝。
- 单元测试使用 mock provider，不产生模型费用；覆盖 provider 选择与降级、脱敏、超时/重试、结构化输出和模板替换。
- 集成测试覆盖 TMS 审批到字典发布、前后端错误码映射、语言切换与 WebSocket locale 传递。

## 非目标

- 本期不实现多租户、账号、角色、公开 TMS 部署或在线翻译 API。
- 本期不修改测试与开发辅助页面的显示文本。
- 本期不把模型 API key、原始模型响应或生成任务产物提交到 Git。
