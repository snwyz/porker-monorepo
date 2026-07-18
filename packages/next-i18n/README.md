# @poker/next-i18n

把 `@poker/i18n` 的纯函数接到 Next.js 里的胶水层,解决"locale 怎么存在浏览器/怎么在 Server/Client Component 间传递/怎么在中间件里做路由重定向"的问题。四个独立入口,按运行环境拆开避免把服务端代码打进浏览器包(或反过来)。

## 四个入口

| 入口 | 文件 | 运行环境 | 作用 |
|---|---|---|---|
| `@poker/next-i18n/browser` | `browser.ts` | 浏览器 | 读写 `NEXT_LOCALE` cookie(`readLocaleCookie` / `writeLocaleCookie`)。 |
| `@poker/next-i18n/react` | `react.tsx` | Client Component | `LocaleContext` + `I18nProvider`/`LocaleProvider` + `useI18n()` hook,给组件树注入当前 `locale` 和绑定好 locale 的 `t()`。 |
| `@poker/next-i18n/next` | `next.tsx` | Client Component | 依赖 react.tsx 的 `useI18n`:`LocaleLink`(自动给 `href` 加 locale 前缀的 `next/link` 封装)、`LocaleSwitcher`(语言切换按钮组件)。 |
| `@poker/next-i18n/proxy` | `proxy.ts` | Next Middleware | `createLocaleProxy()`:请求路径不带 locale 前缀时,按 cookie 或默认值重定向到 `/{locale}/...`;放行 `/_next`、`/api`、带扩展名的静态资源。 |

## 依赖方向

`next.tsx` → `react.tsx`(用 `useI18n`);`browser.ts` 独立,被 `next.tsx` 的 `LocaleSwitcher` 用来写 cookie。所有类型/翻译逻辑都来自 `@poker/i18n`,本包不重复实现字典或插值。
