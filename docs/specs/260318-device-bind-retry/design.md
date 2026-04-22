# 技术设计

## 架构概览

纯前端 bug 修复，不涉及后端或数据库变更。

## 根因分析

旧稿中的两类设备搜索入口在搜索完成后都会无条件进入下一步，导致按钮从「Mock 搜索设备」切换为「Mock 连接设备」。即使搜索结果为空，step 仍然是 2，用户无法重新触发搜索。

## 修复方案

在 `handleSearch` 中，根据 API 返回结果决定 step 值：
- 有设备：`setStep(2)`（进入设备选择）
- 无设备：`setStep(1)`（保持/恢复搜索状态）+ 显示提示 toast

同时保留 `devices` state 中的空数组，以便 UI 仍可展示"未发现可用设备"的提示文本（当 step === 2 时显示设备列表区域）。

**修正**：为了在无设备时既显示提示文字又保持搜索按钮，改用更简单的方案——不用 step 控制空状态提示，而是用独立的 `searched` flag：

最终方案：在 `handleSearch` 中，搜索结果为空时不将 step 设为 2，而是 toast 提示用户，保持 step=1 让用户可再次搜索。

## 需要修改的文件

1. `packages/app/src/pages/collar-bind/index.tsx` — 统一设备搜索逻辑

## 具体变更

```typescript
// 修改前
setDevices(collars); // or desktops
setStep(2);

// 修改后
setDevices(collars); // or desktops
if (collars.length > 0) { // or desktops.length > 0
  setStep(2);
} else {
  Taro.showToast({ title: "未发现可用设备，请先在后台创建", icon: "none" });
}
```

## 测试策略

- 手动测试：搜索无设备 → 按钮仍为「Mock 搜索设备」且可再次点击
- 手动测试：后台创建设备后重新搜索 → 正常显示设备列表
- 手动测试：桌面端绑定页面同上
