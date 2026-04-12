import { View, Text, Image } from "@tarojs/components";
import Taro, { useDidHide, useDidShow, useUnload } from "@tarojs/taro";
import { useMemo, useRef, useState } from "react";
import { request } from "../../utils/request";
import type { CollarDevice, DesktopDevice } from "@pet-wechat/shared";
import MockBadge from "../../components/MockBadge";
import { createBluetoothScanner, type BluetoothScanDevice } from "../../utils/bluetooth";
import { isDevBuild } from "../../utils/env";
import "./index.scss";

type SearchDevice = {
  id: string;
  name: string;
  macAddress?: string | null;
  signal?: number | null;
  deviceType: "collar" | "desktop";
  source: "mock" | "backend-unowned" | "bluetooth";
};

const FALLBACK_DEVICES: SearchDevice[] = [
  {
    id: "fallback-collar-001",
    name: "YEHEY-Collar-001",
    macAddress: "AA:BB:CC:DD:EE:21",
    signal: 88,
    deviceType: "collar",
    source: "mock",
  },
  {
    id: "fallback-desktop-001",
    name: "YEHEY-Table-X2",
    macAddress: "AA:BB:CC:DD:EE:31",
    signal: 64,
    deviceType: "desktop",
    source: "mock",
  },
];

const DEV_MODE = isDevBuild();

function getSignalLabel(signal?: number | null) {
  if (signal == null) return "RSSI --";
  return signal > 0 ? `RSSI ${signal}` : `RSSI ${signal} dBm`;
}

function getBluetoothDeviceType(device: BluetoothScanDevice): "collar" | "desktop" {
  return device.localName.includes("Collar") ? "collar" : "desktop";
}

function toBluetoothSearchDevice(device: BluetoothScanDevice): SearchDevice {
  return {
    id: device.id,
    name: device.name,
    macAddress: device.macAddress,
    signal: device.signal,
    deviceType: getBluetoothDeviceType(device),
    source: "bluetooth",
  };
}

function getLoadingKey(device: SearchDevice) {
  return `${device.source}:${device.id}`;
}

export default function CollarBind() {
  const [bluetoothDevices, setBluetoothDevices] = useState<SearchDevice[]>([]);
  const [backendDevices, setBackendDevices] = useState<SearchDevice[]>([]);
  const [loadingId, setLoadingId] = useState("");
  const [scanError, setScanError] = useState("");
  const scannerRef = useRef<ReturnType<typeof createBluetoothScanner> | null>(null);
  const loadIdRef = useRef(0);

  const cleanupScanner = () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;

    if (!scanner) return;
    void scanner.cleanup();
  };

  const loadBackendDevices = async (loadId: number) => {
    const [collarRes, desktopRes] = await Promise.all([
      request<{ collars: CollarDevice[] }>({ url: "/api/devices/collars/unowned" }).catch(() => ({ collars: [] })),
      request<{ desktops: DesktopDevice[] }>({ url: "/api/devices/desktops/unowned" }).catch(() => ({ desktops: [] })),
    ]);

    if (loadIdRef.current !== loadId) return;

    setBackendDevices([
      ...collarRes.collars.map((device) => ({
        id: device.id,
        name: device.name,
        macAddress: device.macAddress,
        signal: device.signal,
        deviceType: "collar" as const,
        source: "backend-unowned" as const,
      })),
      ...desktopRes.desktops.map((device) => ({
        id: device.id,
        name: device.name,
        macAddress: device.macAddress,
        signal: null,
        deviceType: "desktop" as const,
        source: "backend-unowned" as const,
      })),
    ]);
  };

  const startBluetoothScan = async (loadId: number) => {
    cleanupScanner();
    setBluetoothDevices([]);
    setScanError("");

    const scanner = createBluetoothScanner();
    scannerRef.current = scanner;

    try {
      await scanner.start((devices) => {
        if (loadIdRef.current !== loadId) return;
        setBluetoothDevices(devices.map(toBluetoothSearchDevice));
      });
    } catch (e: any) {
      await scanner.cleanup();
      if (scannerRef.current === scanner) {
        scannerRef.current = null;
      }

      if (loadIdRef.current !== loadId) return;

      const nextError = e.message || "请开启蓝牙";
      setScanError(nextError);
      setBluetoothDevices([]);
      Taro.showToast({ title: nextError, icon: "none" });
    }
  };

  useDidShow(() => {
    const loadId = loadIdRef.current + 1;
    loadIdRef.current = loadId;

    void loadBackendDevices(loadId);
    void startBluetoothScan(loadId);
  });

  useDidHide(() => {
    loadIdRef.current += 1;
    cleanupScanner();
  });

  useUnload(() => {
    loadIdRef.current += 1;
    cleanupScanner();
  });

  const visibleDevices = useMemo(
    () => [...bluetoothDevices, ...backendDevices, ...(DEV_MODE ? FALLBACK_DEVICES : [])],
    [bluetoothDevices, backendDevices]
  );

  const handleConnect = async (device: SearchDevice) => {
    if (loadingId) return;
    setLoadingId(getLoadingKey(device));

    try {
      if (device.source === "bluetooth") {
        Taro.navigateTo({
          url: `/pages/wifi-config/index?deviceType=${device.deviceType}&deviceId=${encodeURIComponent(device.macAddress || device.id)}&deviceName=${encodeURIComponent(device.name)}`,
        });
        return;
      }

      let nextDeviceId = device.id;
      let nextDeviceName = device.name;

      if (device.deviceType === "collar") {
        if (device.source === "mock") {
          const res = await request<{ collar: CollarDevice }>({
            url: "/api/devices/collars/register",
            method: "POST",
            data: {
              macAddress: device.macAddress?.replace(/:/g, "") || "AABBCCDDEE21",
              name: nextDeviceName,
            },
          });
          nextDeviceId = res.collar.id;
          nextDeviceName = res.collar.name;
        } else {
          const res = await request<{ collar: CollarDevice }>({
            url: `/api/devices/collars/${device.id}/claim`,
            method: "POST",
            data: { name: nextDeviceName },
          });
          nextDeviceId = res.collar.id;
          nextDeviceName = res.collar.name;
        }
      } else {
        if (device.source === "mock") {
          const res = await request<{ desktop: DesktopDevice }>({
            url: "/api/devices/desktops/register",
            method: "POST",
            data: {
              macAddress: device.macAddress?.replace(/:/g, "") || "AABBCCDDEE31",
              name: nextDeviceName,
            },
          });
          nextDeviceId = res.desktop.id;
          nextDeviceName = res.desktop.name;
        } else {
          const res = await request<{ desktop: DesktopDevice }>({
            url: `/api/devices/desktops/${device.id}/claim`,
            method: "POST",
            data: { name: nextDeviceName },
          });
          nextDeviceId = res.desktop.id;
          nextDeviceName = res.desktop.name;
        }
      }

      Taro.navigateTo({
        url: `/pages/wifi-config/index?deviceType=${device.deviceType}&deviceId=${encodeURIComponent(nextDeviceId)}&deviceName=${encodeURIComponent(nextDeviceName)}`,
      });
    } catch (e: any) {
      Taro.showToast({ title: e.message || "连接失败", icon: "none" });
    } finally {
      setLoadingId("");
    }
  };

  return (
    <View className="device-search-page">
      <View className="device-search-top-strip" />

      <View className="device-search-header">
        <View className="device-search-back" onClick={() => Taro.navigateBack({ fail: () => Taro.switchTab({ url: "/pages/index/index" }) })}>
          <Text className="device-search-back-text">‹</Text>
        </View>
        <Text className="device-search-title">搜索设备</Text>
      </View>

      <View className="device-search-content">
        {DEV_MODE ? (
          <View style={{ marginBottom: "20rpx" }}>
            <MockBadge text="开发 Mock 已开启" />
          </View>
        ) : null}

        <View className="step-outline-card">
          <Text className="step-outline-index">Step 1</Text>
          <View className="step-circle">
            <Image className="step-circle-image" src={require("@/assets/images/cat-dog-banner.png")} mode="aspectFit" />
          </View>
          <Text className="step-main-copy">确保桌面端/项圈插电</Text>
          <Text className="step-sub-copy">插电即可开启蓝牙</Text>
        </View>

        <View className="step-outline-card">
          <Text className="step-outline-index">Step 2</Text>
          <View className="step-circle">
            <Image className="step-circle-icon" src={require("@/assets/images/wifi-icon.png")} mode="aspectFit" />
          </View>
          <Text className="step-main-copy">{scanError ? "蓝牙暂不可用" : "正在搜索附近设备..."}</Text>
          <Text className="step-sub-copy">{scanError || "确保设备已开启蓝牙"}</Text>
        </View>

        <View className="nearby-device-list">
          {visibleDevices.map((device) => (
            <View
              key={`${device.source}-${device.id}`}
              className={`nearby-device-row ${loadingId === getLoadingKey(device) ? "nearby-device-row--active" : ""}`}
            >
              <View className="nearby-device-leading">
                <Image
                  className="nearby-device-leading-image"
                  src={device.deviceType === "desktop" ? require("@/assets/images/desktop-icon.png") : require("@/assets/images/collar-icon.png")}
                  mode="aspectFit"
                />
              </View>
              <View className="nearby-device-body">
                <Text className="nearby-device-name">{device.name}</Text>
                <Text className="nearby-device-meta">
                  {(device.macAddress || device.id) + " · " + getSignalLabel(device.signal)}
                </Text>
              </View>
              <View className="nearby-device-action" onClick={() => handleConnect(device)}>
                <Text className="nearby-device-action-text">{loadingId === getLoadingKey(device) ? "连接中" : "连接"}</Text>
              </View>
            </View>
          ))}
        </View>

        {visibleDevices.length === 0 ? (
          <View className="step-outline-card">
            <Text className="step-main-copy">暂未发现可用设备</Text>
            <Text className="step-sub-copy">{scanError || "请确认蓝牙已开启，并让设备靠近手机后重试"}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
