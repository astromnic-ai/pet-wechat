# 需求文档：全流程前后端接通

## 简介

将小程序前端从 mock 数据模式切换到真实 API 调用，删除整套 mock 系统，所有页面接入后端真实数据。同时实现开发环境切换机制和开发调试登录接口。

---

## 需求

### 需求 1 - 环境切换机制

**用户故事：** 作为开发者，我想要通过不同的命令切换前端连接的后端地址（本地/云端），以便本地调试和远程测试无需手动改代码。

#### 验收标准

1. 当运行 `pnpm dev:app` 时，前端 `BASE_URL` 为 `http://localhost:9527`（本地后端）
2. 当运行 `pnpm dev:app:remote` 时，前端 `BASE_URL` 为 `https://pet-wechat.yangl.com.cn`（云端后端）
3. 当执行生产构建时，前端 `BASE_URL` 为 `https://pet-wechat.yangl.com.cn`
4. WebSocket 地址应根据 `BASE_URL` 自动推导协议（http→ws, https→wss）

---

### 需求 2 - 删除 Mock 系统

**用户故事：** 作为开发者，我想要删除所有 mock 相关代码，以便代码库干净、不产生混淆。

#### 验收标准

1. `packages/app/src/mock/` 目录完全删除（data.ts、handler.ts、mode.ts）
2. `packages/app/src/components/MockToggle/` 组件完全删除
3. `packages/app/src/utils/request.ts` 中 mock 相关逻辑（isMockMode、handleMockRequest 导入和分支）删除
4. `packages/app/src/utils/ws.ts` 中 mock 模式检查删除
5. `packages/app/src/app.ts` 中 `ensureMockLoginState()` 调用删除
6. `packages/app/src/pages/login/index.tsx` 中 `handleMockLogin()` 函数删除
7. 所有页面中的 `FALLBACK_*` 常量和 `mock-*` 前缀 ID 删除
8. 删除后项目编译无报错

---

### 需求 3 - 开发调试登录接口

**用户故事：** 作为开发者，我想要在开发环境下通过测试登录接口获取 token，以便在微信开发者工具中调试不依赖真机扫码。

#### 验收标准

1. 后端新增 `POST /api/auth/dev-login` 接口，接受 `{ phone: string }` 参数
2. 该接口仅在非 production 环境可用（通过环境变量 `NODE_ENV` 判断）
3. 调用后自动创建或查找用户，返回 JWT token
4. 前端登录页在开发环境下显示「开发登录」入口，输入手机号即可登录
5. 生产环境下不暴露该接口，登录页不显示开发登录入口

---

### 需求 4 - 首页接入真实数据

**用户故事：** 作为用户，我想要在首页看到我真实的宠物信息，以便了解宠物当前状态。

#### 验收标准

1. 首页调用 `GET /api/pets` 获取用户的宠物列表
2. 宠物卡片展示真实数据：名称、品种、活跃度、最新行为
3. 如果用户没有宠物，显示引导用户添加宠物的空状态
4. 气泡文案根据宠物有无和状态动态展示（无宠物时引导添加，有宠物时展示行为摘要）
5. 通过 WebSocket 订阅 `behavior:new` 实时更新宠物行为

---

### 需求 5 - 设备管理页接入真实数据

**用户故事：** 作为用户，我想要在设备管理页看到我真实的宠物和设备信息，以便管理项圈和桌面端。

#### 验收标准

1. 页面调用 `GET /api/pets` 获取宠物列表作为 Tab 数据源
2. 页面调用 `GET /api/devices/collars` 和 `GET /api/devices/desktops` 获取设备列表
3. 每个宠物 Tab 下展示其关联的项圈和桌面端设备
4. 设备信息展示真实数据：名称、MAC 地址、电量、信号、在线状态
5. 删除硬编码的 `PET_TABS` 数组（当前 118 行假数据）

---

### 需求 6 - 宠物信息页接入真实数据

**用户故事：** 作为用户，我想要查看和编辑宠物的真实信息。

#### 验收标准

1. 创建宠物：调用 `POST /api/pets`，使用 API 返回的完整宠物对象
2. 编辑宠物：调用 `PUT /api/pets/:id`，使用 API 返回值更新界面
3. 删除硬编码的 `userId: "mock-user"` 和 `activityScore: 82`
4. 设备 ID 从关联的项圈数据获取，不再硬编码 `666777888`

---

### 需求 7 - 项圈绑定：扫码自动注册

**用户故事：** 作为用户，我想要扫描项圈上的二维码即可完成绑定，不依赖管理员预注册。

#### 验收标准

1. 后端新增 `POST /api/devices/collars/register` 接口，接受 `{ macAddress: string, name?: string }`
2. 该接口逻辑：MAC 不存在 → 创建+绑定当前用户；MAC 存在且无主 → claim 给当前用户；MAC 已有主 → 返回错误
3. 前端扫码获取 MAC 地址后，调用该接口一步完成注册+绑定
4. 删除 `FALLBACK_COLLAR` 常量
5. 删除旧的 `GET /api/devices/collars/unowned` 无主设备查询逻辑（前端不再使用）

---

### 需求 8 - 桌面端绑定：扫码自动注册

**用户故事：** 作为用户，我想要扫描桌面端上的二维码即可完成绑定。

#### 验收标准

1. 后端新增 `POST /api/devices/desktops/register` 接口，接受 `{ macAddress: string, name?: string }`
2. 该接口逻辑同项圈：MAC 不存在 → 创建+绑定；MAC 存在且无主 → claim；MAC 已有主 → 报错
3. 前端扫码获取 MAC 地址后，调用该接口一步完成注册+绑定
4. 宠物绑定仍调用 `POST /api/devices/desktops/:id/bind`
5. 删除 `FALLBACK_DESKTOP` 常量

---

### 需求 9 - 邀请页接入真实数据

**用户故事：** 作为被邀请用户，我想要看到真实的邀请信息（邀请人、宠物信息）。

#### 验收标准

1. 页面根据邀请码调用 `GET /api/invite/:code` 获取邀请详情
2. 接受邀请调用 `POST /api/devices/invite/:code/accept`
3. 删除 `FALLBACK_PET` 常量和硬编码年龄
4. 宠物年龄根据 birthday 字段实时计算

---

### 需求 10 - 个人中心页接入真实数据

**用户故事：** 作为用户，我想要在个人中心看到我的真实信息。

#### 验收标准

1. 调用 `GET /api/me` 获取用户信息（昵称、头像、手机号、配额）
2. 调用 `GET /api/pets` 获取用户宠物列表用于「服务宠物」展示
3. 删除硬编码的用户名 `烨子（微信用户）`、ID `6667779898`、手机号、邮箱、注册日期
4. 会员权益列表 `BENEFITS` 如果是产品固定文案可保留，不属于 mock 数据

---

### 需求 11 - 宠物头像定制页接入真实数据

**用户故事：** 作为用户，我想要使用真实的头像定制功能。

#### 验收标准

1. 上传图片调用 `POST /api/upload`，获取图片 URL
2. 创建定制任务调用 `POST /api/avatars`
3. 定制额度从 `GET /api/me` 的 `avatarQuota` 获取，不再硬编码 `{ remaining: 2, total: 2 }`
4. 示例图片 `EXAMPLE_IMAGES` 如果是产品固定示意图可保留
5. 宠物信息从路由参数传入或调用 API 获取，删除回退文案 `毛毛 英短蓝猫 3岁半`

---

### 需求 12 - 数据统计页接入真实数据

**用户故事：** 作为用户，我想要看到宠物的真实行为统计数据。

#### 验收标准

1. 后端新增 `GET /api/stats/:petId` 接口，返回按周/日聚合的行为统计数据
2. 返回数据结构包含：周活跃柱状图数据、日活跃柱状图数据、行为类型饼图数据、日统计摘要
3. 前端调用该接口获取数据，替换硬编码的 `weekBars`、`dayBars`、`pieItems`、`dayStats`
4. 日期显示为真实日期，不再硬编码 `2026年3月3日`

---

### 需求 13 - 消息页接入真实数据

**用户故事：** 作为用户，我想要收到真实的系统消息和授权通知。

#### 验收标准

1. 调用 `GET /api/messages` 获取消息列表
2. 调用 `GET /api/messages/unread-count` 获取未读数
3. 标记已读调用 `PUT /api/messages/:id/read` 或 `PUT /api/messages/read-all`
4. 通过 WebSocket 订阅实时消息推送

---

### 需求 14 - WiFi 配置页接入真实数据

**用户故事：** 作为用户，我想要配置项圈连接的 WiFi 时看到当前的网络信息。

#### 验收标准

1. 调用小程序原生 WiFi API（`Taro.getConnectedWifi`）获取当前连接的 WiFi 名称
2. 删除硬编码的 WiFi 名 `TFTINGHUATONGFANG-WIFI`
3. 如果获取 WiFi 信息失败（用户未授权等），显示输入框让用户手动输入

---

### 需求 15 - 设置页确认

**用户故事：** 作为用户，我想要在设置页管理账号和应用设置。

#### 验收标准

1. 确认设置页当前是否有 mock 数据依赖，如有则替换为真实 API 调用
2. 登出操作清除本地 token 并断开 WebSocket
