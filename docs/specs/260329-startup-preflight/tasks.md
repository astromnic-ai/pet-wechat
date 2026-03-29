# 实施计划

- [x] 1. 修改 `storage.ts` 导出 `ensureBucket` 和 `BUCKET`
  - 将 `ensureBucket` 和 `BUCKET` 从内部变量改为具名导出
  - 不改变任何逻辑，仅修改可见性
  - _需求：需求 2_

- [x] 2. 新建 `preflight.ts` 预检模块
  - 实现 `withTimeout` 超时工具函数（10 秒）
  - 实现 `checkEnvVars()`：生产环境检查必要环境变量
  - 实现 `checkPostgres()`：执行 `SELECT 1` 验证数据库连通性
  - 实现 `checkMinio()`：调用 `ensureBucket()` 验证 MinIO 连通性
  - 实现 `checkMigrations()`：查询 `__drizzle_migrations` 表
  - 实现 `runPreflight()`：按顺序调用上述检查，失败抛异常
  - _需求：需求 1, 2, 3, 4, 5_

- [x] 3. 修改 `index.ts` 集成预检
  - 在 `export default` 前添加 `await runPreflight()` + try/catch
  - catch 块输出错误并 `process.exit(1)`
  - _需求：需求 5_
