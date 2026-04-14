# 用户端 API 补齐总结

## 新增/修改文件

- 文档
  - `docs/specs/260414-user-end-apis/design.md`
  - `docs/specs/260414-user-end-apis/tasks.md`
  - `docs/specs/260414-user-end-apis/summary.md`
- 数据库与共享契约
  - `packages/server/drizzle/0004_massive_taskmaster.sql`
  - `packages/server/drizzle/meta/0004_snapshot.json`
  - `packages/server/drizzle/meta/_journal.json`
  - `packages/server/src/db/schema.ts`
  - `packages/server/src/validators/user-end.ts`
  - `packages/shared/src/types.ts`
  - `packages/server/package.json`
  - `pnpm-lock.yaml`
- 服务端路由与工具
  - `packages/server/src/index.ts`
  - `packages/server/src/routes/account.ts`
  - `packages/server/src/routes/content.ts`
  - `packages/server/src/routes/devices.ts`
  - `packages/server/src/routes/me.ts`
  - `packages/server/src/routes/pets.ts`
  - `packages/server/src/routes/settings.ts`
  - `packages/server/src/utils/content.ts`
  - `packages/server/src/utils/storage.ts`
  - `packages/server/content/help.md`
  - `packages/server/content/about.md`
  - `packages/server/content/privacy.md`
  - `packages/server/content/user-agreement.md`
- 服务端测试与测试辅助
  - `packages/server/src/__tests__/account.test.ts`
  - `packages/server/src/__tests__/auth.test.ts`
  - `packages/server/src/__tests__/content.test.ts`
  - `packages/server/src/__tests__/devices.test.ts`
  - `packages/server/src/__tests__/helpers.ts`
  - `packages/server/src/__tests__/me.test.ts`
  - `packages/server/src/__tests__/mock-db.ts`
  - `packages/server/src/__tests__/pets.test.ts`
  - `packages/server/src/__tests__/settings.test.ts`
- 小程序前端
  - `packages/app/src/app.config.ts`
  - `packages/app/src/pages/data/index.scss`
  - `packages/app/src/pages/data/index.tsx`
  - `packages/app/src/pages/devices/index.scss`
  - `packages/app/src/pages/devices/index.tsx`
  - `packages/app/src/pages/profile/index.tsx`
  - `packages/app/src/pages/settings/ContentPage.tsx`
  - `packages/app/src/pages/settings/about.tsx`
  - `packages/app/src/pages/settings/bind-email.tsx`
  - `packages/app/src/pages/settings/bind-phone.tsx`
  - `packages/app/src/pages/settings/help.tsx`
  - `packages/app/src/pages/settings/index.scss`
  - `packages/app/src/pages/settings/index.tsx`
  - `packages/app/src/pages/settings/privacy.tsx`
  - `packages/app/src/pages/settings/subpages.scss`
  - `packages/app/src/pages/settings/system.tsx`
  - `packages/app/src/pages/settings/theme.tsx`
  - `packages/app/src/pages/settings/user-agreement.tsx`
  - `packages/app/src/utils/deviceDisplay.ts`
  - `packages/app/src/utils/markdown.ts`
  - `packages/app/src/utils/userSettings.ts`

## 接口清单

### 新增接口

- `GET /api/pets/:petId/interaction-stats`
- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/devices`
- `DELETE /api/devices/:type/:id`
- `GET /api/devices/firmware/status`
- `POST /api/devices/:deviceType/:deviceId/firmware/upgrade`
- `GET /api/content/:slug`
- `POST /api/account/bind-phone/send-code`
- `POST /api/account/bind-phone/verify`
- `POST /api/account/bind-email/send-code`
- `POST /api/account/bind-email/verify`

### 修改接口

- `GET /api/me`
- `PUT /api/me`
- `DELETE /api/devices/collars/:id`
- `DELETE /api/devices/desktops/:id`

## 提交记录

- `8c3539e` `feat(server): scaffold user-end api foundations`
- `a5ad879` `feat(app): connect user settings and binding flows`
- `7e29280` `feat(app): connect device summaries and firmware status`
- `9c808aa` `feat(app): connect interaction stats to data page`
- `2af2fac` `feat(app): connect markdown content pages`
- 当前收尾提交包含 `/api/me` email 返回补测与本文件更新

## 未完成事项 / TODO

- `packages/server/src/routes/account.ts` 中手机与邮箱验证码仍为 mock `000000`，后续需要接入真实短信/邮件服务。
- 固件升级接口当前只把 `upgrade_status` 置为 `pending`，后续需要接入真实 OTA 下发与回执。
- `interaction_events` 目前只有查询与测试数据入口，后续需要由设备端补齐真实上报链路。
