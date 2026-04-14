# 反思报告

## 执行结果
- 发现 7 个问题
- 修复 4 个（`0831fb3 fix: allow clearing me avatar url`、`2259c88 fix: exclude future interaction stats`、`561f1d1 fix: align content version metadata`、`8cc2c1d fix: refresh profile data on page show`）
- 留 3 个未修（1 个无关改动、2 个后续 TODO）
- 核对结果：R-01..R-08 与 D-01..D-11 已逐条过；D-01、D-08、D-09 现状与文档一致，未发现新的阻塞性缺口
- 验证结果：`pnpm --filter server build` 通过；`pnpm --filter server test` 通过（113 pass）

## 发现清单
### [修] `PUT /api/me` 无法清空 `avatarUrl`
- 位置：`packages/server/src/routes/me.ts:30`
- 原因：`updateMeSchema` 允许 `avatarUrl: null`，但路由层用 `body.avatarUrl ?? existing.avatarUrl` 合并，导致显式传 `null` 时被旧值吞掉，和 R-02.2 的可更新语义不一致。
- 修复：`0831fb3`

### [修] 互动统计会把未来时间事件计入 today/week/month 与 buckets
- 位置：`packages/server/src/routes/pets.ts:161`
- 原因：`interaction-stats` 只校验 `>= startOfWindow`，没有限制 `<= now`。一旦设备时钟漂移或写入未来时间，R-01.1 / R-01.2 的累计窗口和 D-08 的桶统计都会被污染。
- 修复：`2259c88`

### [修] 内容页 `version` 不符合 D-04 约束
- 位置：`packages/server/src/utils/content.ts:42`
- 原因：实现原先把 `version` 返回成 git commit hash，但 D-04 明确要求 `version` 取 git mtime 或 frontmatter。当前改为 git 提交时间，失败时回退文件 `mtime`，和文档约束对齐。
- 修复：`561f1d1`

### [修] 用户信息页不会在返回页面时刷新最新绑定信息
- 位置：`packages/app/src/pages/profile/index.tsx:18`
- 原因：页面只在首次挂载时请求 `/api/me`，从“绑定手机 / 绑定邮箱”返回后不会重拉数据，导致 R-02.3 / R-07.5 的真实字段展示滞后。
- 修复：`8cc2c1d`

### [留] diff 中存在一处与本次 API 补齐无直接关系的改动
- 位置：`packages/server/src/utils/storage.ts:1`
- 原因：这个文件只做了重复 import 清理，不属于本次 user-end API 范围。它本身无行为变化，但属于“无关改动”。
- 修复：未修。反思阶段不回滚已有 diff，避免覆盖作者已提交的上下文。

### [TODO] 账号绑定测试矩阵明显不足
- 位置：`packages/server/src/__tests__/account.test.ts:12`
- 原因：当前只覆盖了 `bind-phone/send-code` happy path 和 `bind-email/verify` 的 happy path / wrong code。按需求与验收标准，还缺 `bind-phone/verify`、`bind-email/send-code`、`404`、`409` 等关键分支，尤其 D-09/R-07 的冲突语义尚未被测试锁住。
- 修复：未修。补齐这部分需要扩充整组 account route 测试用例，不适合和本次缺陷修复混在同一个小提交里。

### [TODO] 互动统计仍然把整只宠物的所有事件拉回内存后再聚合
- 位置：`packages/server/src/routes/pets.ts:302`
- 原因：虽然新增了 `interaction_events.pet_id + occurred_at` 索引，但当前实现仍是 `select occurred_at where pet_id = ?` 后在 Node 侧做 day/week/month 统计和 buckets 计算。数据量上来后，R-01 查询成本会随历史事件线性增长，索引价值没有被完全发挥。
- 修复：未修。需要改成数据库侧窗口聚合或至少带时间范围过滤的分段查询，属于后续性能优化项。
