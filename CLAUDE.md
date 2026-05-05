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
- `server` - 后端 API + 管理后台 SPA（镜像来自 GHCR：`ghcr.io/thup-jds/pet-wechat/server`）

### 管理后台镜像合并

管理后台不再单独构建 nginx 镜像，也不再由 `docker-compose.prod.yml` 启动 `admin` 服务。CI 只构建 `ghcr.io/thup-jds/pet-wechat/server`，该镜像内置 `packages/admin` 的构建产物，由 Hono/Bun 在 9527 端口提供 SPA 静态资源和路由 fallback。

部署时需要手动调整 Caddy：将 `pet-admin.yangl.com.cn` 从原来的 `admin:80` / `localhost:9528` 改为反代到 `server:9527` / `localhost:9527`。

### 环境变量

敏感配置通过服务器上的 `.env` 文件管理（不提交到 Git）：
- `WX_APPID` / `WX_SECRET` - 微信小程序密钥
- `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` - MinIO 凭据

### 微信小程序

- AppID：`wx29ab8d3fd0cb4af0`
- GitHub 组织：`thup-jds/pet-wechat`
- CI：GitHub Actions 构建 Docker 镜像推送到 GHCR
