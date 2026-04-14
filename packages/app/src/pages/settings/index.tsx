import { View, Text, Switch } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import type { CollarDevice, DesktopDevice } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import { request } from "../../utils/request";
import "./index.scss";

const APP_VERSION = "1.0.0";
const STORAGE_KEYS = {
  sound: "settings:sound",
  message: "settings:message",
  theme: "settings:theme",
} as const;

export default function Settings() {
  const [soundEnabled, setSoundEnabled] = useState(() => Taro.getStorageSync(STORAGE_KEYS.sound) ?? true);
  const [messageEnabled, setMessageEnabled] = useState(() => Taro.getStorageSync(STORAGE_KEYS.message) ?? true);
  const [theme, setTheme] = useState<"light" | "dark" | "blue">(
    () => Taro.getStorageSync(STORAGE_KEYS.theme) || "light"
  );
  const [collars, setCollars] = useState<CollarDevice[]>([]);
  const [desktops, setDesktops] = useState<DesktopDevice[]>([]);

  useDidShow(() => {
    Taro.hideTabBar();
  });

  useEffect(() => {
    void Promise.all([
      request<{ collars: CollarDevice[] }>({ url: "/api/devices/collars" }).catch(() => ({ collars: [] })),
      request<{ desktops: DesktopDevice[] }>({ url: "/api/devices/desktops" }).catch(() => ({ desktops: [] })),
    ]).then(([collarRes, desktopRes]) => {
      setCollars(collarRes.collars);
      setDesktops(desktopRes.desktops);
    });
  }, []);

  useEffect(() => {
    Taro.setStorageSync(STORAGE_KEYS.sound, soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    Taro.setStorageSync(STORAGE_KEYS.message, messageEnabled);
  }, [messageEnabled]);

  useEffect(() => {
    Taro.setStorageSync(STORAGE_KEYS.theme, theme);
  }, [theme]);

  const openPage = (url: string) => Taro.navigateTo({ url });
  const firmwareText = useMemo(() => {
    const versions = [...collars, ...desktops]
      .map((item) => item.firmwareVersion?.trim())
      .filter(Boolean) as string[];

    if (versions.length === 0) return "连接设备后查看";
    return `当前固件 ${versions[0]}`;
  }, [collars, desktops]);

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
          <View className="theme-pill-group">
            <View className={`theme-pill ${theme === "light" ? "theme-pill--active" : ""}`} />
            <View className={`theme-pill ${theme === "dark" ? "theme-pill--active" : ""}`} />
            <View className={`theme-pill ${theme === "blue" ? "theme-pill--active" : ""}`} />
          </View>
        </View>

        <View className="setting-card setting-card--row">
          <Text className="setting-label">声音反馈</Text>
          <Switch checked={soundEnabled} color="#4aa4ff" onChange={(e) => setSoundEnabled(e.detail.value)} />
        </View>

        <View className="setting-card setting-card--row">
          <Text className="setting-label">消息通知</Text>
          <Switch checked={messageEnabled} color="#4aa4ff" onChange={(e) => setMessageEnabled(e.detail.value)} />
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

        <View className="firmware-card" onClick={() => Taro.showToast({ title: "固件更新即将开放", icon: "none" })}>
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
