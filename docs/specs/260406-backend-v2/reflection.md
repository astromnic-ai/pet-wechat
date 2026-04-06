# 后端 V2 实现反思

## 本次回看范围

- `docs/specs/260406-backend-v2/requirements.md`
- `docs/specs/260406-backend-v2/design.md`
- `git diff f074dc2..HEAD`

## 关键问题与已落地修复

### 1. `real` 模式被错误耦合到项圈绑定

- 问题：实现里把 `PUT /api/pets/:id/mode` 的 `real` 模式切换和项圈绑定绑定在一起，这和 D-07「只存储模式选择，不做实时联动」直接冲突
- 修复：移除了切到 `real` 模式时的项圈前置校验，测试改为验证无项圈时也能切换成功

### 2. 时间表校验逻辑重复，且时间格式不够严格

- 问题：`pet-modes.ts` 和 `admin.ts` 各自维护一份时间表校验；原实现只校验 `\d{2}:\d{2}`，会放过 `24:00`、`99:99`
- 修复：提取了 `packages/server/src/utils/pet-mode-schedules.ts` 统一处理时间表归一化、严格 HH:MM 校验、重叠校验和 20 条上限
- 顺带修复：admin 批量配置会去重 `petIds`，并补了宠物存在性校验，避免 silent partial success

### 3. 自定义时间表编辑没有收敛到 `custom` 模式

- 问题：用户即使当前在 `free/real` 模式下也能直接新增/修改/删除 `custom` 时间表，和需求里的“仅 custom 模式”不一致
- 修复：新增 schedule CRUD 前置校验，仅在当前模式为 `custom` 时允许编辑

### 4. 互动上报 API 漏了设计里的 `timestamp` 能力和时间上界校验

- 问题：`POST /api/interactions` 只会写当前时间，丢掉了设计中设备回传时间戳的能力，也没有“不能超前 1 小时”的保护
- 修复：接口新增 `timestamp` 入参支持，增加时间格式校验和未来 1 小时上界校验，并补测试覆盖

### 5. Admin 端自定义动作流程被悄悄简化成“只填 URL”

- 问题：需求是管理员上传处理结果（静态图/GIF），但前端只有手填 `resultImageUrl`；同时缺少失败态操作
- 修复：
  - 提取共享上传工具，新增 `POST /api/admin/uploads`
  - Admin「自定义动作」页支持直接上传图片/GIF 并回填 URL
  - 增加“标记失败”操作，和后端 `done/failed` 流程保持一致
  - 非 `done` 状态时清空 `resultImageUrl`，避免残留脏数据

### 6. 新消息类型只在后端放开，Admin 前端没有配套入口

- 问题：后端 `POST /api/admin/messages` 接受了新类型，但 Admin 没有任何入口创建 `activity/health/device/community` 消息，D-08 没闭环
- 修复：
  - 后端增加统一的消息类型校验，非法类型直接拒绝
  - Admin `Events` 页补了“发送消息”入口，可选择全部六种消息类型并指定接收用户

### 7. 上传链路重复实现，且 `storage.ts` 存在明显代码污染

- 问题：原上传逻辑分散，Admin 也无法复用；`packages/server/src/utils/storage.ts` 还出现了重复 import
- 修复：
  - 提取 `packages/server/src/utils/uploads.ts` 统一做文件校验与存储
  - 用户上传和 Admin 上传复用同一套逻辑
  - 修掉 `storage.ts` 的重复 import

### 8. 登录入口的手机号约束不一致

- 问题：注册接口校验手机号格式，但 `/api/auth/phone` 没有同样的校验，导致同一领域对象约束前后不一致
- 修复：统一为手机号登录入口增加格式校验

## D-01 到 D-08 逐条核对

| 决策 | 核对结果 | 说明 |
| --- | --- | --- |
| D-01 | 已完整实现 | Admin 单宠物替换配置、批量同模板配置均已实现；本次补了严格时间校验、去重和宠物存在校验 |
| D-02 | 已完整实现 | 注册验证码仍为 dev 模式固定 `123456`，未引入真实短信服务 |
| D-03 | 已完整实现 | 用户创建动作为 `pending`；Admin 可推进到 `processing/done/failed`；本次补了 Admin 文件上传和失败态操作 |
| D-04 | 已完整实现 | 设备上报 API、Admin 批量造数、统计接口、广播都已具备；本次补上 timestamp 入参与校验 |
| D-05 | 已完整实现 | 额度只做展示和管理，不做强制拦截；实现未偷偷加限制逻辑 |
| D-06 | 已完整实现 | 模式和时间表以后端存储为准；前端不再是 source of truth |
| D-07 | 已修正实现偏差 | 原实现错误要求切 `real` 模式前必须有项圈；现已移除该耦合，只保留模式存储 |
| D-08 | 已完整实现 | Pets / Users / PetModes / CustomActions / Interactions 已对齐；本次补齐了新消息类型创建入口与自定义动作上传能力 |

## 代码质量与架构回看

- 这次最明显的问题不是“写错”，而是“同一规则在多个入口各写一遍”，导致 scope 漂移时不容易及时发现。时间表校验、上传校验、消息类型校验都属于这个问题，本次都收敛成了共享工具
- `admin.ts` 仍然是一个偏大的聚合路由，但这轮至少先把最容易继续分叉的 schedule / upload / message 规则抽出来，避免继续在文件内复制黏贴
- 测试侧补到了这轮修复覆盖到的关键路径：`real` 模式切换、严格时间校验、`custom` 模式 gate、互动时间戳、非法消息类型、Admin GIF 上传

## 验证

- `cd packages/server && bun test src/__tests__/`
- `cd packages/admin && bun run build`
