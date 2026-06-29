import { View, Text, Image, Input } from "@tarojs/components";
import Taro, { useDidHide, useDidShow, useRouter, useUnload } from "@tarojs/taro";
import { useMemo, useState } from "react";
import { request } from "../../utils/request";
import type { CollarDevice, DesktopDevice } from "@pet-wechat/shared";
import "./index.scss";

type WifiState = "loading" | "ready" | "manual";
type DeviceType = "collar" | "desktop";
type ReconfigureSuccess = {
  deviceName: string;
  deviceIdentity: string;
  ssid: string;
  signalText: string;
};

const BLE_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const BLE_CONTROL_UUID = "1b9a473a-4493-4536-8b2b-9d4133488256";
const BLE_NOTIFY_UUID = "2a9b473a-4493-4536-8b2b-9d4133488257";
const BLE_FRAME_HEAD = 0xaa;
const BLE_CMD_WIFI_CONFIG = 0x01;
const BLE_CMD_DEVICE_INFO = 0x02;
const BLE_RESP_FAIL = 0x00;
const BLE_RESP_SUCCESS = 0x01;
const BLE_WIFI_CONNECT_TIMEOUT_MS = 45000;
const BLE_WIFI_RESULT_GRACE_MS = 8000;
const BLE_DEVICE_INFO_TIMEOUT_MS = 15000;
const BLE_DEVICE_INFO_RETRY_DELAYS_MS = [0, 3000, 8000];

const BLE_ERROR_TEXT: Record<number, string> = {
  1: "WiFi 名称不能为空",
  2: "设备拒绝了配网参数",
  3: "设备连接 WiFi 失败，请检查密码",
  4: "配网数据校验失败，请重试",
};

function getWifiErrorText(error?: unknown) {
  const message = typeof error === "object" && error && "errMsg" in error ? String((error as any).errMsg) : "";
  if (message.includes("not init")) return "WiFi 模块未初始化";
  if (message.includes("system not support")) return "当前设备暂不支持读取 WiFi";
  if (message.includes("auth deny") || message.includes("permission")) return "请授权访问 WiFi 信息";
  return "未能自动读取当前 WiFi，请手动填写";
}

function inferDeviceType(name?: string): DeviceType {
  const normalized = (name || "").toLowerCase();
  if (
    normalized.includes("table") ||
    normalized.includes("desk") ||
    normalized.includes("house") ||
    normalized.includes("globe") ||
    normalized.includes("desktop")
  ) {
    return "desktop";
  }

  return "collar";
}

function getBleErrorText(error?: unknown) {
  const message = typeof error === "object" && error && "errMsg" in error ? String((error as any).errMsg) : "";
  if (message.includes("10006") || message.includes("no connection")) return "蓝牙连接已断开，请重新搜索设备";
  if (message.includes("10004") || message.includes("no service")) return "未找到设备配网服务，请确认固件版本";
  if (message.includes("10005") || message.includes("no characteristic")) return "未找到设备配网通道，请确认固件版本";
  if (message.includes("not init")) return "蓝牙未初始化，请返回重新连接设备";
  return message || "蓝牙配网失败，请重试";
}

function normalizeDeviceClaimErrorMessage(message?: string) {
  const text = message || "";
  if (
    text.includes("already registered to another user") ||
    text.includes("已被其他账号绑定")
  ) {
    return deviceTypeNameFromText(text);
  }
  return text || "连接网络失败";
}

function deviceTypeNameFromText(message: string) {
  if (message.toLowerCase().includes("collar") || message.includes("项圈")) {
    return "该项圈已被其他账号绑定，无法再次绑定";
  }
  if (message.toLowerCase().includes("desktop") || message.includes("桌面")) {
    return "该桌面摆台已被其他账号绑定，无法再次绑定";
  }
  return "该设备已被其他账号绑定，无法再次绑定";
}

function isBleDisconnectedError(error?: unknown) {
  const message =
    typeof error === "object" && error && "errMsg" in error
      ? String((error as any).errMsg).toLowerCase()
      : error instanceof Error
        ? error.message.toLowerCase()
        : "";
  return message.includes("10006") || message.includes("no connection") || message.includes("not connected");
}

function encodeUtf8(text: string) {
  const encoded = encodeURIComponent(text);
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i++) {
    const char = encoded[i];
    if (char === "%") {
      bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(char.charCodeAt(0));
    }
  }
  return bytes;
}

function xor(bytes: number[]) {
  return bytes.reduce((sum, item) => sum ^ item, 0) & 0xff;
}

function buildBleFrame(cmd: number, data: number[]) {
  const len = 1 + data.length;
  const bytes = [BLE_FRAME_HEAD, (len >> 8) & 0xff, len & 0xff, cmd, ...data];
  bytes.push(xor(bytes));
  return new Uint8Array(bytes).buffer;
}

function buildWifiConfigFrame(ssid: string, password: string) {
  const ssidBytes = encodeUtf8(ssid);
  const passwordBytes = encodeUtf8(password);
  if (ssidBytes.length === 0 || ssidBytes.length > 32) throw new Error("WiFi 名称需为 1-32 字节");
  if (passwordBytes.length > 64) throw new Error("WiFi 密码不能超过 64 字节");
  return buildBleFrame(BLE_CMD_WIFI_CONFIG, [ssidBytes.length, ...ssidBytes, passwordBytes.length, ...passwordBytes]);
}

function parseBleResponse(buffer: ArrayBuffer) {
  const bytes = Array.from(new Uint8Array(buffer));
  if (bytes.length < 5 || bytes[0] !== BLE_FRAME_HEAD) return null;
  const payloadLen = (bytes[1] << 8) | bytes[2];
  if (bytes.length !== payloadLen + 4) return null;
  if (xor(bytes.slice(0, -1)) !== bytes[bytes.length - 1]) return null;

  const status = bytes[3];
  const data = bytes.slice(4, -1);
  if (status === BLE_RESP_SUCCESS) {
    return { ok: true, message: data.length ? String.fromCharCode(...data) : "" };
  }
  if (status === BLE_RESP_FAIL) {
    const code = data[0] ?? 0;
    return { ok: false, message: BLE_ERROR_TEXT[code] || `设备配网失败（错误码 ${code}）` };
  }
  return null;
}

function normalizeChipId(value?: string) {
  const compact = (value || "").trim().replace(/[^a-fA-F0-9]/g, "").toLowerCase();
  return /^[a-f0-9]{12}$/.test(compact) ? compact : "";
}

function bytesToHex(bytes: number[]) {
  return bytes.map((item) => item.toString(16).padStart(2, "0")).join("");
}

function getShortDeviceIdentity(value?: string | null) {
  const compact = (value || "").trim();
  return compact ? compact.slice(-6).toUpperCase() : "------";
}

function extractChipIdFromDeviceInfo(buffer: ArrayBuffer) {
  const bytes = Array.from(new Uint8Array(buffer));
  if (bytes.length < 5 || bytes[0] !== BLE_FRAME_HEAD) return "";
  const payloadLen = (bytes[1] << 8) | bytes[2];
  if (bytes.length !== payloadLen + 4) return "";
  if (xor(bytes.slice(0, -1)) !== bytes[bytes.length - 1]) return "";
  if (bytes[3] !== BLE_RESP_SUCCESS) return "";
  const chipId = String.fromCharCode(...bytes.slice(4, bytes.length - 1));
  return normalizeChipId(chipId);
}

async function closeBleConnectionQuietly(deviceId: string) {
  if (!deviceId) return;

  try {
    await (Taro as any).closeBLEConnection?.({ deviceId });
  } catch {}
}

function removeBleListenersQuietly() {
  try {
    if (typeof (Taro as any).offBLECharacteristicValueChange === "function") {
      (Taro as any).offBLECharacteristicValueChange();
    }
  } catch {}

  try {
    if (typeof (Taro as any).offBLEConnectionStateChange === "function") {
      (Taro as any).offBLEConnectionStateChange();
    }
  } catch {}
}

export default function WifiConfig() {
  const router = useRouter();
  const bleDeviceId = decodeURIComponent(router.params.bleDeviceId || "");
  const deviceName = decodeURIComponent(router.params.deviceName || "");
  const deviceType = ((router.params.deviceType as DeviceType | undefined) || inferDeviceType(deviceName)) as DeviceType;
  const mode = router.params.mode === "reconfigure" ? "reconfigure" : "bind";

  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [bleHint, setBleHint] = useState("等待下发 WiFi 信息");
  const [wifiState, setWifiState] = useState<WifiState>("loading");
  const [wifiHint, setWifiHint] = useState("正在读取当前连接的 WiFi…");
  const [reconfigureSuccess, setReconfigureSuccess] = useState<ReconfigureSuccess | null>(null);

  const deviceImage = useMemo(
    () =>
      deviceType === "desktop"
        ? require("@/assets/images/desktop-icon.png")
        : require("@/assets/images/collar-icon.png"),
    [deviceType]
  );

  const displayDeviceName = deviceName || bleDeviceId || "待连接设备";

  useDidShow(() => {
    void initializeWifi();
  });

  const cleanupBleLifecycle = () => {
    removeBleListenersQuietly();
    void closeBleConnectionQuietly(bleDeviceId);
  };

  useDidHide(cleanupBleLifecycle);
  useUnload(cleanupBleLifecycle);

  const initializeWifi = async () => {
    setWifiState("loading");
    setWifiHint("正在读取当前连接的 WiFi…");

    try {
      await Taro.startWifi();
      const wifiRes = (await Taro.getConnectedWifi()) as any;
      const connectedSsid = wifiRes?.wifi?.SSID || "";

      if (connectedSsid) {
        setSsid(connectedSsid);
        setWifiState("ready");
        setWifiHint("已自动读取当前 WiFi，可直接输入密码继续");
        return;
      }

      setWifiState("manual");
      setWifiHint("未识别到当前 WiFi，请手动填写网络名称");
    } catch (error) {
      setWifiState("manual");
      setWifiHint(getWifiErrorText(error));
    }
  };

  const ensureDeviceRecord = async (chipId: string) => {
    if (deviceType === "desktop") {
      const existing = await request<{ desktops: Array<DesktopDevice & { bindings?: any[] }> }>({ url: "/api/devices/desktops" });
      const matched = existing.desktops.find((item) => item.chipId === chipId || item.macAddress === bleDeviceId);
      if (matched) return matched;

      const registered = await request<{ desktop: DesktopDevice }>({
        url: "/api/devices/desktops/register",
        method: "POST",
        data: {
          name: displayDeviceName,
          macAddress: bleDeviceId,
          chipId,
        },
      });
      return registered.desktop;
    }

    const existing = await request<{ collars: CollarDevice[] }>({ url: "/api/devices/collars" });
    const matched = existing.collars.find((item) => item.chipId === chipId || item.macAddress === bleDeviceId);
    if (matched) return matched;

    const registered = await request<{ collar: CollarDevice }>({
      url: "/api/devices/collars/register",
      method: "POST",
      data: {
        name: displayDeviceName,
        macAddress: bleDeviceId,
        chipId,
      },
    });
    return registered.collar;
  };

  const ensureBleConnection = async () => {
    if (!bleDeviceId) throw new Error("缺少蓝牙设备 ID，请返回重新搜索设备");

    setBleHint("正在确认蓝牙连接…");
    try {
      await (Taro as any).createBLEConnection({ deviceId: bleDeviceId, timeout: 12000 });
    } catch (error) {
      const message =
        typeof error === "object" && error && "errMsg" in error ? String((error as any).errMsg).toLowerCase() : "";
      if (!message.includes("already connect")) {
        throw new Error(getBleErrorText(error));
      }
    }
  };

  const findBleCharacteristics = async () => {
    let servicesRes: any;
    try {
      servicesRes = await (Taro as any).getBLEDeviceServices({ deviceId: bleDeviceId });
    } catch (error) {
      if (!isBleDisconnectedError(error)) throw error;
      await ensureBleConnection();
      servicesRes = await (Taro as any).getBLEDeviceServices({ deviceId: bleDeviceId });
    }

    const services = Array.isArray(servicesRes?.services) ? servicesRes.services : [];
    const service = services.find((item: any) => String(item.uuid || "").toLowerCase() === BLE_SERVICE_UUID);
    if (!service?.uuid) throw new Error("未找到设备配网服务，请确认设备处于配网模式");

    let characteristicsRes: any;
    try {
      characteristicsRes = await (Taro as any).getBLEDeviceCharacteristics({
        deviceId: bleDeviceId,
        serviceId: service.uuid,
      });
    } catch (error) {
      if (!isBleDisconnectedError(error)) throw error;
      await ensureBleConnection();
      characteristicsRes = await (Taro as any).getBLEDeviceCharacteristics({
        deviceId: bleDeviceId,
        serviceId: service.uuid,
      });
    }

    const characteristics = Array.isArray(characteristicsRes?.characteristics) ? characteristicsRes.characteristics : [];
    const control = characteristics.find((item: any) => String(item.uuid || "").toLowerCase() === BLE_CONTROL_UUID);
    const notify = characteristics.find((item: any) => String(item.uuid || "").toLowerCase() === BLE_NOTIFY_UUID);
    if (!control?.uuid) throw new Error("未找到设备写入通道，请确认固件版本");
    if (!notify?.uuid) throw new Error("未找到设备通知通道，请确认固件版本");

    return { serviceId: service.uuid, controlId: control.uuid, notifyId: notify.uuid };
  };

  const readChipIdByBle = async (ids: { serviceId: string; controlId: string; notifyId: string }) => {
    setBleHint("正在读取设备 Chip ID…");

    return await new Promise<string>((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const retryTimers: Array<ReturnType<typeof setTimeout>> = [];

      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        retryTimers.forEach((timer) => clearTimeout(timer));
        if (typeof (Taro as any).offBLECharacteristicValueChange === "function") {
          (Taro as any).offBLECharacteristicValueChange(onNotify);
        }
      };

      const finish = (chipId?: string, error?: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else if (chipId) resolve(chipId);
        else reject(new Error("未读取到设备 Chip ID，请确认固件支持 0x02 指令"));
      };

      const onNotify = (res: any) => {
        if (res?.deviceId && res.deviceId !== bleDeviceId) return;
        const characteristicId = String(res?.characteristicId || "").toLowerCase();

        const rawBytes = Array.from(new Uint8Array(res?.value || new ArrayBuffer(0)));
        const chipId = extractChipIdFromDeviceInfo(res?.value);
        console.log("[wifi-config] device info notify", {
          characteristicId,
          expectedNotifyId: String(ids.notifyId).toLowerCase(),
          raw: bytesToHex(rawBytes),
          chipId: chipId || null,
        });
        if (chipId) {
          setBleHint(`已读取设备 Chip ID：${chipId}`);
          finish(chipId);
        }
      };

      (Taro as any).onBLECharacteristicValueChange(onNotify);

      timeout = setTimeout(() => {
        console.warn("[wifi-config] device info timeout", {
          deviceId: bleDeviceId,
          serviceId: ids.serviceId,
          controlId: ids.controlId,
          notifyId: ids.notifyId,
        });
        finish(undefined, new Error("读取设备 Chip ID 超时，请重新搜索设备后再试"));
      }, BLE_DEVICE_INFO_TIMEOUT_MS);

      (Taro as any)
        .notifyBLECharacteristicValueChange({
          deviceId: bleDeviceId,
          serviceId: ids.serviceId,
          characteristicId: ids.notifyId,
          state: true,
        })
        .then(() => {
          console.log("[wifi-config] device info notify enabled", {
            deviceId: bleDeviceId,
            serviceId: ids.serviceId,
            controlId: ids.controlId,
            notifyId: ids.notifyId,
          })
          BLE_DEVICE_INFO_RETRY_DELAYS_MS.forEach((delayMs, index) => {
            const timer = setTimeout(() => {
              if (settled) return;
              console.log("[wifi-config] write device info command", { attempt: index + 1 });
              void (Taro as any)
                .writeBLECharacteristicValue({
                  deviceId: bleDeviceId,
                  serviceId: ids.serviceId,
                  characteristicId: ids.controlId,
                  value: buildBleFrame(BLE_CMD_DEVICE_INFO, []),
                })
                .catch((error: unknown) => {
                  console.warn("[wifi-config] write device info failed", {
                    attempt: index + 1,
                    message: getBleErrorText(error),
                  });
                  if (index === BLE_DEVICE_INFO_RETRY_DELAYS_MS.length - 1) {
                    finish(undefined, new Error(getBleErrorText(error)));
                  }
                });
            }, delayMs);
            retryTimers.push(timer);
          });
        })
        .catch((error: unknown) => {
          finish(undefined, new Error(getBleErrorText(error)));
        });
    });
  };

  const writeWifiConfigByBle = async (ids: { serviceId: string; controlId: string; notifyId: string }) => {
    const frame = buildWifiConfigFrame(ssid.trim(), password);
    setBleHint("正在订阅设备配网结果…");

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let writeStarted = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        if (fallbackTimer) clearTimeout(fallbackTimer);
        if (typeof (Taro as any).offBLECharacteristicValueChange === "function") {
          (Taro as any).offBLECharacteristicValueChange(onNotify);
        }
        if (typeof (Taro as any).offBLEConnectionStateChange === "function") {
          (Taro as any).offBLEConnectionStateChange(onConnectionChange);
        }
      };

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve();
      };

      const onNotify = (res: any) => {
        if (res?.deviceId && res.deviceId !== bleDeviceId) return;
        const characteristicId = String(res?.characteristicId || "").toLowerCase();
        if (characteristicId && characteristicId !== String(ids.notifyId).toLowerCase()) return;

        const parsed = parseBleResponse(res?.value);
        if (!parsed) return;
        if (parsed.ok) {
          setBleHint(parsed.message ? `设备已联网：${parsed.message}` : "设备已联网");
          finish();
          return;
        }
        finish(new Error(parsed.message));
      };

      const onConnectionChange = (res: any) => {
        if (res?.deviceId !== bleDeviceId || res?.connected || !writeStarted) return;
        // 当前设备固件在 WiFi 连接成功后会释放 BLE；失败路径会保留连接并 notify 错误。
        setBleHint("设备已接收 WiFi 信息并断开蓝牙");
        finish();
      };

      (Taro as any).onBLECharacteristicValueChange(onNotify);
      (Taro as any).onBLEConnectionStateChange(onConnectionChange);

      timeout = setTimeout(() => {
        finish(new Error("等待设备联网超时，请确认 WiFi 密码和设备距离"));
      }, BLE_WIFI_CONNECT_TIMEOUT_MS);

      (Taro as any)
        .notifyBLECharacteristicValueChange({
          deviceId: bleDeviceId,
          serviceId: ids.serviceId,
          characteristicId: ids.notifyId,
          state: true,
        })
        .then(() => {
          setBleHint("正在下发 WiFi 信息到设备…");
          writeStarted = true;
          return (Taro as any).writeBLECharacteristicValue({
            deviceId: bleDeviceId,
            serviceId: ids.serviceId,
            characteristicId: ids.controlId,
            value: frame,
          });
        })
        .then(() => {
          setBleHint("WiFi 信息已下发，等待设备联网…");
          fallbackTimer = setTimeout(() => {
            setBleHint("WiFi 信息已下发，继续完成设备绑定");
            finish();
          }, BLE_WIFI_RESULT_GRACE_MS);
        })
        .catch((error: unknown) => {
          finish(new Error(getBleErrorText(error)));
        });
    });
  };

  const sendWifiConfigByBle = async () => {
    if (!bleDeviceId) throw new Error("缺少蓝牙设备 ID，请返回重新搜索设备");

    await ensureBleConnection();
    const ids = await findBleCharacteristics();
    const chipId = await readChipIdByBle(ids);
    await writeWifiConfigByBle(ids);
    return chipId;
  };

  const handleConnectWifi = async () => {
    if (loading) return;

    if (!ssid.trim()) {
      Taro.showToast({ title: "请输入 WiFi 名称", icon: "none" });
      return;
    }

    if (!password.trim()) {
      Taro.showToast({ title: "请输入 WiFi 密码", icon: "none" });
      return;
    }

    setLoading(true);
    setBleHint("准备下发 WiFi 信息…");
    try {
      const chipId = await sendWifiConfigByBle();
      const device = await ensureDeviceRecord(chipId);

      if (mode === "reconfigure") {
        setReconfigureSuccess({
          deviceName: displayDeviceName,
          deviceIdentity: getShortDeviceIdentity(device.chipId || device.macAddress || device.id),
          ssid: ssid.trim(),
          signalText: "良好",
        });
        return;
      }

      Taro.navigateTo({
        url: `/pages/bind-pet/index?deviceType=${deviceType}&deviceId=${encodeURIComponent(device.id)}&deviceName=${encodeURIComponent(
          displayDeviceName
        )}`,
      });
    } catch (e: any) {
      const message = normalizeDeviceClaimErrorMessage(e.message);
      Taro.showToast({ title: message, icon: "none", duration: 3000 });
      setBleHint(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="device-wifi-page">
      <View className="device-wifi-top-strip" />

      <View className="device-wifi-header">
        <View
          className="device-wifi-back"
          onClick={() => Taro.navigateBack({ fail: () => Taro.switchTab({ url: "/pages/index/index" }) })}
        >
          <Text className="device-wifi-back-text">‹</Text>
        </View>
        <Text className="device-wifi-title">{mode === "reconfigure" ? "重新配网" : "WiFi 配置"}</Text>
      </View>

      <View className="device-wifi-content">
        <View className="device-wifi-device-card">
          <View className="device-wifi-device-icon-wrap">
            <Image className="device-wifi-device-icon" src={deviceImage} mode="aspectFit" />
          </View>
          <Text className="device-wifi-device-name">{displayDeviceName}</Text>
          <View className="device-wifi-device-status">
            <Text className="device-wifi-device-status-dot">•</Text>
            <Text className="device-wifi-device-status-text">蓝牙已连接</Text>
          </View>
        </View>

        <View className="wifi-panel">
          <Text className="wifi-panel-title">WiFi 设置</Text>

          <View className="wifi-status-card">
            <Text className={`wifi-status-tag wifi-status-tag--${wifiState}`}>
              {wifiState === "ready" ? "已自动识别" : wifiState === "loading" ? "读取中" : "手动填写"}
            </Text>
            <Text className="wifi-status-text">{wifiHint}</Text>
          </View>

          <View className="wifi-band-tip">
            <Text className="wifi-band-tip-text">请选择 2.4G 网络进行配网</Text>
          </View>

          <View className="wifi-input-box wifi-input-box--highlight">
            <Text className="wifi-input-label">WiFi 名称</Text>
            <Input
              className="wifi-input-value"
              value={ssid}
              placeholder="请输入网络名称"
              onInput={(e) => setSsid(e.detail.value)}
            />
          </View>

          <View className="wifi-input-box">
            <Text className="wifi-input-label">WiFi 密码</Text>
            <Input
              className="wifi-input-value"
              value={password}
              password
              placeholder="请输入 WiFi 密码"
              onInput={(e) => setPassword(e.detail.value)}
            />
          </View>
        </View>

        <View className="wifi-hint-panel">
          <Text className="wifi-hint-title">提示</Text>
          <Text className="wifi-hint-text">请确保设备已靠近手机，且 WiFi 信号稳定。确认后会通过蓝牙下发 WiFi 信息。</Text>
          <Text className="wifi-ble-status">{bleHint}</Text>
        </View>

        <View className={`wifi-submit-btn ${loading ? "wifi-submit-btn--disabled" : ""}`} onClick={handleConnectWifi}>
          <Text className="wifi-submit-btn-text">{loading ? "处理中..." : mode === "reconfigure" ? "重新连接网络" : "连接网络"}</Text>
        </View>
      </View>

      {reconfigureSuccess ? (
        <View className="wifi-success-overlay">
          <View className="wifi-success-modal">
            <View className="wifi-success-icon">
              <Text className="wifi-success-icon-text">✓</Text>
            </View>
            <Text className="wifi-success-title">配网成功</Text>
            <Text className="wifi-success-subtitle">设备已重新连接网络</Text>

            <View className="wifi-success-info">
              <View className="wifi-success-info-row">
                <Text className="wifi-success-info-label">设备</Text>
                <Text className="wifi-success-info-value">{reconfigureSuccess.deviceName}</Text>
              </View>
              <View className="wifi-success-info-row">
                <Text className="wifi-success-info-label">设备号</Text>
                <Text className="wifi-success-info-value">{reconfigureSuccess.deviceIdentity}</Text>
              </View>
              <View className="wifi-success-info-row">
                <Text className="wifi-success-info-label">WiFi</Text>
                <Text className="wifi-success-info-value">{reconfigureSuccess.ssid}</Text>
              </View>
              <View className="wifi-success-info-row">
                <Text className="wifi-success-info-label">信号强度</Text>
                <Text className="wifi-success-info-value wifi-success-info-value--ok">{reconfigureSuccess.signalText}</Text>
              </View>
            </View>

            <View className="wifi-success-primary" onClick={() => Taro.switchTab({ url: "/pages/index/index" })}>
              <Text className="wifi-success-primary-text">返回主页</Text>
            </View>
            <View className="wifi-success-secondary" onClick={() => Taro.switchTab({ url: "/pages/devices/index" })}>
              <Text className="wifi-success-secondary-text">查看设备详情</Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
