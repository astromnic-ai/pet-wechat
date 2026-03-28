import { View, Text, Image, Input } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useMemo, useState } from "react";
import PageBack from "../../components/PageBack";
import "./index.scss";

function getWifiErrorMessage(error: unknown) {
  const message = String((error as { errMsg?: string; message?: string })?.errMsg ?? (error as { message?: string })?.message ?? "");

  if (/not supported|not implement/i.test(message)) {
    return "当前设备不支持自动获取 WiFi，请手动输入";
  }

  if (/(auth deny|auth denied|permission denied|system permission denied)/i.test(message)) {
    return "缺少 WiFi 权限，请手动输入";
  }

  if (/not init|not started|startwifi/i.test(message)) {
    return "无法自动读取当前 WiFi，请手动输入";
  }

  return "未能自动获取当前 WiFi，请手动输入";
}

export default function WifiConfig() {
  const router = useRouter();
  const deviceType = router.params.deviceType as "collar" | "desktop" | undefined;
  const deviceId = router.params.deviceId;
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [manualInput, setManualInput] = useState(false);
  const [detectingWifi, setDetectingWifi] = useState(false);

  const isDesktop = deviceType === "desktop";
  const pageTitle = isDesktop ? "桌面端网络配置" : "配置宠物项圈";
  const petImage = require("@/assets/images/Group 2.png");
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

  useDidShow(() => {
    let cancelled = false;

    const initWifi = async () => {
      setDetectingWifi(true);

      try {
        await Taro.startWifi();
        const connectedWifi = (await Taro.getConnectedWifi()) as {
          wifi?: {
            SSID?: string;
            ssid?: string;
          };
        };
        const connectedSsid =
          connectedWifi.wifi?.SSID ??
          connectedWifi.wifi?.ssid ??
          "";

        if (cancelled) return;

        if (connectedSsid) {
          setSsid(connectedSsid);
          setManualInput(false);
          return;
        }

        setSsid("");
        setManualInput(true);
        Taro.showToast({ title: "未获取到当前 WiFi，请手动输入", icon: "none" });
      } catch (error) {
        if (cancelled) return;

        setSsid("");
        setManualInput(true);
        Taro.showToast({ title: getWifiErrorMessage(error), icon: "none" });
      } finally {
        if (!cancelled) {
          setDetectingWifi(false);
        }
      }
    };

    void initWifi();

    return () => {
      cancelled = true;
    };
  });

  const handleConfigure = async () => {
    if (loading) return;
    if (!ssid.trim()) {
      Taro.showToast({ title: "请输入网络名称", icon: "none" });
      return;
    }

    setLoading(true);
    Taro.showLoading({ title: "配置中..." });

    try {
      if (!deviceId) {
        throw new Error("missing device id");
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
      <PageBack />
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
          {manualInput ? (
            <Input
              className="selected-network-name"
              placeholder="输入 WiFi 名称"
              value={ssid}
              onInput={(e) => setSsid(e.detail.value)}
              onConfirm={handleConfigure}
            />
          ) : (
            <Text className="selected-network-name">
              {ssid || (detectingWifi ? "正在获取当前 WiFi..." : "当前 WiFi 未知")}
            </Text>
          )}
          <Input
            className="password-input"
            password
            placeholder="输入密码"
            value={password}
            onInput={(e) => setPassword(e.detail.value)}
            onConfirm={handleConfigure}
          />
          <Text className="selected-network-tip">
            {loading
              ? "配置中..."
              : manualInput
                ? "输入网络名称和密码后点击此区域继续"
                : "输入密码后点击此区域继续"}
          </Text>
        </View>
      </View>

      <View className="progress-track">
        <View className="progress-fill progress-step-2" />
      </View>
    </View>
  );
}
