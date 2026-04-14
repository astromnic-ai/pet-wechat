import { View, Text } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import type { UserSettingTheme } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import {
  fetchUserSettings,
  readCachedUserSettings,
  saveUserSettings,
  THEME_OPTIONS,
} from "../../utils/userSettings";
import "./subpages.scss";

export default function ThemeSettings() {
  const [theme, setTheme] = useState<UserSettingTheme>(() => readCachedUserSettings().theme);

  useDidShow(() => {
    void fetchUserSettings().then((result) => setTheme(result.settings.theme));
  });

  const handleThemeChange = async (nextTheme: UserSettingTheme) => {
    const result = await saveUserSettings({ theme: nextTheme });
    setTheme(result.settings.theme);
    if (!result.persisted) {
      Taro.showToast({ title: "网络异常，已保存在本地", icon: "none" });
    }
  };

  return (
    <View className="settings-subpage">
      <View className="settings-subpage-top-strip" />
      <View className="settings-subpage-header">
        <PageBack inline />
        <Text className="settings-subpage-title">主题模式</Text>
      </View>

      <View className="settings-subpage-content">
        {THEME_OPTIONS.map((item) => {
          const active = item.key === theme;
          return (
            <View
              key={item.key}
              className={`theme-option-card ${active ? "theme-option-card--active" : ""}`}
              onClick={() => {
                void handleThemeChange(item.key);
              }}
            >
              <View className="theme-option-left">
                <View className="theme-option-preview" style={{ background: item.color }} />
                <Text className="theme-option-title">{item.label}</Text>
              </View>
              <View className={`theme-option-radio ${active ? "theme-option-radio--active" : ""}`} />
            </View>
          );
        })}
      </View>
    </View>
  );
}
