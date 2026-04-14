# 用户端 API 补全 需求文档

## 背景

小程序现有页面存在大量占位/硬编码：互动次数写死 0、邮箱显示"未设置"、账号安全项无点击响应、系统设置仅本地存储、固件升级仅 toast、帮助中心等页面完全硬编码。本次补齐后端接口 + 前端接入，让真实数据/配置驱动相关页面。

不在范围：管理后台（已由 PR #54 处理）、硬件 OTA 真实下发、富媒体 CMS 后台编辑器。

## 关键决策（Decisions）

- **D-01 登录体系保持不变**：用户端不引入密码。前端删除"修改密码"入口，后端不实现 change-password 接口。原因：现有登录靠微信 OAuth + 手机号短信，引入密码会扩大注册/找回流程的改动。
- **D-02 互动事件表先建立**：硬件未对接时，`interaction_events` 表先落库，查询接口返回真实聚合值（无数据时为 0）。后续由设备端补上报。不使用 behaviors 表近似。
- **D-03 账号级设置独立成表**：新增 `user_settings` 表，字段固定为 `message_enabled / sound_enabled / theme / language`。首次读取若无行则返回默认值。不合并进 users 表（避免混用业务字段与 UI 偏好）。
- **D-04 帮助/关于/隐私/用户协议用 Markdown 文件**：内容放在 `packages/server/content/*.md`，接口返回原始 Markdown + version（取 git mtime 或 frontmatter）。前端渲染 Markdown。不建 `content_pages` 表。
- **D-05 固件升级含 OTA 触发 API，硬件未接入时返回 pending**：新增 `firmware_releases` 表管理版本。接口含 `GET /api/devices/firmware/status`（聚合全部设备）+ `POST /api/devices/:id/firmware/upgrade`（触发升级，记录 `upgrade_status`）。
- **D-06 设备 claim_status 加字段**：`collar_devices` / `desktop_devices` 新增 `claim_status` 枚举：`occupied / available / reset_required`。默认 `occupied`。用户主动删除 → `available`；后续硬件上报判断是否需要 `reset_required`（本期预留字段，硬件未接入不变更）。
- **D-07 设备累计使用时长存真实值**：新增 `usage_duration_minutes` 字段（integer, 默认 0）。本期不实现计算逻辑（硬件上报后累加），但前端读取真实字段，不再基于 `createdAt` 估算。
- **D-08 互动 buckets 粒度固定**：`range=day` → 24 个小时桶；`range=week` → 7 个天桶；`range=month` → 30 个天桶。时区按服务器本地（后续再考虑用户时区）。
- **D-09 账号绑定（手机/邮箱）走验证码**：`bind-phone` 复用现有短信验证码流程；`bind-email` 新增邮件验证码流程（本期 mock 验证码为固定值 `000000`，并加 `TODO: 接入邮件服务`）。不允许直接改绑定。
- **D-10 响应格式保持现状**：沿用 `c.json({ data })` / `c.json({ error }, statusCode)` 模式，不新增统一包装层。新增接口使用 zod 做输入校验（首次引入），错误统一 400。
- **D-11 一个大 PR 交付**：后端接口 + 前端接入合并为一个 PR，按文件分层清晰提交。不切分多 PR。

## 需求条目（EARS）

### R-01 宠物互动统计
- **R-01.1** 当用户请求 `GET /api/pets/:petId/interaction-stats` 时，系统应返回 `{ totalCount, todayCount, weekCount, monthCount }`（整数，无数据时 0）。
- **R-01.2** 当用户请求 `GET /api/pets/:petId/interaction-stats?range=day|week|month` 时，系统应额外返回 `buckets: [{ label, count }]`，桶数按 D-08。
- **R-01.3** 当用户不是宠物所有者/授权者时，系统应返回 403。
- **R-01.4** 前端"宠物记录页"应从该接口读取数据，替换硬编码 0 和"待接入"提示。

### R-02 用户信息邮箱
- **R-02.1** `GET /api/me` 应返回 `email`（可空）字段。
- **R-02.2** `PUT /api/me` 应允许更新 `nickname / avatarUrl`，但不允许直接改 `email`（改邮箱走 R-07）。
- **R-02.3** 前端"用户信息页"邮箱栏应读取 `email`，空值展示"未设置"占位但真实字段来自接口。

### R-03 账号级设置
- **R-03.1** `GET /api/settings` 应返回 `{ messageEnabled, soundEnabled, theme, language }`，首次无记录返回默认值 `{ true, true, "system", "zh-CN" }`。
- **R-03.2** `PUT /api/settings` 应支持部分字段更新（unset 字段不改动），并 upsert 到 `user_settings`。
- **R-03.3** 前端"系统设置页"应将本地 Taro 存储迁移为接口调用；读写失败时降级本地缓存。

### R-04 固件状态/升级
- **R-04.1** `GET /api/devices/firmware/status` 应返回当前用户名下所有设备的 `[{ deviceId, deviceType, currentVersion, latestVersion, hasUpdate, releaseNotes, upgradeStatus }]`。
- **R-04.2** `POST /api/devices/:deviceType/:deviceId/firmware/upgrade` 应将 `upgrade_status` 置为 `pending` 并返回 `{ accepted: true, upgradeStatus: "pending" }`。硬件未接入时不做进一步动作。
- **R-04.3** 前端"系统设置-固件"与"设备管理"应读取该接口，展示真实版本对比与升级按钮态。

### R-05 设备增强字段
- **R-05.1** `GET /api/devices` 返回每个设备应包含 `claimStatus, lastOnlineAt, inactiveDays, isInactive, usageDurationMinutes`。
- **R-05.2** `isInactive` 判定：`lastOnlineAt` 距今 > 30 天视为 true。
- **R-05.3** 用户通过 `DELETE /api/devices/:type/:id` 删除时，系统应将 `claim_status` 置为 `available`（软删除逻辑保持现状，字段更新即可）。
- **R-05.4** 前端"设备管理"列表应展示真实累计时长，不再基于 `createdAt` 估算；长期未使用设备展示"可删除"标签。

### R-06 内容页（help/about/privacy/user-agreement）
- **R-06.1** `GET /api/content/:slug` 应返回 `{ slug, title, body, version, updatedAt }`，`slug ∈ { help, about, privacy, user-agreement }`。
- **R-06.2** 内容源为仓库 `packages/server/content/{slug}.md`，首行 H1 作为 title，其余为 body。
- **R-06.3** 前端"帮助中心 / 关于 YEHEY / 用户协议 / 隐私政策"四个页面应读取该接口并用 Markdown 渲染器展示。
- **R-06.4** 不存在的 slug 返回 404。

### R-07 账号绑定（不含密码）
- **R-07.1** `POST /api/account/bind-phone/send-code` → 发送短信验证码（mock 返回 `000000` 提示日志）。
- **R-07.2** `POST /api/account/bind-phone/verify` 入参 `{ phone, code }` → 验证成功后更新 `users.phone`。
- **R-07.3** `POST /api/account/bind-email/send-code` → mock 验证码（TODO: 接入邮件服务）。
- **R-07.4** `POST /api/account/bind-email/verify` 入参 `{ email, code }` → 验证成功后更新 `users.email`。
- **R-07.5** 前端"账号安全"页应接入手机/邮箱绑定流程，删除"修改密码"入口（D-01）。

### R-08 Schema 变更
- **R-08.1** 新增表：`interaction_events`（id, userId, petId, deviceId?, actionType, occurredAt, createdAt）、`user_settings`（userId PK, messageEnabled, soundEnabled, theme, language, updatedAt）、`firmware_releases`（id, deviceType, version, releaseNotes, releasedAt）。
- **R-08.2** `users` 新增 `email` 字段（varchar(255)，唯一索引，可空）。
- **R-08.3** `collar_devices` / `desktop_devices` 新增 `claim_status`（enum）、`usage_duration_minutes`（int default 0）、`upgrade_status`（enum default 'idle'）。
- **R-08.4** 所有新增通过 `pnpm db:generate` + `pnpm db:migrate` 落地，迁移文件提交进仓库。

## 验收标准

- 后端：所有接口单元测试（happy path + 403/404/400 各一）+ `pnpm --filter server build` 通过。
- 前端：`pnpm --filter app build:weapp` 通过，真实小程序运行涉及页面无硬编码/占位 toast。
- 迁移：`pnpm db:migrate` 在本地干净库从 0 跑到末尾无错。
- 文档：PR 描述列清所有新增接口与表结构变更。
