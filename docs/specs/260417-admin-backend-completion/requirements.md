# 后端补齐：设备管理 / 定制中心 / 用户会员 / 图像审核

日期：2026-04-17
负责人：@so2liu

## 1. 背景

管理后台前端页面已经落地，但多处关键字段由前端在本地"拼凑/猜测/硬编码"。本轮补齐后端接口、DB 表、共享类型，让前端彻底去 demo 化。对应前端问题点参考 PR 描述（Devices.tsx L552-749、Customization.tsx L397-633、Users.tsx L348-513、ImageReview.tsx L406-453）。

## 2. 范围

### 2.1 In scope

- 新增 `memberships` 表 + 完整会员读写接口
- 统一设备列表 `GET /api/admin/devices`（扁平合并 + type 字段 + 服务端搜索/筛选/分页）
- 设备详情 `GET /api/admin/devices/:type/:id/detail`
- 定制中心任务列表 `GET /api/admin/customization/tasks`（带摘要字段）
- 图像预签名上传 `POST /api/admin/uploads/presign`
- 会员读写 `GET/PUT /api/admin/users/:id/membership`
- 图像审核统计 `GET /api/admin/avatar-review/stats`
- seed 测试数据脚本
- `packages/shared` 相关类型同步

### 2.2 Out of scope

- 会员计费 / 支付流转
- 管理员编辑设备 / 永久删除设备（按钮保留禁用态）
- 小程序端会员展示
- 动作类别（基础/个性化）配置管理 UI —— 本轮用静态常量即可
- 鉴权体系重构（沿用现有 `X-Admin-Key`）

## 3. 关键决策

- **D-01** 会员数据模型：新增独立 `memberships` 表，与 `users` 一对一（`userId` unique FK），`benefits` 字段用 `jsonb` 存储权益数组。**Why**：后续权益结构会膨胀；用 jsonb 避免频繁迁移。**How to apply**：users 表不加字段；读取会员时 LEFT JOIN，缺失记录时按 `free` 级别 lazy 返回默认值。

- **D-02** 会员等级枚举：`free | basic | pro | premium`，定义在 PG enum `membership_level`。**Why**：枚举值稳定、前端可映射。**How to apply**：`avatarQuota` 仍保留在 users（是额度字段），但"等级"由 `memberships.level` 决定，不再由 quota 反推。

- **D-03** 上传方案：预签名 PUT URL。后端签发 MinIO 预签名 URL（含 15 min 过期、强制 Content-Type 白名单 image/*、key 前缀 `uploads/admin/YYYY/MM/<id>.<ext>`），返回 `{uploadUrl, publicUrl, key, expiresAt}`。**Why**：省服务端带宽，接口契约里已注明。**How to apply**：`routes/upload.ts` 的代理上传不删，留着给小程序端；admin 只用预签名。

- **D-04** 统一设备列表形状：扁平合并 `{items:[{type:'collar'|'desktop', id, name, macAddress, status, claimStatus, upgradeStatus, userId, userNickname, petId?, petName?, petSpecies?, petAvatarUrl?, battery?, signal?, lastOnlineAt, createdAt, hasUploadedAvatar, avatarProgress:{uploaded,total}, bindingCount}], total, page, pageSize}`。**Why**：前端一套分页/筛选/排序；跨类型搜索和绑定状态筛选能工作。**How to apply**：SQL 用 `collars UNION ALL desktops` 做子查询，再外层 JOIN users/pets/avatar 聚合。分页在合并后做。

- **D-05** 列表筛选参数：`keyword`（name/mac/userNickname 模糊）、`type`（collar|desktop|all）、`model`（预留字符串，先按 name 前缀匹配）、`imageStatus`（uploaded|pending|all，以 `petAvatars.status IN ('approved','done')` 判定）、`bindingStatus`（bound|unbound）、`species`（cat|dog|all）、`status`（online|offline|pairing|all）、`sort`（createdAt|lastOnlineAt）、`order`（asc|desc）、`page`（默认 1）、`pageSize`（默认 20，最大 100）。

- **D-06** 设备详情 `/devices/:type/:id/detail` 返回：基础字段 + 真实绑定宠物（含 `petAvatarUrl`、`speciesLabel`、陪伴天数 = `now - bindings.createdAt`）+ 关联设备（同一 `pet.userId` 下的其他设备，type 不同优先）+ 定制进度 `{total, uploaded, approved, pending}` + 最后同步时间 + 激活时间（用 `createdAt` 代替）。**Why**：前端目前这些都在猜。**How to apply**：陪伴天数按 collar 看 `collarDevices.petId` 的 binding，desktop 看 `desktopPetBindings`。

- **D-07** 定制进度口径：基础动作清单由 `ACTION_CATALOG` 常量（server/src/constants/actions.ts）定义，固定 18 项分为 `base`(N 条) 与 `personalized`(M 条)。**Why**：前端现在假设 18 项总数，需要统一来源。**How to apply**：新建常量文件，导出 `BASE_ACTIONS[]`、`PERSONALIZED_ACTIONS[]`；所有进度计算都 JOIN `petAvatarActions.actionType` 比对。

- **D-08** `GET /api/admin/customization/tasks` 返回左侧列表所需摘要：`{items:[{avatarId, petId, petName, petSpecies, userId, userNickname, status, defaultPreviewUrl, baseActionCount, personalizedActionCount, totalActionCount, baseActionTotal, personalizedActionTotal, categoryStatus:'empty'|'partial'|'base_done'|'all_done', isNewToday, createdAt, reviewedAt}], total, page, pageSize}`。支持 `keyword`（user/pet 名）、`status`、`category`（base|personalized|all）、`page`、`pageSize`。

- **D-09** `defaultPreviewUrl` 选取规则：优先取 `petAvatars.sourceImageUrl`；若为空取第一条 `petAvatarActions.imageUrl`（按 sortOrder）。

- **D-10** `GET /api/admin/users/:id/membership` 返回：`{level, levelLabel, status:'active'|'expired'|'suspended', startAt, expireAt, benefits:[{key,label,value,enabled}], avatarQuotaUsed, avatarQuotaTotal}`。缺失记录时 lazy 返回 `{level:'free', status:'active', expireAt:null, benefits:DEFAULT_FREE_BENEFITS, avatarQuotaTotal:users.avatarQuota}`。

- **D-11** `PUT /api/admin/users/:id/membership` 入参：`{level, expireAt, status, benefits[], avatarQuotaTotal}`。首次写入时 upsert；`avatarQuotaTotal` 同步写到 `users.avatarQuota`（保持小程序端一致）。

- **D-12** `GET /api/admin/avatar-review/stats` 返回：`{pendingReview, approvedTotal, syncedToDevices, todayNewUploads}`。`syncedToDevices` 口径：存在 `petAvatars.status='approved'` 且该 pet 至少有一台 `collarDevices.status='online'` 或 `desktopPetBindings` 关联。**Why**：前端现状是按 avatar 状态算，不准。**How to apply**：用 EXISTS 子查询避免 N+1。

- **D-13** seed 脚本：`packages/server/scripts/seed-admin-demo.ts`，可重复执行（先清理 `@seed-demo` 前缀数据），生成 ~20 用户、~30 宠物、~25 collars、~15 desktops、~40 avatars（各状态都有）、若干 actions、若干 memberships（覆盖 4 档）。**How to apply**：pnpm script `db:seed:demo`。

- **D-14** 鉴权：所有新路由继续用 `middleware/admin.ts`（`X-Admin-Key`）。本期不做 RBAC。

- **D-15** shared 类型：在 `packages/shared/src/types.ts` 新增 `Membership`、`MembershipLevel`、`AdminDeviceListItem`、`AdminDeviceDetail`、`CustomizationTask`、`AvatarReviewStats`、`PresignResponse`。前后端共用。

- **D-16** 分页 helper：在 `packages/server/src/utils/pagination.ts` 新建 `parsePagination(c)` + `buildPageResponse(items, total, params)`，统一 `{items, total, page, pageSize}` 形状。**Why**：当前路由 adhoc 写分页，需要收敛。**How to apply**：8 个新接口中的 3 个列表类接口都走它。

## 4. 验收（EARS）

- **UBI-01** WHILE 管理员访问定制中心左侧列表，WHEN 调用 `/admin/customization/tasks`，系统 SHALL 返回每条任务的真实 `baseActionCount / personalizedActionCount / categoryStatus / defaultPreviewUrl`，前端 **不得** 再 fallback demo 数据。

- **UBI-02** WHILE 管理员访问设备详情，WHEN 调用 `/admin/devices/:type/:id/detail`，系统 SHALL 返回真实绑定宠物、宠物头像 URL、陪伴天数、关联设备列表、定制进度 `{uploaded,total,approved,pending}`，前端 **不得** 再按 userId 猜。

- **UBI-03** WHEN 管理员在设备列表搜索关键字 "布丁"，系统 SHALL 服务端匹配 name/macAddress/userNickname 并返回跨 collar/desktop 的合并结果，`total` 等于真实命中数。

- **UBI-04** WHEN 管理员保存会员配置，系统 SHALL upsert `memberships` 行、同步 `users.avatarQuota`，并在随后 `GET /membership` 返回一致数据。

- **UBI-05** WHEN 前端请求预签名上传，系统 SHALL 返回 15 分钟内有效的 PUT URL，URL 对非 `image/*` Content-Type 上传 SHALL 拒绝。

- **UBI-06** WHEN 执行 `pnpm db:seed:demo`，系统 SHALL 生成覆盖 4 档会员/各 avatar 状态/绑定与未绑定设备的数据集，重复执行不产生重复。

- **UBI-07** WHEN 请求 `/admin/avatar-review/stats`，`syncedToDevices` SHALL 按"avatar approved 且 pet 有在线设备或桌面端绑定"口径返回，不是按 avatar 状态字段简单计数。

- **UBI-08** 所有新接口 SHALL 在缺少 `X-Admin-Key` 或值不匹配时返回 401。

## 5. 非目标

- 不改动现有 `/collars`、`/desktops`、`/avatars` 老接口行为（保持向后兼容，前端按需切换到新接口）。
- 不引入 Redis / 缓存层。
- 不做接口级限流。
