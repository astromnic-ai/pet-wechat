# 项目说明

YEHEY 宠物"在场" - 微信小程序 MVP

## 协作语言约定

- 提 GitHub Issue 时请使用中文
- 编写项目文档时请使用中文

## 技术栈

- 前端：Taro 4 + React + TypeScript + Sass（微信小程序）
- 后端：Hono + Bun + TypeScript
- 数据库：PostgreSQL + Drizzle ORM
- 包管理：pnpm workspace monorepo

## 项目结构

- `packages/app` - Taro 小程序前端
- `packages/server` - Hono 后端 API
- `packages/shared` - 前后端共享类型定义

## 端口约定

- 后端 API：9527（避开常用端口 3000/8000/8080/5173）
- PostgreSQL：5432（Docker Compose）

## 常用命令

- `pnpm dev:server` - 启动后端（Bun）
- `pnpm dev:app` - 启动小程序前端
- `pnpm db:generate` - 生成数据库迁移
- `pnpm db:migrate` - 执行数据库迁移
- `pnpm db:studio` - 打开 Drizzle Studio

- 需要通过 pencil mcp 拿到前端设计图，复用设计图内部的资源文件，确保实现与设计一致

## 微信开发者工具调试

### Console 日志读取

项目已安装 `miniprogram-automator`，可以通过微信开发者工具的自动化 websocket 读取小程序 `console` 和异常日志。

端口关系：
- 微信开发者工具「设置 → 安全设置 → 服务端口」必须开启。
- IDE 服务端口会写在 `~/Library/Application Support/微信开发者工具/*/Default/.ide`，例如 `18309`。这个端口可能随机变化，只用于微信 CLI 和 IDE 通信。
- 自动化 websocket 建议固定为 `9420`，通过 CLI 的 `--auto-port 9420` 指定。后续 Codex/脚本连接 `ws://127.0.0.1:9420` 即可，不需要关心随机 IDE 服务端口。

开启自动化端口：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
  --project /Users/yangmei/codebase/pet-wechat/packages/app/dist \
  --auto-port 9420 \
  --lang zh \
  --trust-project
```

读取当前小程序 console/exception 日志：

```bash
node - <<'NODE'
const automator = require('./packages/app/node_modules/miniprogram-automator');
const wsEndpoint = process.env.WEAPP_WS_ENDPOINT || 'ws://127.0.0.1:9420';

(async () => {
  const mp = await automator.connect({ wsEndpoint });
  console.log(`[weapp-log] connected: ${wsEndpoint}`);

  mp.on('console', (log) => {
    console.log('[weapp:console]', JSON.stringify(log));
  });

  mp.on('exception', (error) => {
    console.error('[weapp:exception]', JSON.stringify(error));
  });

  const page = await mp.currentPage();
  console.log('[weapp-log] currentPage', JSON.stringify({
    path: page && page.path,
    query: page && page.query,
  }));

  await new Promise(() => {});
})().catch((error) => {
  console.error('[weapp-log] failed:', error && error.stack ? error.stack : error);
  process.exit(1);
});
NODE
```

快速验证链路：

```bash
node - <<'NODE'
const automator = require('./packages/app/node_modules/miniprogram-automator');

(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  mp.on('console', (log) => console.log('[weapp:console]', JSON.stringify(log)));
  await mp.evaluate(() => {
    console.log('[codex-probe] console log bridge ok', { time: Date.now() });
    console.warn('[codex-probe] console warn bridge ok');
    return true;
  });
  await new Promise((resolve) => setTimeout(resolve, 3000));
  mp.disconnect();
})();
NODE
```

排查：
- 如果连接 `ws://127.0.0.1:9420` 失败，先确认微信开发者工具已打开当前项目，并已开启「服务端口」。
- 如果 CLI 提示 `IDE service port disabled`，需要在微信开发者工具 GUI 中开启「设置 → 安全设置 → 服务端口」。
- 如果 CLI 提示 `wait IDE port timeout`，通常重启微信开发者工具后再执行 `cli auto ... --auto-port 9420`。
- 可用 `cat ~/Library/Application\ Support/微信开发者工具/*/Default/.ide` 查看当前 IDE 服务端口；这个不是 automator 连接端口。
- 可用 `lsof -nP -iTCP:9420 -sTCP:LISTEN` 确认自动化 websocket 是否已启动。

## 部署

- 服务器：SSH HK（`ssh hk`）
- 项目目录：`~/pet-wechat/`
- 反向代理：Caddy（运行在 Docker 容器 `caddy` 中）

### 域名

- 后端 API：`https://pet-wechat.yangl.com.cn`（反代 → localhost:9527）
- 管理后台：`https://pet-admin.yangl.com.cn`（反代 → localhost:9527，由 server 镜像提供 SPA）
- 文件存储：`https://pet-wechat.yangl.com.cn/storage/`（反代 → MinIO localhost:9000）

### Docker Compose 服务（docker-compose.prod.yml）

- `postgres` - PostgreSQL 16
- `minio` - MinIO 对象存储（S3 兼容）
- `server` - 后端 API + 管理后台 SPA（镜像来自 GHCR：`ghcr.io/astromnic-ai/pet-wechat/server`）

### 管理后台镜像合并

管理后台不再单独构建 nginx 镜像，也不再由 `docker-compose.prod.yml` 启动 `admin` 服务。CI 只构建 `ghcr.io/astromnic-ai/pet-wechat/server`，该镜像内置 `packages/admin` 的构建产物，由 Hono/Bun 在 9527 端口提供 SPA 静态资源和路由 fallback。

部署时需要手动调整 Caddy：将 `pet-admin.yangl.com.cn` 从原来的 `admin:80` / `localhost:9528` 改为反代到 `server:9527` / `localhost:9527`。

### 环境变量

敏感配置通过服务器上的 `.env` 文件管理（不提交到 Git）：
- `WX_APPID` / `WX_SECRET` - 微信小程序密钥
- `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` - MinIO 凭据

### 微信小程序

- AppID：`wx29ab8d3fd0cb4af0`
- GitHub 仓库：`astromnic-ai/pet-wechat`
- CI：GitHub Actions 构建 Docker 镜像推送到 GHCR
