# 实施计划

- [x] 1. 修复主页导航跳转（#40 + #41）
  - 给 `top-card` 添加 onClick：有宠物且 currentPet 非 null → pet-info 编辑；无宠物 → pet-info 创建
  - 给 Swiper 中 `pet-slide` 添加 onClick：pet 非 null → pet-avatar 定制
  - 所有跳转加空值保护
  - _需求：需求 1_

- [x] 2. 修复设置页 toast 文案（#46）
  - 将 `showComingSoon` 的 toast 文案改为"即将上线，敬请期待"
  - _需求：需求 2_

- [x] 3. 统一消息中心返回按钮（#45）
  - 导入 PageBack 组件，替换自定义 `←` 返回按钮
  - 调整 header 布局：移除 back 按钮位置，保留标题和"全部已读"
  - _需求：需求 3_

- [x] 4. 后端 stats 路由修复与扩展（#42 + #44）
  - 统一时间锚点：在路由开头计算 `today`，所有查询复用
  - 整个路由包裹 try-catch
  - 新增 `getLastNDateBuckets(today, n)` 通用函数
  - 新增 `monthBars`（30 天柱状图）和 `monthPieItems`（30 天活动分布）
  - _需求：需求 4、需求 5_

- [x] 5. 前端数据中心月视图 + 错误兜底（#42 + #44）
  - Mode 类型扩展为 `"week" | "day" | "month"`
  - 移除月 tab 的 onClick 守卫
  - StatsResponse 中 monthBars/monthPieItems 为可选字段
  - 月视图用 ScrollView scrollX 水平滚动，固定柱宽，稀疏标签
  - routePetId 无效时回退到第一个宠物或显示"暂无宠物数据"
  - _需求：需求 4、需求 5_

- [x] 6. 修复上传链路错误处理（#47）
  - `utils/request.ts`：uploadFile 的 JSON.parse 加 try-catch 安全解析
  - `routes/upload.ts`：区分 ensureBucket 和 PutObjectCommand 的错误信息
  - `pages/pet-avatar/index.tsx`：添加文件大小预校验，分别捕获 upload 和 avatars 请求错误
  - _需求：需求 6_

- [x] 7. 后端测试基建补充 + stats API 测试
  - `helpers.ts`：添加 statsRoute 挂载
  - `mock-db.ts`：添加 execute() 方法
  - 新增 `stats.test.ts`：正常请求、无权限、无数据、无效 petId
  - _需求：需求 7_

- [x] 8. 前端 E2E 测试扩展
  - `helpers.ts`：新增 toast mock、getPageData
  - `full-flow.test.ts`：新增主页导航、设置页交互、消息中心返回、数据中心月视图测试
  - _需求：需求 7_
