# @poker/agents

调用 LLM 完成后台任务(目前是「翻译」)的多 provider 运行时,解决"用哪个模型跑任务、怎么降级、怎么防止误花钱"的问题。

## 解决的问题

- **多 provider 统一接口**:`codex-cli` / `anthropic` / `gemini` / `openai-compatible` 四种 provider 实现同一个 `AgentProvider` 接口(`isAvailable()` + `execute()`),上层不关心具体是哪家。
- **自动选择与降级**:`createAgentRunner` 按 `providerOrder` 依次探测可用性,`codex-cli` 永远被提到最前面优先尝试(免费/本地),不可用才降级到付费 provider,且付费降级需要 `allowPaidFallback` 显式放行,防止意外产生 API 费用。
- **结果校验**:每次调用返回值都用调用方传入的 zod `schema` 解析,保证类型安全。

## 关键文件

| 文件 | 作用 |
|---|---|
| `provider.ts` | `AgentProvider` 接口定义 + `providerIds` 枚举 |
| `providers/*.ts` | 四个具体 provider 实现(anthropic/gemini/codex-cli/openai-compatible 共用 `http.ts` 的 fetch 封装) |
| `runner.ts` | `createAgentRunner`:provider 选择、降级、失败上报(`report` 回调) |
| `config.ts` | `AgentConfig` 的 zod schema(`providerOrder` / `allowPaidFallback` / `models`) |
| `agents/translation/` | 具体业务场景:i18n 翻译任务的 prompt 构造、结果校验(对应 `@poker/i18n` 的词条) |
| `cli.ts` | 命令行入口:`agents run translation --input <path> --output <path>`,读文件→跑翻译 agent→写结果,付费 provider 会先在终端确认 |

## 依赖关系

被 i18n 相关的自动化脚本使用(生成/校验 `packages/i18n/src/locales/*.json` 的翻译词条)。不被 apps 直接依赖,是纯后台工具包。
