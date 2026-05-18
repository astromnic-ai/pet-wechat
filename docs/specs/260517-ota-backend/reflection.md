# OTA 后端实现反思

反思范围：
- `requirements.md` 的 D-01 ~ D-13、FR-01 ~ FR-17
- `design.md`
- 本分支相对 `main` 的所有改动

## 总体结论

本次实现的主路径与协议要求一致：upload、check、dispatch、MQTT status/progress、rolled_back mandatory 处理、清 retained、quarantine、内测白名单、状态机、Admin UI 和 token 管理均已覆盖。

用户少、设备规模小的前提下，当前实现总体没有引入持久化队列、灰度策略、per-device 凭据、CDN、签名校验等 v2 范围能力，复杂度基本可接受。本次反思只发现 3 个明确可以收窄或简化的问题，均已直接修复并分别提交。

## 已修复问题

### 1. rolled_back 重复清 retained

问题：`mqtt-handlers.ts` 对所有终态先清 retained，`rolled_back` 随后进入 `handleRollback()` 又按协议第一步再清一次 retained。

判断：清 retained 本身是 mandatory，不能删；但 rolled_back 的五步动作应集中在 rollback handler，避免重复副作用和职责分散。

修复：`verified/failed` 仍由 MQTT handler 清 retained；`rolled_back` 只进入 rollback handler，由 handler 内部先清 retained，再执行幂等 quarantine。

提交：`b6c342b Avoid duplicate OTA retained clear on rollback`

### 2. 未使用的 `internal_auto` dispatch 来源

问题：`dispatch_source` 枚举包含 `internal_auto`，但需求只需要手动下发和全量自动下发，代码没有任何调用方会产生 `internal_auto`。

判断：这是未来占位，会扩大数据库 enum、API 类型和 UI 展示面，不符合“用户少，别 over engineer”。

修复：移除 `internal_auto`，保留当前真实来源：`manual`、`auto_full`。

提交：`fcec258 Remove unused OTA internal auto dispatch source`

### 3. 未使用的 Bearer middleware 包装

问题：`ota-bearer.ts` 同时导出 `authenticateOtaBearer()` 和未使用的 `otaBearerMiddleware`。实际路由都通过 `otaAdminMiddleware` 组合 X-Admin-Key / Bearer。

判断：独立 middleware 当前没有入口使用，属于重复抽象。

修复：保留 `authenticateOtaBearer()`，删除未使用 wrapper，并把类型改成直接的 `Context`。

提交：`d616809 Remove unused OTA bearer middleware wrapper`

## D-01 ~ D-13 核对

- D-01 完整 v1：保留，未裁剪 HTTP/MQTT/状态机/Admin UI。
- D-02 Admin 认证双轨制：保留，OTA admin 路由支持 X-Admin-Key 或 Bearer。
- D-03 MQTT 单进程：保留，没有引入多副本协调。
- D-04 固件存储：保留独立 firmware bucket 和预签名 URL。
- D-05 设备清册独立表：保留，符合 OTA 与小程序设备绑定解耦。
- D-06 两阶段发布调度：保留内存节流；未引入持久化队列，适合当前规模。
- D-07 OTA 错误格式：保留 `{ ok:false, code, message }` 边界。
- D-08 rolled_back 强制处理：保留，且集中在 rollback handler。
- D-09 清 retained：保留，`verified/failed/rolled_back` 都覆盖。
- D-10 内测白名单 Admin UI：保留。
- D-11 chipId 不做设备认证：保留，未扩展 per-device 凭据。
- D-12 同号版本不覆盖：保留。
- D-13 服务端 SHA-256 校验：保留。

## FR-01 ~ FR-17 核对与 scope reduction

- FR-01 上传：必要，保留。大小、格式、同号、SHA-256 都是协议/生产基本面。
- FR-02 check：必要，保留。quarantine/internal/released 过滤是核心协议。
- FR-03 下载：必要，保留。dev local storage 的 Range 支持没有删。
- FR-04 运营下发：必要，保留。批量节流用内存实现，未升级成持久化 worker。
- FR-05 一键全量：必要，保留。当前按在线且版本落后的设备下发。
- FR-06 MQTT 连接：必要，保留。没有扩展 shared subscription。
- FR-07 设备清册：必要，保留。
- FR-08 进度收集：必要，保留。去重是为了 QoS1/retained 重放，不是未来扩展。
- FR-09 rolled_back：协议级 mandatory，不能简化，保留。
- FR-10 其它终态清 retained：协议级 mandatory，保留。
- FR-11 状态流转：必要，保留。
- FR-12 released 前置条件：必要，保留。当前 failed 判定偏保守，但需求没有给“偶发”算法，v1 先简单阻断。
- FR-13 内测白名单持久化：必要，保留。
- FR-14 internal 仅白名单可见：必要，保留。
- FR-15 白名单 UI：必要，保留。
- FR-16 OTA 管理 UI：保留。当前页面直接表格/表单实现，没有继续拆组件。
- FR-17 token 管理：必要，保留。未增加过期、nonce、签名等额外机制。

## 保留风险

- 节流 dispatch 仍是内存 `setTimeout`。这是刻意的 scope 控制：进程重启会丢未发送批次，但当前规模可由运营重发解决。
- Bearer token 是长期 secret。当前只做 hash 存储、可吊销，不做请求签名或短期 token。
- `internal -> released` 的 failed 判定采用 24 小时内任意 failed 阻断；需求没有定义“非偶发 failed”的算法，暂不引入复杂规则。

## 验证

- `pnpm --filter server typecheck`
- `pnpm --filter admin typecheck`
- `pnpm --filter server test`（171 pass）
