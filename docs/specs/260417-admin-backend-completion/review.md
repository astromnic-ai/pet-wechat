# 设计审查结论

本次审查只做防御性修正，没有扩 scope、没有引入新功能。`design.md` 已按下面结论直接修改。

## 问题清单

### P0

1. `GET /admin/devices` 原方案“先 `UNION ALL`，再外层 JOIN 聚合”会把 desktop 多绑定、pet 多 avatar 的行数放大，导致 `items` 去重困难、`total` 失真、分页不稳定。这个不是优化问题，是结果正确性问题。
2. 预签名 PUT 原方案把白名单写成泛化的 `image/*`，同时没把“前端 PUT 必须显式带同一 `Content-Type`”写死。这样要么白名单约束不成立，要么线上会出现签名不匹配。

### P1

3. `avatarProgress` 如果在 devices 列表里按行跑多个相关子查询，不会形成经典 N+1 HTTP/DB 往返，但会退化成 SQL 级“每行反复算一遍”的慢查询。必须先按 `pet_id` 预聚合。
4. `customization/tasks` 的 `categoryStatus` 和 `category` 语义原先不自洽。特别是 `personalized > 0 && base = 0` 的数据会落入灰区，`category=base` 还会把已进入 personalized 阶段的任务错误排除。
5. `/avatar-review/stats` 里的 `EXISTS (SELECT ... UNION ALL SELECT ...)` 在 PostgreSQL 里可以跑，但写法晦涩，后续改成 Drizzle/sql 模板很难维护。这里没有必要耍花活，直接两个 `EXISTS ... OR EXISTS ...`。
6. seed 脚本“可重复执行”的删除策略原先只写 `nickname LIKE '@seed-demo%'`，风险有两个：
   - 误伤真实用户
   - 当前 schema 大量依赖应用层手动清理，不存在完整 FK 级联，单删 user 不够
7. 设备详情原方案拿 `collar.updatedAt` 推 `companionDays`，还发明了 `pet code`。前者没有数据依据，后者是需求外字段。

### P2

8. `memberships.benefits` 用 `jsonb` 本身没问题，但只能当“配置快照”存，不适合这轮拿来做查询维度。否则后面会同时踩业务校验、索引和迁移三类坑。
9. shared 类型和 server 里的 Drizzle inferred type 如果都拿来表示同一份 API 契约，会出现双源维护。shared 应该只承担接口 contract，Drizzle 类型留在 handler 内部。
10. 对现有 `routes/admin/devices.ts`、`routes/admin/avatars.ts` 的“无破坏性”假设基本成立，但前提是只新增 path / 只读统计，不去改老接口 payload。新旧前端切换期并发读没有双写风险。

## 修复摘要

`design.md` 已直接收紧为下面这版实现口径：

1. `memberships`
   - 保留 `user_id` 唯一约束和 `users -> memberships` 级联删除。
   - 明确 `benefits` 是 `jsonb` 整包替换，不做 patch merge，不做 JSON 子字段查询。
   - 明确不能把这一个级联误当成全库都具备 FK 级联。

2. `GET /admin/devices`
   - 改成“先按设备聚平成一行，再 `UNION ALL`”。
   - 明确 desktop 只选一个代表宠物做扁平字段展示，但 `species` / `imageStatus` 过滤必须对全部 active bindings 做 `EXISTS`。
   - 明确允许用 `db.execute(sql\`...\`)` 写 CTE，不强求 Drizzle builder。
   - 明确 `page` 查询和 `count` 查询分开执行，并补稳定二级排序。

3. 预签名 PUT URL
   - 白名单收紧为 `image/jpeg | image/png | image/webp`。
   - 明确 `expiresIn = 900`。
   - 明确 MinIO `forcePathStyle` 保留在 `S3Client` 即可，不需要额外 `signableHeaders`。
   - 明确前端 PUT 必须带和签名完全一致的 `Content-Type` header。

4. `customization/tasks`
   - 重新定义 `categoryStatus`，保证所有组合都能落类。
   - 把 `category` 解释成“关注哪一类动作”，不是“纯 base / 纯 personalized 的互斥筛选”。
   - `defaultPreviewUrl` 改为先读 `NULLIF(source_image_url, '')`，再 fallback action 图。

5. `/avatar-review/stats`
   - `syncedToDevices` 改成两个 `EXISTS ... OR EXISTS ...`。
   - 明确 `approvedTotal` 统计“已通过审核”的头像总数，包含 `approved / processing / done`。

6. shared vs server 类型
   - 明确 shared 是 API contract 单一来源。
   - Drizzle inferred type 只在 server 内部查询行映射时使用，不向 shared 外溢。

7. seed
   - 不再只用 `nickname LIKE` 识别数据。
   - 改成用更明确的 marker 字段定位 seed user。
   - 明确手工清理顺序：`pet_avatar_actions -> pet_avatars -> pet_behaviors -> bindings/device_authorizations/memberships -> devices -> pets -> users`。

8. 向后兼容
   - 明确老 `/collars`、`/desktops`、`/avatars` 行为不改。
   - 新增接口集中在新 path 和只读统计，避免切换期双写。

## 剩余待决项

1. `approvedTotal` 的展示文案需要和前端对齐。现在设计按“已通过审核总量”统计 `approved / processing / done`；如果前端字面上只想看当前 `status = 'approved'`，名称要一起调整，否则会误读。
2. `companionDays` 对项圈只能是近似值，因为 schema 没有绑定历史。若产品坚持要精确值，只能补新表或补事件记录，这超出本轮范围。
3. `keyword ILIKE '%xx%'` 仍然会扫表。admin 数据量如果很快上万，后续要单独评估 `pg_trgm`；这轮不建议顺手引入。
