import { View, Text, Image, Input } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useMemo, useState } from "react";
import "./index.scss";

const NEARBY_NETWORKS = ["MyHomeWiFi", "YEHEY-LivingRoom", "TP-LINK_5G_802"];

export default function WifiConfig() {
  const router = useRouter();
  const deviceType = router.params.deviceType as "collar" | "desktop" | undefined;
  const deviceId = router.params.deviceId || "";
  const deviceName = decodeURIComponent(router.params.deviceName || "");
  const [ssid, setSsid] = useState("MyHomeWiFi");
  const [password, setPassword] = useState("12345678");
  const [loading, setLoading] = useState(false);

  const deviceImage = useMemo(
    () =>
      deviceType === "desktop"
        ? require("@/assets/images/desktop-icon.png")
        : require("@/assets/images/collar-icon.png"),
    [deviceType]
  );

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
      Taro.navigateTo({
        url: `/pages/bind-pet/index?deviceType=${deviceType || "collar"}&deviceId=${encodeURIComponent(deviceId)}&deviceName=${encodeURIComponent(deviceName || "YEHEY-Device-001")}`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="device-wifi-page">
      <View className="device-wifi-top-strip" />

      <View className="device-wifi-header">
        <View className="device-wifi-back" onClick={() => Taro.navigateBack({ fail: () => Taro.switchTab({ url: "/pages/index/index" }) })}>
          <Text className="device-wifi-back-text">‹</Text>
        </View>
        <Text className="device-wifi-title">搜索设备</Text>
      </View>

      <View className="device-wifi-content">
        <View className="device-wifi-device-card">
          <View className="device-wifi-device-icon-wrap">
            <Image className="device-wifi-device-icon" src={deviceImage} mode="aspectFit" />
          </View>
          <Text className="device-wifi-device-name">{deviceName || "YEHEY-Collar-001"}</Text>
          <View className="device-wifi-device-status">
            <Text className="device-wifi-device-status-dot">•</Text>
            <Text className="device-wifi-device-status-text">已连接</Text>
          </View>
        </View>

        <View className="wifi-panel">
          <Text className="wifi-panel-title">WiFi 设置</Text>

          <View className="wifi-network-block">
            <Text className="wifi-block-caption">可用网络</Text>
            <View className="wifi-network-list">
              {NEARBY_NETWORKS.map((item) => (
                <View
                  key={item}
                  className={`wifi-network-row ${ssid === item ? "wifi-network-row--active" : ""}`}
                  onClick={() => setSsid(item)}
                >
                  <Text className="wifi-network-row-text">{item}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="wifi-input-box wifi-input-box--highlight">
            <Text className="wifi-input-label">网络名称 (SSID)</Text>
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
          <Text className="wifi-hint-text">请确保设备已靠近手机，并连接 2.4G WiFi，输入完成后点击确认再进入下一步</Text>
        </View>

        <View className="wifi-submit-btn" onClick={handleConnectWifi}>
          <Text className="wifi-submit-btn-text">{loading ? "连接中..." : "连接网络"}</Text>
        </View>
      </View>
    </View>
  );
}
