# @poker/i18n

平台通用的国际化底层:词条字典 + 翻译函数,不含任何框架(React/Next)相关代码。解决"文案怎么按 locale 取、怎么做参数插值、locale 怎么从 URL/请求头识别"的问题。

## 关键文件

| 文件 | 作用 |
|---|---|
| `locale.ts` | `Locale` 类型(目前只有 `"en" \| "zh-CN"`)+ URL/Accept-Language 相关的纯函数:`localePathname`(给路径加/换 locale 前缀)、`localeFromPathname`、`normalizeLocale`(从请求头猜 locale)。 |
| `messages.ts` | 加载 `locales/en.json` / `locales/zh-CN.json` 两份词典,导出 `dictionaries`,并有 `validateDictionaries` 做完整性校验(两份字典 key 是否对齐等)。词条 key 是 `MessageCode`(如 `P000085`)。 |
| `translate.ts` | `t(locale, code, params)`:按 `{0}` `{1}` 占位符做参数替换,缺参数或未知 code 直接抛错(不会静默输出空字符串)。 |
| `locales/*.json` | 实际文案,`@poker/agents` 的翻译 agent 会读写这里的词条。 |

## 使用方式

被 `@poker/next-i18n`(React/Next 封装层)和 `@poker/agents` 的翻译任务依赖。本包本身不含 React,可在 Node 脚本、Next Server/Client、任意运行时里用。
