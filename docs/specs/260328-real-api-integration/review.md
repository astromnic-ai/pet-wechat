# 代码审查结论

## Bug

- 已修复：`POST /api/devices/collars/register`、`POST /api/devices/desktops/register` 原实现是先查后插，存在并发竞态。两次并发注册同一 MAC 时，后一请求可能触发数据库唯一键异常并返回 500。现已改为 `onConflictDoNothing()` + 冲突后二次读取，返回幂等结果或 409。

- 已修复：`POST /api/devices/desktops/:id/bind` 会重复创建同一个桌面端与宠物的活跃绑定。用户重复点击或重试后会生成重复记录，设备页展示会出现重复绑定。现已在插入前检查未解绑的现有绑定，命中时直接返回已有记录。

## 安全

- 已修复：设置页的“采集对照”按钮会把 `/api/debug/collect-data` 的原始调试数据直接暴露给所有构建环境中的登录用户。现已限制为开发构建可见与可调用。

- 本轮未发现新的注入或 XSS 问题。新增接口的 MAC 与 `tz` 输入未直接拼接到不受控 SQL 中。

## 性能

- 已修复：`/api/debug/collect-data` 原实现按宠物逐个查询绑定、头像、行为，存在 N+1 查询。现已改为基于 `petIds` 的批量查询。

## 验证

- `pnpm --filter server test`
- `pnpm --filter server exec tsc --noEmit`
