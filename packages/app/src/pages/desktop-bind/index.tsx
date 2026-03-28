import { View, Text, Image, Input, Button } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import { BASE_URL, clearToken, getToken } from "../../utils/request";
import type { DesktopDevice } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import "./index.scss";

declare const ENABLE_DEV_LOGIN: boolean

function normalizeMac(mac: string) {
  return mac.replace(/[:\-\s]/g, "").toUpperCase();
}

function extractMacAddress(raw: string) {
  const separatedMatch = raw.match(/([0-9a-f]{2}(?:[:\-\s]?[0-9a-f]{2}){5})/i)?.[1];
  const continuousMatch = raw.match(/([0-9a-f]{12})/i)?.[1];
  const matched = separatedMatch ?? continuousMatch;

  if (!matched) return null;

  const normalized = normalizeMac(matched);
  return /^[0-9A-F]{12}$/.test(normalized) ? normalized : null;
}

function isScanCancelled(error: unknown) {
  const message = String((error as { errMsg?: string; message?: string })?.errMsg ?? (error as { message?: string })?.message ?? "");
  return /cancel/i.test(message);
}

function isPermissionDenied(error: unknown) {
  const message = String((error as { errMsg?: string; message?: string })?.errMsg ?? (error as { message?: string })?.message ?? "");
  return /(auth deny|auth denied|permission denied|scope\.camera|camera)/i.test(message);
}

export default function DesktopBind() {
  const [device, setDevice] = useState<DesktopDevice | null>(null);
  const [loading, setLoading] = useState(false);
  const [macAddressInput, setMacAddressInput] = useState("");

  const registerDevice = async (macAddress: string) => {
    Taro.showLoading({ title: "绑定中..." });

    const token = getToken();
    const response = await Taro.request<{ desktop?: DesktopDevice; error?: string }>({
      url: `${BASE_URL}/api/devices/desktops/register`,
      method: "POST",
      data: { macAddress },
      header: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (response.statusCode === 401) {
      clearToken();
      Taro.redirectTo({ url: "/pages/login/index" });
      return;
    }

    if (response.statusCode === 409) {
      Taro.showToast({ title: "设备已被他人绑定", icon: "none" });
      return;
    }

    if (response.statusCode >= 400 || !response.data.desktop) {
      throw new Error(response.data.error ?? `服务器错误 (${response.statusCode})`);
    }

    setDevice(response.data.desktop);
    setMacAddressInput(response.data.desktop.macAddress ?? macAddress);
    Taro.showToast({ title: "设备绑定成功", icon: "success" });
  };

  const handleScan = async () => {
    if (loading) return;

    setLoading(true);

    try {
      const scanResult = await Taro.scanCode({
        scanType: ["qrCode"],
      });

      const macAddress = extractMacAddress(scanResult.result ?? "");

      if (!macAddress) {
        Taro.showToast({ title: "二维码无效", icon: "none" });
        return;
      }

      await registerDevice(macAddress);
    } catch (error) {
      if (isScanCancelled(error)) {
        return;
      }

      if (isPermissionDenied(error)) {
        Taro.showToast({ title: "请开启相机权限", icon: "none" });
        return;
      }

      Taro.showToast({
        title: error instanceof Error ? error.message : "扫码绑定失败",
        icon: "none",
      });
    } finally {
      Taro.hideLoading();
      setLoading(false);
    }
  };

  const handleDevBind = async () => {
    if (loading) return;

    const macAddress = extractMacAddress(macAddressInput);
    if (!macAddress) {
      Taro.showToast({ title: "请输入有效 MAC 地址", icon: "none" });
      return;
    }

    setLoading(true);
    try {
      await registerDevice(macAddress);
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : "绑定失败",
        icon: "none",
      });
    } finally {
      Taro.hideLoading();
      setLoading(false);
    }
  };

  const handleConnect = () => {
    if (!device) return;

    Taro.navigateTo({
      url: `/pages/wifi-config/index?deviceType=desktop&deviceId=${device.id}`,
    });
  };

  return (
    <View className="desktop-guide-page">
      <PageBack />
      <Text className="brand">YEHEY</Text>
      <Image
        className="outline-image"
        src={require("@/assets/images/pet-outline.png")}
        mode="widthFix"
      />

      <View className="guide-card">
        <Text className="guide-title">蓝牙连接桌面端</Text>

        <View className="device-hero">
          <Image
            className="pet-device-icon pet-icon"
            src={require("@/assets/images/Group 2.png")}
            mode="aspectFit"
          />
          <Image
            className="pet-device-icon link-icon"
            src={require("@/assets/images/link-icon.png")}
            mode="aspectFit"
          />
          <Image
            className="pet-device-icon device-icon"
            src={require("@/assets/images/snow-globe.png")}
            mode="aspectFit"
          />
        </View>

        <View className="step-block">
          <Text className="step-title">Step 1：</Text>
          <Text className="step-text">使用磁吸充电电线给桌面端插电以后启动设备</Text>
          <View className="step-panel plug-panel">
            <Text className="plug-icon">⌁</Text>
          </View>
        </View>

        <View className="step-block">
          <Text className="step-title">Step 2：</Text>
          <Text className="step-text">
            {ENABLE_DEV_LOGIN ? "输入设备 MAC 地址完成绑定后进入网络配置" : "扫描设备二维码完成绑定后进入网络配置"}
          </Text>
          {ENABLE_DEV_LOGIN ? (
            <View className="step-panel dev-bind-panel">
              <Input
                className="dev-login-input"
                type="text"
                maxlength={17}
                placeholder="请输入设备 MAC 地址"
                value={macAddressInput}
                onInput={(e) => setMacAddressInput(e.detail.value)}
                onConfirm={device ? handleConnect : handleDevBind}
              />
              <Button
                className="dev-bind-button"
                loading={loading}
                disabled={loading}
                onClick={device ? handleConnect : handleDevBind}
              >
                {device ? "进入 WiFi 配置" : "绑定设备"}
              </Button>
              <Text className="panel-device-id">ID:{device?.macAddress ?? "--"}</Text>
            </View>
          ) : (
            <View
              className={`step-panel device-panel ${device ? "is-ready" : ""}`}
              onClick={device ? handleConnect : handleScan}
            >
              <Image
                className="panel-device-image desktop-panel-image"
                src={require("@/assets/images/snow-globe.png")}
                mode="aspectFit"
              />
              <Text className="panel-device-id">ID:{device?.macAddress ?? "--"}</Text>
              <Text className="panel-tip">
                {device ? "点击进入 WiFi 配置" : loading ? "扫码绑定中..." : "点击扫码绑定"}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View className="progress-track">
        <View className="progress-fill progress-step-1" />
      </View>
    </View>
  );
}
