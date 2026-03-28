# 实施计划

- [x] 1. 环境切换机制
  - 修改 `packages/app/config/index.ts`：在 `defineConstants` 中注入 `API_BASE_URL` 和 `ENABLE_DEV_LOGIN`
  - 修改 `packages/app/src/utils/request.ts`：使用 `declare const API_BASE_URL` 替代硬编码 `BASE_URL`
  - 修改 `packages/app/src/utils/ws.ts`：同理使用 `API_BASE_URL`
  - 修改根 `package.json`：新增 `dev:app:remote` script
  - _需求：需求 1_

- [x] 2. 删除 Mock 系统
  - 删除 `packages/app/src/mock/` 目录（data.ts、handler.ts、mode.ts）
  - 删除 `packages/app/src/components/MockToggle/` 目录
  - 清理 `app.ts`：删除 `ensureMockLoginState()` 调用和 import
  - 清理 `utils/request.ts`：删除 `isMockMode`、`handleMockRequest` 相关导入和分支
  - 清理 `utils/ws.ts`：删除 `isMockMode` 检查
  - 清理 `pages/login/index.tsx`：删除 `handleMockLogin` 函数和相关导入
  - 确保编译无报错
  - _需求：需求 2_

- [x] 3. 后端：开发调试登录接口
  - 在 `packages/server/src/routes/auth.ts` 新增 `POST /dev-login`
  - 通过 `ENABLE_DEV_LOGIN` 环境变量控制路由注册
  - 接受 `{ phone }` 参数，upsert 用户，返回 `{ token, user }`
  - 在 docker-compose.yml 开发环境中设置 `ENABLE_DEV_LOGIN=true`
  - _需求：需求 3_

- [x] 4. 后端：设备扫码注册接口
  - 在 `packages/server/src/routes/devices.ts` 新增 `POST /collars/register` 和 `POST /desktops/register`
  - 实现 MAC 归一化函数（去分隔符、转大写）
  - 实现逻辑：不存在→创建+绑定，无主→claim，已属当前用户→幂等返回，属于他人→409
  - _需求：需求 7、需求 8_

- [x] 5. 后端：行为统计聚合接口
  - 新建 `packages/server/src/routes/stats.ts`
  - 实现 `GET /:petId`，接受 `?tz=` 参数
  - 返回 weekBars（7天补零）、dayBars（24小时补零）、pieItems、daySummary
  - 指标为事件计数
  - 在 `packages/server/src/index.ts` 中挂载 `/api/stats` 路由
  - _需求：需求 12_

- [x] 6. 后端：扩展桌面端接口返回绑定信息
  - 修改 `GET /api/devices/desktops` 返回值，JOIN `desktop_pet_bindings` 返回每个桌面端的 `bindings` 数组
  - _需求：需求 5_

- [x] 7. 前端：WebSocket 连接生命周期
  - `app.ts`：`useLaunch` 中检查 token 存在则 `connectWs()`
  - 登录成功后调用 `connectWs()`
  - 登出时调用 `disconnectWs()`
  - _需求：需求 4、需求 13_

- [x] 8. 前端：登录页接入真实 API
  - 微信登录：`Taro.login()` → `POST /api/auth/wechat` → 保存 token
  - 开发登录（`ENABLE_DEV_LOGIN`）：手机号 → `POST /api/auth/dev-login`
  - 登录成功后 `connectWs()`
  - _需求：需求 3_

- [x] 9. 前端：首页接入真实数据
  - `useEffect` 调用 `GET /api/pets` 获取宠物列表
  - 调用 `GET /api/messages/unread-count` 获取未读消息数
  - 动态气泡文案（无宠物→引导添加，有宠物→行为摘要）
  - 订阅 `behavior:new` 实时更新
  - _需求：需求 4_

- [x] 10. 前端：设备管理页接入真实数据
  - 删除 `PET_TABS` 硬编码
  - 调用 `GET /api/pets` 获取宠物（合并 pets + authorizedPets 作为 Tab）
  - 调用 `GET /api/devices/collars` 和 `GET /api/devices/desktops`（含 bindings）
  - 按 petId 关联设备到宠物 Tab
  - _需求：需求 5_

- [x] 11. 前端：宠物信息页接入真实 API
  - 创建/编辑使用 API 返回值
  - 删除 `mock-user`、`activityScore: 82`、`666777888` 硬编码
  - _需求：需求 6_

- [x] 12. 前端：项圈绑定页 + WiFi 配置页改造
  - 删除 `FALLBACK_COLLAR`
  - 扫码流程：`Taro.scanCode()` → MAC 归一化 → `POST /api/devices/collars/register`
  - 错误处理：取消/权限拒绝/非法二维码 → Toast 提示
  - WiFi 配置页：`Taro.startWifi()` + `Taro.getConnectedWifi()`，删除硬编码 WiFi 名和旧 `/claim` 调用
  - _需求：需求 7、需求 14_

- [x] 13. 前端：桌面端绑定页 + 配对页改造
  - 删除 `FALLBACK_DESKTOP`
  - 扫码 → `POST /api/devices/desktops/register`
  - 配对页：关联宠物 `POST /api/devices/desktops/:id/bind`
  - _需求：需求 8_

- [x] 14. 前端：邀请页接入真实数据
  - 删除 `FALLBACK_PET`
  - `GET /api/invite/:code` 获取邀请详情
  - `POST /api/devices/invite/:code/accept` 接受邀请
  - 年龄计算兜底：birthday 为空/无效 → "年龄未知"
  - _需求：需求 9_

- [x] 15. 前端：个人中心页接入真实数据
  - `GET /api/me` 获取用户信息
  - `GET /api/pets` 获取服务宠物
  - 删除硬编码用户数据
  - _需求：需求 10_

- [x] 16. 前端：宠物头像页 + 头像进度页接入真实数据
  - 上传 `POST /api/upload`，创建定制 `POST /api/avatars`
  - 额度从 `GET /api/me` 获取
  - 宠物信息从 `GET /api/pets/:id` 获取
  - 进度页轮询 `GET /api/avatars/:id`，订阅 `avatar:done`
  - _需求：需求 11_

- [x] 17. 前端：数据统计页接入真实数据
  - `GET /api/stats/:petId?tz=Asia/Shanghai`
  - 替换所有硬编码统计数据
  - _需求：需求 12_

- [x] 18. 前端：消息页接入真实数据
  - `GET /api/messages`、`GET /api/messages/unread-count`
  - `PUT /api/messages/:id/read`、`PUT /api/messages/read-all`
  - `onShow` 时刷新列表
  - _需求：需求 13_

- [x] 19. 前端：设置页接入真实数据
  - `GET /api/pets` 获取宠物缩略图
  - 登出：`clearToken()` + `disconnectWs()`
  - _需求：需求 15_
