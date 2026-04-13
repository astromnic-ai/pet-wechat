import { View, Text, Switch } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import PageBack from "../../components/PageBack";
import "./index.scss";

export default function Settings() {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [messageEnabled, setMessageEnabled] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark" | "blue">("light");

  useDidShow(() => {
    Taro.hideTabBar();
  });

  const openPage = (url: string) => Taro.navigateTo({ url });

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
            <Text className="firmware-desc">当前版本 v2.1.0</Text>
          </View>
          <View className="firmware-arrow-wrap">
            <Text className="firmware-arrow">→</Text>
          </View>
        </View>

        <View className="firmware-card" onClick={() => Taro.showToast({ title: "固件更新即将开放", icon: "none" })}>
          <View className="firmware-icon" />
          <View className="firmware-main">
            <Text className="firmware-title">固件更新</Text>
            <Text className="firmware-desc">当前版本 v2.1.0</Text>
          </View>
          <View className="firmware-arrow-wrap">
            <Text className="firmware-arrow">→</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
