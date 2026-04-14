import { View, Text, Switch } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import type { DeviceFirmwareStatus, UserSettings } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import { request } from "../../utils/request";
import {
  fetchUserSettings,
  getThemeLabel,
  readCachedUserSettings,
  saveUserSettings,
} from "../../utils/userSettings";
import "./index.scss";

const APP_VERSION = "1.0.0";

export default function Settings() {
  const [settings, setSettings] = useState<UserSettings>(() => readCachedUserSettings());
  const [firmwareDevices, setFirmwareDevices] = useState<DeviceFirmwareStatus[]>([]);

  const applySettings = async (patch: Partial<UserSettings>) => {
    const result = await saveUserSettings(patch);
    setSettings(result.settings);
    if (!result.persisted) {
      Taro.showToast({ title: "网络异常，已保存在本地", icon: "none" });
    }
  };

  useDidShow(() => {
    Taro.hideTabBar();
    void Promise.all([
      fetchUserSettings(),
      request<{ devices: DeviceFirmwareStatus[] }>({ url: "/api/devices/firmware/status" }).catch(
        () => ({ devices: [] as DeviceFirmwareStatus[] })
      ),
    ]).then(([settingsResult, firmwareResult]) => {
      setSettings(settingsResult.settings);
      setFirmwareDevices(firmwareResult.devices);
    });
  });

  const openPage = (url: string) => Taro.navigateTo({ url });
  const pendingFirmwareDevice = firmwareDevices.find((item) => item.upgradeStatus === "pending");
  const updatableFirmwareDevice = firmwareDevices.find((item) => item.hasUpdate);
  const firmwareText = pendingFirmwareDevice
    ? `${pendingFirmwareDevice.currentVersion || "--"} → ${pendingFirmwareDevice.latestVersion || "--"}`
    : updatableFirmwareDevice
    ? `${updatableFirmwareDevice.currentVersion || "--"} → ${updatableFirmwareDevice.latestVersion || "--"}`
    : firmwareDevices[0]?.currentVersion
    ? `当前固件 ${firmwareDevices[0].currentVersion}`
    : "连接设备后查看";

  const handleFirmwareAction = async () => {
    if (pendingFirmwareDevice) {
      Taro.showToast({ title: "升级请求已提交", icon: "none" });
      return;
    }
    if (!updatableFirmwareDevice) {
      Taro.showToast({ title: "当前已是最新版本", icon: "none" });
      return;
    }

    try {
      await request({
        url: `/api/devices/${updatableFirmwareDevice.deviceType}/${updatableFirmwareDevice.deviceId}/firmware/upgrade`,
        method: "POST",
      });
      Taro.showToast({ title: "升级请求已提交", icon: "success" });
      const firmwareResult = await request<{ devices: DeviceFirmwareStatus[] }>({
        url: "/api/devices/firmware/status",
      }).catch(() => ({ devices: [] as DeviceFirmwareStatus[] }));
      setFirmwareDevices(firmwareResult.devices);
    } catch (error: any) {
      Taro.showToast({ title: error.message || "升级失败", icon: "none" });
    }
  };

  return (
    <View className="settings-page">
      <View className="settings-top-strip" />

      <View className="settings-header">
        <PageBack inline />
        <Text className="settings-title">设置</Text>
      </View>

      <View className="settings-shell">
        <Text className="group-title">通用</Text>

        <View className="setting-card setting-card--arrow" onClick={() => openPage("/pages/settings/system")}>
          <Text className="setting-label">系统设置</Text>
          <View className="setting-arrow-wrap">
            <Text className="setting-arrow">→</Text>
          </View>
        </View>

        <View className="setting-card setting-card--row" onClick={() => openPage("/pages/settings/theme")}>
          <Text className="setting-label">主题模式</Text>
          <Text className="setting-value">{getThemeLabel(settings.theme)}</Text>
        </View>

        <View className="setting-card setting-card--row">
          <Text className="setting-label">声音反馈</Text>
          <Switch
            checked={settings.soundEnabled}
            color="#4aa4ff"
            onChange={(e) => {
              void applySettings({ soundEnabled: e.detail.value });
            }}
          />
        </View>

        <View className="setting-card setting-card--row">
          <Text className="setting-label">消息通知</Text>
          <Switch
            checked={settings.messageEnabled}
            color="#4aa4ff"
            onChange={(e) => {
              void applySettings({ messageEnabled: e.detail.value });
            }}
          />
        </View>

        <Text className="group-title group-title--support">支持</Text>

        <View className="setting-card setting-card--arrow" onClick={() => openPage("/pages/settings/help")}>
          <Text className="setting-label">帮助中心</Text>
          <View className="setting-arrow-wrap">
            <Text className="setting-arrow">→</Text>
          </View>
        </View>

        <View className="setting-card setting-card--arrow" onClick={() => openPage("/pages/settings/about")}>
          <Text className="setting-label">关于 YEHEY</Text>
          <View className="setting-arrow-wrap">
            <Text className="setting-arrow">→</Text>
          </View>
        </View>

        <Text className="group-title group-title--support">更新</Text>

        <View className="firmware-card" onClick={() => Taro.showToast({ title: "当前已是最新版本", icon: "none" })}>
          <View className="firmware-icon" />
          <View className="firmware-main">
            <Text className="firmware-title">版本更新</Text>
            <Text className="firmware-desc">当前版本 v{APP_VERSION}</Text>
          </View>
          <View className="firmware-arrow-wrap">
            <Text className="firmware-arrow">→</Text>
          </View>
        </View>

        <View className="firmware-card" onClick={() => void handleFirmwareAction()}>
          <View className="firmware-icon" />
          <View className="firmware-main">
            <Text className="firmware-title">固件更新</Text>
            <Text className="firmware-desc">{firmwareText}</Text>
          </View>
          <View className="firmware-arrow-wrap">
            <Text className="firmware-arrow">→</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
