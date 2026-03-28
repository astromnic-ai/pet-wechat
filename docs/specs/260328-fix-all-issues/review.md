# Code Review

## 已修复

1. `packages/app/src/utils/request.ts`
   - 修复 `uploadFile()` 将非 JSON 的 2xx 响应误判为成功的问题。
   - 现在上传服务返回 HTML / 空响应时会直接抛出错误，避免继续创建头像任务并传入无效 `sourceImageUrl`。

2. `packages/server/src/routes/stats.ts`
   - 将统计页 6 个相互独立的查询改为并发执行，减少接口串行等待时间。

## 审查结论

1. Bug
   - 已修复 1 个真实逻辑问题：上传成功响应解析失败时的误判成功。

2. 安全漏洞
   - 本次 diff 未发现新增注入、XSS 或敏感信息泄露问题。

3. 性能问题
   - 已修复 1 个性能问题：统计接口多次独立查询串行执行导致的额外延迟。
