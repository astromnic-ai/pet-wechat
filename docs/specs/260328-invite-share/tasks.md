# 实施计划

- [x] 1. 创建 devices 和 invite 页面的分享配置文件
  - 新建 `packages/app/src/pages/devices/index.config.ts`，配置 `enableShareAppMessage: true`
  - 新建 `packages/app/src/pages/invite/index.config.ts`，配置 `enableShareAppMessage: true`
  - _需求：需求 1、2、3 的前置条件_

- [x] 2. 改造 devices 页面接入微信分享
  - 引入 `Button`（from `@tarojs/components`）和 `useShareAppMessage`（from `@tarojs/taro`）
  - 添加 `sharePetIdRef` 用于存储待分享的 petId
  - 添加 `useShareAppMessage` 回调：`res.from === "button"` 读 ref，`res.from === "menu"` 读 `selectedPet.id`；调用 `POST /api/devices/invite` 生成邀请码并返回分享卡片配置
  - 项圈卡片「分享授权」按钮：`<View>` → `<Button openType="share">`，onClick 设置 ref
  - 桌面端卡片 action === "share" 的按钮：`<View>` → `<Button openType="share">`，onClick 设置 ref
  - 修改 `handleAction` 签名移除 "share" 类型
  - _需求：需求 1、需求 2_

- [x] 3. 改造 invite 页面接入微信分享
  - 引入 `Button` 和 `useShareAppMessage`
  - 添加 `useShareAppMessage` 回调：检查 pet 已加载且无 code 参数时，调用 API 生成邀请码
  - `mode !== "pair"` 时：「一键连接」按钮 `<View>` → `<Button openType="share">`
  - `mode === "pair"` 时：保持现有 `<View>` + Toast 行为不变
  - 移除 `handleGenerateInvite` 函数（仅 invite 模式相关部分）
  - _需求：需求 3_

- [x] 4. CSS 按钮重置样式
  - `packages/app/src/pages/devices/index.scss`：为 `.action-btn` 和 `.desktop-action-chip` 添加按钮重置（margin: 0, border: none, line-height: normal, font-size: inherit, color: inherit, ::after display: none）
  - `packages/app/src/pages/invite/index.scss`：为 `.connect-button` 添加按钮重置
  - _需求：需求 1、2、3（视觉一致性）_
