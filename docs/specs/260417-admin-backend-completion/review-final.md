# 最终审查结论

分支：`feat/admin-backend-completion`
审查基线：`git diff main...HEAD`
审查范围：按需求文档与本次 review 要点，对 admin 新增后端接口做 bug / 安全 / 性能 / 逻辑正确性硬审查。

## 已修问题

### 1. P0: admin 预签名 PUT 没有把 `Content-Type` 绑进签名

- 文件：`packages/server/src/utils/storage.ts`
- 风险：原实现返回的 URL 只有 `X-Amz-SignedHeaders=host`，`Content-Type` 没进入签名；实际验证里，用 `text/plain` 也能成功 PUT，白名单约束形同虚设。
- 修复：
  - 改为用底层 SigV4 直接签 `HttpRequest`
  - 将 `content-type` 放入 `SignedHeaders`
  - 用同一个 `signingDate` 计算 `expiresAt`，避免响应时间和签名时间漂移
  - 补充 server 直接依赖：`@smithy/hash-node`、`@smithy/protocol-http`、`@smithy/signature-v4`
- commit：`574c692 fix: bind admin upload content type in presign`
- 验证：
  - `/api/admin/uploads/presign` 返回 `X-Amz-SignedHeaders=content-type;host`
  - 错误 `Content-Type` 上传返回 `403`
  - 正确 `Content-Type` 上传返回 `200`

### 2. P1: membership benefits 可写入脏数据

- 文件：`packages/server/src/routes/admin/memberships.ts`
- 风险：原实现只校验字段 shape，允许重复 `key`、空白 `key/label`、非有限数字；实测重复 key payload 会被 200 接受，后续前端按 key 渲染/覆盖时会出现不确定行为。
- 修复：
  - 要求 `key` / `label` trim 后非空
  - 拒绝重复 `key`
  - 拒绝 `NaN` / `Infinity`
- commit：`3c4bdb9 fix: reject invalid membership benefits payloads`
- 验证：
  - 带重复 `benefits[].key` 的 `PUT /api/admin/users/:id/membership` 现在返回 `400`

### 3. P1: customization 动作进度按行数计数，遇到重复 action 会虚高

- 文件：`packages/server/src/routes/admin/customization.ts`
- 风险：`base_action_count` / `personalized_action_count` 原本按 `COUNT(*)` 统计；一旦同一 `pet_avatar_id + action_type` 出现重复记录，任务进度会被放大，`categoryStatus` 也会被错误推进到 `base_done` / `all_done`。
- 修复：
  - 改成 `COUNT(DISTINCT paa.action_type)`，按动作类型去重
- commit：`9d304be fix: dedupe customization action progress counts`

### 4. P1: demo seed 重跑会累积旧的 desktop bindings

- 文件：`packages/server/scripts/seed-admin-demo.ts`
- 风险：原清理逻辑只是把命中的 `desktop_pet_bindings` 软解绑，不删除历史行；重复执行 seed 会不断堆积旧绑定记录，不满足“可重复执行不产生重复”。
- 修复：
  - 清理阶段改为直接删除命中的 `desktop_pet_bindings`
- commit：`b21c7b9 fix: delete stale seed desktop bindings on reseed`
- 验证：
  - 连续两次执行 `pnpm --filter server db:seed:demo`
  - 关联 seed 数据的 `desktop_pet_bindings` 计数稳定为 `19`，不再递增

## 已核对通过

- SQL 注入：
  - `keyword`、`status` 逗号分隔等动态值都走参数插值
  - `sort` / `order` 先白名单校验，再拼固定列名/方向，未发现可注入入口
- 慢查询 / N+1：
  - `devices` 和 `customization/tasks` 都是单 SQL + CTE 预聚合，不存在逐行补查
  - `devices` 的 `count` 与分页查询分开执行，避免把总数统计塞进每一页
- 事务边界：
  - `PUT /users/:id/membership` 的 `users.avatarQuota` 更新和 `memberships` upsert 在同一事务中，原子性满足要求
- 401 覆盖：
  - 新路由都挂在 `/api/admin/*` 下，经过 `adminMiddleware`
  - 实测无 `X-Admin-Key` 请求 `/api/admin/devices` 返回 `401`
- shared 契约：
  - `AdminDeviceListItem` / `CustomizationTask` / `Membership` 等新增 contract，handler 返回字段已覆盖
- 老接口兼容：
  - `/api/admin/collars`、`/api/admin/desktops`、`/api/admin/avatars` 既有路径和结构未被改写，本轮只追加新路由/只读统计

## 剩余未修项

### 1. `publicUrl` 在当前本地 MinIO 环境下仍然返回 403

- 现象：预签名 PUT 成功后，直接 GET 返回的 `publicUrl`，当前环境得到 `403`
- 判断：这更像对象存储暴露策略 / bucket policy 问题，不是本次签名修复本身的问题；现有 `uploadFile()` 也沿用同样的公开 URL 口径
- 处理：本轮未改接口契约，也未把返回值切成 signed GET URL，避免超 scope

### 2. 多 active binding 的 desktop，列表里的 `hasUploadedAvatar/avatarProgress` 仍然按代表宠物口径返回

- 现状：`imageStatus` / `species` 过滤已经对 desktop 的全部 active bindings 做 `EXISTS`，但列表行上的 `hasUploadedAvatar` 和 `avatarProgress` 仍来自代表宠物
- 风险：极端情况下，过滤命中和列表展示字段可能出现口径差异
- 原因：需求没有明确定义“多宠物 desktop 的进度字段应按代表宠物、按并集还是按最大值聚合”
- 处理：本轮未擅自重定义该字段语义，建议下一轮先补清口径再改 SQL

## 本轮验证

- `pnpm --filter server typecheck`
- 重启 server 后验证 `/api/admin/uploads/presign`
- 验证错误 `Content-Type` 上传 `403`、正确 `Content-Type` 上传 `200`
- 验证重复 `benefits.key` 的 membership PUT 返回 `400`
- 验证 `/api/admin/customization/tasks?pageSize=2` 正常返回
- 连续两次执行 `pnpm --filter server db:seed:demo`，确认 desktop binding 计数稳定
