import { View, Text, Image } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useState } from "react";
import { request } from "../../utils/request";
import type { CollarDevice, DesktopDevice } from "@pet-wechat/shared";
import "./index.scss";

type SearchDevice = {
  id: string;
  name: string;
  macAddress?: string | null;
  signal?: number | null;
  deviceType: "collar" | "desktop";
};

function getSignalLabel(signal?: number | null) {
  if (signal == null) return "信号强度：中";
  if (signal >= 80) return "信号强度：强";
  if (signal >= 60) return "信号强度：中";
  return "信号强度：弱";
}

export default function CollarBind() {
  const router = useRouter();
  const preferredDeviceType = (router.params.deviceType as "collar" | "desktop" | undefined) || "collar";
  const [devices, setDevices] = useState<SearchDevice[]>([]);
  const [loadingId, setLoadingId] = useState("");

  useDidShow(() => {
    void Promise.all([
      request<{ collars: CollarDevice[] }>({ url: "/api/devices/collars/unowned" }).catch(() => ({ collars: [] })),
      request<{ desktops: DesktopDevice[] }>({ url: "/api/devices/desktops/unowned" }).catch(() => ({ desktops: [] })),
    ])
      .then(([collarRes, desktopRes]) =>
        setDevices([
          ...collarRes.collars.map((device) => ({
            id: device.id,
            name: device.name,
            macAddress: device.macAddress,
            signal: device.signal,
            deviceType: "collar" as const,
          })),
          ...desktopRes.desktops.map((device) => ({
            id: device.id,
            name: device.name,
            macAddress: device.macAddress,
            signal: null,
            deviceType: "desktop" as const,
          })),
        ])
      )
      .catch(() => setDevices([]));
  });

  const visibleDevices = [...devices].sort((a, b) => {
    if (a.deviceType === b.deviceType) return 0;
    if (a.deviceType === preferredDeviceType) return -1;
    if (b.deviceType === preferredDeviceType) return 1;
    return 0;
  });

  const handleConnect = async (device: SearchDevice) => {
    if (loadingId) return;
    setLoadingId(device.id);

    try {
      let nextDeviceId = device.id;
      let nextDeviceName = device.name;

      if (device.deviceType === "collar") {
        const res = await request<{ collar: CollarDevice }>({
          url: `/api/devices/collars/${device.id}/claim`,
          method: "POST",
          data: { name: nextDeviceName },
        });
        nextDeviceId = res.collar.id;
        nextDeviceName = res.collar.name;
      } else {
        const res = await request<{ desktop: DesktopDevice }>({
          url: `/api/devices/desktops/${device.id}/claim`,
          method: "POST",
          data: { name: nextDeviceName },
        });
        nextDeviceId = res.desktop.id;
        nextDeviceName = res.desktop.name;
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
          <Text className="step-main-copy">正在搜索附近设备...</Text>
          <Text className="step-sub-copy">确保设备已开启蓝牙</Text>
        </View>

        {visibleDevices.length > 0 ? (
          <View className="nearby-device-list">
            {visibleDevices.map((device) => (
              <View key={device.id} className={`nearby-device-row ${loadingId === device.id ? "nearby-device-row--active" : ""}`}>
                <View className="nearby-device-leading">
                  <Image
                    className="nearby-device-leading-image"
                    src={device.deviceType === "desktop" ? require("@/assets/images/desktop-icon.png") : require("@/assets/images/collar-icon.png")}
                    mode="aspectFit"
                  />
                </View>
                <View className="nearby-device-body">
                  <Text className="nearby-device-name">{device.name}</Text>
                  <Text className="nearby-device-meta">{getSignalLabel(device.signal)}</Text>
                </View>
                <View className="nearby-device-action" onClick={() => handleConnect(device)}>
                  <Text className="nearby-device-action-text">{loadingId === device.id ? "连接中" : "连接"}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View className="nearby-device-empty">
            <Text className="nearby-device-empty-title">暂未搜索到设备</Text>
            <Text className="nearby-device-empty-text">请确认设备已插电并开启蓝牙后重试</Text>
          </View>
        )}
      </View>
    </View>
  );
}
