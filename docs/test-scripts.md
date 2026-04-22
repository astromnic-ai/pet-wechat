# YEHEY 宠物"在场" 全功能测试脚本

> **账户类型**：个人账户（非企业认证，部分能力受限）
>
> **后端地址**：`http://localhost:9527`（代码中硬编码，真机测试需修改）
>
> **开发环境限制**：微信登录使用 mock openid（所有用户映射到同一账户），手机号登录验证码固定为 `123456`

---

## 一、微信开发者工具测试

### 环境准备

1. 安装微信开发者工具（稳定版）
2. 导入项目：选择 `packages/app/dist` 目录，AppID 使用 `touristappid`（测试号）
3. 启动数据库：`docker compose up -d`（PostgreSQL）
4. 执行迁移：`pnpm db:migrate`
5. 启动后端：`pnpm dev:server`（确认端口 9527 可用）
6. 启动前端编译：`pnpm dev:app`
7. 在开发者工具中勾选「不校验合法域名」

### 测试用例

#### 1. 用户登录

> 当前 MVP 只有微信登录一种方式。"本机号码快捷登录"按钮实际复用微信登录流程（TODO：尚未对接真实手机号验证）。

| 编号 | 步骤 | 预期结果 |
|------|------|----------|
| L-01 | 打开小程序 | 进入首页 `/pages/index/index`，未登录时显示登录按钮 |
| L-02 | 不勾选用户协议，点击微信登录 | 提示需先同意用户协议和隐私政策 |
| L-03 | 勾选用户协议，点击「微信账号登录」 | 调用 `wx.login` 获取 code → `POST /api/auth/wechat` → 登录成功，跳转首页显示宠物内容 |
| L-04 | 点击「本机号码快捷登录」 | 与微信登录行为一致（当前复用同一逻辑） |
| L-05 | 登录后刷新编译 | Token 持久化在 storage 中，自动保持登录状态 |
| L-06 | 未登录时访问「我的」Tab | 显示未登录状态，有登录按钮 |

#### 2. 首页落点与设备入口

> 当前登录后直接进入首页，不再经过独立引导页。

| 编号 | 步骤 | 预期结果 |
|------|------|----------|
| G-01 | 登录成功进入首页 | 显示宠物主视图区、宠物活动模式卡片、设备管理卡片 |
| G-02 | 首页空态点击设备管理加号 | 跳转统一设备搜索页 `/pages/collar-bind/index` |
| G-03 | 首页有宠物时点击设备管理箭头 | 跳转设备管理页 `/pages/devices/index` |

#### 3. 宠物管理

| 编号 | 步骤 | 预期结果 |
|------|------|----------|
| P-01 | 首页无宠物时 | 显示空状态，提供「绑定项圈」和「先添加宠物」按钮 |
| P-02 | 点击添加宠物，进入 `/pages/pet-info/index` | 显示表单：物种选择（猫🐱/狗🐶，默认猫）、名称、品种、性别、生日、体重 |
| P-03 | 不填名称直接提交 | 表单校验失败，提示「请输入宠物名字」 |
| P-04 | 切换物种选择（猫↔狗） | 品种输入框 placeholder 随物种变化 |
| P-05 | 填写完整信息提交 | `POST /api/pets` 成功，显示「添加成功」，跳转到头像上传页 |
| P-06 | 从项圈流程进入（带 `collarId` 参数） | 创建宠物后自动将项圈绑定到该宠物（`PUT /api/devices/collars/:collarId`），然后跳转头像上传 |
| P-07 | 编辑已有宠物（进入带 `id` 参数的 pet-info 页） | 加载现有数据，修改后 `PUT /api/pets/:id` 更新成功 |
| P-08 | 首页有多只宠物 | Swiper 滑动切换宠物，显示对应宠物信息和设备状态 |

#### 4. 宠物头像/形象

> 头像处理流水线：上传后状态为 `pending`，需管理员通过 admin API 上传动作帧后变为 `done`。当前无自动处理。

| 编号 | 步骤 | 预期结果 |
|------|------|----------|
| A-01 | 进入 `/pages/pet-avatar/index` | 显示上传区域（最多 9 张）和配额提示「新用户免费定制2次」 |
| A-02 | 从相册选择照片上传 | `POST /api/avatars` 成功，配额扣减，跳转到进度页 |
| A-03 | 进入 `/pages/avatar-progress/index` | 显示圆形进度环和状态文案「等待处理中」（`pending` 状态） |
| A-04 | 进度页等待（每 5 秒轮询状态） | 持续显示处理状态，轮询 `GET /api/avatars/:id` |
| A-05 | **前置操作**：通过 admin API `POST /api/avatars/:id/actions` 上传动作帧 | 状态变为 `done`，进度页显示完成（🎉），提供「立即配置桌面端」和「后续进入主页」按钮 |
| A-06 | 点击「不满意？重新定制」 | 返回头像上传页重新上传 |

> **注意**：前端配额显示为硬编码（2/2），未从后端读取真实配额。配额扣减由后端 `POST /api/avatars` 控制，当配额不足时后端返回错误。

#### 5. 统一设备连接流程

> 当前桌面端与项圈共用同一条蓝牙搜索与 WiFi 配置链路，前端按蓝牙名称区分设备类型。

| 编号 | 步骤 | 预期结果 |
|------|------|----------|
| C-01 | 进入 `/pages/collar-bind/index` | 显示第一步引导「为项圈充电」 |
| C-02 | 首次进入时触发蓝牙搜索 | 优先展示名称包含 `YEHEY` / `Collar` / `Table` / `Desktop` 的设备 |
| C-03 | 点击连接设备 | 调用蓝牙连接能力，成功后跳转 WiFi 配置页 `/pages/wifi-config/index` |
| C-04 | WiFi 配置页：输入 SSID 和密码，点击「连接网络」 | 创建或复用设备记录，跳转绑定宠物页 `/pages/bind-pet/index` |
| C-05 | 绑定宠物页选择已有宠物 | 项圈走 `PUT /api/devices/collars/:id`；桌面端走 `POST /api/devices/desktops/:id/bind` |
| C-06 | 绑定宠物页点击「创建新宠物」 | 跳转 `/pages/pet-info/index`，保存后回到绑定页并可继续确认绑定 |
| C-07 | 绑定成功返回首页 | 首页设备管理卡片展示最新绑定结果 |

#### 7. 宠物分享

> 分享码通过弹窗显示，当前无微信分享卡片功能。使用分享码要求接收方已有至少一个桌面设备。

| 编号 | 步骤 | 预期结果 |
|------|------|----------|
| S-01 | 设备 Tab 点击宠物切换区域的「分享」按钮 | `POST /api/devices/share-links`（shareType: pet），弹窗显示分享码 |
| S-02 | **API 测试**：自己使用自己的分享码 | `POST /api/devices/share-links/:code/use` 返回错误 |
| S-03 | **API 测试**：用另一用户使用分享码（该用户已有桌面设备） | 创建 `authorized` 类型绑定成功 |
| S-04 | **API 测试**：用户无桌面设备时使用分享码 | 返回错误「You have no desktop devices to bind」 |
| S-05 | **API 测试**：使用已过期/已禁用的分享码 | 返回错误提示 |
| S-06 | **API 测试**：超过最大使用次数 | 返回错误提示 |

> 注意：S-02~S-06 需通过 API 工具（curl/Postman）测试，因为 UI 无使用分享码的入口。多用户测试需通过手机号登录 API 创建不同用户（微信登录在开发环境返回固定 openid）。

#### 8. 宠物行为记录

> 行为数据由项圈设备上报，需通过 API 模拟。

| 编号 | 步骤 | 预期结果 |
|------|------|----------|
| B-01 | **API 测试**：`POST /api/behaviors` 上报行为 | 记录行为（需提供 petId、collarDeviceId、actionType） |
| B-02 | 上报后查看首页 | `GET /api/behaviors/:petId` 加载行为数据 |
| B-03 | **API 测试**：传入 `?limit=5` | 只返回最近 5 条记录 |

#### 9. 消息通知

| 编号 | 步骤 | 预期结果 |
|------|------|----------|
| M-01 | 点击消息 Tab | `GET /api/messages` + `GET /api/messages/unread-count`，显示消息列表 |
| M-02 | 切换消息类型标签：全部 / 授权通知 / 系统消息 | 对应 `?type=` 过滤参数，列表更新 |
| M-03 | 点击一条未读消息 | `PUT /api/messages/:id/read`，消息标记为已读 |
| M-04 | 点击「全部已读」 | `PUT /api/messages/read-all`，所有消息标记已读 |
| M-05 | 无消息时 | 显示空状态「暂无消息」 |
| M-06 | 消息图标区分类型 | 授权通过（✓）/ 授权拒绝（✗）/ 系统消息（⚙） |

#### 10. 用户资料与设置

| 编号 | 步骤 | 预期结果 |
|------|------|----------|
| U-01 | 点击「我的」Tab | `GET /api/me`，显示头像（首字母兜底）、昵称（默认「微信用户」）、用户 ID 前 8 位 |
| U-02 | 查看账号信息区 | 显示手机号（未绑定显示「未绑定」）、邮箱（未绑定）、注册日期 |
| U-03 | 查看宠物服务区 | 列出已有宠物，显示物种、品种、性别符号 |
| U-04 | 进入设置页 `/pages/settings/index` | 显示设置菜单项（通知/隐私/主题/语言等，当前仅 UI 展示无实际功能） |
| U-05 | 设置页「我的宠物」区域 | 显示已有宠物列表和「添加宠物」入口 |
| U-06 | 点击退出登录（设置页或个人资料页） | 清除 token 和 userInfo，重新进入登录页 |

#### 11. Tab 导航

| 编号 | 步骤 | 预期结果 |
|------|------|----------|
| T-01 | 点击首页 Tab | 跳转 `/pages/index/index` |
| T-02 | 点击设备 Tab | 跳转 `/pages/devices/index` |
| T-03 | 点击消息 Tab | 跳转 `/pages/messages/index` |
| T-04 | 点击我的 Tab | 跳转 `/pages/profile/index` |
| T-05 | Tab 间来回切换 | 每次切回时触发 `useDidShow` 重新加载数据（这是预期行为，非 bug） |

#### 12. 首页详细交互

| 编号 | 步骤 | 预期结果 |
|------|------|----------|
| H-01 | 已登录且有宠物 | 顶栏显示宠物头像和名称，通知图标；中间显示活力值条和宠物照片区域 |
| H-02 | 宠物语音气泡 | 显示固定文案（当前硬编码） |
| H-03 | 设备卡片区 | 显示项圈和桌面设备状态 |
| H-04 | 点击「管理设备」 | 弹出设备管理浮层 |
| H-05 | 点击通知图标 | 跳转到消息页 |

---

## 二、真机测试（手机扫码预览）

### 环境准备

1. 手机安装最新版微信
2. **修改后端地址**：将 `packages/app/src/utils/request.ts` 中的 `BASE_URL` 改为可从手机访问的地址（如 `http://192.168.x.x:9527`），或使用内网穿透工具（ngrok/frpc）并修改为穿透地址
3. 重新编译前端：`pnpm dev:app`
4. 开发者工具中点击「预览」生成二维码（或使用「真机调试」）
5. 确保后端已启动且手机可访问

### 个人账户真机限制说明

| 受限能力 | 说明 | 影响 |
|----------|------|------|
| `wx.getPhoneNumber` | 个人账户不支持 | 当前 MVP 未使用此 API，无影响 |
| 微信支付 | 个人账户不支持 | MVP 暂无支付功能，无影响 |
| 订阅消息 | 个人账户模板有限 | 仅测试应用内消息系统 |
| 分享卡片 | 个人账户可转发但样式受限 | 当前分享仅用分享码弹窗，无影响 |

### 测试用例

#### 1. 项圈绑定（模拟流程 - 真机）

> 当前蓝牙为 mock 实现，真机上同样走模拟流程，不触发真实 BLE API。

| 编号 | 步骤 | 预期结果 |
|------|------|----------|
| BT-01 | 进入项圈绑定页 | 显示引导步骤，模拟搜索 2 秒后发现设备 |
| BT-02 | 点击连接 | 模拟连接 1.5 秒后成功，跳转 WiFi 配置 |
| BT-03 | 完成 WiFi 配置 | 创建设备记录，跳转宠物信息页 |
| BT-04 | 完整走通：项圈绑定 → WiFi → 添加宠物 → 头像上传 | 整个新手引导流程顺畅无中断 |

#### 2. 登录流程（真机）

| 编号 | 步骤 | 预期结果 |
|------|------|----------|
| RL-01 | 打开小程序 | 显示首页，未登录时有登录入口 |
| RL-02 | 勾选协议后点击微信登录 | 真实 `wx.login` 调用，获取 openid，登录成功 |
| RL-03 | 杀掉小程序后重新打开 | Token 有效（30 天），自动保持登录 |
| RL-04 | 清除小程序数据后打开 | Token 被清除，需重新登录 |

#### 3. 页面交互与手势

| 编号 | 步骤 | 预期结果 |
|------|------|----------|
| UI-01 | 列表滚动（消息列表） | 滚动流畅，无卡顿 |
| UI-02 | 表单输入（键盘弹起） | 页面不被遮挡，输入框可见 |
| UI-03 | 返回手势/物理返回键 | 正确返回上一页，不跳转异常页面 |
| UI-04 | 多只宠物时首页 Swiper 滑动 | 切换流畅，对应设备信息同步更新 |

#### 4. 网络异常处理

| 编号 | 步骤 | 预期结果 |
|------|------|----------|
| N-01 | 断开网络后操作（关闭 WiFi/流量） | 请求失败有提示，不白屏不 crash |
| N-02 | 弱网环境 | 请求有 loading 状态 |
| N-03 | 网络恢复后切换 Tab | 重新加载数据正常 |
| N-04 | 后端未启动时操作 | 显示错误提示 |
| N-05 | Token 过期（401 响应） | 自动清除 token，引导重新登录 |

#### 5. 权限管理

| 编号 | 步骤 | 预期结果 |
|------|------|----------|
| PM-01 | 上传宠物头像时选择相册 | 首次弹出相册授权，允许后可选择图片 |
| PM-02 | 上传宠物头像时选择拍照 | 首次弹出相机授权，允许后可拍照 |
| PM-03 | 拒绝相册/相机权限后再次上传 | 引导用户前往系统设置开启权限 |

#### 6. 性能与稳定性

| 编号 | 步骤 | 预期结果 |
|------|------|----------|
| PF-01 | 冷启动时间 | 扫码到首页可交互 < 3 秒 |
| PF-02 | Tab 切换响应 | 切换 < 300ms，页面跳转 < 500ms |
| PF-03 | 长时间挂后台再恢复 | 页面正常显示，Token 未过期时自动登录 |
| PF-04 | 快速反复切换 Tab | 无崩溃 |
| PF-05 | 多次上传头像图片 | 无内存泄漏，不 crash |
| PF-06 | 头像进度页长时间轮询 | 每 5 秒轮询不导致性能下降 |

#### 7. 多机型兼容性

| 编号 | 测试项 | 关注点 |
|------|--------|--------|
| CP-01 | iPhone SE（小屏） | 布局不溢出，文字不截断 |
| CP-02 | iPhone 15 Pro Max（大屏） | 布局适配，无过大留白 |
| CP-03 | Android 主流机型 | 华为/小米/OPPO 各一台，微信版本最新 |
| CP-04 | 刘海屏/挖孔屏安全区 | 自定义导航栏适配顶部安全区 |
| CP-05 | 底部安全区（iPhone X 及以上） | Tab 栏不被遮挡 |

---

## 三、后端 API 独立测试

> 部分功能（分享码使用、行为上报、头像处理推进）无前端 UI 入口，需通过 API 工具测试。
> 使用 curl / Postman / Hoppscotch 均可。

```bash
# 健康检查
curl http://localhost:9527/health

# 手机号登录（创建独立用户，用于多用户测试场景）
curl -X POST http://localhost:9527/api/auth/phone \
  -H "Content-Type: application/json" \
  -d '{"phone": "13800138000", "code": "123456"}'
# 返回 { token, user }

# 微信登录（开发环境固定 openid，所有调用映射到同一用户）
curl -X POST http://localhost:9527/api/auth/wechat \
  -H "Content-Type: application/json" \
  -d '{"code": "any-string"}'

# 获取用户信息
curl http://localhost:9527/api/me \
  -H "Authorization: Bearer <TOKEN>"

# 创建宠物
curl -X POST http://localhost:9527/api/pets \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name": "小橘", "species": "cat", "gender": "male"}'

# 上报宠物行为（模拟项圈）
curl -X POST http://localhost:9527/api/behaviors \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"petId": "<PET_ID>", "collarDeviceId": "<COLLAR_ID>", "actionType": "jumping"}'

# 推进头像状态（admin 操作）
curl -X POST http://localhost:9527/api/avatars/<AVATAR_ID>/actions \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"actionType": "idle", "imageUrl": "https://example.com/idle.png"}'

# 创建分享码
curl -X POST http://localhost:9527/api/devices/share-links \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"shareType": "pet", "targetId": "<PET_ID>"}'

# 使用分享码（用另一用户的 TOKEN）
curl -X POST http://localhost:9527/api/devices/share-links/<CODE>/use \
  -H "Authorization: Bearer <OTHER_USER_TOKEN>"
```

---

## 四、测试数据管理

```bash
# 通过 Drizzle Studio 查看和管理数据（推荐）
pnpm db:studio

# 完全重置数据库（删除所有数据后重新迁移）
# 方法 1：删除 Docker 数据卷重建
docker compose down -v && docker compose up -d && pnpm db:migrate

# 方法 2：在 Drizzle Studio 中手动清空表
```

> **注意**：`pnpm db:migrate` 仅执行增量迁移，不会清除已有数据。如需干净环境，需删除数据卷重建。
