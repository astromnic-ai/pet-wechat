# 实施计划

- [ ] 1. Schema 基建与共享契约落地
  - **涉及文件**: `packages/server/src/db/schema.ts`, `packages/server/drizzle/*`, `packages/server/drizzle/meta/*`, `packages/shared/src/types.ts`, `packages/server/src/validators/user-end.ts`, `packages/server/src/index.ts`, `packages/app/src/app.config.ts`
  - **做什么**: 一次性补齐新增表、枚举、设备增强字段、共享 TS 类型与 zod 校验基础设施，并把新路由与前端页面入口挂好。
  - **完成标准**: `drizzle-kit generate` 能产出迁移；shared 类型可被 server/app 同时消费；新路由和新页面已在入口层可用。
  - **关联决策**: D-03, D-05, D-06, D-07, D-10
  - **关联需求**: R-02, R-03, R-04, R-05, R-06, R-07, R-08

- [ ] 2. 用户资料、系统设置与账号安全接入
  - **涉及文件**: `packages/server/src/routes/me.ts`, `packages/server/src/routes/settings.ts`, `packages/server/src/routes/account.ts`, `packages/shared/src/types.ts`, `packages/app/src/pages/profile/index.tsx`, `packages/app/src/pages/settings/index.tsx`, `packages/app/src/pages/settings/system.tsx`, `packages/app/src/pages/settings/theme.tsx`, `packages/app/src/pages/settings/bind-phone.tsx`, `packages/app/src/pages/settings/bind-email.tsx`
  - **做什么**: 让用户资料返回真实邮箱，系统设置通过接口读写并保留本地降级缓存，账号安全页移除“修改密码”并接入手机/邮箱验证码绑定流程。
  - **完成标准**: `/api/me` 返回 `email`；`/api/settings` 支持默认值和部分更新；手机/邮箱绑定 happy path 可走通；前端无硬编码邮箱和无响应入口。
  - **关联决策**: D-01, D-03, D-09, D-10
  - **关联需求**: R-02, R-03, R-07

- [ ] 3. 设备聚合、释放与固件能力接入
  - **涉及文件**: `packages/server/src/routes/devices.ts`, `packages/server/src/routes/settings.ts`, `packages/shared/src/types.ts`, `packages/app/src/pages/devices/index.tsx`, `packages/app/src/pages/settings/index.tsx`, `packages/app/src/utils/deviceDisplay.ts`
  - **做什么**: 为设备域补统一列表、claim 状态、真实累计时长、长期未在线标记、固件状态查询与升级触发，并让设置页和设备页展示真实版本与按钮态。
  - **完成标准**: `/api/devices` 返回增强字段；`DELETE /api/devices/:type/:id` 会释放设备；`/api/devices/firmware/status` 和升级接口可驱动前端显示。
  - **关联决策**: D-05, D-06, D-07, D-10
  - **关联需求**: R-04, R-05

- [ ] 4. 互动事件聚合与宠物记录页接入
  - **涉及文件**: `packages/server/src/routes/pets.ts`, `packages/server/src/db/schema.ts`, `packages/shared/src/types.ts`, `packages/app/src/pages/data/index.tsx`
  - **做什么**: 落 interaction 事件聚合查询，按固定 buckets 返回统计结果，并让宠物记录页基于真实接口渲染总次数、今日次数和趋势图。
  - **完成标准**: `/api/pets/:petId/interaction-stats` 支持 day/week/month；owner/authorized 可读，越权返回 403；前端不再显示“待接入”与硬编码 0。
  - **关联决策**: D-02, D-08, D-10
  - **关联需求**: R-01, R-08

- [ ] 5. Markdown 内容接口与四个内容页接入
  - **涉及文件**: `packages/server/src/routes/content.ts`, `packages/server/src/utils/content.ts`, `packages/server/content/help.md`, `packages/server/content/about.md`, `packages/server/content/privacy.md`, `packages/server/content/user-agreement.md`, `packages/shared/src/types.ts`, `packages/app/src/pages/settings/help.tsx`, `packages/app/src/pages/settings/about.tsx`, `packages/app/src/pages/settings/privacy.tsx`, `packages/app/src/pages/settings/user-agreement.tsx`, `packages/app/src/utils/markdown.ts`
  - **做什么**: 用仓库 Markdown 文件驱动 help/about/privacy/user-agreement 四类内容，并让小程序页面通过统一 renderer 展示正文。
  - **完成标准**: `/api/content/:slug` 能返回标题、正文、版本与更新时间；四个页面都通过接口展示内容；非法 slug 返回 404。
  - **关联决策**: D-04, D-10
  - **关联需求**: R-06

- [ ] 6. 核心测试、汇总文档与差异复查
  - **涉及文件**: `packages/server/src/__tests__/me.test.ts`, `packages/server/src/__tests__/devices.test.ts`, `packages/server/src/__tests__/pets.test.ts`, `packages/server/src/__tests__/settings.test.ts`, `packages/server/src/__tests__/content.test.ts`, `docs/specs/260414-user-end-apis/summary.md`
  - **做什么**: 为新增核心接口补 happy path 与 400/403/404 测试，完成最终构建验证，生成汇总文档并基于 git diff 做一次范围与重复代码复查。
  - **完成标准**: server build 与测试通过；summary.md 列清接口、文件和 commit；复查后无明显重复实现、无遗漏 requirements 条目。
  - **关联决策**: D-10, D-11
  - **关联需求**: R-01, R-02, R-03, R-04, R-06, R-08
