import { View, Text, Switch } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import PageBack from "../../components/PageBack";
import "./subpages.scss";

export default function SystemSettings() {
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);

  return (
    <View className="settings-subpage">
      <View className="settings-subpage-top-strip" />
      <View className="settings-subpage-header">
        <PageBack />
        <Text className="settings-subpage-title">系统设置</Text>
      </View>

      <View className="settings-subpage-content">
        <View className="settings-subpage-card settings-subpage-card--row">
          <Text className="settings-subpage-label">账户安全</Text>
          <Text className="settings-subpage-arrow">→</Text>
        </View>

        <View className="settings-subpage-card settings-subpage-card--row">
          <Text className="settings-subpage-label">消息通知</Text>
          <Switch checked={notifyEnabled} color="#4aa4ff" onChange={(e) => setNotifyEnabled(e.detail.value)} />
        </View>

        <View className="settings-subpage-card settings-subpage-card--row" onClick={() => Taro.navigateTo({ url: "/pages/settings/theme" })}>
          <Text className="settings-subpage-label">主题模式</Text>
          <Text className="settings-subpage-arrow">→</Text>
        </View>

        <View className="settings-subpage-card settings-subpage-card--row">
          <Text className="settings-subpage-label">语言设置</Text>
          <View className="settings-subpage-meta">
            <Text className="settings-subpage-value">简体中文</Text>
            <Text className="settings-subpage-arrow">→</Text>
          </View>
        </View>

        <View className="settings-subpage-card settings-subpage-card--row">
          <Text className="settings-subpage-label">震动反馈</Text>
          <Switch checked={vibrationEnabled} color="#4aa4ff" onChange={(e) => setVibrationEnabled(e.detail.value)} />
        </View>
      </View>
    </View>
  );
}
