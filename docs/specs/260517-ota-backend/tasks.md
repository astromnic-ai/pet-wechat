# 摆台 OTA 后端 — 任务拆分

参见 [design.md](./design.md)、[requirements.md](./requirements.md)。垂直切片，每个任务有可验证完成标准。逐个调 Codex 实现，每任务完成后跑验证 + 原子 commit。

---

## 任务 1：基础设施 + Schema + 共享类型

**文件**：
- `packages/server/src/db/schema.ts`（append 7 张表）
- `packages/server/drizzle/*`（drizzle generate 产物）
- `packages/server/src/preflight.ts`（加 4 个环境变量校验）
- `packages/server/package.json`（加 `mqtt` 依赖）
- `packages/shared/src/ota.ts`（新文件，类型定义）
- `packages/shared/src/index.ts`（导出）
- `packages/server/src/ota/errors.ts`（新文件，ok/fail helper）
- `packages/server/src/ota/version-cmp.ts`（新文件，语义化版本比较）
- `.env.example`、`docker-compose.prod.yml`（加新环境变量）

**做什么**：
- 按 design.md §3 实现 7 张表（firmware_versions / internal_devices / device_registry / dispatch_jobs / ota_progress / ota_rollbacks / ota_tokens），完整字段、约束、索引
- drizzle generate 出 migration，命名清晰
- preflight 新增 EMQX_BROKER_URL/USERNAME/PASSWORD、S3_FIRMWARE_BUCKET 必填校验
- shared 包定义协议层类型：`FirmwareState`、`OtaStage`、`OtaCommandPayload`、`OtaProgressPayload`、`StatusPayload`
- errors.ts 暴露 `ok(c, data)` 和 `fail(c, status, code, message)`（D-07）
- version-cmp.ts 提供 `compare(a, b)` 和 `isValid(v)` 两个纯函数，不引入第三方依赖
- .env.example 和 docker-compose.prod.yml 同步新变量（password 用 `${EMQX_PASSWORD}` 占位）

**完成标准**：
- `pnpm install` 成功（mqtt 依赖装上）
- `pnpm db:generate` 产出迁移文件
- `pnpm db:migrate` 在本地能跑通（如有 PG）；无 PG 时至少 `tsc --noEmit` 通过
- `pnpm -C packages/server typecheck`、`pnpm -C packages/shared typecheck` 通过
- preflight 在缺少新变量时启动报错

**关联决策**：D-04, D-05, D-07, D-12

---

## 任务 2：MQTT 客户端 + 消息处理 + Rollback handler

**文件**：
- `packages/server/src/ota/mqtt-client.ts`（新）
- `packages/server/src/ota/mqtt-handlers.ts`（新）
- `packages/server/src/ota/rollback-handler.ts`（新）
- `packages/server/src/ota/state-machine.ts`（新，rollback 需要）
- `packages/server/src/ota/internal-readiness.ts`（新，checkInternalReadyForRelease，供任务 3 用）
- `packages/server/src/index.ts`（接入 initOtaMqtt / closeOtaMqtt）

**做什么**：
- mqtt-client.ts：mqtt.js 单例 + 连接 + QoS1 订阅 `pet/+/status` 和 `pet/+/ota`，断线自动重连（reconnectPeriod 5s），暴露 `publishOtaCommand(chipId, payload, { retain })` / `clearRetainedOtaCommand(chipId)`（publish 空 Buffer + retain=true）/ `isConnected()` / `closeOtaMqtt()`
- mqtt-handlers.ts：路由消息到 status handler 或 ota handler
  - status：upsert device_registry，处理 LWT 的 online:false
  - ota：**三分支严格区分**——空 payload 忽略；无 stage 忽略（自己 publish 的下行命令）；有 stage 写 ota_progress（用唯一键去重）；终态 stage（verified/failed/rolled_back）调用 clearRetainedOtaCommand；rolled_back 额外调用 handleRollback
  - 整个 handler 包 try/catch，坏消息只 console.error，不抛
- rollback-handler.ts：按 design §4.6
  1. clearRetainedOtaCommand
  2. 尝试 insert ota_rollbacks(chip_id, version)，ON CONFLICT 更新 last_seen_at+seen_count 并 return（不触发副作用）
  3. 首次 insert 才调 stateMachine.transitionTo(version, 'quarantine', { triggeredBy: chipId, reason })
  4. console.warn
- state-machine.ts：transitionTo(versionId, newState, ctx) + 守卫表 + 写 quarantined_at/reason 字段，draft→internal 无前置，internal→released 调 checkInternalReadyForRelease 返回未达标列表，quarantine→released 仅手动
- internal-readiness.ts：`checkInternalReadyForRelease(versionId)` 按 design §4.4 算法
- index.ts：启动时 `if (!process.env.OTA_MQTT_DISABLED) await initOtaMqtt()`；SIGTERM/SIGINT 调 closeOtaMqtt

**完成标准**：
- typecheck 通过
- 本地启动 server 时 `OTA_MQTT_DISABLED=1` 能正常起；不设时尝试连 EMQX（连不上要重试，不能直接崩）
- 单元测试覆盖 version-cmp、rollback 幂等（用内存假表或 mock db）

**关联决策**：D-03, D-08, D-09, NFR-05

---

## 任务 3：HTTP OTA 接口 + 认证 + dispatch worker

**文件**：
- `packages/server/src/middleware/ota-bearer.ts`（新）
- `packages/server/src/middleware/ota-admin.ts`（新，X-Admin-Key 或 Bearer 组合）
- `packages/server/src/ota/tokens.ts`（新）
- `packages/server/src/ota/version-resolver.ts`（新）
- `packages/server/src/ota/firmware-storage.ts`（新，独立 firmware bucket + 预签名 GET）
- `packages/server/src/ota/dispatch.ts`（新，内存节流）
- `packages/server/src/routes/ota-public.ts`（新，/firmware/check）
- `packages/server/src/routes/admin/firmware.ts`（新）
- `packages/server/src/routes/admin/ota.ts`（新）
- `packages/server/src/routes/admin/ota-tokens.ts`（新）
- `packages/server/src/index.ts`（注册路由——OTA admin 路由必须先于 /api/admin/* 全局 adminMiddleware）
- `packages/server/src/utils/storage.ts`（如未有 `createPresignedGetUrl` 则补一个）

**做什么**：
- tokens.ts：随机 32B → base64url → 前缀 `ota_` → sha256 hash 存表，仅返回明文一次；verify 用 hash 查 where revoked_at is null
- ota-bearer.ts：parse Authorization Bearer → verify token → 写入 `c.set('otaToken', row)`，失败 401
- ota-admin.ts：先试 X-Admin-Key（用现有 adminMiddleware 逻辑），失败再试 Bearer，都失败 401；成功则 next
- firmware-storage.ts：包一层 S3Client 指向 firmware bucket，提供 putFirmware(buffer, key, contentType) / createPresignedGetUrl(key, expires)
- version-resolver.ts：按 design §4.3 五步过滤
- dispatch.ts：写一行 dispatch_jobs，同步 publish 前 K=20 条，剩余用 setTimeout 递归每 5s 一批 publish；返回 { dispatched, immediate, throttled }；进程重启会丢失未完成批次（接受）
- 路由层：
  - ota-public.ts：`GET /firmware/check`，调 version-resolver，输出预签名 url
  - admin/firmware.ts：
    - `POST /upload`（ota-admin 中间件）：multipart 接收，校验 magic byte 0xE9 / size ≤ 5MB / version 格式 / version_exists；计算 sha256；写 MinIO + DB；返回 `{ ok, version, sha256, size, uploadedAt, initialState: "draft" }`
    - `GET /versions`（列表，分页）
    - `POST /versions/:id/state`（运营状态切换）
  - admin/ota.ts：
    - `POST /dispatch`：FR-04 校验链（state 非 draft/quarantine、internal 仅白名单、chipIds 非空），调 dispatch.dispatchVersion
    - `POST /dispatch-all`：从 device_registry 拉 online + fw < target 的全集，调同上
    - `GET /dispatch-jobs`：列表 + 按 job 聚合 ota_progress 各 stage 计数
    - `GET /registry`：分页 + 按 version/online 筛选
    - `GET/POST/DELETE /internal-devices`
  - admin/ota-tokens.ts：CRUD（POST 返回一次明文，GET 列表只返 prefix）
- index.ts：注册顺序**必须**为：先 OTA admin 路由（用 ota-admin 中间件） → 再现有 `/api/admin/*` 的 adminMiddleware

**完成标准**：
- typecheck + build 通过
- 手测（用 curl 或 httpie）：
  - 用 Bearer token 上传一个 fake firmware（前缀 0xE9）→ 200
  - 同号重传 → 409 version_exists
  - 状态切到 internal，白名单内 check 拿到，非白名单拿不到
  - dispatch 100 个假 chipId → 立即返回 { immediate: 20, throttled: 80 }，dispatch_jobs 表新增一行，前 20 条 broker 端已收到 publish
  - rolled_back 路径：手动 publish 一条 stage:rolled_back，验证清 retained + state 变 quarantine + 后续 check 不再返回
- 所有 OTA 路由返回严格 `{ ok, code, message }` 格式

**关联决策**：D-01, D-02, D-04, D-06, D-07, D-12, D-13, FR-01~FR-15

---

## 任务 4：Admin UI

**文件**：
- `packages/admin/src/pages/ota/Firmware.tsx`（新）
- `packages/admin/src/pages/ota/Internal.tsx`（新）
- `packages/admin/src/pages/ota/Registry.tsx`（新）
- `packages/admin/src/pages/ota/Dispatch.tsx`（新）
- `packages/admin/src/pages/ota/Tokens.tsx`（新）
- `packages/admin/src/App.tsx`（加菜单组 + 路由）
- `packages/admin/src/api/client.ts`（加 OTA 接口封装 + `{ ok:false, ... }` 错误转 Error）

**做什么**：
- client.ts 加 `otaRequest()` 薄封装：把 `{ ok: false, code, message }` 抛成带 code 的 Error
- 5 个子页复用现有 Devices.tsx / ImageReview.tsx 的 AntD Table + Modal 范式
- Firmware.tsx：列表 + AntD Upload（multipart 到 /admin/firmware/upload）+ 状态切换 Button（draft→internal / internal→released / *→quarantine / quarantine→released），状态切换失败时把错误 message 显示
- Internal.tsx：chipId 增删表
- Registry.tsx：分页 + 筛选（online、fw）
- Dispatch.tsx：dispatch_jobs 列表 + 展开行显示各 stage 计数（received/downloading/verified/failed/rolled_back）+ "全量下发"按钮（弹确认框）+ "选设备下发"暂不做（v2，先注释 TODO）
- Tokens.tsx：列表 + 新建（弹窗只显示一次明文 + 复制按钮）+ 吊销
- App.tsx：菜单组 "OTA 管理" 含 5 子项，使用现有 React Router 模式

**完成标准**：
- admin dev server 启动，菜单可见，5 个页面可路由进入
- typecheck 通过
- 手测：在浏览器里走一遍：上传固件 → 切 internal → 加白名单 → dispatch → 看进度（如果有真实设备就完整跑，否则用 mock data 验证 UI 不崩）

**关联决策**：D-02, D-10, FR-16, FR-17

---

## 执行顺序

依赖关系：1 → 2 → 3 → 4

每个任务完成后：
1. 跑该任务的"完成标准"验证
2. `git add -A && git commit -m "feat(ota): <task summary>"`
3. 进入下一任务

任务 2 和任务 3 都依赖 schema（任务 1）。任务 4 依赖任务 3 的接口。
