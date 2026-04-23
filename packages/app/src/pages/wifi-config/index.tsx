import { View, Text, Image, Input } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useMemo, useState } from "react";
import { request } from "../../utils/request";
import type { CollarDevice, DesktopDevice } from "@pet-wechat/shared";
import "./index.scss";

type WifiState = "loading" | "ready" | "manual";
type DeviceType = "collar" | "desktop";

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

export default function WifiConfig() {
  const router = useRouter();
  const bleDeviceId = decodeURIComponent(router.params.bleDeviceId || "");
  const deviceName = decodeURIComponent(router.params.deviceName || "");
  const deviceType = ((router.params.deviceType as DeviceType | undefined) || inferDeviceType(deviceName)) as DeviceType;

  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [wifiState, setWifiState] = useState<WifiState>("loading");
  const [wifiHint, setWifiHint] = useState("正在读取当前连接的 WiFi…");

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

  const ensureDeviceRecord = async () => {
    if (deviceType === "desktop") {
      const existing = await request<{ desktops: Array<DesktopDevice & { bindings?: any[] }> }>({ url: "/api/devices/desktops" });
      const matched = existing.desktops.find((item) => item.macAddress === bleDeviceId);
      if (matched) return matched;

      const created = await request<{ desktop: DesktopDevice }>({
        url: "/api/devices/desktops",
        method: "POST",
        data: {
          name: displayDeviceName,
          macAddress: bleDeviceId,
        },
      });
      return created.desktop;
    }

    const existing = await request<{ collars: CollarDevice[] }>({ url: "/api/devices/collars" });
    const matched = existing.collars.find((item) => item.macAddress === bleDeviceId);
    if (matched) return matched;

    const created = await request<{ collar: CollarDevice }>({
      url: "/api/devices/collars",
      method: "POST",
      data: {
        name: displayDeviceName,
        macAddress: bleDeviceId,
      },
    });
    return created.collar;
  };

  const handleConnectWifi = async () => {
    if (!ssid.trim()) {
      Taro.showToast({ title: "请输入 WiFi 名称", icon: "none" });
      return;
    }

    if (!password.trim()) {
      Taro.showToast({ title: "请输入 WiFi 密码", icon: "none" });
      return;
    }

    setLoading(true);
    try {
      const device = await ensureDeviceRecord();

      Taro.navigateTo({
        url: `/pages/bind-pet/index?deviceType=${deviceType}&deviceId=${encodeURIComponent(device.id)}&deviceName=${encodeURIComponent(
          displayDeviceName
        )}`,
      });
    } catch (e: any) {
      Taro.showToast({ title: e.message || "连接网络失败", icon: "none" });
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
        <Text className="device-wifi-title">WiFi 配置</Text>
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
          <Text className="wifi-hint-text">请确保设备已靠近手机，且 WiFi 信号稳定。确认后进入下一步绑定宠物。</Text>
        </View>

        <View className="wifi-submit-btn" onClick={handleConnectWifi}>
          <Text className="wifi-submit-btn-text">{loading ? "处理中..." : "连接网络"}</Text>
        </View>
      </View>
    </View>
  );
}
