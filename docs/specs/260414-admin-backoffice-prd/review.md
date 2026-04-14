# 代码审查结论

## 已修复问题

1. `packages/server/src/routes/admin/stats.ts`
   - `/api/admin/stats/enhanced` 缺少宠物总数返回，导致管理后台首页“宠物总数”稳定显示为 `0`。
   - 已补充 `pets.total` 统计返回，和前端 `Dashboard` 的读取契约对齐。

2. `packages/server/src/routes/admin/avatars.ts`
   - 同一 `avatar` 可重复创建相同 `actionType`，会让定制中心 UI 只显示最后一个动作，数据库却累积重复记录。
   - 删除动作时没有限制到 `approved/processing`，且删除最后一个动作后不会把 `processing` 回退为 `approved`，会留下错误状态。
   - 已改为同动作类型覆盖更新；删除动作仅允许在可编辑状态执行；删空动作后自动回退到 `approved`。

3. `packages/server/src/routes/admin/users.ts`
   - 用户删除流程里解绑桌面设备使用了错误的 `= ANY(SELECT ...)` 写法，存在解绑 SQL 执行失败风险。
   - 已改为 `IN (SELECT ...)` 子查询，确保关联解绑语义正确。

4. `packages/server/src/db/schema.ts`
   - 日程表原实现缺少数据库级完整性保护：`behavior_schedule_blocks.schedule_id` 无外键，`start/end` 无 check，`behavior_schedules` 无“同物种同生效策略仅一个 active”约束。
   - 已补充外键级联删除、分钟范围 check、时间区间 check，以及激活态唯一索引。
   - 对应新增迁移：`packages/server/drizzle/0005_lonely_thor.sql`。

## 安全审查

1. 本轮改动中未发现新的 SQL 注入点。
2. 本轮改动中未发现新的前端 XSS 注入点。
3. 本轮改动中未发现新的敏感信息泄露点。

## 性能审查

1. 未发现新的接口级 N+1 查询问题。
2. 未发现新的前端内存泄漏点。
3. 已将管理后台页面切为路由懒加载，减少新增页面一次性进入首包。
4. `pnpm --filter admin build` 仍提示一个较大的 vendor chunk，这是当前打包层面的剩余风险，但不影响本次功能正确性。

## 验证结果

1. `pnpm db:generate`
   - 通过
   - 新生成：`packages/server/drizzle/0005_lonely_thor.sql`

2. `pnpm --filter admin build`
   - 通过
   - 仍有 Vite chunk size warning，但构建成功

3. `pnpm --filter server exec tsc -p tsconfig.json --noEmit`
   - 未通过
   - 当前仓库存在与本次修改无关的既有错误：
     - `src/__tests__/mock-db.ts(192,5): TS2322`
     - `src/utils/storage.ts(7-10): Duplicate identifier`
