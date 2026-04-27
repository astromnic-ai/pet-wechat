# 任务拆分

5 个垂直切片，每个任务完成后都可独立 lint/build/typecheck。

- [ ] **1. 基础设施：memberships 表 + 索引 + 分页工具 + shared 类型与常量**
  - **文件**：
    - `packages/server/src/db/schema.ts`（新增 membershipLevelEnum、membershipStatusEnum、memberships 表；并补 §2.2 所列索引）
    - `packages/server/src/utils/pagination.ts`（新建）
    - `packages/shared/src/types.ts`（新增 Membership、MembershipLevel、MembershipStatus、MembershipBenefit、AdminDeviceListItem、AdminDeviceDetail、CustomizationTask、AvatarReviewStats、PresignResponse）
    - `packages/shared/src/constants.ts`（新增 MEMBERSHIP_LEVEL_LABELS、DEFAULT_FREE_BENEFITS）
    - `packages/server/drizzle/`（`pnpm db:generate` 产生的迁移 SQL）
  - **做什么**：按 design §2 / §3 / §4.8 / §4.9 的定义落地数据库结构和共享契约，为后续接口提供底座。shared 类型保持"API 契约单一来源"定位，不外溢 Drizzle inferred type。
  - **完成标准**：
    - `pnpm -F shared build` 通过
    - `pnpm -F server typecheck` 通过
    - `pnpm db:generate` 产出迁移文件，本地 `pnpm db:migrate` 执行成功
    - `psql` 查表 `memberships` 存在，有 `uq_memberships_user_id` 唯一约束，有 ON DELETE CASCADE
  - **关联决策**：D-01、D-02、D-15、D-16

- [ ] **2. 上传预签名 + 会员接口（两个小模块合并提交）**
  - **文件**：
    - `packages/server/src/utils/storage.ts`（新增 `createPresignedPutUrl`）
    - `packages/server/package.json`（新增依赖 `@aws-sdk/s3-request-presigner`）
    - `packages/server/src/routes/admin/uploads.ts`（新建，`POST /admin/uploads/presign`）
    - `packages/server/src/routes/admin/memberships.ts`（新建，`GET /admin/users/:id/membership`、`PUT /admin/users/:id/membership`）
    - `packages/server/src/routes/admin/index.ts`（注册两个新路由）
  - **做什么**：实现 §4.4、§4.5、§4.6。预签名严格白名单 `image/jpeg|png|webp`，dev 模式（`ENABLE_DEV_LOGIN=true`）返回 501。membership GET lazy 返回 free；PUT 事务内 upsert + 同步 `users.avatarQuota`。
  - **完成标准**：
    - `pnpm -F server build` 通过
    - 手测：
      - `curl -X POST -H "X-Admin-Key: yehey-admin-dev" -H "Content-Type: application/json" -d '{"contentType":"image/jpeg"}' http://localhost:9527/api/admin/uploads/presign` 返回 `uploadUrl`
      - 对返回的 uploadUrl 做 `curl -X PUT -H "Content-Type: image/jpeg" --data-binary @/some.jpg` 成功 200
      - 读/写 `/admin/users/:id/membership` 结果一致，`avatarQuotaTotal` 回写到 users 表
      - 缺 `X-Admin-Key` 时 401
  - **关联决策**：D-03、D-10、D-11、D-14

- [ ] **3. 统一设备列表 + 设备详情**
  - **文件**：
    - `packages/server/src/routes/admin/devices.ts`（在既有文件追加两个 handler，老 `/collars`/`/desktops` 不改）
  - **做什么**：实现 §4.1（`GET /admin/devices`）、§4.2（`GET /admin/devices/:type/:id/detail`）。接受直接用 `db.execute(sql\`...\`)` 写 CTE，不强求 Drizzle builder。`page` 查询和 `count` 查询分开执行，二级排序补 `type asc, id desc`。desktop 的 `species/imageStatus` 筛选必须对全部 active bindings 做 EXISTS。
  - **完成标准**：
    - `pnpm -F server typecheck` 通过
    - 手测：
      - `/admin/devices?page=1&pageSize=5` 扁平返回 `{items,total,page,pageSize}`，items 含 `type` 字段
      - `keyword=布丁` 跨 collar/desktop 命中
      - `bindingStatus=unbound` 只返回无绑定的
      - `/admin/devices/collar/:id/detail`、`/admin/devices/desktop/:id/detail` 返回 design §4.2 全部字段
      - `avatarProgress` 数字与 DB 实际 `pet_avatar_actions` 对得上
  - **关联决策**：D-04、D-05、D-06

- [ ] **4. 定制任务列表 + 图像审核统计**
  - **文件**：
    - `packages/server/src/routes/admin/customization.ts`（新建）
    - `packages/server/src/routes/admin/avatars.ts`（追加 `GET /avatar-review/stats`）
    - `packages/server/src/routes/admin/index.ts`（注册 customization）
  - **做什么**：实现 §4.3（`GET /admin/customization/tasks`）和 §4.7（`GET /admin/avatar-review/stats`）。动作计数用 `COUNT(*) FILTER` 做一次聚合；`defaultPreviewUrl` 先 `NULLIF(source_image_url,'')` 再 fallback action。`categoryStatus` 按 §4.3 五状态映射（empty/all_done/base_done/partial）。stats 里 `approvedTotal` 包含 `approved/processing/done`。
  - **完成标准**：
    - `pnpm -F server typecheck` 通过
    - 手测：
      - `/admin/customization/tasks?page=1&pageSize=5` 返回 `{items,total,page,pageSize,baseActionTotal:6,personalizedActionTotal:8,totalActionTotal:14}` 或把三个总数放在每条 item 上
      - `category=base` 返回 baseActionCount>0 的任务
      - `/admin/avatar-review/stats` 四个数合理（与手工 SQL 对得上）
  - **关联决策**：D-07、D-08、D-09、D-12

- [ ] **5. Seed 脚本 + npm script**
  - **文件**：
    - `packages/server/scripts/seed-admin-demo.ts`（新建）
    - `packages/server/package.json`（新增 `"db:seed:demo": "bun scripts/seed-admin-demo.ts"`）
    - 根 `package.json` 加 workspace 转发脚本（如当前惯例使用 `pnpm -F server db:seed:demo` 则不需）
  - **做什么**：按 design §6 造 20 users / 30 pets / 25 collars / 15 desktops / 40 avatars / 各档 memberships。使用 `wechatOpenid='seed-demo:<n>'` 做主清理键。清理顺序严格按 §6.2。
  - **完成标准**：
    - `pnpm -F server db:seed:demo` 执行成功
    - 连续执行两次不产生重复数据（不报唯一约束冲突）
    - `SELECT count(*) FROM users WHERE wechat_openid LIKE 'seed-demo:%'` = 20
    - `/admin/devices?page=1&pageSize=20` 返回真实 items，不再需要 demo fallback
  - **关联决策**：D-13

## 任务间依赖

- 1 → 2,3,4：1 提供 schema + shared 类型，后续任务都依赖
- 2,3,4 互相独立，可任意顺序
- 5 依赖 1（需要 memberships 表）和 2（需要读写能力验证）
