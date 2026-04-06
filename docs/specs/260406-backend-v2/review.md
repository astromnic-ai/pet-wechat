# 审查结论

## Findings

1. `[High]` 注册流与现有 `POST /api/auth/phone` 自动建号语义冲突，且未定义旧手机号账号如何补设密码。  
证据：`docs/specs/260406-backend-v2/requirements.md:103-108`，`docs/specs/260406-backend-v2/design.md:156-162`，`packages/server/src/routes/auth.ts:49-73`  
当前 `POST /api/auth/phone` 对验证码登录执行 upsert 自动建号；新设计新增 `POST /api/auth/register` 且要求“手机号不能已被注册”。如果继续保留自动建号，`register` 会变成语义含混的重复入口；如果改成登录前必须注册，则现有验证码登录就是 breaking change。设计还缺少旧手机号用户补设 `passwordHash`、`phone` 归一化、同时传 `code` + `password` / 两者都不传时的后端判定。

2. `[High]` `petModes` 缺少对存量宠物的默认值/backfill 方案，迁移后老数据会出现空模式。  
证据：`docs/specs/260406-backend-v2/requirements.md:14-15,52-64`，`docs/specs/260406-backend-v2/design.md:55-80,129-141`  
需求明确活动模式要从 localStorage 迁移到后端，但设计只定义了新表和新接口，没有定义存量宠物的默认 `mode`、`pet_modes` 回填、无记录时 `GET /api/pets/:id/mode` 的返回策略，也没定义如何迁移前端本地 `custom` schedule。

3. `[High]` 表关系完整性仍停留在文档注释，未把 FK / `ON DELETE` / 唯一约束落到 schema，现有手写删除流程也未覆盖新增表。  
证据：`docs/specs/260406-backend-v2/design.md:53-108`，`packages/server/src/db/schema.ts:44-205`，`packages/server/src/routes/pets.ts:272-308`，`packages/server/src/routes/admin.ts:73-105,155-173,231-292`  
当前 schema 基本都是裸 `text` 字段，没有 `.references()`；删除宠物/用户/桌面设备靠路由手工清理。设计新增 `petModes`、`petModeSchedules`、`customActions`、`deviceInteractions` 后，没有同时补 FK、`ON DELETE` 策略和现有删除链路更新，删除宠物/用户/桌面设备后很容易留下 orphan rows 或软删状态不一致。`pet_modes.pet_id` 也需要唯一约束，`device_interactions` 还应考虑与活跃绑定关系的一致性约束。

4. `[High]` PostgreSQL 枚举扩展迁移方案不完整，缺少事务兼容、回滚策略和灰度发布顺序。  
证据：`docs/specs/260406-backend-v2/design.md:36-51,245-248`，`packages/server/src/db/schema.ts:15-31`  
设计只写了 `ALTER TYPE ... ADD VALUE`。这里至少要补三件事：确认目标 PostgreSQL 版本与 drizzle migrator 是否会把枚举变更包在事务里；明确“先迁移、后发布应用”的顺序，避免新代码在迁移提交前写入新枚举值；接受该变更基本不可直接回滚，回滚只能靠新类型重建或逻辑回退。否则 mixed-version rollout 和故障回退都会卡住。

5. `[High]` 需求 2 要求的 admin 消息创建能力没有进入技术设计和改动清单。  
证据：`docs/specs/260406-backend-v2/requirements.md:40-44`，`docs/specs/260406-backend-v2/design.md:177-214`  
P0 验收标准要求“POST 创建消息（admin API）支持新类型”，但设计的 Admin API 只有模式、自定义动作、互动记录，没有消息创建接口，也没有 `admin.ts` / 测试 / admin 前端对应改动。这是需求级缺口，不是实现细节。

6. `[Medium]` 测试策略继续依赖 mock DB，会漏掉本次迭代最关键的数据库与事务问题。  
证据：`docs/specs/260406-backend-v2/design.md:5,21,250-258`，`packages/server/src/__tests__/mock-db.ts:12-200`  
当前 mock DB 只是按调用顺序回放预设结果，不执行 SQL、约束、唯一索引、FK、事务回滚或聚合逻辑；`transaction()` 只是直接回调，`onConflictDoUpdate()` / `execute()` 也没有真实数据库语义。时间表冲突检测、批量整体替换、quota 统计、enum 迁移、删除级联、聚合统计都不能靠这套测试兜底，至少需要真实 PostgreSQL 集成测试覆盖迁移、约束和聚合查询。

7. `[Medium]` 测试装配点和生产路由装配点都没有覆盖新增域，设计低估了回归成本。  
证据：`packages/server/src/__tests__/helpers.ts:27-50`，`packages/server/src/index.ts:44-62`，`docs/specs/260406-backend-v2/design.md:204-214,219-227`  
当前测试 `createApp()` 只挂了现有公开/受保护路由，没有 `/api/admin`、`/api/interactions`、`/api/pets/:id/mode`、`/api/pets/:id/custom-actions`。如果继续沿用这套 helpers，新路由测试需要先补路由装配和 admin auth 支持；设计清单只提了加 test 文件，没提测试基座和生产 `index.ts` 的路由注册调整，容易出现“实现了文件但没真正挂载”的漏项。

8. `[Medium]` 路由组织会继续扩大单文件耦合，并放大现有权限判断不一致的问题。  
证据：`packages/server/src/routes/admin.ts:1-380`，`packages/server/src/routes/pets.ts:136-191`，`docs/specs/260406-backend-v2/design.md:204-214`  
`admin.ts` 已经承担用户、宠物、项圈、桌面端、行为、统计多个域；再把模式、自定义动作、互动记录、消息创建都塞进去，会继续恶化维护性。另一方面，当前 `/api/pets` 列表会返回 `authorizedPets`，但 `/api/pets/:id` 只允许 owner 访问；新 `/mode`、`/custom-actions` 路由如果没有抽象统一的 pet access guard，很容易出现 owner / authorized / admin 三套规则继续漂移。

9. `[Medium]` shared types 的扩展存在向后兼容和安全边界风险。  
证据：`docs/specs/260406-backend-v2/design.md:112-122,163-175,229-232`，`packages/shared/src/types.ts:3-22,26-40,124-154`  
`Species` / `MessageType` 扩大 union 后，现有前端和 admin 的 exhaustive switch、下拉映射、颜色映射都会在运行时遇到新值；`Pet` / `User` 直接增加必填字段还会让测试假对象和对象字面量在编译期整体爆掉。更重要的是，`passwordHash` 只能存在于 server schema，不能进 shared `User`。另外设计要求新增 `custom-action:done`、`interaction:new` websocket 事件，但当前 shared `WsMessage` 还没有对应消息类型。

10. `[Medium]` 时间表后端校验还不够，只有“冲突检测”不足以保证数据可执行。  
证据：`docs/specs/260406-backend-v2/design.md:66-80,129-141,182-185,263-267`  
设计已写时间段重叠校验，但还缺至少这些后端规则：`HH:MM` 格式校验；是否允许跨天（如 `23:00-02:00`）必须明确；`startTime === endTime` 是否非法；单宠物单 `source` 最大条目数；`sortOrder` 生成 / 重排策略；admin “整体替换” 需要事务包裹删除 + 插入，避免并发下出现短暂空时间表或部分写入。

11. `[Medium]` 自定义动作的核心业务约束没有完全后端化。  
证据：`docs/specs/260406-backend-v2/requirements.md:72-80`，`docs/specs/260406-backend-v2/design.md:143-148,187-191,266-277`，`packages/server/src/routes/upload.ts:7-28`  
设计提了状态机原则，但没有把关键约束写全：`videoUrl` 必须属于当前用户且来自受控上传地址；`POST /api/upload` 扩成视频后需要区分图片 / 视频 bucket 或 key 前缀；`pending -> processing -> done / failed` 的合法迁移集合要固定；`done` 必须带 `resultImageUrl`，`failed` 是否允许 / 清空 `resultImageUrl` 需要明确；用户删除动作时是否允许删除 `processing` 状态也要在后端限制。

12. `[Medium]` 互动记录和额度统计的后端规则仍有缺口。  
证据：`docs/specs/260406-backend-v2/requirements.md:89-95,117-120`，`docs/specs/260406-backend-v2/design.md:153-175,193-197,271-277`，`packages/server/src/db/schema.ts:102-129`  
互动上报不能只校验“设备归属”，还要校验 `desktopDeviceId` 与 `petId` 当前存在有效绑定、`count` 为正整数、`timestamp` 不超前 / 不过旧、用户是否对该宠物有查看权限。`GET /api/me` 里的 `deviceBindingUsed` 目前写成 “count owned devices”，但需求语义更像“已用绑定数”；现有 schema 里有 `desktop_pet_bindings` 软删记录，这两种口径会得出不同结果，设计需要先固定计算口径。

## Open Questions

1. `POST /api/auth/phone` 是否继续保留“验证码登录即自动注册”语义；如果保留，`POST /api/auth/register` 的存在价值和老用户补设密码入口是什么？
2. localStorage 里现存的宠物模式和自定义时间表如何迁移到 `pet_modes` / `pet_mode_schedules`；如果迁移失败，后端默认返回什么？
3. 时间表是否允许跨天；如果允许，冲突检测和排序规则按哪套语义实现？
