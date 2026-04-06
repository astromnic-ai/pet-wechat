# 需求文档 — 后端 V2 功能迭代

## 简介

基于 0.8 PRD 和产品讨论，对后端和 admin 前端进行一系列功能扩展：宠物活动模式、宠物信息字段扩展、消息类型扩展、自定义动作、桌面互动记录、注册流程、会员额度系统。

## 关键决策

- **D-01**: 系统自由模式的时间表由管理员（张烨）通过 admin API 为每个宠物单独配置，支持修改和批量配置，不硬编码
- **D-02**: 注册流程短信验证码继续使用 dev 模式（固定 123456），不对接真实短信服务
- **D-03**: 自定义动作的处理流程：用户上传视频 → 状态变为 pending → 管理员通过 admin API 上传处理结果（静态图/GIF）→ 状态变为 done
- **D-04**: 桌面设备互动记录：建设备上报 API + admin 批量生成测试数据接口
- **D-05**: 会员/额度系统只建表和展示 API，暂不做强制校验限制逻辑（会议决定）
- **D-06**: 宠物活动模式数据从 localStorage 迁移到后端存储，后端为 single source of truth
- **D-07**: 三种宠物活动模式中，「真实行为模式」为前端占位，本次只需后端存储模式选择，不需要与项圈联动的实时逻辑
- **D-08**: Admin 前端需要配套更新，新增管理页面与后端 admin API 对齐

## 需求

### 需求 1 — 宠物信息字段扩展（P0）

**用户故事：** 作为用户，我想要为宠物添加描述、毛色等信息，以便在首页展示更丰富的宠物档案

#### 验收标准

1. `pets` 表新增 `description`（text, nullable）、`color`（text, nullable）字段
2. `species` 枚举新增 `"other"` 值
3. `POST /api/pets` 和 `PUT /api/pets/:id` 接受新字段
4. `GET /api/pets` 和 `GET /api/pets/:id` 返回新字段
5. shared types 同步更新
6. Admin 前端 Pets 页面的表单和表格展示新增 description、color 字段，species 下拉支持 "other"
7. 所有现有宠物测试继续通过，新字段有测试覆盖

### 需求 2 — 消息类型扩展（P0）

**用户故事：** 作为用户，我想要看到不同类型的消息通知（活动提醒、健康报告、设备提醒、社区互动），以便区分消息的重要程度

#### 验收标准

1. `messageType` 枚举扩展为：`"system"` | `"authorization"` | `"activity"` | `"health"` | `"device"` | `"community"`
2. `GET /api/messages` 的 `type` 过滤参数支持新类型
3. `POST` 创建消息（admin API）支持新类型
4. shared types 同步更新
5. 消息相关测试覆盖新类型

### 需求 3 — 宠物活动模式（P0）

**用户故事：** 作为用户，我想要为宠物设置活动模式（系统自由/个性自定义/真实行为），以便桌面端播放对应的宠物动画

#### 验收标准

1. 新增 `petModes` 表，存储每个宠物的当前活动模式（free/custom/real）
2. 新增 `petModeSchedules` 表，存储时间段配置（startTime, endTime, actionType），用 `source` 字段区分来源（"system" = admin 配置 / "custom" = 用户配置）
3. `GET /api/pets/:id/mode` — 获取宠物当前模式及对应时间表
4. `PUT /api/pets/:id/mode` — 用户切换模式（free/custom/real）
5. `GET /api/pets/:id/mode/schedules` — 获取时间表
6. `POST /api/pets/:id/mode/schedules` — 用户添加自定义时间段（仅 custom 模式）
7. `PUT /api/pets/:id/mode/schedules/:scheduleId` — 用户修改时间段
8. `DELETE /api/pets/:id/mode/schedules/:scheduleId` — 用户删除时间段
9. Admin API：`PUT /api/admin/pets/:id/mode/schedules` — 管理员批量配置某宠物的系统自由模式时间表（D-01），支持整体替换
10. Admin API：`POST /api/admin/pets/batch-schedules` — 管理员批量为多个宠物配置相同时间表（D-01）
11. 前端切换模式时，对应的时间表应自动切换（free 看 admin 配的，custom 看用户自己配的）
12. Admin 前端新增「活动模式」页面：选择宠物 → 查看/编辑系统自由模式时间表，支持批量选择多宠物配置相同时间表
13. 全部有测试覆盖

### 需求 4 — 自定义动作（P1）

**用户故事：** 作为用户，我想要上传视频生成自定义动作，以便在桌面端展示个性化的宠物动画

#### 验收标准

1. 新增 `customActions` 表：petId, userId, name, description, videoUrl, status (pending/processing/done/failed), resultImageUrl (nullable), createdAt
2. `POST /api/upload` 扩展支持视频文件（MP4, MOV, max 50MB）
3. `GET /api/pets/:id/custom-actions` — 获取宠物的自定义动作列表
4. `POST /api/pets/:id/custom-actions` — 创建自定义动作（上传视频 URL + 名称 + 描述）
5. `DELETE /api/pets/:id/custom-actions/:actionId` — 删除自定义动作
6. Admin API：`PUT /api/admin/custom-actions/:id` — 管理员上传处理结果（设置 resultImageUrl, 更新 status 为 done/failed）（D-03）
7. Admin API：`GET /api/admin/custom-actions` — 管理员查看所有待处理的自定义动作
8. 状态变为 done 时通过 WebSocket 通知用户（`custom-action:done`）
9. Admin 前端新增「自定义动作」页面：表格展示所有动作（可按 status 过滤），pending 状态显示上传处理结果按钮，支持上传图片并标记为 done
10. 全部有测试覆盖

### 需求 5 — 桌面互动记录（P1）

**用户故事：** 作为用户，我想要查看与宠物的互动记录和统计，以便了解自己的陪伴情况

#### 验收标准

1. 新增 `deviceInteractions` 表：desktopDeviceId, petId, interactionType (touch/shake/gesture), count (integer, default 1), timestamp
2. `POST /api/interactions` — 设备上报互动事件（D-04）
3. `GET /api/interactions/:petId/stats` — 获取互动统计（支持 day/week/month 维度），返回各类型次数聚合
4. Admin API：`POST /api/admin/interactions/auto` — 批量生成模拟互动数据用于测试（D-04）
5. WebSocket 广播 `interaction:new` 事件
6. Admin 前端新增「互动记录」页面：查看互动事件列表 + 批量生成测试数据按钮
7. 全部有测试覆盖

### 需求 6 — 注册流程（P2）

**用户故事：** 作为新用户，我想要用手机号 + 验证码 + 密码注册账号，以便后续使用密码登录

#### 验收标准

1. `users` 表新增 `passwordHash`（text, nullable）字段
2. `POST /api/auth/register` — 手机号 + 验证码 + 密码注册（D-02：验证码固定 123456）
3. `POST /api/auth/phone` — 扩展支持密码登录模式：`{ phone, password }` 作为替代 `{ phone, code }` 的方式
4. 密码使用 bcrypt/argon2 哈希存储，不存明文
5. 注册时手机号不能已被注册
6. shared types 更新
7. 全部有测试覆盖

### 需求 7 — 会员/额度系统（P3）

**用户故事：** 作为用户，我想要在个人页面看到我的会员额度信息（终端绑定额度、定制图像额度），以便了解剩余免费次数

#### 验收标准

1. `users` 表新增 `deviceBindingQuota`（integer, default: 3）字段
2. `GET /api/me` 响应扩展：返回 `deviceBindingQuota`、已用绑定数、已用定制次数
3. 暂不做强制校验（D-05），仅提供展示数据
4. Admin API：`PUT /api/admin/users/:id` 支持修改 `avatarQuota` 和 `deviceBindingQuota`
5. Admin 前端 Users 页面的表单和表格展示 `deviceBindingQuota` 字段
6. shared types 更新
7. 全部有测试覆盖
