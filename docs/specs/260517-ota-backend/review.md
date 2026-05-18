# 摆台 OTA 后端设计审查

审查对象：`docs/specs/260517-ota-backend/design.md`，参考 `requirements.md` 的 D-01 ~ D-13、FR-01 ~ FR-17。

## 总体结论

设计主线基本覆盖了 v1 协议：上传、check、预签名下载、dispatch、MQTT status/progress、rolled_back 强制 quarantine、清 retained、状态机、内测白名单、Admin UI 和 token 管理都已纳入范围。

本次发现 4 个 P1 级实现风险，已直接修订 `design.md`：持久化节流队列、rollback 幂等依据、MQTT retained/空 payload 重放处理、OTA 双轨认证注册顺序。未发现必须阻断实现的 P0。

## P0

无。

## P1

### 1. 节流 dispatch 只靠内存 `setTimeout`，进程重启会造成已返回成功的批次丢失

原设计接受"运营重发"，但 FR-04/FR-05 会对 100 台级别批量下发返回 `throttled=true`，如果 server 在第 2 批前重启，后续设备不会收到 retained command，审计表也无法准确表达哪些已发布。这个行为对生产 OTA 不够可靠。

建议修复方案：
- 新增 `dispatch_job_targets`，把每台设备的 `due_at/status/published_at/publish_error` 持久化。
- `dispatch.ts` 只负责事务写入 job 和 targets，并唤醒 worker。
- `dispatch-worker.ts` 在启动、MQTT reconnect、每次 dispatch 后 resume due targets。
- `setTimeout` 只能作为进程内唤醒优化，不能作为唯一事实来源。

状态：已在 `design.md` 修订。

### 2. rollback 幂等只看 firmware 当前 state，不足以抵御旧消息重放

原设计用"版本已是 quarantine 则只写日志"保证幂等。问题是 FR-11 允许 `quarantine → released` 手动恢复；如果此后 MQTT QoS1/retained 重放旧 `rolled_back`，会把版本再次 quarantine，破坏人工恢复动作。

建议修复方案：
- 新增 `ota_rollbacks`，唯一键 `(chip_id, version)`。
- 清 retained 可以每次执行；quarantine 副作用只在 rollback 事件首次 insert 成功时执行。
- 重复 rollback 只更新 `last_seen_at/seen_count`，用于审计。
- 不以 firmware 当前 state 作为幂等唯一依据。

状态：已在 `design.md` 修订。

### 3. MQTT 同一 topic 承载下行命令和上行进度，空 retained 和 retained progress 重放处理不够明确

server 订阅 `pet/+/ota` 后会收到自己 publish 的下行 retained command，也会收到清 retained 时 broker 分发的空 payload。原设计只说"无 stage 忽略"，没有明确空 payload 分支；如果先 JSON parse，空 payload 会变成异常噪声。若设备误把进度发成 retained，server 重连后还可能重复触发 terminal handler。

建议修复方案：
- handler 三分支必须固定：空 payload 直接忽略；无 `stage` 视为下行命令忽略；有 `stage` 才写 progress。
- 所有 parse/handler 包 try/catch，坏消息不影响订阅。
- `ota_progress` 增加去重约束；`rolled_back` 副作用再走 `ota_rollbacks`。

状态：已在 `design.md` 修订。

### 4. OTA 双轨认证和现有全局 adminMiddleware 的注册顺序存在踩坑风险

现有 server 在 `index.ts` 中对 `/api/admin/*` 全局套 `adminMiddleware`。如果实现时直接把 OTA admin 路由挂到现有 `adminRoute` 下，Bearer token 会先被 X-Admin-Key 拦截，D-02/FR-01 的 Bearer token 上传会失败。

建议修复方案：
- OTA admin 路由必须先于现有 `app.use("/api/admin/*", adminMiddleware)` 注册。
- `/api/admin/firmware/*` 和 `/api/admin/ota/*` 使用 `ota-admin.ts` 组合中间件：X-Admin-Key 或 Bearer 任一通过。
- 其他 admin 路由维持现有 `X-Admin-Key`，避免回归。

状态：已在 `design.md` 修订。

## P2

### 1. 错误响应格式分裂可接受，但需要把边界写进 client 封装和测试

D-07 要求 OTA 路由用 `{ ok, code, message }`，现有 admin 路由用 `{ error }`。这个分裂合理，因为 OTA 协议面向 release.sh/CI，需要稳定机器可读 code；但实现时容易让 Admin UI client 混用。

建议修复方案：
- `packages/admin/src/api/client.ts` 增加 OTA 专用 request helper，把 `{ ok:false, code, message }` 转成 Error。
- server 测试分别覆盖 OTA 与非 OTA 错误格式，避免全局 error handler 误改 OTA 响应。

### 2. 状态机前置条件对"内测组全集"的定义需要实现时进一步钉牢

requirements 要求"内测组所有设备都上报 verified"和 24 小时无 rolled_back/非偶发 failed。设计现在以该版本实际 dispatch target 去重作为全集，这是合理的；但如果白名单后来增删，不能用当前白名单直接推导历史内测全集。

建议修复方案：
- release readiness 只基于该版本的 internal dispatch targets，不基于当前 `internal_devices` 快照。
- failed 是否"非偶发"目前需求没有给判定算法，v1 建议先保守：24h 内任意 failed 都阻断 released，并在错误中列出设备。

### 3. mqtt.js 单进程方案风险提示基本充分，但需要部署保护

设计已说明单副本，多副本未来用 shared subscription。但生产误开多副本时，`pet/+/status` 和 `pet/+/ota` 都会被重复处理，progress 写入量会放大。

建议修复方案：
- preflight 或启动日志明确输出 `OTA_MQTT_INSTANCE_MODE=single`。
- docker compose 保持 server replicas=1；如果未来横向扩容，先切 `$share/ota/...` 并复核 retained 行为。

### 4. 风险表还应覆盖路由注册、旧 rollback 重放、同 topic 上下行混用

原第 10 节风险偏运维，缺少实现层高概率踩坑。

建议修复方案：
- 已补充 OTA 路由被全局 adminMiddleware 提前拦截、`quarantine → released` 后旧 rollback 重放、同 topic 三分支处理等风险。
