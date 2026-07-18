# TMS 本地开发说明

TMS 是内部翻译管理工具，当前不纳入生产部署，也不通过 Docker 启动。日常开发请直接在宿主机运行 UI 和 API，以获得更快的启动、热更新和调试体验。

## 本地启动

先安装仓库依赖：

```bash
pnpm install
```

在两个终端分别启动服务。

### TMS UI

```bash
pnpm -C apps/tms dev
```

默认访问地址为 <http://127.0.0.1:4000>。

### TMS API

```bash
pnpm -C apps/tms-api dev
```

该命令会持续编译 TypeScript，并在首次编译完成后启动 API；后续源码变更编译完成时会自动重启 API。默认监听 <http://127.0.0.1:4001>。UI 默认也会请求该地址；如需修改，可在启动命令前设置 `HOST` 或 `PORT`，或在启动 UI 前设置 `NEXT_PUBLIC_TMS_API_URL`。

## 数据位置

权威词典位于：

```text
i18n-data/web/en.json
i18n-data/web/zh-CN.json
```

翻译审核确认写入后，API 会更新这两个文件。运行时语言文件由 `pnpm i18n:sync` 生成。

## Docker 的使用范围

`deploy/docker-compose.yml` 仍可用于需要容器化的游戏服务、数据库、Redis 和 Caddy。TMS UI 与 TMS API 不再包含在该 Compose 配置中，也不提供 Dockerfile。

如未来需要部署 TMS 到测试环境，应重新评估认证、数据持久化、网络暴露与镜像构建方式，再单独恢复部署配置。
