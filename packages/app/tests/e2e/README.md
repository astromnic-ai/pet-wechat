# 小程序 E2E 前置环境

运行 `pnpm test:e2e` 前会先执行 `scripts/check-e2e-env.js`，用于快速检查环境是否完整，避免测试在页面等待阶段超时。

## 必要条件

- 后端 API：默认 `http://localhost:9527`，可通过 `API_BASE_URL` 覆盖。
- 开发登录：本地后端需使用 `ENABLE_DEV_LOGIN=true` 启动，根目录 `pnpm dev:server` 已包含该配置。
- 数据库与对象存储：后端需要可用的 PostgreSQL 与 MinIO/S3。
- 微信开发者工具：打开 `packages/app/dist`，并在「设置 → 安全设置」开启服务端口。
- 自动化端口：默认 `ws://127.0.0.1:9420`，可通过 `WEAPP_WS_ENDPOINT` 覆盖。

启动自动化端口示例：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
  --project /Users/yangmei/codebase/pet-wechat/packages/app/dist \
  --auto-port 9420 \
  --lang zh \
  --trust-project
```

## 线上影响

这些条件只用于本地/CI 自动化测试。线上用户不依赖 `ENABLE_DEV_LOGIN`、mock 蓝牙设备或 mock WiFi。

生产环境必须保持 `NODE_ENV=production`，并且不能配置 `ENABLE_DEV_LOGIN=true` 或 `SMS_MOCK_CODE`。服务启动预检会阻止这两类配置进入生产。
