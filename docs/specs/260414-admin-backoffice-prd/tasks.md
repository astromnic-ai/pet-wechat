# 实施计划

- [x] 1. 共享常量和类型定义
  - 新建 `packages/shared/src/constants.ts`：ACTION_TYPES 常量、ACTION_LABELS 映射
  - 修改 `packages/shared/src/types.ts`：新增 Schedule、ScheduleBlock 类型；AvatarStatus 增加 'approved'、'rejected'
  - 修改 `packages/shared/src/index.ts`：导出 constants
  - _需求：需求 2、3、4_

- [x] 2. 数据库 Schema 变更
  - 修改 `packages/server/src/db/schema.ts`：新增 scheduleEffectiveTypeEnum、behaviorSchedules、behaviorScheduleBlocks 表；petAvatars 增加 rejectReason、reviewedAt 字段；avatarStatusEnum 增加 approved、rejected
  - 运行 `pnpm db:generate` 生成迁移文件
  - _需求：需求 2、3、4_

- [x] 3. Admin 路由拆分重构
  - 将现有 `src/routes/admin.ts` 拆分为 `src/routes/admin/` 目录
  - 新建 `admin/index.ts` 作为路由注册入口
  - 迁移现有 users、pets、collars、desktops、behaviors、stats 到各自子文件
  - 修改 `src/index.ts` 注册新路由结构
  - 确保所有现有 API 行为不变
  - _需求：设计决策 D4_

- [x] 4. 行为日程后端 API
  - 新建 `src/routes/admin/schedules.ts`：CRUD + activate 接口
  - 实现 blocks 校验逻辑（start < end、无重叠、action_type 合法）
  - 激活逻辑：事务内先 deactivate 同 species+type 的旧日程
  - 新建 `src/routes/schedules.ts`：公开设备轮询接口 `/api/schedules/current`
  - 注册到 `src/index.ts`
  - _需求：需求 2_

- [x] 5. 图像审核 + 定制后端 API
  - 新建 `src/routes/admin/avatars.ts`：列表、详情、approve、reject、actions CRUD、sync 接口
  - 实现状态流转校验和幂等逻辑
  - approve/reject 创建系统消息通知用户
  - sync 将 status 置为 done + 创建消息 + WebSocket 通知
  - _需求：需求 3、4_

- [x] 6. 增强统计 + 数据看板后端 API
  - 新建 `src/routes/admin/stats.ts`：迁移原有 stats + 新增 /stats/enhanced
  - 新建 `src/routes/admin/analytics.ts`：数据看板 P1 接口
  - enhanced 统计包含：用户维度、设备分布、活跃度、avatar 审核概览
  - analytics 包含：在线设备数、平均互动数、排行榜、7 天趋势
  - _需求：需求 1、7_

- [x] 7. 设备增强查询 + 用户增强后端 API
  - 修改 `src/routes/admin/devices.ts`：collars/desktops 增加筛选参数（status、bound、species、sort、order）
  - 新建用户增强接口：enhanced 列表（含关联数量）、detail（含关联宠物/设备）
  - _需求：需求 5、8_

- [x] 8. 前端导航和路由重构
  - 修改 `src/App.tsx`：更新侧边栏菜单结构（运营管理 + 开发工具折叠组）、新增路由
  - 新增页面组件占位文件
  - _需求：所有_

- [x] 9. 前端 API Client 扩展
  - 修改 `src/api/client.ts`：新增所有新 API 调用方法（schedules、avatars、enhanced stats、analytics、enhanced users/devices）
  - 保持现有 getStats 不变
  - _需求：所有_

- [x] 10. 系统概览页面增强
  - 重写 `src/pages/Dashboard.tsx`：KPI 卡片、活跃设备数、今日互动、设备分布、活跃度分布、avatar 概览
  - P2 占位：系统健康状态
  - _需求：需求 1_

- [x] 11. 行为日程页面
  - 新建 `src/pages/Schedules.tsx`：Species Tab + 日程列表 + 时间轴编辑器 + 保存/激活
  - 时间轴：div+CSS 实现，Block Modal 选择动作和时间范围
  - _需求：需求 2_

- [x] 12. 图像审核页面
  - 新建 `src/pages/ImageReview.tsx`：统计卡 + 状态 Tab + 卡片网格 + 审核操作
  - _需求：需求 3_

- [x] 13. 定制中心页面
  - 新建 `src/pages/Customization.tsx`：任务列表 + 工作区 + 14 动作网格 + 上传 + 同步
  - _需求：需求 4_

- [x] 14. 设备管理增强页面
  - 新建 `src/pages/Devices.tsx`：Tab（项圈/桌面）+ 筛选栏 + Table + 详情 Drawer
  - _需求：需求 5_

- [x] 15. 数据看板 + 用户管理增强页面（P1）
  - 新建 `src/pages/Analytics.tsx`：统计卡 + 排行榜 + 趋势图
  - 修改 `src/pages/Users.tsx`：增加宠物数/设备数列、详情 Drawer
  - P2 占位：会员信息区域
  - _需求：需求 7、8、10_
