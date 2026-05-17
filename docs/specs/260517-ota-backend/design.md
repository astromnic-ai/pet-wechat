# 摆台 OTA 后端 — 技术设计

参见 [requirements.md](./requirements.md) 中的 D-01 ~ D-13、FR-01 ~ FR-17。

## 1. 架构总览

```
┌──────────────────────────────────────────────────────────────┐
│ packages/server (Hono + Bun, 单进程)                         │
│                                                              │
│  HTTP 层                       MQTT 层                       │
│  ├── /firmware/check (无认证)  └── mqtt.js 长连接 EMQX       │
│  ├── /admin/firmware/* (Bearer 或 Key) 订阅: pet/+/status    │
│  └── /admin/ota/* (Bearer 或 Key)            pet/+/ota       │
│                                    发布: pet/<chipId>/ota   │
│         ↓                                ↑                   │
│  src/ota/ (业务核心)                                         │
│  ├── version-resolver  ├── state-machine  ├── dispatch       │
│  ├── rollback-handler  ├── firmware-storage  ├── tokens      │
│         ↓                                                    │
│  Drizzle + Postgres                MinIO (firmware bucket)   │
│  └── 7 张新表                       └── 固件二进制 + 预签名  │
└──────────────────────────────────────────────────────────────┘
         ↑                                          ↓
  packages/admin (React + AntD)                  EMQX Cloud
  └── OTA 管理 5 子页                            (已有, 共享凭据)
```

**部署形态**：MQTT 客户端跑在 server 进程内（D-03），**永远单副本**。当前设备规模不大（百台级），不考虑横向扩容。

## 2. 文件清单

### 2.1 新增

**packages/server/src/ota/**（业务核心，所有 OTA 逻辑集中在此目录）
- `mqtt-client.ts` — mqtt.js 单例，连接/重连/订阅管理
- `mqtt-handlers.ts` — 消息分发：status → registry，ota with stage → progress + rollback handler
- `version-resolver.ts` — 按协议 §2.2 五步过滤算法
- `state-machine.ts` — 状态流转 + 前置条件校验（FR-11/12）
- `dispatch.ts` — 节流批量下发（K=20 / 5s，内存 setTimeout）
- `rollback-handler.ts` — D-08 五步动作（清 retained / quarantine / log）
- `firmware-storage.ts` — 包一层 MinIO，独立 firmware bucket + 预签名 GET
- `tokens.ts` — Bearer token：sign（hash 存）/ verify / revoke
- `errors.ts` — `{ ok: false, code, message }` 响应辅助（D-07）
- `version-cmp.ts` — 语义化版本比较（小工具，不引入 semver 依赖）

**packages/server/src/routes/**
- `ota-public.ts` — GET /firmware/check（设备无认证）
- `admin/firmware.ts` — POST /admin/firmware/upload，GET /admin/firmware/versions，POST /admin/firmware/versions/:id/state（状态切换）
- `admin/ota.ts` — POST /admin/ota/dispatch，POST /admin/ota/dispatch-all（一键全量），GET /admin/ota/dispatch-jobs，GET /admin/ota/registry，CRUD /admin/ota/internal-devices
- `admin/ota-tokens.ts` — POST/GET/DELETE /admin/ota/tokens

**packages/server/src/middleware/**
- `ota-bearer.ts` — Bearer token 中间件（独立于现有 adminMiddleware）
- `ota-admin.ts` — 组合中间件：admin UI 调用走 X-Admin-Key，固件团队 release.sh / CI 走 Bearer（任一通过即可）

**packages/admin/src/pages/ota/**
- `Firmware.tsx` — 版本列表 + 上传 + 状态切换 + release note 编辑
- `Internal.tsx` — 白名单 chipId 增删
- `Registry.tsx` — 设备清册（chipId / online / fw / last_seen，按版本筛选）
- `Dispatch.tsx` — 下发记录 + 进度统计（按 dispatch_job 聚合 ota_progress）
- `Tokens.tsx` — Bearer token 签发/吊销

**packages/shared/src/**
- `ota.ts` — 类型定义：FirmwareState / OtaStage / OtaCommandPayload / OtaProgressPayload / StatusPayload

**packages/server/drizzle/**
- 新 migration 文件（drizzle generate 自动生成）

### 2.2 修改

- `packages/server/src/db/schema.ts` — append 7 张新表
- `packages/server/src/index.ts` — 注册新路由 + 启动 MQTT 客户端（启动后台任务，主进程退出时优雅关闭）
- `packages/server/src/preflight.ts` — 校验 `EMQX_BROKER_URL` / `EMQX_USERNAME` / `EMQX_PASSWORD` / `S3_FIRMWARE_BUCKET`
- `packages/server/src/utils/storage.ts` — 暴露 `createPresignedGetUrl()`（如未公开则补一个），firmware-storage.ts 复用底层 S3Client
- `packages/server/package.json` — 加 `mqtt` 依赖
- `packages/admin/src/App.tsx` — 加 "OTA 管理" 菜单组（5 个子项）
- `packages/admin/src/api/client.ts` — 加 OTA 接口封装
- `.env.example` — 加新环境变量
- `docker-compose.prod.yml` — 加新环境变量

## 3. 数据库 Schema

snake_case，遵循现有风格。详细字段在 Codex 实现时按需补充，下面列必备字段。

### 3.1 `firmware_versions`
- `id` (uuid pk)
- `version` (text, unique) — `v1.2.3` 格式
- `state` (enum: draft / internal / released / quarantine)
- `sha256` (text, 64)
- `size` (bigint)
- `storage_key` (text) — MinIO key
- `release_note` (text, nullable)
- `force` (bool, default false)
- `min_from_version` (text, nullable)
- `uploaded_at`, `uploaded_by_token_id` (fk → ota_tokens.id, nullable)
- `quarantined_at`, `quarantined_reason` (text, nullable) — D-08 审计

### 3.2 `internal_devices`
- `chip_id` (text pk)
- `added_at`, `added_by` (text, 操作员)
- `note` (text, nullable)

### 3.3 `device_registry`
- `chip_id` (text pk)
- `online` (bool)
- `fw` (text, nullable) — 当前固件版本
- `ip`, `rssi` (int), `free_heap` (bigint), `mac` (text)
- `first_seen_at`, `last_seen_at`

### 3.4 `dispatch_jobs`
- `id` (uuid pk)
- `version` (text)
- `chip_ids` (jsonb, text[])
- `source` (enum: manual / auto_full / internal_auto)
- `dispatched_at`
- `total_count`, `immediate_count`, `throttled_count`
- `created_by` (text, nullable)

> 节流任务不落表 target。节流期间（最多几十秒）进程重启会丢失未发批次，由运营重发解决——规模小不值得做持久化队列。

### 3.5 `ota_progress`
- `id` (uuid pk)
- `chip_id` (text, index)
- `version` (text)
- `stage` (text) — received / waiting_idle / deferred / downloading / verifying / installing / rebooting / verified / rolled_back / failed
- `percent` (int, nullable)
- `code` (text, nullable) — failed/rolled_back 时的错误码
- `reason` (text, nullable)
- `device_ts` (bigint) — 设备 millis 时间戳
- `received_at`
- 复合索引 `(chip_id, version, received_at desc)`

### 3.6 `ota_rollbacks`
- `id` (uuid pk)
- `chip_id` (text)
- `version` (text)
- `code` (text, nullable)
- `reason` (text, nullable)
- `first_seen_at`, `last_seen_at`
- `seen_count` (int)
- 唯一索引 `(chip_id, version)`；rollback 副作用只允许由这张表的首次 insert 触发，重复消息只更新 `last_seen_at/seen_count`

### 3.7 `ota_tokens`
- `id` (uuid pk)
- `name` (text)
- `token_hash` (text) — sha256(token)，不存明文
- `token_prefix` (text, 8 char) — 用于 UI 展示识别
- `created_at`, `created_by` (text)
- `revoked_at` (timestamp, nullable)
- `last_used_at` (timestamp, nullable)

## 4. 核心模块设计意图

### 4.1 MQTT 客户端 (`mqtt-client.ts`)

- 单例模式，启动时由 `index.ts` 调用 `initOtaMqtt()`
- 用 `mqtt.connect(EMQX_BROKER_URL, { username, password, reconnectPeriod: 5000, clean: true })`
- 上线后订阅 `pet/+/status`（QoS 1）和 `pet/+/ota`（QoS 1）
- 暴露 `publishOtaCommand(chipId, payload, { retain })` 给 dispatch 和 rollback-handler 用
- 暴露 `clearRetainedOtaCommand(chipId)`（publish 空 payload + retain）
- 重连后自动重订阅（mqtt.js 默认行为，但要日志）
- 优雅关闭：进程信号触发 `client.end()`

### 4.2 消息处理 (`mqtt-handlers.ts`)

收到 `pet/<chipId>/status`：
- parse payload，upsert device_registry
- LWT 触发的 `online:false` 也走这里

收到 `pet/<chipId>/ota`：
- payload 长度为 0 → broker retained 清除事件或本服务清 retained 的回环消息，直接忽略
- 无 `stage` 字段 → 是后端自己 publish 的下行命令（D-09 §3.5），忽略
- 有 `stage` → 写 ota_progress
- stage ∈ {verified, failed, rolled_back} → 调用 `clearRetainedOtaCommand(chipId)`（FR-10）
- stage == rolled_back → 额外调用 `handleRollback(chipId, version, code, reason)`（FR-09）

MQTT QoS1 / retained 重放处理：
- handler 必须整体 try/catch；单条坏消息只记日志，不影响订阅。
- 设备端若误把 `stage` 进度发成 retained，server 重连后可能再次收到同一条终态进度。`ota_progress` 用 `(chip_id, version, stage, device_ts)` 去重；`rolled_back` 的副作用还必须经过 `ota_rollbacks` 首次 insert 才能执行。
- 不能只靠"版本当前已是 quarantine"判断 rollback 幂等，因为运营可能在审计后手动 `quarantine → released`；旧 retained / QoS1 重放不应再次把它打回 quarantine。

### 4.3 版本筛选 (`version-resolver.ts`)

输入：chipId, currentFw, hw, model
输出：目标版本 row 或 null

算法（严格按 PDF §2.2）：
1. 查 firmware_versions where state in (released, internal)
2. 过滤掉 quarantine（state 字段已是 quarantine，但加一层 defensive：where quarantined_at is null）
3. 如果版本 state=internal：检查 chipId 是否在 internal_devices（不在则跳过）
4. 用 version-cmp 比较：仅保留 > currentFw 的
5. 取剩余中最大的

### 4.4 状态机 (`state-machine.ts`)

- `transitionTo(versionId, newState, operator)`：守卫 + 写表 + 写审计行（在 release_note 附加 transition log 或新建 audit 表，本期附加到 release_note）
- 守卫表：
  - `draft → internal`：无前置（只校验当前 state）
  - `internal → released`：调用 `checkInternalReadyForRelease(versionId)` 返回 ok/未达标设备列表
  - `* → quarantine`：rollback-handler 调用，操作员可手动
  - `quarantine → released`：仅手动 + 写审计

`checkInternalReadyForRelease`：
- 该版本所有 internal/手动内测 dispatch_job_targets 的 chip_id 去重 = 全集
- 这些 chipId 在 ota_progress 里都有过 stage=verified
- 24h 内无该版本的 stage in (rolled_back, failed) 记录

### 4.5 节流下发 (`dispatch.ts`)

```
dispatchVersion(chipIds, version) -> { dispatched, immediate, throttled }
  K = 20, INTERVAL_MS = 5000
  immediate = chipIds.slice(0, K)
  throttled = chipIds.slice(K)
  // 同步 publish 前 K 条（await 完成后再返回）
  // 异步 setTimeout 递归 push 剩余批次
  // 写 dispatch_jobs（含 chip_ids 全集 + 计数）
  // 返回响应（不等异步完成）
```

进程重启时未完成的节流任务会丢失——可接受，运营重发即可。规模上千台后再考虑持久化队列。

### 4.6 Rollback handler (`rollback-handler.ts`)

D-08 五步，全部要做：
1. `clearRetainedOtaCommand(chipId)` — 必须最先做，防新设备又拉到
2. 尝试 insert `ota_rollbacks(chipId, version)`；只有首次 insert 成功才继续执行 quarantine 副作用，冲突时只更新 `last_seen_at/seen_count`
3. `stateMachine.transitionTo(version, 'quarantine', { reason, triggeredBy: chipId })`
4. 步骤 1/3 已隐式实现"check 跳过 + dispatch 拒绝"（因为 state 已是 quarantine）
5. console.warn + 写 quarantined_reason 字段

幂等规则：
- 清 retained 对重复消息无害，可以每次先做。
- quarantine 副作用以 `ota_rollbacks(chip_id, version)` 首次 insert 为准，不以 firmware 当前 state 为准。
- 如果同版本已被运营手动从 quarantine 恢复到 released，旧 rollback 重放只更新 `ota_rollbacks.seen_count`，不再次 quarantine；新的设备回滚会因 chipId 不同而再次触发 quarantine。

### 4.7 Bearer token (`tokens.ts`)

- 签发：随机 32 字节 → base64url → 前缀 `ota_` → 计算 sha256 存 token_hash，仅返回明文一次
- 校验：req.header('Authorization') → Bearer xxx → sha256 → 查表 where revoked_at is null
- 中间件 `ota-bearer.ts` 把 token row attach 到 `c.set('otaToken', row)`，便于 audit
- `ota-admin.ts` 组合中间件：先试 X-Admin-Key，失败再试 Bearer，都失败返回 401。不要复用全局 `app.use("/api/admin/*", adminMiddleware)` 包住 OTA 路由；否则 Bearer 永远到不了业务路由。实现时应在 `index.ts` 先注册 `/api/admin/firmware/*`、`/api/admin/ota/*` 的组合中间件和路由，再注册现有 `/api/admin/*` 的 `adminMiddleware`。

### 4.8 错误响应 (`errors.ts`)

```
ok(c, data) -> c.json({ ok: true, ...data })
fail(c, status, code, message) -> c.json({ ok: false, code, message }, status)
```

所有 OTA 路由用这两个 helper，**不**改其他模块的响应风格。

## 5. Admin UI 设计

- 菜单组 "OTA 管理"（在 App.tsx 现有菜单数组里加）
- 5 个子页直接复用 Devices.tsx / ImageReview.tsx 的 AntD Table + Modal 范式
- Firmware.tsx 用 `<Upload>` 组件 + multipart POST 到 `/api/admin/firmware/upload`，进度条用 AntD `<Progress>`
- Dispatch.tsx 的进度统计：按 dispatch_job 聚合该版本所有 chip_ids 的最新 stage，分桶展示

UI 不直接调 OTA 接口的 `{ ok, code, message }` 格式，client.ts 加薄封装把 `{ ok: false, code, message }` throw 成 Error，UI 层用 AntD message 显示。

## 6. 环境变量

新增：
- `EMQX_BROKER_URL` — `mqtts://lf2ebe1a.ala.cn-hangzhou.emqxsl.cn:8883`
- `EMQX_USERNAME` — `thup`
- `EMQX_PASSWORD` — 从密钥管理服务
- `S3_FIRMWARE_BUCKET` — `firmware`（如未自动创建，部署前手动创建）

preflight 加入校验。`.env.example` 和 `docker-compose.prod.yml` 同步。

## 7. 启动 / 关闭流程

`index.ts`:
```
runPreflight()
const app = createApp()
// ... 现有逻辑
if (!process.env.OTA_MQTT_DISABLED) {
  await initOtaMqtt()  // 启动 MQTT 客户端 + 订阅
}
process.on('SIGTERM', async () => { await closeOtaMqtt(); ... })
```

`OTA_MQTT_DISABLED=1` 留给 CI 测试 / 本地调试时跳过 MQTT 连接。

## 8. 测试策略

- **单元测试**：version-resolver（覆盖筛选规则各分支）、version-cmp、state-machine 守卫、token sign/verify
- **集成测试**（vitest + 真 Postgres）：upload → state transitions → check 返回的全链路；rollback handler 幂等
- **MQTT 测试**：用 aedes 起一个内存 broker 跑 e2e（订阅/发布/retained 行为）—— 时间允许再加，本期 mock client
- **手动验收**：第 7 节验收清单

## 9. 不变式 & 反模式提醒

按协议附录 A：
1. 设备不感知阶段 — payload 字段统一，不在 payload 里加 "phase: internal/release"
2. 版本号递增 — upload 接 409 强制
3. rolled_back 单次触发 quarantine — 不引入比例阈值
4. 清 retained 协议级 — 任何 stage 终态都清
5. 设备失败兜底 — 不实现强制重推同版本的逻辑

**反模式**：
- 不要在 dispatch 时直接 await 所有 publish 完成（节流时长会阻塞响应）
- 不要把 chip_ids 大数组 JSON 整个塞到日志（容易爆日志）
- 不要在 mqtt-handlers 里直接抛异常（会断订阅，必须 try/catch + 日志）

## 10. 风险与缓解

| 风险 | 缓解 |
|---|---|
| MQTT 连接频繁断开导致 retained 命令重复触发设备或 server handler | handler 明确忽略空 payload / 下行命令；progress 和 rollback 做唯一键幂等；监控连接状态 |
| MinIO 满 / firmware bucket 未创建 | 启动 preflight 探测；上传前 head bucket |
| 节流任务因进程重启丢失 | 接受。运营重发即可（规模小，重启在节流窗口内概率低） |
| Bearer token 泄露 | 仅返回明文一次 + 可吊销 + last_used_at 监控异常 |
| OTA 路由被全局 adminMiddleware 提前拦截，Bearer token 失效 | index.ts 中 OTA admin 路由必须先于 `/api/admin/*` 全局 X-Admin-Key 中间件注册 |
| quarantine → released 后旧 rolled_back 重放导致再次隔离 | `ota_rollbacks(chip_id, version)` 控制副作用只执行一次；重复重放只计数审计 |
| 同一 topic 同时承载下行命令和上行进度 | payload 长度 0、无 stage、有 stage 三分支必须清晰；所有 JSON parse 失败返回日志，不抛出 |
