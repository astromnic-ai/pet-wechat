# OTA 后端硬审结论

审查范围：本分支相对 `origin/main` 的 OTA 后端、Admin UI、数据库 migration，以及 `requirements/design/tasks/review.md`。

## 总体结论

本次未发现 P0。已修复 6 个会影响协议正确性、安全边界或运行稳定性的 P1/P2 问题。剩余可接受风险：Bearer token 属于长期 bearer secret，协议/需求未定义 token 过期、一次性 nonce 或请求签名；当前实现只能保证服务端不存明文和可吊销，不能防止泄漏后的重放。

## P1

### 1. `quarantine -> released` 后仍被 `/firmware/check` 永久跳过

问题：`version-resolver.ts` 防御性过滤 `quarantined_at IS NULL`，但 `state-machine.ts` 在人工 `quarantine -> released` 时只改 `state`，没有清 `quarantined_at/quarantined_reason`。结果是状态显示已恢复发布，但设备 check 永远拿不到该版本。

修复：`transitionTo()` 在 `quarantine -> released` 时清空 `quarantinedAt` 和 `quarantinedReason`。

### 2. 固件上传在读取内存前缺少有效大小限制

问题：上传路由先 `parseBody()`/`arrayBuffer()`，再判断 5MB。大 multipart 请求会先进入内存，大小限制没有在高风险路径前生效。

修复：上传入口新增 `Content-Length` 预检；读取 `arrayBuffer()` 前检查 `File.size`；读取后保留原有 buffer 长度校验作为兜底。

### 3. OTA 路由未兜住未处理异常的协议错误格式

问题：路由显式错误使用 `{ ok:false, code, message }`，但未处理异常会落入全局 `{ error }`，OTA 客户端/脚本会看到混合格式。

修复：全局 `onError` 对 `/firmware`、`/api/admin/firmware`、`/api/admin/ota` 单独返回 `{ ok:false, code, message }`。

## P2

### 4. X-Admin-Key 明文字符串比较有时序泄漏

问题：`ota-admin.ts` 对 `X-Admin-Key` 使用 `===`，不符合认证路径的常量时间比较要求。Bearer token 目前是 hash 后 SQL 精确查询，不暴露明文比较路径。

修复：新增 hash 后 `timingSafeEqual()`，`X-Admin-Key` 使用常量时间比较。

### 5. `ota_progress` 去重冲突直接丢弃，不能支持进度重写

问题：`ota_progress` 有 `(chip_id, version, stage, device_ts)` 唯一约束，但冲突时 `onConflictDoNothing()`，重复上报/重写进度不会更新 `percent/code/reason/received_at`。

修复：冲突改为 `onConflictDoUpdate()`，更新进度字段和接收时间；rollback 副作用仍由 `ota_rollbacks(chip_id, version)` 唯一索引幂等保护。

### 6. dispatch 节流定时器进程退出时没有清理

问题：节流批次使用 `setTimeout` 链，但没有保存句柄和 shutdown cleanup。虽然进程退出会释放资源，但优雅停机期间仍可能触发后台 publish，与 MQTT close 交错。

修复：保存所有节流 timer，定时触发后移除；shutdown 时先 `clearScheduledDispatches()` 再关闭 MQTT。

## 已复核未发现问题

- `rolled_back` 五步动作：清 retained、`ota_rollbacks` 幂等、quarantine、check/dispatch 跳过、warning 日志均存在。
- rollback 重复触发：`ota_rollbacks` 唯一索引拦截，重复消息只更新 `seen_count/last_seen_at`。
- 路由注册顺序：OTA admin 路由先于全局 `/api/admin/*` adminMiddleware，Bearer 不会被提前吞掉。
- SQL 注入：审查范围内查询均使用 Drizzle 参数化 API 或 `sql` 模板变量插值，未发现字符串拼接 SQL。
- MQTT handler：入口整体 try/catch，空 payload、无 stage 下行命令、JSON parse 失败均不会断订阅。
- 预签名 URL：firmware 使用独立 bucket，过期时间被限制在 60s 到 24h，当前 check/dispatch 使用 1h。

## 验证

- `pnpm -C packages/server typecheck`
- `pnpm -C packages/admin typecheck`
- `pnpm -C packages/server test`（171 pass）
