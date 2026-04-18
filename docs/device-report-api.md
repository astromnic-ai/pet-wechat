# 设备上报接口（硬件对接文档）

面向项圈 / 桌面端硬件开发者。提供两条接口：**周期心跳** 与 **事件上报**。

## 基础信息

- 基础地址：`https://pet-wechat.yangl.com.cn`
- Content-Type：`application/json`
- 鉴权：所有请求都需要带 HTTP 头 `X-Device-Secret: <共享密钥>`
  - 共享密钥由后端分配，线下交付，不要写进客户端代码仓库
  - 若密钥错误或缺失，返回 `401 Unauthorized`
  - 若服务端未配置密钥，返回 `503`（部署问题，联系后端）
- 所有时间字段一律使用 **ISO 8601 UTC**（如 `2026-04-18T06:11:00.051Z`）

## 设备注册前置条件

**设备必须先存在于系统中才能上报**。注册由小程序侧的配对流程完成：

- 项圈：用户在小程序"添加项圈"流程里通过 MAC 注册
- 桌面端：用户在小程序"绑定桌面端"流程里通过 MAC 注册并绑定宠物

未注册的 MAC 调接口会返回 `404 Device not registered`。硬件无法自己创建设备。

### MAC 地址格式

- 后端按 **12 位十六进制大写** 存储（示例：`AABBCC001122`）
- 接口可以接受带分隔符的写法（`AA:BB:CC:00:11:22`、`aa-bb-cc-00-11-22`），后端会归一化
- 非法格式（含非 hex 字符、长度错误）返回 `400`

---

## 1. 周期心跳

`POST /api/device-report/heartbeat`

**用途**：让后端知道设备还在线；上报当前电量、信号、固件版本等运行指标。

**建议频率**：每 3–5 分钟一次。

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `macAddress` | string | 是 | 设备 MAC，12 位 hex 或带分隔符 |
| `type` | `"collar"` \| `"desktop"` | 是 | 设备类型 |
| `status` | `"online"` \| `"offline"` \| `"pairing"` | 否 | 默认 `"online"` |
| `firmwareVersion` | string | 否 | 固件版本号，如 `"1.2.3"` |
| `battery` | integer 0–100 | 否 | **仅项圈**，电池百分比 |
| `signal` | integer -120–0 | 否 | **仅项圈**，蓝牙 RSSI，单位 dBm |

> 桌面端即便传了 `battery` / `signal` 也会被忽略。

### 响应

成功 `200`：
```json
{
  "success": true,
  "deviceId": "1c39425440ff4afb5e3c1e97",
  "type": "collar",
  "lastOnlineAt": "2026-04-18T06:11:00.051Z"
}
```

错误：
- `400` body 校验失败，返回 `details` 数组指出哪个字段
- `401` 密钥错误
- `404` `{"error":"Device not registered"}`

### curl 示例

```bash
curl -X POST https://pet-wechat.yangl.com.cn/api/device-report/heartbeat \
  -H "X-Device-Secret: <你的密钥>" \
  -H "Content-Type: application/json" \
  -d '{
    "macAddress": "AA:BB:CC:00:11:22",
    "type": "collar",
    "status": "online",
    "battery": 85,
    "signal": -52,
    "firmwareVersion": "1.2.3"
  }'
```

---

## 2. 事件上报

`POST /api/device-report/event`

**用途**：触发式上报。项圈上报宠物行为（如吃、睡），桌面端上报用户与宠物的交互（如摸、喂、点击）。

**建议频率**：按事件发生实时推送；如果离线缓存，批量回传可以按顺序多次调用（暂无批量接口）。

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `macAddress` | string | 是 | 设备 MAC |
| `type` | `"collar"` \| `"desktop"` | 是 | 设备类型 |
| `actionType` | string | 是 | 事件标识符，1–64 字符。建议 snake_case |
| `occurredAt` | ISO 8601 | 否 | 事件实际发生时间；不传则用服务器当前时间 |

### actionType 约定

**项圈**（写入 `pet_behaviors`，用于宠物行为追踪）—— 建议使用 shared 常量里已有的枚举：

- 基础：`sit` / `eat` / `sleep` / `lie` / `run` / `walk`
- 扩展：`play_ball` / `poop` / `watch_tv` / `chase_tail` / `scratch_air` / `dream` / `lick_paw` / `spin`

**桌面端**（写入 `interaction_events`，用于用户交互追踪）—— 暂不强制枚举，由硬件方与业务方约定。建议命名：

- `pet_touch` 用户摸宠物
- `feed` 喂食
- `play` 逗玩
- `talk` 说话 / 语音
- `call` 呼叫宠物
- `tap` 轻点 / 泛用
- `gift` 送道具
- `wake` 唤醒
- `camera_view` 打开摄像头

> 后端不做枚举校验（桌面端），但请和后端同步字符串约定，避免脏数据。

### 前置条件

- **项圈**：必须已绑定宠物（通过小程序绑定），否则 `400 Collar has no bound pet`
- **桌面端**：必须已绑用户并且至少有一个有效的宠物绑定，否则 `400 Desktop not bound to user or pet`
  - 若桌面端同时绑多只宠物，事件记在**最近绑定**的那只名下

### 响应

成功 `201`：
```json
{
  "success": true,
  "eventId": "abc123...",
  "occurredAt": "2026-04-18T06:11:00.051Z"
}
```

错误：
- `400` body 校验失败 / 设备未绑定
- `401` 密钥错误
- `404` 设备不存在

### curl 示例

项圈上报宠物吃东西：
```bash
curl -X POST https://pet-wechat.yangl.com.cn/api/device-report/event \
  -H "X-Device-Secret: <你的密钥>" \
  -H "Content-Type: application/json" \
  -d '{
    "macAddress": "AA:BB:CC:00:11:22",
    "type": "collar",
    "actionType": "eat",
    "occurredAt": "2026-04-18T06:10:00Z"
  }'
```

桌面端上报用户摸宠物：
```bash
curl -X POST https://pet-wechat.yangl.com.cn/api/device-report/event \
  -H "X-Device-Secret: <你的密钥>" \
  -H "Content-Type: application/json" \
  -d '{
    "macAddress": "11:22:33:44:55:66",
    "type": "desktop",
    "actionType": "pet_touch"
  }'
```

---

## 错误码速查

| HTTP | 含义 | 常见原因 |
|------|------|---------|
| 200 / 201 | 成功 | — |
| 400 | 请求格式错 | mac 格式、字段缺失、设备未绑定 |
| 401 | 鉴权失败 | `X-Device-Secret` 缺失或错误 |
| 404 | 设备未注册 | MAC 没在系统里，需要先走小程序注册流程 |
| 500 | 服务端错误 | 联系后端 |
| 503 | 服务未配置 | 联系后端（密钥未下发）|

## 建议实践

- **幂等与重试**：心跳失败请指数退避重试（1s → 2s → 5s → 30s…），成功前保持离线缓存
- **时钟**：设备上报 `occurredAt` 请用 UTC ISO；若设备无法同步网络时间，心跳时可不传 `occurredAt`，让服务器打时间戳
- **字段最小化**：只传你有数据的字段；所有可选字段留空也能工作
- **密钥保护**：不要硬编码到客户端 APK / 固件；通过受控发布渠道注入
- **测试**：对接前请用一台测试 MAC 注册到测试账号，然后用 curl 跑一遍两个接口

## 联系

有问题找后端同学。任何新增字段或新 actionType 前先对齐。
