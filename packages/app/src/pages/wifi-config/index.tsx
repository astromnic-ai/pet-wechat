import { View, Text, Image, Input } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useMemo, useState } from "react";
import { request } from "../../utils/request";
import "./index.scss";

const DEFAULT_SSID = "TFTINGHUATONGFANG-WIFI";

export default function WifiConfig() {
  const router = useRouter();
  const deviceType = router.params.deviceType as "collar" | "desktop" | undefined;
  const deviceId = router.params.deviceId;
  const [ssid, setSsid] = useState(DEFAULT_SSID);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const isDesktop = deviceType === "desktop";
  const pageTitle = isDesktop ? "桌面端网络配置" : "配置宠物项圈";
  const petImage = isDesktop
    ? require("@/assets/images/Group 2.png")
    : require("@/assets/images/Group 1.png");
  const deviceImage = isDesktop
    ? require("@/assets/images/snow-globe.png")
    : require("@/assets/images/mirror-icon.png");

  const resultUrl = useMemo(() => {
    if (isDesktop && deviceId) {
      return `/pages/wifi-result/index?success=true&stage=config&deviceType=desktop&desktopId=${deviceId}`;
    }
    if (deviceId) {
      return `/pages/wifi-result/index?success=true&stage=config&deviceType=collar&collarId=${deviceId}`;
    }
    return "/pages/wifi-result/index?success=true&stage=config&deviceType=collar";
  }, [deviceId, isDesktop]);

  const handleConfigure = async () => {
    if (loading) return;
    if (!ssid) {
      Taro.showToast({ title: "请选择网络", icon: "none" });
      return;
    }

    setLoading(true);
    Taro.showLoading({ title: "配置中..." });

    try {
      if (!deviceId) {
        throw new Error("missing device id");
      }

      if (isDesktop) {
        await request({
          url: `/api/devices/desktops/${deviceId}/claim`,
          method: "POST",
          data: { name: "YEHEY Desktop", wifiSsid: ssid },
        });
      } else {
        await request({
          url: `/api/devices/collars/${deviceId}/claim`,
          method: "POST",
          data: { name: "YEHEY Collar", wifiSsid: ssid },
        });
      }

      Taro.navigateTo({ url: resultUrl });
    } catch {
      Taro.navigateTo({
        url: `/pages/wifi-result/index?success=false&stage=config&deviceType=${deviceType ?? "collar"}&deviceId=${deviceId ?? ""}`,
      });
    } finally {
      Taro.hideLoading();
      setLoading(false);
    }
  };

  return (
    <View className="wifi-guide-page">
      <Text className="brand">YEHEY</Text>
      <Image
        className="outline-image"
        src={require("@/assets/images/pet-outline.png")}
        mode="widthFix"
      />

      <View className="guide-card">
        <Text className="guide-title">{pageTitle}</Text>

        <View className="device-hero">
          <Image className="pet-icon" src={petImage} mode="aspectFit" />
          <Image
            className="link-icon"
            src={require("@/assets/images/link-icon.png")}
            mode="aspectFit"
          />
          <Image className="device-icon" src={deviceImage} mode="aspectFit" />
        </View>

        <View className="step-block">
          <Text className="step-title">Step 3：</Text>
          <Text className="step-text">点击设备配置设备WIFI网络 选择网络名称，输入密码即可</Text>
        </View>

        <View className="network-list-card">
          <Text className="network-list-title">附近网络</Text>
          <View className="network-placeholder" />
          <View className="network-placeholder" />
          <View className="network-placeholder" />
        </View>

        <View className="selected-network-card" onClick={handleConfigure}>
          <Text className="selected-network-name">{ssid}</Text>
          <Input
            className="password-input"
            password
            placeholder="输入密码"
            value={password}
            onInput={(e) => setPassword(e.detail.value)}
            onConfirm={handleConfigure}
          />
          <Text className="selected-network-tip">
            {loading ? "配置中..." : "输入密码后点击此区域继续"}
          </Text>
        </View>
      </View>

      <View className="progress-track">
        <View className="progress-fill progress-step-2" />
      </View>
    </View>
  );
}
