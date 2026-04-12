# 宠物活动模式后端对接 + 蓝牙真实搜索

## 背景

小程序前端推进到 feat/backend-v2 分支，但两个关键功能未落地：

1. 宠物活动模式（系统自由 / 个性自定义 / 真实行为）只写 localStorage，不调后端，会议纪要明确要求「后台配置每个宠物在不同时间段的状态」。
2. 设备搜索 100% 使用硬编码 FALLBACK_DEVICES，没有调用任何 Taro 蓝牙 API。

后端 `pet-modes` 路由和 `devices/unowned|register|claim` 路由都已实现且有完整测试，差的是前端接入。

## 目标

- 前端 pet-mode 页面选择模式时，把 `mode` 写回后端，custom 页的时间段通过 schedules API 读写。
- 前端 collar-bind 页面切换为真实蓝牙扫描；开发环境仍保留现有假设备与交互，便于演示与开发。
- 后端测试覆盖完整生命周期（抽查已有 `pet-modes.test.ts` 已覆盖 GET/PUT mode、POST/PUT/DELETE schedules，无需新增）。

## 非目标

- 不改后端 API 协议、不动 DB schema。
- 不实现 custom 页完整时段编排 UI（保留现有极简结构，对接 API 即可，不新增复杂交互）。
- 不处理 data 页 mock 数据、profile 额度、主题持久化（后续再说）。
- 不补前端单测或 e2e（依赖 wx API，ROI 低）。

## 关键决策

- **D-01 模式持久化写回后端**：pet-mode 页 `handleConfirm` 在 free/real 分支必须调 `PUT /api/pets/:id/mode`，成功后再本地缓存作为离线回退。进入页面时 `GET /api/pets/:id/mode` 拉取服务端值并覆盖 localStorage。
  - 原因：会议纪要要求后台统一配置宠物时间段。localStorage 只作为离线 fallback，不再作为真值。

- **D-02 custom 页对接 schedules API**：进入 custom 页先 `PUT /api/pets/:id/mode { mode: "custom" }`（后端 schedules 仅在 custom 模式下可写），再 `GET /api/pets/:id/mode/schedules` 拉取，添加时段调 `POST /api/pets/:id/mode/schedules`。
  - 原因：后端 `ensureCustomModeEditable` 要求当前模式必须为 custom。
  - 字段映射：前端 `{start, end, action}` → 后端 `{startTime, endTime, actionType}`。删除保留现有 UI 行为即可，暂不必新增删除交互（会议纪要也说个性自定义 UI 后续细化）。

- **D-03 蓝牙开发者模式使用 process.env.NODE_ENV**：`process.env.NODE_ENV === "development"` 时显示 FALLBACK_DEVICES 并挂 MockBadge；生产构建不渲染假设备。
  - 原因：Taro dev 命令默认 NODE_ENV=development，production 构建自动切换，用户无感知，零运行时开关暴露风险。
  - 编译期定义：Taro 自动注入 process.env.NODE_ENV，无需额外配置。

- **D-04 真实蓝牙不做 name/service 过滤**：`startBluetoothDevicesDiscovery` 不传 services，`onBluetoothDeviceFound` 回调里展示所有扫描结果（名称、mac、signal）。
  - 原因：用户选择。真实硬件广播特征尚未确定，过滤容易漏设备；开发阶段全量展示更安全。
  - 后续硬件量产时再切到前缀/services 过滤。

- **D-05 蓝牙发现的设备暂不走后端注册**：真实扫描到的设备，用户点「连接」后仍跳 wifi-config 页，后端 register/claim 的时机留给 wifi-config 完成配网后处理（当前 collar-bind 对 fallback 设备的 register 逻辑仅用于 mock 流程保留）。
  - 原因：硬件 MAC 上报时机和协议未定。真实设备先不走 `/register`，避免无效数据污染 DB。
  - Mock 设备继续走原来的 fallback register/claim 逻辑，以便开发演示。

- **D-06 设备列表优先级**：开发环境下真实扫描结果与 mock 设备合并展示；生产环境仅真实扫描结果。后端 unowned 接口（已有设备数据库预录入场景）在两个环境都调用，作为已注册未绑定设备入口。
  - 原因：保留已有 unowned 流程，不破坏现有测试账号可见的预置设备。

- **D-07 蓝牙权限与兜底**：页面挂载时 `openBluetoothAdapter` 失败（未开蓝牙/未授权），提示用户并展示空态；dev 环境下失败仍然显示 mock 设备（加 MockBadge 标注）。
  - 原因：微信小程序强制需要用户开启蓝牙和定位，必须有明确错误反馈。
