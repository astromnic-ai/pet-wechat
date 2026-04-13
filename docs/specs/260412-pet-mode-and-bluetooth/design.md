# 设计文档

## 架构概览

两块前端改造，后端不动：

```
Task A: pet-mode 对接
  pet-mode/index.tsx  ── GET /mode → 本地 state
                      ── PUT /mode (free/real)
  pet-mode/custom.tsx ── PUT /mode {custom} → GET /mode/schedules → POST /mode/schedules
  utils/storage.ts    ── 保留作为离线 fallback（读取在 API 失败时兜底）

Task B: 蓝牙真实化 + dev mock 开关
  pages/collar-bind/index.tsx ── 真实 Taro 蓝牙 API 扫描 + 事件订阅
                             ── dev 环境合并 FALLBACK_DEVICES + MockBadge
  utils/bluetooth.ts (新)    ── 封装 openAdapter/start/stop/onFound 的封装与 cleanup
  utils/env.ts (新)          ── 暴露 isDevBuild() = NODE_ENV === 'development'
  components/MockBadge/     ── 已有组件，首次接入使用
```

## 文件清单

**新增（2）**
- `packages/app/src/utils/env.ts` — `export const isDevBuild = () => process.env.NODE_ENV === "development"`；一行 util，方便未来替换策略。
- `packages/app/src/utils/bluetooth.ts` — 封装蓝牙扫描生命周期（open → start → onFound 累积 → stop → close），提供 Promise 化接口与 cleanup。

**修改（3）**
- `packages/app/src/pages/pet-mode/index.tsx` — 用 `GET /api/pets/:id/mode` 覆盖 initialMode；`handleConfirm` free/real 分支调 `PUT /api/pets/:id/mode`；API 失败回退 localStorage。
- `packages/app/src/pages/pet-mode/custom.tsx` — 进入时 `PUT /api/pets/:id/mode {custom}` → `GET /api/pets/:id/mode/schedules` 作为真值；`handleAddSlot` 改为调 `POST /api/pets/:id/mode/schedules`，重新拉取刷新。字段转换 `{start,end,action} ↔ {startTime,endTime,actionType}`。
- `packages/app/src/pages/collar-bind/index.tsx` — 用 `bluetooth.ts` 做真实扫描；dev 环境把 FALLBACK_DEVICES 合进设备列表，并在页面显眼位置挂 MockBadge。真实设备不走 register/claim（直接跳 wifi-config 时把 macAddress 作为 deviceId 之一），mock 设备保留现有 register/claim 逻辑。

**无改动**
- 后端：`routes/pet-modes.ts`、`routes/devices.ts` 不动。
- 测试：`__tests__/pet-modes.test.ts` 已覆盖完整 CRUD，仅需跑一遍确认不回归。

## 关键数据流

### pet-mode/index

```
onShow:
  GET /api/pets/:id/mode
    ↓ { mode, schedules }
  setSelectedMode(mode), setPetActivityMode(petId, mode)   // 本地缓存
  fallback on error: 用 getPetActivityMode 已有值

onConfirm (free/real):
  PUT /api/pets/:id/mode { mode }
    ↓ ok
  setPetActivityMode(petId, mode) → showToast → navigateBack
  fallback on error: showToast('保存失败'), 不跳转
```

### pet-mode/custom

```
onShow:
  PUT /api/pets/:id/mode { mode: "custom" }
    ↓ ok
  GET /api/pets/:id/mode/schedules
    ↓ { schedules: [{ id, startTime, endTime, actionType, sortOrder }] }
  setSlots(schedules.map(toUiSlot))
  fallback: 使用 getPetModeSlots 本地值

onAddSlot:
  POST /api/pets/:id/mode/schedules
    body { startTime: "14:00", endTime: "16:00", actionType: "玩耍" }  // 默认值同现状
    ↓ { schedule }
  重新 GET 刷新列表；API 失败时 toast 不回写
```

**字段映射（utils/storage.ts 的 PetModeSlot 与后端 schedule）**
| UI | 后端 |
|---|---|
| start | startTime |
| end | endTime |
| action | actionType |
| — | id / sortOrder / source |

### collar-bind

```
onShow:
  if isDevBuild(): 展示 MockBadge
  scanner = createBluetoothScanner()
  try:
    await scanner.start()   // openAdapter → startDiscovery → onDeviceFound 累积
    listen 10s 后 stopDiscovery（UI 仍可继续渲染，用户点击"刷新"可重扫）
  catch:
    toast '请开启蓝牙'；dev 下继续显示 mock
  并行 GET /api/devices/collars/unowned 和 /api/devices/desktops/unowned → 合进列表

onUnload:
  scanner.cleanup()   // 防止内存泄露

onConnect(device):
  if device.source === 'mock': 原有 register/claim 逻辑
  if device.source === 'backend-unowned': 原有 claim 逻辑
  if device.source === 'bluetooth': 直接跳 wifi-config，带 mac
```

**SearchDevice 扩展字段**
```ts
type SearchDevice = {
  id: string;
  name: string;
  macAddress?: string | null;
  signal?: number | null;
  deviceType: "collar" | "desktop";
  source: "mock" | "backend-unowned" | "bluetooth";   // 新增，决定连接时走哪条路径
};
```

**deviceType 判定**：蓝牙扫描到的设备默认按 `name` 前缀粗判：`Collar` 子串 → collar，其他视为 desktop。前缀匹配不准确时用户可手动选择的 UX 后续再加。

## 验证策略

- 后端：`pnpm --filter server test` 确认 pet-modes.test.ts 绿。
- 前端：`pnpm --filter app typecheck`（如存在）与 build 通过即可；蓝牙交互人工在微信开发者工具验证。
- 端到端：dev 环境下选择 free/real/custom 各保存一次，刷新后拉取应一致；蓝牙页应显示 MockBadge + mock 设备，用户可点击进入 wifi-config。

## 风险 & 待办

- 真实蓝牙设备的 register/claim 时机尚未定（D-05）。这次不处理，留给 wifi-config 或硬件协议确定后补。文档里用 TODO 标注。
- custom 页目前没有删除/编辑 UI，已有的 UI 只能添加固定默认值的时段。完整交互留作会议纪要后续项。
