# 技术设计 — 管理后台（v2，已整合 Codex 审查反馈）

## 架构概览

```mermaid
graph TB
    subgraph 前端 Admin
        A[React + Ant Design + Vite]
        A --> B[新增/增强页面]
        B --> B1[系统概览增强]
        B --> B2[行为日程管理]
        B --> B3[图像审核中心]
        B --> B4[定制中心]
        B --> B5[设备管理统一]
        B --> B6[数据看板 P1]
        B --> B7[用户管理增强 P1]
    end
    subgraph 后端 Server
        C[Hono + Bun]
        C --> D[Admin 路由拆分]
        D --> D1[admin/schedules.ts]
        D --> D2[admin/avatars.ts]
        D --> D3[admin/stats.ts]
        D --> D4[admin/devices.ts]
        D --> D5[admin/index.ts 原有 CRUD]
        C --> E[新增 Public API]
        E --> E1[/schedules/current]
    end
    subgraph 数据库
        F[PostgreSQL + Drizzle ORM]
        F --> G[新表: behavior_schedules]
        F --> H[新表: behavior_schedule_blocks]
        F --> I[修改: pet_avatars 增字段]
        F --> J[修改: avatar_status 增枚举]
    end
    A -- HTTP --> C
    C -- Drizzle --> F
```

## 技术栈

沿用现有，无新增依赖：
- 前端：React 18 + Ant Design 5 + React Router 7 + Vite 6 + TypeScript
- 后端：Hono + Bun + Drizzle ORM
- 数据库：PostgreSQL 16

---

## 关键设计决策（来自 Codex 审查反馈）

### D1. 动作类型词汇表统一

现有系统中 `action_type` 是自由文本，不同模块使用不同词汇：
- 自动行为生成器：`walking, running, sleeping, eating, playing, resting, jumping`
- PRD 日程动作：`sit, eat, sleep, lie, run, walk, play_ball, poop, watch_tv, chase_tail, scratch_air, dream, lick_paw, spin`

**决策**：定义规范动作类型常量表（`ACTION_TYPES`），所有新代码引用此表。现有行为数据中的 `actionType` 是历史数据不做迁移，但 UI 展示时做 label 映射。

```typescript
// packages/shared/src/constants.ts
export const BASIC_ACTIONS = ['sit', 'eat', 'sleep', 'lie', 'run', 'walk'] as const;
export const FUN_ACTIONS = ['play_ball', 'poop', 'watch_tv', 'chase_tail', 'scratch_air', 'dream', 'lick_paw', 'spin'] as const;
export const ALL_ACTIONS = [...BASIC_ACTIONS, ...FUN_ACTIONS] as const;
export type ActionType = (typeof ALL_ACTIONS)[number];

export const ACTION_LABELS: Record<string, string> = {
  sit: '蹲坐', eat: '吃饭', sleep: '睡觉', lie: '趴卧', run: '跑', walk: '走',
  play_ball: '玩球', poop: '噗噗', watch_tv: '看电视', chase_tail: '追尾巴',
  scratch_air: '挠空气', dream: '做美梦', lick_paw: '舔爪子', spin: '转圈',
  // 兼容旧数据
  walking: '走路', running: '奔跑', sleeping: '睡眠', eating: '进食',
  playing: '玩耍', resting: '休息', jumping: '跳跃',
};
```

### D2. Species 策略

现有 `speciesEnum` 只有 `cat | dog`。日程需要支持 `other`。

**决策**：日程表 `species` 字段使用 text 类型，应用层校验值在 `['cat', 'dog', 'other']` 范围内。不修改现有 enum 避免影响宠物核心模型。后续如果宠物需要支持"其他"类型再统一迁移。

### D3. 时区统一

**决策**：所有"今日"统计使用 UTC+8 (Asia/Shanghai) 计算。服务器内部统一用 `AT TIME ZONE 'Asia/Shanghai'` 转换 SQL。

### D4. Admin 路由拆分

**决策**：将现有 god route `admin.ts` 拆分为：
- `src/routes/admin/index.ts` — 路由注册入口
- `src/routes/admin/users.ts` — 用户 CRUD（从现有 admin.ts 迁移）
- `src/routes/admin/pets.ts` — 宠物 CRUD（迁移）
- `src/routes/admin/devices.ts` — 设备 CRUD + 统一查询（迁移 + 新增）
- `src/routes/admin/schedules.ts` — 行为日程（全新）
- `src/routes/admin/avatars.ts` — 图像审核 + 定制（全新）
- `src/routes/admin/stats.ts` — 统计（迁移 + 新增 enhanced）
- `src/routes/admin/analytics.ts` — 数据看板 P1（全新）

### D5. 设备查询策略

**决策**：放弃统一 DTO 方案。保留分开的 collars/desktops 端点，在前端用 Tab 切换。增强查询参数（筛选绑定状态、在线状态、排序），但不做跨类型 union。桌面设备的"已绑定"以 `userId IS NOT NULL` 判断（owner 关系），宠物类型筛选通过 `desktop_pet_bindings` JOIN，只看 `unbound_at IS NULL` 的活跃绑定。

### D6. 保持 /stats 兼容

**决策**：`/api/admin/stats` 保持原样（用于 verifyAdminKey 和旧 Dashboard），新增 `/api/admin/stats/enhanced` 提供增强数据。

---

## 数据库设计

### 新增枚举

```sql
CREATE TYPE schedule_effective_type AS ENUM ('everyday', 'weekday');
-- 注意：holiday 策略暂不实现，因为缺少节假日判定数据源。预留在代码常量中。
```

### 新增表：behavior_schedules

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text PK | hex ID |
| species | text NOT NULL | 'cat' / 'dog' / 'other'（应用层校验） |
| name | text NOT NULL | 日程名称 |
| effective_type | schedule_effective_type NOT NULL DEFAULT 'everyday' | 生效策略 |
| is_active | boolean NOT NULL DEFAULT false | 是否为当前生效日程 |
| created_at | timestamptz NOT NULL DEFAULT now() | |
| updated_at | timestamptz NOT NULL DEFAULT now() | |

**约束**：partial unique index `WHERE is_active = true ON (species, effective_type)`，数据库级保证同 species + effective_type 下最多一个活跃日程。

### 新增表：behavior_schedule_blocks

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text PK | hex ID |
| schedule_id | text NOT NULL FK→behavior_schedules ON DELETE CASCADE | |
| action_type | text NOT NULL | ALL_ACTIONS 中的值（应用层校验） |
| start_minutes | integer NOT NULL CHECK(>= 0 AND <= 1440) | 距午夜分钟数 |
| end_minutes | integer NOT NULL CHECK(>= 0 AND <= 1440) | 距午夜分钟数 |
| sort_order | integer NOT NULL DEFAULT 0 | 排序 |

**校验规则（应用层）**：
- `start_minutes < end_minutes`（不允许跨天）
- 同一 schedule 内时间块不可重叠
- 允许空洞（未覆盖的时间段设备自行处理为默认动作）
- 不允许激活没有 blocks 的空日程

### 修改表：pet_avatars

新增字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| reject_reason | text | 拒绝原因（rejected 时必填，其他状态为 null）|
| reviewed_at | timestamptz | 审核操作时间 |

### 修改枚举：avatar_status

```sql
ALTER TYPE avatar_status ADD VALUE 'approved';
ALTER TYPE avatar_status ADD VALUE 'rejected';
```

### 完整状态流转

```
pending ──→ approved ──→ processing ──→ done
   │                                      ↑
   ├──→ rejected                          │
   │       │                              │
   │       └──→ (可重新 approve) ──→ approved
   │
   └──→ failed（系统异常，管理员可在 UI 看到但不可操作）
```

**幂等规则**：
- approve：已是 approved/processing/done 则 200 无操作；pending/rejected → approved
- reject：已是 rejected 则更新 reason；pending → rejected；approved/processing/done 不可 reject（400）
- sync：processing 且至少有 1 个 action → done + 通知；已是 done 则 200 无操作；其他状态 400
- 删除 action：done 状态不允许删除

### 与现有用户侧 avatar 路由的关系

现有 `POST /api/avatars/:id/actions` 允许用户侧批量提交 actions 并直接置 done。
**收口策略**：本期不修改用户侧路由逻辑，admin 侧是独立的操作入口。若同一 avatar 同时被两端操作，以最后写入为准（last-write-wins）。后续如需严格收口，可在用户侧路由添加状态检查。

---

## API 设计

### Admin API — 行为日程

```
GET    /api/admin/schedules                    -- 列出所有日程（含 blocks）
POST   /api/admin/schedules                    -- 创建日程 + blocks
PUT    /api/admin/schedules/:id                -- 更新日程（全量替换 blocks）
DELETE /api/admin/schedules/:id                -- 删除日程（CASCADE 删 blocks）
POST   /api/admin/schedules/:id/activate       -- 激活日程（事务内先 deactivate 同 species+type 的旧日程）
```

创建/更新请求体：
```json
{
  "name": "猫咪工作日日程",
  "species": "cat",
  "effectiveType": "weekday",
  "blocks": [
    { "actionType": "sleep", "startMinutes": 0, "endMinutes": 360, "sortOrder": 0 },
    { "actionType": "eat", "startMinutes": 360, "endMinutes": 390, "sortOrder": 1 }
  ]
}
```

**激活逻辑**：
1. 校验日程存在且有 blocks
2. 事务内：`UPDATE behavior_schedules SET is_active=false WHERE species=X AND effective_type=Y AND is_active=true`
3. `UPDATE behavior_schedules SET is_active=true WHERE id=:id`
4. 幂等：已激活的日程再次激活 → 200 无操作

### Admin API — 图像审核 + 定制

```
GET    /api/admin/avatars                      -- 列出所有 avatar（?status=pending 筛选）
GET    /api/admin/avatars/:id                  -- avatar 详情（含 pet 信息 + actions）
PUT    /api/admin/avatars/:id/approve          -- 审核通过
PUT    /api/admin/avatars/:id/reject           -- 审核拒绝（body: { reason }，reason 必填）
GET    /api/admin/avatars/:id/actions          -- 获取 actions 列表
POST   /api/admin/avatars/:id/actions          -- 上传 action（body: { actionType, imageUrl }）
DELETE /api/admin/avatars/:id/actions/:actionId -- 删除 action（done 状态不允许）
POST   /api/admin/avatars/:id/sync             -- 一键同步（要求 ≥1 个 action）
```

### Admin API — 增强统计

```
GET    /api/admin/stats                        -- 保持不变（兼容 verifyAdminKey）
GET    /api/admin/stats/enhanced               -- 增强版统计
```

enhanced 返回：
```json
{
  "users": { "total": 100, "withDevice": 45, "withCustomization": 20 },
  "devices": {
    "collars": { "total": 30, "online": 10, "offline": 20 },
    "desktops": { "total": 50, "online": 25, "offline": 25 }
  },
  "weeklyActiveDevices": 35,
  "todayInteractions": 150,
  "deviceActivity": { "high": 20, "medium": 15, "low": 45 },
  "avatars": { "pending": 5, "approved": 3, "processing": 2, "done": 40, "rejected": 1, "failed": 0 },
  "todayNewAvatars": 3
}
```

### Admin API — 设备增强查询

保留现有分开的 collars/desktops 端点，增加筛选参数：

```
GET /api/admin/collars?status=online&bound=true&species=cat&sort=createdAt&order=desc
GET /api/admin/desktops?status=online&bound=true&sort=createdAt&order=desc
```

- `bound`：`true` = userId IS NOT NULL, `false` = userId IS NULL
- `species`：仅 collars 支持（通过 petId → pets.species 过滤）
- `sort`：`createdAt` | `lastOnlineAt`
- `order`：`asc` | `desc`

### Admin API — 用户增强 (P1)

```
GET    /api/admin/users/enhanced               -- 用户列表 + 关联设备数/宠物数
GET    /api/admin/users/:id/detail             -- 用户详情 + 关联宠物/设备列表
```

### Admin API — 数据看板 (P1)

```
GET    /api/admin/analytics                    -- 看板数据
```

返回：实时在线设备数、平均互动数、一周互动排行 Top10、7 天每日互动趋势

### Public API — 设备日程轮询

```
GET    /api/schedules/current?species=cat      -- 无需认证
```

逻辑：
1. 判断今天是工作日还是周末（UTC+8）
2. 查找 species 匹配 + effective_type 匹配 + is_active=true 的日程
3. 若无匹配，fallback 到 effective_type=everyday 的活跃日程
4. 返回日程 blocks 列表；无日程返回空数组

---

## 前端设计

### 导航结构

```
侧边栏 - 运营管理：
├── 系统概览        /                    （增强版 Dashboard）
├── 行为日程        /schedules           （NEW）
├── 图像审核        /image-review        （NEW）
├── 定制中心        /customization       （NEW）
├── 设备管理        /devices             （增强版，Tab: 项圈/桌面端）
├── 数据看板        /analytics           （NEW - P1）
├── 用户管理        /users               （增强版 - P1）

侧边栏 - 开发工具（折叠组）：
├── 宠物管理        /pets                （保留）
└── 模拟事件        /events              （保留）
```

### 页面设计

#### 系统概览 `/`（增强）
- Row 1：4 个 KPI 卡片（注册用户/已绑定设备用户/已定制用户/宠物总数）
- Row 2：活跃设备数 + 今日互动总数
- Row 3：设备分布（桌面 vs 项圈，数字+占比）+ 设备活跃度分布（高/中/低 Progress）
- Row 4：Avatar 审核概览（各状态数量）
- P1 预留：实时动态列表
- P2 占位：系统健康状态

#### 行为日程 `/schedules`
- 左侧面板：Species Tab（猫/狗/其他）+ 该类型下的日程列表卡片
- 右侧主区域：选中日程的时间轴编辑器
  - 24h 横向时间轴（0:00-24:00），每个 block 用颜色条标识
  - 操作：点击添加 block（弹出 Modal 选择动作+时间范围）、拖拽调整、删除
  - 时间轴实现：纯 div + CSS 定位（block 宽度 = 占 24h 比例），无重型库
- 底部：保存 + 激活按钮
- 激活状态用绿色 Badge 标识

#### 图像审核 `/image-review`
- 顶部：3 个统计卡（今日待处理/今日已完成/已同步总数）
- Tabs：待审核 / 已通过 / 已拒绝 / 已失败
- 卡片网格：图片 + 宠物名 + 类型 + 上传时间 + 状态
- 操作：通过按钮 / 拒绝按钮（弹出原因 Modal）/ 下载按钮

#### 定制中心 `/customization`
- 顶部：统计卡（累计总量 + 今日新增）
- 左侧列表：Avatar 任务卡片（approved/processing 状态），可按状态筛选
- 右侧工作区：
  - 宠物信息 + 原图展示
  - 14 个动作网格（2 行 × 7 列，基础/趣味分区）
  - 每个格子：有 action → 缩略图 + ✓，无 → 上传按钮
  - 底部：一键同步按钮（至少 1 个 action 时可用）

#### 设备管理 `/devices`（增强）
- Tab：项圈 / 桌面端
- 每个 Tab 下：筛选栏（绑定状态/在线状态/排序）+ Ant Table
- 行点击 → Drawer 展示详情
- 项圈 Tab 额外支持宠物类型筛选

#### 数据看板 `/analytics`（P1）
- 实时在线设备数 + 平均互动数（Statistic 卡片）
- 一周互动排行 Top 10（Ant Table）
- 7 天每日互动趋势（简单 CSS 柱状图 或 Ant Statistic + description）

#### 用户管理 `/users`（P1 增强）
- 现有表格 + 额外列：宠物数、绑定设备数
- 行点击 → Drawer：用户信息 + 宠物列表 + 设备列表
- P2 占位：会员信息区域

---

## 文件变更清单

### 后端 (packages/server)

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/db/schema.ts` | 修改 | 新增 scheduleEffectiveTypeEnum、behaviorSchedules、behaviorScheduleBlocks 表；petAvatars 增加 rejectReason、reviewedAt 字段；avatarStatusEnum 增加 approved/rejected |
| `drizzle/0004_admin_backoffice.sql` | 新建 | 数据库迁移文件 |
| `src/routes/admin/index.ts` | 新建 | Admin 路由注册入口，挂载所有子路由 |
| `src/routes/admin/users.ts` | 新建 | 从 admin.ts 迁移用户 CRUD + 新增 enhanced/detail |
| `src/routes/admin/pets.ts` | 新建 | 从 admin.ts 迁移宠物 CRUD |
| `src/routes/admin/devices.ts` | 新建 | 从 admin.ts 迁移设备 CRUD + 新增筛选参数 |
| `src/routes/admin/schedules.ts` | 新建 | 行为日程 CRUD + activate |
| `src/routes/admin/avatars.ts` | 新建 | 图像审核 + 定制管理 |
| `src/routes/admin/stats.ts` | 新建 | 迁移 stats + 新增 enhanced |
| `src/routes/admin/analytics.ts` | 新建 | 数据看板 P1 |
| `src/routes/admin.ts` | 删除 | 全部迁移到 admin/ 目录 |
| `src/routes/schedules.ts` | 新建 | 设备日程轮询公开接口 |
| `src/index.ts` | 修改 | 注册新路由 |

### 前端 (packages/admin)

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/App.tsx` | 修改 | 更新导航结构和路由 |
| `src/api/client.ts` | 修改 | 新增 API 方法（保持 getStats 不变） |
| `src/pages/Dashboard.tsx` | 重写 | 增强版系统概览 |
| `src/pages/Schedules.tsx` | 新建 | 行为日程管理（含时间轴编辑器） |
| `src/pages/ImageReview.tsx` | 新建 | 图像审核中心 |
| `src/pages/Customization.tsx` | 新建 | 定制中心 |
| `src/pages/Devices.tsx` | 新建 | 统一设备管理（Tab 切换） |
| `src/pages/Analytics.tsx` | 新建 | 数据看板 P1 |
| `src/pages/Users.tsx` | 修改 | 增强用户管理 P1 |
| `src/pages/Collars.tsx` | 保留 | 移入开发工具折叠组 |
| `src/pages/Desktops.tsx` | 保留 | 移入开发工具折叠组 |

### 共享类型 (packages/shared)

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/types.ts` | 修改 | 新增 Schedule、ScheduleBlock 类型；AvatarStatus 增加 'approved'、'rejected' |
| `src/constants.ts` | 新建 | ACTION_TYPES 常量 + ACTION_LABELS 映射 |
| `src/index.ts` | 修改 | 导出 constants |

---

## 测试策略

- **后端**：`pnpm build` 验证 TypeScript 编译通过
- **前端**：`pnpm build` 验证 Vite 构建无报错
- **迁移**：`pnpm db:generate` 生成迁移 + 本地 `pnpm db:migrate` 验证
- **API 冒烟**：用 curl 验证新端点基本可达

---

## 安全考虑

- 所有 admin 新路由继续使用 adminMiddleware (X-Admin-Key) 保护
- `/api/schedules/current` 公开接口不含敏感数据（仅日程配置）
- 文件上传复用现有 MinIO 存储方案
- 审核操作记录 reviewedAt 时间戳，可追溯
- avatar 状态流转有严格的前置状态校验，防止非法状态跳转
