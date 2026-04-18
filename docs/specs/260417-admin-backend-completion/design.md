# 技术设计：后端补齐

对应需求：`requirements.md`（D-01..D-16、UBI-01..UBI-08）。

## 0. 需求修正

- **修正 D-07**：shared 已有 `BASIC_ACTIONS`(6) + `FUN_ACTIONS`(8) = `ALL_ACTIONS`(14)。不新建 `ACTION_CATALOG`，直接复用 shared 常量；base = `BASIC_ACTIONS`，personalized = `FUN_ACTIONS`。前端硬编码的 `18` 是错误假设，必须改为读取接口返回的总数。
- **修正 D-03**：白名单不是泛化的 `image/*`，而是明确枚举 `image/jpeg | image/png | image/webp`。预签名 PUT 必须绑定具体 `Content-Type`，否则白名单约束形同虚设。
- **修正 D-06**：当前 schema 没有项圈绑定历史表，`companionDays` 对项圈只能按 `collar_devices.created_at` 近似计算，不能用 `updatedAt` 硬猜，更不能额外发明 `pet code` 之类需求外字段。

## 1. 架构总览

```text
packages/server/src/
├── db/schema.ts              (+ memberships 表 + membership_level enum + 查询所需索引)
├── routes/admin/
│   ├── index.ts              (挂新路由)
│   ├── devices.ts            (现状保留 + 新增 /devices 统一列表 + /devices/:type/:id/detail)
│   ├── customization.ts      (新文件：/customization/tasks)
│   ├── memberships.ts        (新文件：/users/:id/membership GET/PUT)
│   ├── avatars.ts            (现状保留 + 新增 /avatar-review/stats)
│   └── uploads.ts            (新文件：/uploads/presign)
├── utils/
│   ├── pagination.ts         (新文件：parsePagination + buildPageResponse)
│   └── storage.ts            (+ createPresignedPutUrl)
└── scripts/
    └── seed-admin-demo.ts    (新文件)

packages/shared/src/types.ts      (+ Membership, MembershipLevel, AdminDevice*, CustomizationTask, AvatarReviewStats, PresignResponse)
packages/shared/src/constants.ts  (+ MEMBERSHIP_LEVEL_LABELS, DEFAULT_FREE_BENEFITS)
```

## 2. 数据库变更

### 2.1 `memberships` 表

```ts
export const membershipLevelEnum = pgEnum("membership_level", [
  "free",
  "basic",
  "pro",
  "premium",
]);

export const membershipStatusEnum = pgEnum("membership_status", [
  "active",
  "expired",
  "suspended",
]);

export const memberships = pgTable(
  "memberships",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    level: membershipLevelEnum("level").notNull().default("free"),
    status: membershipStatusEnum("status").notNull().default("active"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull().defaultNow(),
    expireAt: timestamp("expire_at", { withTimezone: true }),
    benefits: jsonb("benefits").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_memberships_user_id").on(table.userId),
  ],
);
```

设计约束：

- `user_id` 保持一对一唯一约束，足够支撑 GET/PUT membership 的按用户读写；保留独立 `id` 只是为了与现有 schema 风格一致，不额外引入复合主键。
- `onDelete: "cascade"` 只用于 `users -> memberships`，这是合理的。当前代码库大部分旧表并没有完整 FK，不能因为这里加了级联就假设 seed 或清理脚本可以“删 user 一把梭”。
- `benefits` 用 `jsonb` 可以接受，但只适合作为“配置快照”存储，不适合作为查询维度。本期不按 benefits 子字段筛选/排序，因此不要给 `jsonb` 补 GIN，也不要在 SQL 里解析它。
- `benefits` 写入语义定义为“整包替换”，不做 patch merge。否则空数组、禁用项、删除项三者语义会混在一起。
- `users.avatarQuota` 保留，作为真实额度字段；`memberships.level` 表示会员等级。写 membership 时同步 `users.avatarQuota`，避免前端和小程序出现双口径。

### 2.2 查询索引

这轮新增接口会直接打到下面这些列。若迁移前不存在索引，补上：

- `pet_avatars(pet_id, created_at desc)`
- `pet_avatar_actions(pet_avatar_id, sort_order, id)`
- `desktop_pet_bindings(desktop_device_id, created_at desc) where unbound_at is null`
- `desktop_pet_bindings(pet_id) where unbound_at is null`
- `collar_devices(pet_id)`

说明：

- 这些索引是为聚合和 `EXISTS` 子查询服务，不是为了 `%keyword%` 模糊搜索。
- `keyword` 的 `ILIKE '%xx%'` 在没有 `pg_trgm` 时仍然会扫表；本期不承诺做全文检索，只把 pageSize 限制在 100 并接受 admin 数据量下的线性扫描。

## 3. 分页工具

```ts
export interface PageParams {
  page: number;
  pageSize: number;
  offset: number;
}

export function parsePagination(c: Context): PageParams {
  const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
  const raw = Number(c.req.query("pageSize") ?? 20) || 20;
  const pageSize = Math.min(100, Math.max(1, raw));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function buildPageResponse<T>(items: T[], total: number, params: PageParams) {
  return { items, total, page: params.page, pageSize: params.pageSize };
}
```

补充约束：

- 所有列表接口排序都必须带稳定次序，至少补 `id` 作为二级排序键，避免翻页重复/漏项。
- 统一列表接口用“页查询 + count 查询”两条 SQL，共享同一段过滤 CTE；不要为了省一条 SQL 把 `count(*) over()`、聚合、分页硬搅在一起。

## 4. 接口详设

### 4.1 `GET /admin/devices` （D-04, D-05, UBI-03）

#### 实现原则

- 不采用“先 `UNION ALL` 原始设备行，再在外层继续 JOIN 宠物/头像/绑定明细”的写法。那样 desktop 多绑定、pet 多 avatar 时会直接把行数放大，分页和 `total` 都会失真。
- 正确做法是“**先按设备聚平成一行，再 `UNION ALL`**”：
  1. `avatar_stats_by_pet`：按 `pet_id` 预聚合头像是否已上传、动作上传数、最新展示图。
  2. `desktop_binding_stats`：按 `desktop_device_id` 预聚合 `binding_count`，并选一个代表宠物用于扁平展示。
  3. `collar_rows`：每台项圈一行。
  4. `desktop_rows`：每台桌面端一行。
  5. `merged_devices`：`UNION ALL collar_rows + desktop_rows` 后再做统一筛选、排序、分页。
- 这个查询在 Drizzle 0.39 上可以拼出来，但可读性和可维护性都差。这里直接允许 `db.execute(sql\`...\`)` 写带 CTE 的 SQL，返回结果再映射到 shared 类型。不要为了“全 Drizzle builder”牺牲可控性。

#### 字段口径

- `bindingStatus`
  - collar：`petId IS NOT NULL` 视为 `bound`
  - desktop：`bindingCount > 0` 视为 `bound`
- `bindingCount`
  - collar：0 或 1
  - desktop：`desktop_pet_bindings.unbound_at IS NULL` 的 active 绑定数
- `petId / petName / petSpecies / petAvatarUrl`
  - collar：直接取 `collar_devices.pet_id`
  - desktop：只暴露一个“代表宠物”做扁平展示，选 `created_at desc, id desc` 的最新 active binding
- `species` / `imageStatus` 过滤
  - desktop 不能只看代表宠物，否则会误筛
  - 必须对该 desktop 的全部 active bindings 做 `EXISTS` 判断
- `hasUploadedAvatar`
  - 沿用需求口径：对应宠物存在 `pet_avatars.status in ('approved', 'done')`
- `avatarProgress`
  - 从 `avatar_stats_by_pet` 一次性 left join 取回
  - 绝不在列表结果上为每行再跑多个相关子查询

#### 性能与分页

- `page` 查询和 `count` 查询共享同一套过滤条件，但分别执行。这样最稳，不会把 count 的聚合成本塞进每一页。
- `sort` 支持 `createdAt | lastOnlineAt`，`order` 默认 `desc`；二级排序统一补 `type asc, id desc`。
- `keyword` 命中 `name / macAddress / userNickname`，采用 `ILIKE`。这是当前唯一允许的全表扫描点，不再叠加更多复杂搜索。

#### 代表 SQL 结构

```sql
WITH avatar_stats_by_pet AS (
  SELECT
    pa.pet_id,
    BOOL_OR(pa.status IN ('approved', 'done')) AS has_uploaded_avatar,
    MAX(NULLIF(pa.source_image_url, '')) FILTER (WHERE pa.status IN ('approved', 'done')) AS pet_avatar_url,
    COUNT(*) FILTER (
      WHERE act.action_type = ANY($1::text[])
    )::int AS uploaded_actions
  FROM pet_avatars pa
  LEFT JOIN pet_avatar_actions act ON act.pet_avatar_id = pa.id
  GROUP BY pa.pet_id
),
desktop_binding_stats AS (
  SELECT
    b.desktop_device_id,
    COUNT(*)::int AS binding_count,
    (
      ARRAY_AGG(b.pet_id ORDER BY b.created_at DESC, b.id DESC)
    )[1] AS representative_pet_id
  FROM desktop_pet_bindings b
  WHERE b.unbound_at IS NULL
  GROUP BY b.desktop_device_id
),
collar_rows AS (...),
desktop_rows AS (...),
merged_devices AS (
  SELECT * FROM collar_rows
  UNION ALL
  SELECT * FROM desktop_rows
)
SELECT *
FROM merged_devices
WHERE ...
ORDER BY created_at DESC, type ASC, id DESC
LIMIT $limit OFFSET $offset;
```

### 4.2 `GET /admin/devices/:type/:id/detail` （D-06, UBI-02）

- `type` 仅允许 `collar | desktop`。
- 现有 `routes/admin/devices.ts` 保持原 `/collars`、`/desktops`、CRUD 行为不变，只新增新的 detail handler；不要改老接口返回结构。
- 返回结构：
  - `device`：设备基础信息
  - `owner`：`{id, nickname, avatarUrl}` 或 `null`
  - `pet`
    - collar：取 `collar_devices.pet_id`
    - desktop：取最新 active binding 对应宠物
    - `avatarUrl`：优先该宠物最近一条 `status in ('approved', 'done')` 的 `sourceImageUrl`
    - `companionDays`
      - desktop：按 active binding 的 `created_at` 精确计算
      - collar：schema 无绑定历史，只能按 `collar_devices.created_at` 近似计算；不要用 `updatedAt`
  - `relatedDevices`：同一 owner 下、去掉自身的其他设备，仍按扁平结构返回最小必要字段
  - `avatarProgress`：`{ total, uploaded, approved, pending }`
  - `lastSyncedAt`：暂用 `lastOnlineAt`
  - `activatedAt`：`createdAt`

说明：

- 需求没有要求 `pet code`，设计里不新增这类猜测字段。
- `relatedDevices` 不做跨宠物复杂排序，只按“最近在线优先，再 createdAt desc”即可。

### 4.3 `GET /admin/customization/tasks` （D-08, D-09, UBI-01）

- 参数：`keyword`、`status`（逗号分隔，值属于 `avatar_status`）、`category`（`base | personalized | all`）、`page`、`pageSize`。
- 基础查询：`pet_avatars` JOIN `pets` JOIN `users`。
- 动作计数：按 `pet_avatar_id` 做一次聚合，使用 `COUNT(*) FILTER (...)` 计算 `baseActionCount` 和 `personalizedActionCount`，不要为每一行写两个标量子查询。
- `defaultPreviewUrl`
  - 先取 `NULLIF(pet_avatars.source_image_url, '')`
  - 若为空，再取该 avatar 第一条 action 图 `ORDER BY sort_order ASC, id ASC LIMIT 1`
  - 这是为了兼容“字段非 null 但可能写入空串”的脏数据

#### `categoryStatus` 定义

先定义：

- `baseActionTotal = BASIC_ACTIONS.length = 6`
- `personalizedActionTotal = FUN_ACTIONS.length = 8`
- `baseDone = baseActionCount >= baseActionTotal`
- `personalizedDone = personalizedActionCount >= personalizedActionTotal`

再映射：

- `empty`：`baseActionCount = 0 AND personalizedActionCount = 0`
- `all_done`：`baseDone AND personalizedDone`
- `base_done`：`baseDone AND NOT personalizedDone`
- `partial`：其他所有情况

这样可以覆盖 `personalized > 0 且 base = 0` 这种异常但真实可能出现的数据，不会产生不可归类状态。

#### `category` 筛选语义

- `all`：不筛
- `base`：`baseActionCount > 0`
- `personalized`：`personalizedActionCount > 0`

这里的 `category` 表示“关注哪一类动作”，不是“只保留纯 base、没有任何 personalized 的任务”。否则会把大量已经进入个性化阶段的任务从 base 视图里错误排除。

#### 返回字段

每条 item 返回：

- `avatarId`
- `petId`
- `petName`
- `petSpecies`
- `userId`
- `userNickname`
- `status`
- `defaultPreviewUrl`
- `baseActionCount`
- `personalizedActionCount`
- `totalActionCount`
- `baseActionTotal`
- `personalizedActionTotal`
- `categoryStatus`
- `isNewToday`
- `createdAt`
- `reviewedAt`

### 4.4 `POST /admin/uploads/presign` （D-03, UBI-05）

依赖：补 `@aws-sdk/s3-request-presigner`。

```ts
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ALLOWED_CONTENT_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export async function createPresignedPutUrl(opts: {
  contentType: keyof typeof ALLOWED_CONTENT_TYPES;
  scope?: string;
}) {
  await ensureBucket();

  const now = new Date();
  const ext = ALLOWED_CONTENT_TYPES[opts.contentType];
  const key = `uploads/${opts.scope ?? "admin"}/${now.getUTCFullYear()}/${String(
    now.getUTCMonth() + 1,
  ).padStart(2, "0")}/${createId()}.${ext}`;

  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: opts.contentType,
    ACL: "public-read",
  });

  const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 900 });
  const endpoint = process.env.S3_PUBLIC_URL ?? "http://localhost:9000";

  return {
    uploadUrl,
    publicUrl: `${endpoint}/${BUCKET}/${key}`,
    key,
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
  };
}
```

实现说明：

- `expiresIn = 900` 合理，按需求固定 15 分钟。
- `forcePathStyle: true` 只需要继续保留在 `S3Client` 初始化里；**不需要额外设置 `signableHeaders`**。`Content-Type` 已经通过 `PutObjectCommand` 进入签名。
- 前端发起 PUT 时**必须显式带上与签名时完全一致的 `Content-Type` header**。缺失或不一致都应让签名校验失败，这是预期行为，不是兼容问题。
- 不能接受任意 `image/*` 字符串，否则前端传一个奇怪的 subtype 也能拿到 URL。
- dev 模式（`ENABLE_DEV_LOGIN=true`，本地 `storage/`）继续返回 501，提示走现有代理上传；不要伪造本地 presign。

### 4.5 `GET /admin/users/:id/membership` （D-10）

- `LEFT JOIN memberships`。
- 不存在 membership 行时 lazy 返回 free 级别：
  - `level = 'free'`
  - `status = 'active'`
  - `expireAt = null`
  - `benefits = DEFAULT_FREE_BENEFITS`
  - `avatarQuotaTotal = users.avatarQuota`
  - `startAt = users.createdAt`
- `avatarQuotaUsed` = 该用户名下 `pet_avatars.status != 'rejected'` 的数量。

### 4.6 `PUT /admin/users/:id/membership` （D-11）

- body：`{ level, status?, expireAt?, benefits?, avatarQuotaTotal? }`
- 事务内完成：
  - `memberships` 按 `user_id` upsert
  - `users.avatar_quota` 同步更新
- 校验：
  - `level`、`status` 必须落在 enum
  - `expireAt` 允许 `null`
  - `benefits` 只做结构校验：`[{key,label,value,enabled}]`
  - `benefits` 缺失时沿用原值，显式传空数组表示清空

### 4.7 `GET /admin/avatar-review/stats` （D-12, UBI-07）

`syncedToDevices` 不要写成 `EXISTS(SELECT ... UNION ALL SELECT ...)`。PostgreSQL 语法上能跑，但既难读又不利于后续改写成 Drizzle/sql 模板。直接拆成两个 `EXISTS ... OR EXISTS ...`。

```sql
SELECT
  COUNT(*) FILTER (WHERE pa.status = 'pending')::int AS pending_review,
  COUNT(*) FILTER (
    WHERE pa.status IN ('approved', 'processing', 'done')
  )::int AS approved_total,
  COUNT(*) FILTER (
    WHERE pa.status = 'approved'
      AND (
        EXISTS (
          SELECT 1
          FROM collar_devices cd
          WHERE cd.pet_id = pa.pet_id
            AND cd.status = 'online'
        )
        OR EXISTS (
          SELECT 1
          FROM desktop_pet_bindings b
          WHERE b.pet_id = pa.pet_id
            AND b.unbound_at IS NULL
        )
      )
  )::int AS synced_to_devices,
  COUNT(*) FILTER (
    WHERE pa.created_at >= date_trunc('day', now())
  )::int AS today_new_uploads
FROM pet_avatars pa;
```

口径说明：

- `approvedTotal` 统计“已通过审核”的总量，因此包含 `approved / processing / done`。
- `syncedToDevices` 严格按需求，只统计当前 `status = 'approved'` 且宠物存在在线项圈或 active desktop binding 的头像。

### 4.8 shared 类型

shared 只承担“接口契约”的单一职责，不承担 server 内部查询行类型。

```ts
export type MembershipLevel = "free" | "basic" | "pro" | "premium";
export type MembershipStatus = "active" | "expired" | "suspended";

export interface MembershipBenefit {
  key: string;
  label: string;
  value: string | number | boolean;
  enabled: boolean;
}

export interface Membership {
  level: MembershipLevel;
  levelLabel: string;
  status: MembershipStatus;
  startAt: string;
  expireAt: string | null;
  benefits: MembershipBenefit[];
  avatarQuotaUsed: number;
  avatarQuotaTotal: number;
}

export interface AdminDeviceListItem {
  type: DeviceType;
  id: string;
  name: string;
  macAddress: string;
  status: DeviceStatus;
  claimStatus: DeviceClaimStatus;
  upgradeStatus: DeviceUpgradeStatus;
  userId: string | null;
  userNickname: string | null;
  petId: string | null;
  petName: string | null;
  petSpecies: Species | null;
  petAvatarUrl: string | null;
  battery: number | null;
  signal: number | null;
  firmwareVersion: string | null;
  lastOnlineAt: string | null;
  createdAt: string;
  hasUploadedAvatar: boolean;
  avatarProgress: {
    uploaded: number;
    total: number;
  };
  bindingCount: number;
}

export interface AdminDeviceDetail { /* 见 §4.2 */ }
export interface CustomizationTask { /* 见 §4.3 */ }
export interface AvatarReviewStats {
  pendingReview: number;
  approvedTotal: number;
  syncedToDevices: number;
  todayNewUploads: number;
}
export interface PresignResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresAt: string;
}
```

约束：

- handler 内部仍然可以使用 `typeof table.$inferSelect` 或局部 row type；不要把这些类型再导出到 shared，避免出现“一份 API 类型 + 一份 Drizzle 推导类型”的双源维护。
- shared 里的类型字段名和接口 JSON 保持一致，不追求与 DB 列一一同名。

### 4.9 shared 常量

```ts
export const MEMBERSHIP_LEVEL_LABELS: Record<MembershipLevel, string> = {
  free: "免费用户",
  basic: "基础会员",
  pro: "高级会员",
  premium: "尊享会员",
};

export const DEFAULT_FREE_BENEFITS: MembershipBenefit[] = [
  { key: "avatar_quota", label: "形象额度", value: 2, enabled: true },
  { key: "device_binding", label: "设备绑定", value: "1台", enabled: true },
  { key: "priority_review", label: "优先审核", value: false, enabled: false },
];
```

## 5. 路由注册

`routes/admin/index.ts` 追加：

```ts
adminRoute.route("/", customizationRoute);
adminRoute.route("/", membershipsRoute);
adminRoute.route("/", uploadsRoute);
// /avatar-review/stats 继续挂在 avatarsRoute 下
```

兼容性约束：

- 不改现有 `/collars`、`/desktops`、`/avatars` 既有返回结构。
- 这轮新增到 `routes/admin/devices.ts`、`routes/admin/avatars.ts` 的内容都是新 path 或只读统计，不引入“双写”。

## 6. Seed 脚本（D-13）

`packages/server/scripts/seed-admin-demo.ts` 必须可重复执行，但不能依赖“删 users 自动级联”。

### 6.1 识别种子数据

- 不用 `nickname LIKE '@seed-demo%'` 作为唯一识别条件。昵称是可编辑字段，误伤真实用户的概率不是零。
- 采用更明确的脚本标识，例如：
  - `wechatOpenid = 'seed-demo:<n>'`
  - 或 `email = 'seed-demo+<n>@example.local'`
- `nickname` 仍然可以保留 `@seed-demo-user-N`，但只作展示，不作主清理键。

### 6.2 清理顺序

按事务手动清理依赖：

1. 找出所有 seed user ids
2. 找出这些用户名下 `pet ids`
3. 找出这些宠物名下 `avatar ids`
4. 删除 `pet_avatar_actions where pet_avatar_id in (...)`
5. 删除 `pet_avatars where pet_id in (...)`
6. 删除 `pet_behaviors where pet_id in (...)`
7. `desktop_pet_bindings` 对 seed 宠物或 seed desktop 置 `unbound_at = now()`
8. 删除 `memberships where user_id in (...)`
9. 删除 `device_authorizations` 中 `from_user_id / to_user_id / pet_id` 命中的记录
10. 删除 seed `collar_devices`
11. 删除 seed `desktop_devices`
12. 删除 seed `pets`
13. 删除 seed `users`

说明：

- 这个顺序与现有 `routes/admin/users.ts`、`routes/admin/pets.ts` 的手工清理策略一致，符合当前 schema 的现实。
- seed 脚本不创建 `invite_codes`、`messages` 等非本期必需数据，避免把清理范围继续放大。

### 6.3 造数范围

- 20 users
- 30 pets
- 25 collars
- 15 desktops
- 40 avatars，覆盖 `pending / processing / done / failed / approved / rejected`
- `done / approved / processing` 的 avatar 插入动作图，数量覆盖 0、部分完成、全部完成
- 15 memberships，覆盖 4 档和过期状态

## 7. 验证命令

```bash
pnpm -F shared build
pnpm -F server build
pnpm -F server typecheck
pnpm db:generate
pnpm db:migrate
pnpm db:seed:demo
curl -H "X-Admin-Key: yehey-admin-dev" "http://localhost:9527/api/admin/devices?page=1&pageSize=5"
curl -H "X-Admin-Key: yehey-admin-dev" "http://localhost:9527/api/admin/customization/tasks?page=1&pageSize=5"
curl -H "X-Admin-Key: yehey-admin-dev" "http://localhost:9527/api/admin/avatar-review/stats"
```

## 8. 风险与规避

- **设备统一列表复杂度高**：风险不在 `UNION ALL` 本身，而在 union 前后是否发生行扩张。规避方式是先按设备聚平，再 union。
- **Drizzle builder 可维护性差**：这类多 CTE、`FILTER`、`EXISTS`、分页复用查询，允许直接写 `sql\`...\``。不要强行炫技。
- **`avatarProgress` 慢查询**：只要按 `pet_id` 预聚合并 join，一次 SQL 不会形成 N+1；如果写成每行多个相关子查询才会慢。
- **预签名 PUT 兼容性**：前端最容易漏掉 `Content-Type`。接口文档和实现都必须把“header 必须一致”写死。
- **旧路由兼容**：现有 `routes/admin/devices.ts`、`routes/admin/avatars.ts` 继续保留原行为；新前端切换期并发调用新旧读接口没有副作用。
- **benefits jsonb 漂移**：本期只做结构校验，不做 schema versioning；后续若权益项变成报表维度，再拆表。

## 9. 不做

- 不引入 RBAC、不做审计日志。
- 不做设备编辑/永久删除接口。
- 不做 benefits 模板 / 会员套餐 CRUD。
- 不为 admin 搜索额外引入 `pg_trgm`、全文检索或缓存层。
