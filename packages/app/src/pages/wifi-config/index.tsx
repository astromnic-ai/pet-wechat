import { View, Text, Image, Input } from "@tarojs/components";
import Taro, { useDidHide, useDidShow, useRouter, useUnload } from "@tarojs/taro";
import { useMemo, useRef, useState } from "react";
import { request } from "../../utils/request";
import type { CollarDevice, DesktopDevice } from "@pet-wechat/shared";
import StatusBar from "../../components/StatusBar";
import "./index.scss";

type WifiState = "loading" | "ready" | "manual";
type DeviceType = "collar" | "desktop";
type ReconfigureSuccess = {
  deviceName: string;
  deviceIdentity: string;
  ssid: string;
  signalText: string;
};
type WifiProvisionResult =
  | { status: "cloud_ok"; ip: string; rssi: number | null }
  | { status: "pending" };
type WifiStatusResponse = {
  state: number;
  reason: number;
  ip: string;
  rssi: number | null;
};
type DeviceOwnershipCheck = {
  canBind: boolean;
  claimStatus: "unknown" | "owned" | "available" | "occupied";
  message?: string | null;
};

const BLE_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const BLE_CONTROL_UUID = "1b9a473a-4493-4536-8b2b-9d4133488256";
const BLE_NOTIFY_UUID = "2a9b473a-4493-4536-8b2b-9d4133488257";
const BLE_FRAME_HEAD = 0xaa;
const BLE_CMD_WIFI_CONFIG = 0x01;
const BLE_CMD_DEVICE_INFO = 0x02;
const BLE_CMD_WIFI_STATUS = 0x03;
const BLE_RESP_FAIL = 0x00;
const BLE_RESP_SUCCESS = 0x01;
const BLE_RESP_STATUS = 0x02;
const BLE_WIFI_CONNECT_TIMEOUT_MS = 60000;
const BLE_WIFI_RESULT_GRACE_MS = 8000;
const BLE_WIFI_STATUS_POLL_MS = 1000;
const BLE_DEVICE_INFO_TIMEOUT_MS = 15000;
const BLE_DEVICE_INFO_RETRY_DELAYS_MS = [0, 3000, 8000];
const BLE_WIFI_SESSION_SEQ_STORAGE_KEY = "ble_wifi_session_seq";
let wifiSessionSeqFallback = Date.now() & 0xff;

const BLE_ERROR_TEXT: Record<number, string> = {
  1: "WiFi 名称不能为空",
  2: "设备拒绝了配网参数",
  3: "设备连接 WiFi 失败，请检查密码",
  4: "配网数据校验失败，请重试",
};

const BLE_WIFI_FAILURE_TEXT: Record<number, string> = {
  1: "WiFi 密码错误，请重新输入",
  2: "找不到该 WiFi，请确认是 2.4G 频段",
  3: "已连上路由器但获取地址失败，请重启路由器后重试",
  4: "已连上路由器，但无法访问服务器（该网络可能需要网页认证或没有外网）",
  5: "配网超时，请靠近设备重试",
  6: "设备连上了其它已保存的 WiFi，请重试",
};

const BLE_WIFI_PROGRESS_TEXT: Record<number, string> = {
  1: "正在连接 WiFi…",
  2: "已连接 WiFi，正在获取网络地址…",
  3: "已连上路由器，正在连接服务器…",
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

function buildWifiConfigFrame(ssid: string, password: string, sessionSeq: number) {
  const ssidBytes = encodeUtf8(ssid);
  const passwordBytes = encodeUtf8(password);
  if (ssidBytes.length === 0 || ssidBytes.length > 32) throw new Error("WiFi 名称需为 1-32 字节");
  if (passwordBytes.length > 64) throw new Error("WiFi 密码不能超过 64 字节");
  return buildBleFrame(BLE_CMD_WIFI_CONFIG, [
    ssidBytes.length,
    ...ssidBytes,
    passwordBytes.length,
    ...passwordBytes,
    sessionSeq,
  ]);
}

function parseWifiStatusResponse(buffer: ArrayBuffer, expectedSeq: number): WifiStatusResponse | null {
  const bytes = Array.from(new Uint8Array(buffer));
  if (bytes.length !== 14 || bytes[0] !== BLE_FRAME_HEAD) return null;
  const payloadLen = (bytes[1] << 8) | bytes[2];
  if (payloadLen !== 10 || bytes.length !== payloadLen + 4) return null;
  if (xor(bytes.slice(0, -1)) !== bytes[bytes.length - 1]) return null;
  if (bytes[3] !== BLE_RESP_STATUS || bytes[4] !== BLE_CMD_WIFI_STATUS || bytes[5] !== expectedSeq) return null;

  const state = bytes[6];
  const reason = bytes[7];
  const ip = state >= 0x02 ? bytes.slice(8, 12).join(".") : "";
  const rawRssi = bytes[12];
  const rssi = state >= 0x02 ? (rawRssi >= 0x80 ? rawRssi - 0x100 : rawRssi) : null;
  return { state, reason, ip, rssi };
}

function getWifiStatusHint(status: WifiStatusResponse) {
  if (status.state === 0x02) return "已连上路由器，正在连接服务器…";
  if (status.state === 0x01) return BLE_WIFI_PROGRESS_TEXT[status.reason] || "设备正在连接…";
  return "WiFi 信息已下发，等待设备联网…";
}

function getNextWifiSessionSeq() {
  try {
    const stored = Number(Taro.getStorageSync(BLE_WIFI_SESSION_SEQ_STORAGE_KEY));
    const current = Number.isInteger(stored) && stored >= 0 && stored <= 0xff ? stored : wifiSessionSeqFallback;
    const next = ((current + 1) & 0xff) || 1;
    Taro.setStorageSync(BLE_WIFI_SESSION_SEQ_STORAGE_KEY, next);
    wifiSessionSeqFallback = next;
    return next;
  } catch {
    wifiSessionSeqFallback = ((wifiSessionSeqFallback + 1) & 0xff) || 1;
    return wifiSessionSeqFallback;
  }
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

function showDeviceOccupiedModal(message = "该设备已被其他账号绑定，无法再次绑定") {
  Taro.showModal({
    title: "设备已绑定",
    content: message,
    showCancel: false,
    confirmText: "知道了",
  });
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
  const [showBandConfirmation, setShowBandConfirmation] = useState(false);
  const [reconfigureSuccess, setReconfigureSuccess] = useState<ReconfigureSuccess | null>(null);
  const [provisionPending, setProvisionPending] = useState(false);
  const [preflightChipId, setPreflightChipId] = useState("");
  const [deviceOccupiedMessage, setDeviceOccupiedMessage] = useState("");
  const ownershipCheckedRef = useRef(false);

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
    void checkDeviceOwnershipOnEntry();
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

  const checkDeviceOwnershipOnEntry = async () => {
    if (ownershipCheckedRef.current || !bleDeviceId) return;
    ownershipCheckedRef.current = true;

    try {
      await ensureBleConnection();
      const ids = await findBleCharacteristics();
      const chipId = await readChipIdByBle(ids);
      setPreflightChipId(chipId);

      const ownership = await request<DeviceOwnershipCheck>({
        url: "/api/devices/ownership/check",
        method: "POST",
        data: {
          deviceType,
          macAddress: bleDeviceId,
          chipId,
        },
      });

      if (!ownership.canBind) {
        const message = ownership.message || deviceTypeNameFromText(deviceType);
        setDeviceOccupiedMessage(message);
        setBleHint(message);
        showDeviceOccupiedModal(message);
      }
    } catch (error) {
      console.warn("[wifi-config] ownership preflight skipped", {
        message: error instanceof Error ? error.message : getBleErrorText(error),
      });
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

  const writeWifiConfigByBle = async (
    ids: { serviceId: string; controlId: string; notifyId: string },
    sessionSeq: number,
  ) => {
    const frame = buildWifiConfigFrame(ssid.trim(), password, sessionSeq);
    setBleHint("正在订阅设备配网结果…");

    return await new Promise<WifiProvisionResult>((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
      let pollTimer: ReturnType<typeof setInterval> | undefined;
      let pollInFlight = false;

      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        if (fallbackTimer) clearTimeout(fallbackTimer);
        if (pollTimer) clearInterval(pollTimer);
        if (typeof (Taro as any).offBLECharacteristicValueChange === "function") {
          (Taro as any).offBLECharacteristicValueChange(onNotify);
        }
      };

      const finish = (result?: WifiProvisionResult, error?: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve(result || { status: "pending" });
      };

      const onNotify = (res: any) => {
        if (res?.deviceId && res.deviceId !== bleDeviceId) return;
        const characteristicId = String(res?.characteristicId || "").toLowerCase();
        if (characteristicId && characteristicId !== String(ids.notifyId).toLowerCase()) return;

        const wifiStatus = parseWifiStatusResponse(res?.value, sessionSeq);
        if (wifiStatus) {
          console.log("[wifi-config] provision status", wifiStatus);
          if (wifiStatus.state === 0x03) {
            setBleHint("设备已连接服务器");
            finish({ status: "cloud_ok", ip: wifiStatus.ip, rssi: wifiStatus.rssi });
            return;
          }
          if (wifiStatus.state === 0x80) {
            finish(undefined, new Error(BLE_WIFI_FAILURE_TEXT[wifiStatus.reason] || `设备配网失败（错误码 ${wifiStatus.reason}）`));
            return;
          }
          setBleHint(getWifiStatusHint(wifiStatus));
          return;
        }

        const parsed = parseBleResponse(res?.value);
        if (!parsed) return;
        if (parsed.ok) {
          setBleHint("设备已接收配网信息，等待联网确认…");
          return;
        }
        finish(undefined, new Error(parsed.message));
      };

      const pollWifiStatus = async () => {
        if (settled || pollInFlight) return;
        pollInFlight = true;
        try {
          await (Taro as any).writeBLECharacteristicValue({
            deviceId: bleDeviceId,
            serviceId: ids.serviceId,
            characteristicId: ids.controlId,
            value: buildBleFrame(BLE_CMD_WIFI_STATUS, []),
          });
        } catch (error) {
          console.warn("[wifi-config] provision status poll failed", {
            message: getBleErrorText(error),
          });
          if (isBleDisconnectedError(error)) {
            setBleHint("蓝牙连接已断开，尚未确认设备联网状态…");
          }
        } finally {
          pollInFlight = false;
        }
      };

      (Taro as any).onBLECharacteristicValueChange(onNotify);

      timeout = setTimeout(() => {
        setBleHint("设备已收到 WiFi 信息，正在联网，稍后可在设备列表查看");
        finish({ status: "pending" });
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
            if (!settled) setBleHint("仍在等待设备联网…");
          }, BLE_WIFI_RESULT_GRACE_MS);
          pollTimer = setInterval(() => {
            void pollWifiStatus();
          }, BLE_WIFI_STATUS_POLL_MS);
          void pollWifiStatus();
        })
        .catch((error: unknown) => {
          finish(undefined, new Error(getBleErrorText(error)));
        });
    });
  };

  const sendWifiConfigByBle = async () => {
    if (!bleDeviceId) throw new Error("缺少蓝牙设备 ID，请返回重新搜索设备");

    await ensureBleConnection();
    const ids = await findBleCharacteristics();
    const chipId = preflightChipId || (await readChipIdByBle(ids));
    const provision = await writeWifiConfigByBle(ids, getNextWifiSessionSeq());
    return { chipId, provision };
  };

  const handleConnectWifi = async () => {
    if (loading) return;

    if (deviceOccupiedMessage) {
      showDeviceOccupiedModal(deviceOccupiedMessage);
      return;
    }

    if (!ssid.trim()) {
      Taro.showToast({ title: "请输入 WiFi 名称", icon: "none" });
      return;
    }

    if (!password.trim()) {
      Taro.showToast({ title: "请输入 WiFi 密码", icon: "none" });
      return;
    }

    setShowBandConfirmation(true);
  };

  const confirmConnectWifi = async () => {
    if (loading) return;

    setShowBandConfirmation(false);
    setLoading(true);
    setBleHint("准备下发 WiFi 信息…");
    try {
      const { chipId, provision } = await sendWifiConfigByBle();

      if (provision.status === "pending") {
        try {
          await ensureDeviceRecord(chipId);
        } catch (error) {
          console.warn("[wifi-config] register pending device skipped", {
            message: error instanceof Error ? error.message : String(error),
          });
        }
        setProvisionPending(true);
        return;
      }

      const device = await ensureDeviceRecord(chipId);

      if (mode === "reconfigure") {
        setReconfigureSuccess({
          deviceName: displayDeviceName,
          deviceIdentity: getShortDeviceIdentity(device.chipId || device.macAddress || device.id),
          ssid: ssid.trim(),
          signalText: provision.rssi === null ? "设备未上报" : `${provision.rssi} dBm`,
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
      <StatusBar className="device-wifi-top-strip" />

      <View className="device-wifi-header secondary-nav-row">
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
            <Text className="wifi-band-tip-title">仅支持 2.4G WiFi</Text>
            <Text className="wifi-band-tip-text">设备不支持 5G 网络，请先将手机连接到 2.4G WiFi 后再配网。</Text>
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

        <View className={`wifi-submit-btn ${loading || deviceOccupiedMessage ? "wifi-submit-btn--disabled" : ""}`} onClick={handleConnectWifi}>
          <Text className="wifi-submit-btn-text">
            {loading ? "处理中..." : deviceOccupiedMessage ? "设备已绑定" : mode === "reconfigure" ? "重新连接网络" : "连接网络"}
          </Text>
        </View>
      </View>

      {showBandConfirmation ? (
        <View className="wifi-band-confirm-overlay">
          <View className="wifi-band-confirm-modal">
            <View className="wifi-band-confirm-icon">
              <Text className="wifi-band-confirm-icon-text">2.4G</Text>
            </View>
            <Text className="wifi-band-confirm-title">确认 WiFi 频段</Text>
            <Text className="wifi-band-confirm-content">
              设备仅支持 2.4G WiFi，不支持 5G 网络。请确认手机当前连接的是 2.4G WiFi。
            </Text>
            <View className="wifi-band-confirm-actions">
              <View className="wifi-band-confirm-secondary" onClick={() => setShowBandConfirmation(false)}>
                <Text className="wifi-band-confirm-secondary-text">返回检查</Text>
              </View>
              <View className="wifi-band-confirm-primary" onClick={confirmConnectWifi}>
                <Text className="wifi-band-confirm-primary-text">确认继续</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {provisionPending ? (
        <View className="wifi-success-overlay">
          <View className="wifi-success-modal">
            <View className="wifi-band-confirm-icon">
              <Text className="wifi-band-confirm-icon-text">···</Text>
            </View>
            <Text className="wifi-success-title">设备仍在联网</Text>
            <Text className="wifi-success-subtitle">设备已收到 WiFi 信息，但尚未确认连接服务器。稍后可在设备列表查看。</Text>
            <View
              className="wifi-success-primary"
              onClick={() => {
                setProvisionPending(false);
                void confirmConnectWifi();
              }}
            >
              <Text className="wifi-success-primary-text">重试配网</Text>
            </View>
            <View
              className="wifi-success-secondary"
              onClick={() => {
                setProvisionPending(false);
                setBleHint("请修改 WiFi 名称或密码后重试");
              }}
            >
              <Text className="wifi-success-secondary-text">更换网络</Text>
            </View>
          </View>
        </View>
      ) : null}

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
