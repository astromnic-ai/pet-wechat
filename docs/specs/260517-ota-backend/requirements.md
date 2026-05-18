# 摆台 OTA 后端实现 — 需求文档

> 来源协议：`摆台 OTA 后端对接协议` v2026-05-14（固件团队提供）
> 受众：本仓库 `packages/server` + `packages/admin` 后端开发
> 目标：按协议落地"生产 OTA 服务端"，让摆台设备能完整走 upload → dispatch → check → download → progress → verified/rolled_back 的升级闭环

## 1. 背景

摆台是无键盘的桌面陪伴设备，唯一修 bug/加功能的通道就是 OTA。**设备端固件已实现并完成端到端验证**（固件团队负责），目前缺的是"生产服务端"——也就是后端必须实现的 HTTP 接口 + MQTT 处理 + 协议级强制行为。

本仓库现状：MQTT 客户端**完全未接入**（package.json 无 mqtt 依赖），无固件版本表、无内测白名单、无 dispatch 任务表，admin 认证用 `X-Admin-Key`（协议要求 Bearer token）。

## 2. 关键决策

> 编号后面所有任务、设计、代码都会引用这些 D-xx。

- **D-01 协议范围 = 完整 v1**：按 PDF §9.1 v1 必备清单全做：HTTP 4 接口 + MQTT 全套 + 版本状态机（draft→internal→released→quarantine）+ 内测白名单 + 两阶段发布 + rolled_back 协议级强制处理 + admin UI。**不裁剪**。
- **D-02 Admin 认证双轨制**：新增 Bearer token 体系**仅用于 OTA 接口**（`/admin/firmware/*`, `/admin/ota/*`），供固件团队 `release.sh` 和未来 CI 使用；admin UI 继续走 `X-Admin-Key`（不改造已有接口，避免回归）。Bearer token 可在 admin UI 里签发/吊销。
- **D-03 MQTT 部署形态**：`mqtt.js` 长连接跑在 **server 进程内**。订阅 `pet/+/status` 和 `pet/+/ota`，单副本部署。生产多副本时通过 EMQX shared subscription（`$share/ota/...`）做负载均衡，本期不做（注释 TODO）。
- **D-04 固件存储**：新建 MinIO `firmware` bucket（独立于现有默认 bucket），下发给设备的 URL 用**预签名 GET URL**（有效期 1h~24h，协议 §2.3）。
- **D-05 设备清册独立表**：新建 `device_registry` 表（按 `chip_id` 唯一），与现有 `desktop_devices` 解耦。OTA 世界只关心 chipId，不关心是否已被小程序认领。`device_registry` 通过订阅 `pet/+/status` retained 消息构建。
- **D-06 两阶段发布调度**：运营在 admin UI 点"转为全量"后，后端**自动节流分批下发**给所有在线设备（K=20/批，间隔 5s，协议 §2.4）。运营不需要手动选设备。
- **D-07 错误响应格式 = `{ ok: false, code, message }`**：仅 OTA 路由用此格式（协议 §2.1 等明确要求）。其他 admin 路由维持现状 `{ error }`。
- **D-08 rolled_back 协议级强制**（最关键）：收到 `stage:rolled_back` 时**必须**：(1) publish 空 retained payload 清 broker retained 命令；(2) 把对应 version 切到 `quarantine`；(3) `/firmware/check` 跳过该版本；(4) 后续 dispatch 拒绝该版本；(5) 告警日志。不做会出现死循环。
- **D-09 清 retained 触发条件统一**：收到任何 stage 终态（`verified` / `failed` / `rolled_back`）都清 retained ota 命令（协议 §4.4）。
- **D-10 内测白名单 admin UI**：admin 新增 "OTA 管理" 菜单，子页：固件版本列表（含状态切换）、内测白名单管理、设备清册 + 下发记录。手动加/减 chipId 到白名单。
- **D-11 设备 chipId 不可信但唯一**：chipId 来自设备自报（ESP32 efuse MAC），全球唯一且不变（PDF Q7）。后端用它作为 PK，但**不做身份认证**——MQTT broker 凭据当前共享 `username=thup`（PDF §3.1），per-device 凭据是 v2+ 计划。本期接受这个安全权衡。
- **D-12 同号版本不允许覆盖**：`/admin/firmware/upload` 收到同 version 时返回 `409 version_exists`（即使 SHA256 不同）。强制运营递增 patch（PDF §5.1）。
- **D-13 服务端 SHA-256 强校验**：upload 时服务端计算 SHA-256 并写入响应，release.sh 会和本地值比对，不一致认为传输损坏。

## 3. 功能需求（EARS）

### 3.1 HTTP 接口（数据面 + 控制面）

**FR-01（固件上传）** WHEN 固件团队 POST `/admin/firmware/upload`（multipart）携带有效 Bearer token、`firmware` 文件、合法 `version`，THE 后端 SHALL：
- 校验 token 有效 → 否则 `401 auth_failed`
- 校验 version 格式 `^v\d+\.\d+\.\d+$` → 否则 `400 bad_request`
- 校验首字节 `0xE9`（ESP32 app image）→ 否则 `400 bad_format`
- 校验文件 ≤ 5MB → 否则 `400 size_exceeded`
- 校验 version 不存在 → 否则 `409 version_exists`（D-12）
- 计算 SHA-256，写入 `firmware` MinIO bucket，记录 `firmware_versions` 表，`state=draft`
- 返回 `{ ok: true, version, sha256, size, uploadedAt, initialState: "draft" }`（D-13）

**FR-02（设备版本查询）** WHEN 设备 GET `/firmware/check?chipId=&fw=&hw=&model=`，THE 后端 SHALL 按以下顺序过滤候选版本（PDF §2.2）：
1. `state == released`（白名单设备额外允许 `internal`）
2. 排除 quarantine 版本（D-08）
3. 版本号 > 设备当前 fw（语义化比较）
4. 取剩余中最大的一个
- 有结果：返回 `{ v:1, hasUpdate: true, version, url（预签名）, sha256, size, force, minFromVersion, releaseNote }`
- 无结果：返回 `{ v:1, hasUpdate: false }`
- **此接口无需认证**（设备直接调用）

**FR-03（固件下载）** WHEN 设备 GET 预签名 URL，THE MinIO/storage SHALL：
- 支持 `Range: bytes=N-` 头（D-04，PDF §2.3）
- 返回准确 `Content-Length`（设备会和 command size 比对）

**FR-04（运营下发 OTA）** WHEN 运营 POST `/admin/ota/dispatch { chipIds, version }` 携带有效 Bearer token，THE 后端 SHALL：
- 校验 version 不在 `draft`/`quarantine` → 否则 `400`
- `version == internal` 时只接受白名单内 chipId（其他返回 skip）
- `chipIds` 为空 → `400`
- 对每个 chipId publish MQTT 命令到 `pet/<chipId>/ota`（`retained=true`, `QoS=1`），payload 见 PDF §3.3
- **节流**：大于 K=20 条时分批，批间隔 5s（D-06）
- 返回 `{ ok, dispatched, version, immediate, throttled }`
- 写 `dispatch_jobs` 表用于审计

**FR-05（一键全量下发）** WHEN 运营在 admin UI 把某版本切到 `released` 并点击"全量下发"，THE 后端 SHALL：
- 从 `device_registry` 拉所有 `online=true` 且 fw < 目标版本的 chipId
- 调用 FR-04 流程（自动节流）

### 3.2 MQTT 处理

**FR-06（连接 EMQX）** WHEN server 启动，THE MQTT 客户端 SHALL：
- 连接 `lf2ebe1a.ala.cn-hangzhou.emqxsl.cn:8883`（TLS）
- 用户名 `thup`，密码从环境变量 `EMQX_PASSWORD` 读取
- 订阅 `pet/+/status`（QoS 1）和 `pet/+/ota`（QoS 1）
- 断开自动重连，重连后重新订阅

**FR-07（设备清册维护）** WHEN 收到 `pet/<chipId>/status` retained 消息，THE 后端 SHALL：
- upsert `device_registry`：`chipId, online, fw, ip, rssi, free_heap, last_seen_at`
- LWT（`online=false`）也照常 upsert

**FR-08（进度收集）** WHEN 收到 `pet/<chipId>/ota` 且 payload 含 `stage` 字段（区分上行/下行，PDF §3.5），THE 后端 SHALL：
- 写 `ota_progress` 表（chipId, version, stage, percent, code, reason, ts）
- 更新对应 dispatch_job 的最终状态

**FR-09（rolled_back 协议级强制处理）** WHEN 收到 `stage: rolled_back`，THE 后端 SHALL（D-08，最关键）：
1. publish 空 payload + `retained=true` 到 `pet/<chipId>/ota` → 清 broker retained 命令
2. 把 `version` 字段对应的固件状态切到 `quarantine`（单次触发，不按比例）
3. `/firmware/check` 后续跳过该版本
4. `/admin/ota/dispatch` 拒绝该版本
5. 写 WARNING 日志（生产建议接告警，本期只 console.warn）
6. 记录"被哪台设备回滚 + 时间"用于审计

**FR-10（其它 stage 终态清 retained）** WHEN 收到 `stage: verified` 或 `stage: failed`，THE 后端 SHALL publish 空 retained payload 清 broker 上的 ota 命令（D-09）。

### 3.3 版本状态机

**FR-11（状态流转）** THE `firmware_versions.state` SHALL 严格遵守流转图（PDF §4.2）：
- `draft` → `internal`（运营手动"转为内测"）
- `internal` → `released`（运营手动"转为全量"，前置条件：内测组 24 小时无 rolled_back + 所有内测设备都上报过 verified）
- `released` → `quarantine`（FR-09 自动触发，或运营手动）
- `quarantine` → `released`（运营手动反向操作，需写审计日志）

**FR-12（状态前置条件校验）** WHEN 运营点"转为全量"，THE 后端 SHALL 校验：
- 该版本被 dispatch 给的内测设备**至少 24 小时**没有 rolled_back/非偶发 failed
- 内测组所有设备都上报过 `verified`
- 不满足 → 返回错误 + 列出未达标设备

### 3.4 内测白名单

**FR-13** THE `internal_devices` 表 SHALL 持久化（PDF §4.1，至少 5 台覆盖典型硬件批次）。
**FR-14** WHEN 版本处于 `internal`，THE `/firmware/check` 仅对白名单内 chipId 返回 hasUpdate=true。
**FR-15** Admin UI SHALL 提供添加/移除 chipId 的界面。

### 3.5 Admin UI

**FR-16** 新增"OTA 管理"菜单，子页：
- 固件版本列表（含上传记录、状态、状态切换按钮、SHA-256、size、release note）
- 内测白名单管理（chipId 增删）
- 设备清册（chipId、online、fw、last_seen_at、按版本筛选）
- 下发记录（dispatch_jobs，含进度统计：received/downloading/verified/failed/rolled_back 各多少台）

**FR-17** Bearer token 管理：admin UI 可签发"OTA 上传 token"（长 token，可吊销）给固件团队的 release.sh 用。

## 4. 数据模型（高层，详细 schema 在 design.md）

新增 5 张表：
- `firmware_versions`（id, version unique, state, sha256, size, storage_key, release_note, force, min_from_version, uploaded_at, uploaded_by_token_id）
- `internal_devices`（chip_id PK, added_at, added_by, note）
- `device_registry`（chip_id PK, online, fw, ip, rssi, free_heap, last_seen_at, first_seen_at）
- `dispatch_jobs`（id, version, chip_ids[], dispatched_at, immediate_count, throttled_count, source: manual/auto）
- `ota_progress`（id, chip_id, version, stage, percent, code, reason, ts, received_at）
- `ota_tokens`（id, token_hash, name, created_at, revoked_at, last_used_at）

## 5. 非功能性需求

- **NFR-01 性能**：单批 dispatch 不阻塞主请求线程（异步队列）。MQTT 订阅消息处理延迟 < 500ms。
- **NFR-02 安全**：固件 URL 预签名，有效期 ≤ 24h。Bearer token 存储用 hash（不明文存）。
- **NFR-03 可恢复**：MQTT 连接断开后 30s 内重连；重连后重订阅。
- **NFR-04 部署**：环境变量新增 `EMQX_PASSWORD`、`S3_FIRMWARE_BUCKET`，加入 preflight 校验。
- **NFR-05 一致性**：rolled_back 处理必须幂等（同一 chipId+version 重复收到时只执行一次副作用）。

## 6. 不在本期范围

- 按比例灰度（v2+，协议 §9.2）
- HTTP Range 续传（设备目前断网即重头，v2+）
- 固件数字签名（v2+，PDF §8 长期方案）
- per-device MQTT 凭据
- CDN 分发
- 审计日志查询接口（本期只写表，不开 UI）

## 7. 验收清单

- [ ] 固件团队 `release.sh` 能成功上传一个版本（draft），同号重传返回 409
- [ ] Admin UI 能把版本切到 internal，白名单内的设备 check 时拿到该版本，非白名单设备拿不到
- [ ] Admin UI 切到 released 时校验前置条件（24h + verified）
- [ ] 模拟设备上报 rolled_back，验证 retained 被清、版本被 quarantine、check 不再返回
- [ ] 模拟 100 台设备 dispatch，验证节流分 5 批、间隔 5s
- [ ] MQTT 断开重连后订阅恢复
- [ ] 所有 OTA HTTP 接口返回格式为 `{ ok, code, message }`
- [ ] 设备清册能从 status retained 消息构建，LWT 离线状态正确更新

---

**协议附录 A 列的 5 条不变式**（设计/编码全程必须守住）：

1. 协议层无变化（设备不感知阶段）
2. 版本号永远递增（D-12）
3. rolled_back 是 quarantine 的强触发条件（D-08）
4. 清 retained 是协议级强制（D-09）
5. 设备失败兜底是先决保障（OTA 失败不能让设备无法工作）
