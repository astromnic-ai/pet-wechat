import { View, Text, Switch } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import PageBack from "../../components/PageBack";
import "./index.scss";

export default function Settings() {
  const [messageEnabled, setMessageEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);

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
          <Text className="setting-arrow">→</Text>
        </View>

        <View className="setting-card">
          <Text className="setting-label">消息通知</Text>
          <Switch
            checked={messageEnabled}
            color="#4aa4ff"
            onChange={(e) => setMessageEnabled(e.detail.value)}
          />
        </View>

        <View className="setting-card">
          <Text className="setting-label">深色模式</Text>
          <Switch
            checked={darkMode}
            color="#4aa4ff"
            onChange={(e) => setDarkMode(e.detail.value)}
          />
        </View>

        <View className="setting-card setting-card--arrow" onClick={() => openPage("/pages/settings/theme")}>
          <Text className="setting-label">主题模式</Text>
          <Text className="setting-arrow">→</Text>
        </View>

        <View className="setting-card setting-card--arrow" onClick={() => openPage("/pages/settings/system")}>
          <Text className="setting-label">语言</Text>
          <View className="setting-meta">
            <Text className="setting-value">简体中文</Text>
            <Text className="setting-arrow">→</Text>
          </View>
        </View>

        <View className="setting-card">
          <Text className="setting-label">震动反馈</Text>
          <Switch
            checked={vibrationEnabled}
            color="#4aa4ff"
            onChange={(e) => setVibrationEnabled(e.detail.value)}
          />
        </View>

        <Text className="group-title group-title--support">支持</Text>

        <View className="setting-card setting-card--arrow" onClick={() => openPage("/pages/settings/help")}>
          <Text className="setting-label">帮助中心</Text>
          <Text className="setting-arrow">→</Text>
        </View>

        <View className="setting-card setting-card--arrow" onClick={() => Taro.showToast({ title: "请联系官方客服", icon: "none" })}>
          <Text className="setting-label">联系我们</Text>
          <Text className="setting-arrow">→</Text>
        </View>

        <View className="setting-card setting-card--arrow" onClick={() => openPage("/pages/settings/about")}>
          <Text className="setting-label">关于 YEHEY</Text>
          <View className="setting-meta">
            <Text className="setting-value">v2.1.0</Text>
            <Text className="setting-arrow">→</Text>
          </View>
        </View>

        <View className="firmware-card">
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
