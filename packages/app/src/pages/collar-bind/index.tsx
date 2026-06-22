import { View, Text, Image, ScrollView } from "@tarojs/components";
import Taro, { useDidHide, useDidShow } from "@tarojs/taro";
import { useRef, useState } from "react";
import { request } from "../../utils/request";
import "./index.scss";

type DeviceType = "collar" | "desktop";

type BleDevice = {
  deviceId: string;
  name: string;
  localName?: string;
  RSSI?: number;
  isTarget?: boolean;
};

type DeviceOwnershipCheck = {
  canBind: boolean;
  claimStatus: "unknown" | "owned" | "available" | "occupied";
  message?: string | null;
};

function getRawDeviceName(device: any) {
  return device?.name?.trim() || device?.localName?.trim() || "";
}

function isTargetBleDevice(device: any) {
  const normalized = getRawDeviceName(device).toLowerCase();
  if (!normalized) return false;

  return (
    normalized.includes("yehey") ||
    normalized.includes("collar") ||
    normalized.includes("table") ||
    normalized.includes("desktop")
  );
}

function getDevicePriority(device: Pick<BleDevice, "name" | "localName">) {
  const normalized = `${device.name || ""} ${device.localName || ""}`.toLowerCase();

  if (normalized.includes("yehey")) return 0;
  if (normalized.includes("collar")) return 1;
  if (normalized.includes("table") || normalized.includes("desktop")) return 2;
  return 9;
}

function normalizeDevice(device: any): BleDevice | null {
  const deviceId = device?.deviceId || "";
  if (!deviceId) return null;

  const name = getRawDeviceName(device);
  const resolvedName = name || "未命名设备";

  return {
    deviceId,
    name: resolvedName,
    localName: device?.localName || "",
    RSSI: typeof device?.RSSI === "number" ? device.RSSI : undefined,
    isTarget: isTargetBleDevice(device),
  };
}

function getSignalText(rssi?: number) {
  if (typeof rssi !== "number") return "信号强度：未知";
  if (rssi >= -55) return "信号强度：强";
  if (rssi >= -72) return "信号强度：中";
  return "信号强度：弱";
}

function getBluetoothErrorMessage(error?: unknown) {
  const message = typeof error === "object" && error && "errMsg" in error ? String((error as any).errMsg) : "";

  if (message.includes("not available")) return "请先打开手机蓝牙";
  if (message.includes("not init")) return "蓝牙未初始化，请重试";
  if (message.includes("permission")) return "请允许蓝牙权限后重试";
  if (message.includes("10001")) return "请先打开手机蓝牙";
  if (message.includes("10003")) return "未找到可连接设备";
  if (message.includes("10012")) return "连接超时，请重试";
  return "蓝牙连接失败，请重试";
}

function isBluetoothPermissionOrAvailabilityError(error?: unknown) {
  const message = typeof error === "object" && error && "errMsg" in error ? String((error as any).errMsg) : "";

  return (
    message.includes("permission") ||
    message.includes("auth deny") ||
    message.includes("not available") ||
    message.includes("not init") ||
    message.includes("10001")
  );
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

async function closeBleConnectionQuietly(deviceId: string) {
  if (!deviceId) return;

  try {
    await (Taro as any).closeBLEConnection?.({ deviceId });
  } catch {}
}

function showDeviceOccupiedToast(message = "该设备已被其他账号绑定，无法再次绑定") {
  Taro.showToast({
    title: message,
    icon: "none",
    duration: 3000,
  });
}

export default function CollarBind() {
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [searching, setSearching] = useState(false);
  const [connectingId, setConnectingId] = useState("");
  const [searchMessage, setSearchMessage] = useState("正在搜索附近设备…");
  const [showAllDevices, setShowAllDevices] = useState(false);
  const discoveryHandlerRef = useRef<((res: any) => void) | null>(null);

  const mergeDevices = (incoming: any[]) => {
    setDevices((prev) => {
      const next = new Map(prev.map((item) => [item.deviceId, item]));

      incoming.forEach((raw) => {
        const device = normalizeDevice(raw);
        if (!device) return;

        const previous = next.get(device.deviceId);
        next.set(device.deviceId, {
          ...previous,
          ...device,
          name: device.name || previous?.name || "",
          isTarget: device.isTarget ?? previous?.isTarget ?? false,
        });
      });

      return Array.from(next.values()).sort((a, b) => {
        const targetWeight = Number(Boolean(b.isTarget)) - Number(Boolean(a.isTarget));
        if (targetWeight !== 0) return targetWeight;

        const priorityDiff = getDevicePriority(a) - getDevicePriority(b);
        if (priorityDiff !== 0) return priorityDiff;

        return (b.RSSI ?? -999) - (a.RSSI ?? -999);
      });
    });
  };

  const stopDiscovery = async () => {
    try {
      if (typeof (Taro as any).offBluetoothDeviceFound === "function" && discoveryHandlerRef.current) {
        (Taro as any).offBluetoothDeviceFound(discoveryHandlerRef.current);
      }
      discoveryHandlerRef.current = null;
      await (Taro as any).stopBluetoothDevicesDiscovery?.();
    } catch {}
  };

  const startDiscovery = async () => {
    await stopDiscovery();
    setDevices([]);
    setSearching(true);
    setSearchMessage("正在搜索附近设备…");
    setShowAllDevices(false);

    try {
      await (Taro as any).openBluetoothAdapter();
      await (Taro as any).startBluetoothDevicesDiscovery({
        allowDuplicatesKey: false,
      });

      const onFound = (result: any) => {
        const found = Array.isArray(result?.devices) ? result.devices : [];
        if (found.length > 0) {
          mergeDevices(found);
          const hasTarget = found.some((item) => isTargetBleDevice(item));
          setSearchMessage(hasTarget ? "已搜索到附近 YEHEY 设备，请点击连接" : "暂未识别到 YEHEY 设备，可查看全部设备排查");
        }
      };

      discoveryHandlerRef.current = onFound;
      if (typeof (Taro as any).onBluetoothDeviceFound === "function") {
        (Taro as any).onBluetoothDeviceFound(onFound);
      }

      const currentDevices = await (Taro as any).getBluetoothDevices?.();
      const existing = Array.isArray(currentDevices?.devices) ? currentDevices.devices : [];
      if (existing.length > 0) {
        mergeDevices(existing);
        const hasTarget = existing.some((item) => isTargetBleDevice(item));
        setSearchMessage(hasTarget ? "已搜索到附近 YEHEY 设备，请点击连接" : "暂未识别到 YEHEY 设备，可查看全部设备排查");
      }
    } catch (error) {
      setSearchMessage(getBluetoothErrorMessage(error));
      Taro.showToast({ title: getBluetoothErrorMessage(error), icon: "none" });

      if (isBluetoothPermissionOrAvailabilityError(error)) {
        Taro.showModal({
          title: "需要蓝牙权限",
          content: "请在系统或微信设置中打开蓝牙权限，并确认手机蓝牙已开启后，再返回重新搜索设备。",
          confirmText: "去设置",
          success: (res) => {
            if (res.confirm) {
              void Taro.openSetting().catch(() => {
                Taro.showToast({ title: "请手动前往设置开启权限", icon: "none" });
              });
            }
          },
        });
      }
    } finally {
      setSearching(false);
    }
  };

  useDidShow(() => {
    void startDiscovery();
  });

  useDidHide(() => {
    void stopDiscovery();
  });

  const handleConnect = async (device: BleDevice) => {
    if (connectingId) return;

    const proceedConnect = async () => {
      const deviceType = inferDeviceType(device.name);
      setConnectingId(device.deviceId);
      try {
        const ownership = await request<DeviceOwnershipCheck>({
          url: "/api/devices/ownership/check",
          method: "POST",
          data: {
            deviceType,
            macAddress: device.deviceId,
          },
        }).catch(() => null);

        if (ownership && !ownership.canBind) {
          showDeviceOccupiedToast(ownership.message || undefined);
          return;
        }

        await closeBleConnectionQuietly(device.deviceId);
        await (Taro as any).createBLEConnection({ deviceId: device.deviceId, timeout: 12000 });
        await stopDiscovery();

        Taro.navigateTo({
          url: `/pages/wifi-config/index?deviceType=${deviceType}&bleDeviceId=${encodeURIComponent(
            device.deviceId
          )}&deviceName=${encodeURIComponent(device.name)}`,
        });
      } catch (error) {
        Taro.showToast({ title: getBluetoothErrorMessage(error), icon: "none" });
      } finally {
        setConnectingId("");
      }
    };

    if (!device.isTarget) {
      Taro.showModal({
        title: "这是未识别设备",
        content: "该设备名称不符合 YEHEY 规则，可能不是项圈或桌面端。是否仍继续连接排查？",
        confirmText: "继续连接",
        success: (res) => {
          if (res.confirm) {
            void proceedConnect();
          }
        },
      });
      return;
    }

    void proceedConnect();
  };

  const targetDevices = devices.filter((item) => item.isTarget);
  const visibleDevices = showAllDevices ? devices : targetDevices;
  const hasRawDevices = devices.length > 0;
  const hasOnlyNonTargetDevices = targetDevices.length === 0 && hasRawDevices;
  const renderDeviceType = (device: BleDevice) => inferDeviceType(device.name);

  const renderDeviceList = (list: BleDevice[]) =>
    list.map((item, index) => (
      <View key={item.deviceId} className={`nearby-device-row ${index === 0 ? "nearby-device-row--active" : ""}`}>
        <View className="nearby-device-leading">
          <Image
            className="nearby-device-leading-image"
            src={
              renderDeviceType(item) === "desktop"
                ? require("@/assets/images/desktop-icon.png")
                : require("@/assets/images/collar-icon.png")
            }
            mode="aspectFit"
          />
        </View>

        <View className="nearby-device-body">
          <Text className="nearby-device-name">{item.name}</Text>
          <Text className="nearby-device-meta">
            {getSignalText(item.RSSI)}
            {!item.isTarget ? " · 未识别设备" : ""}
          </Text>
        </View>

        <View className="nearby-device-action" onClick={() => handleConnect(item)}>
          <Text className="nearby-device-action-text">{connectingId === item.deviceId ? "连接中" : "连接"}</Text>
        </View>
      </View>
    ));

  return (
    <View className="device-search-page">
      <View className="device-search-top-strip" />

      <View className="device-search-header">
        <View
          className="device-search-back"
          onClick={() => Taro.navigateBack({ fail: () => Taro.switchTab({ url: "/pages/index/index" }) })}
        >
          <Text className="device-search-back-text">‹</Text>
        </View>
        <Text className="device-search-title">搜索设备</Text>
      </View>

      <ScrollView className="device-search-content" scrollY>
        <View className="step-outline-card">
          <Text className="step-outline-index">Step 1</Text>
          <View className="step-circle">
            <Image className="step-circle-image" src={require("@/assets/images/cat-dog-banner.png")} mode="aspectFit" />
          </View>
          <Text className="step-main-copy">确保桌面端/项圈插电</Text>
          <Text className="step-sub-copy">插电即可开启蓝牙广播</Text>
        </View>

        <View className="step-outline-card">
          <Text className="step-outline-index">Step 2</Text>
          <View className="step-circle">
            <Image className="step-circle-icon" src={require("@/assets/images/wifi-icon.png")} mode="aspectFit" />
          </View>
          <Text className="step-main-copy">{searching ? "正在搜索附近设备…" : "正在搜索附近设备"}</Text>
          <Text className="step-sub-copy">{searchMessage}</Text>
        </View>

        <View className="nearby-device-list">
          {visibleDevices.length > 0 ? (
            <>{renderDeviceList(visibleDevices)}</>
          ) : (
            <View className="nearby-device-empty">
              <Text className="nearby-device-empty-title">{searching ? "正在搜索…" : "暂未发现设备"}</Text>
              <Text className="nearby-device-empty-text">
                {hasOnlyNonTargetDevices
                  ? "已搜索到蓝牙设备，但没有识别出 YEHEY 设备。你可以查看全部设备继续排查。"
                  : "请确认 YEHEY 桌面端或项圈已上电，并靠近手机后重试"}
              </Text>
            </View>
          )}
        </View>

        {hasOnlyNonTargetDevices && !showAllDevices ? (
          <View className="scan-secondary-btn" onClick={() => setShowAllDevices(true)}>
            <Text className="scan-secondary-btn-text">查看全部蓝牙设备</Text>
          </View>
        ) : null}

        {showAllDevices ? (
          <View className="scan-secondary-btn scan-secondary-btn--light" onClick={() => setShowAllDevices(false)}>
            <Text className="scan-secondary-btn-text scan-secondary-btn-text--dark">只看 YEHEY 设备</Text>
          </View>
        ) : null}

        <View className="scan-primary-btn" onClick={startDiscovery}>
          <Text className="scan-primary-btn-text">{searching ? "搜索中..." : "重新搜索"}</Text>
        </View>
      </ScrollView>
    </View>
  );
}
