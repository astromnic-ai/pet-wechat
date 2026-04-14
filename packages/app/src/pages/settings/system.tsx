import { View, Text } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import type { User, UserSettings, UserSettingLanguage } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import { request } from "../../utils/request";
import {
  fetchUserSettings,
  getLanguageLabel,
  LANGUAGE_OPTIONS,
  readCachedUserSettings,
  saveUserSettings,
} from "../../utils/userSettings";
import "./subpages.scss";

export default function SystemSettings() {
  const [settings, setSettings] = useState<UserSettings>(() => readCachedUserSettings());
  const [user, setUser] = useState<User | null>(null);

  useDidShow(() => {
    void Promise.all([
      fetchUserSettings(),
      request<{ user: User }>({ url: "/api/me" }).catch(() => ({ user: null as User | null })),
    ]).then(([settingsResult, userResult]) => {
      setSettings(settingsResult.settings);
      setUser(userResult.user);
    });
  });

  const handleLanguageChange = async (language: UserSettingLanguage) => {
    const result = await saveUserSettings({ language });
    setSettings(result.settings);
    if (!result.persisted) {
      Taro.showToast({ title: "网络异常，已保存在本地", icon: "none" });
    }
  };

  return (
    <View className="settings-subpage">
      <View className="settings-subpage-top-strip" />
      <View className="settings-subpage-header">
        <PageBack inline />
        <Text className="settings-subpage-title">系统设置</Text>
      </View>

      <View className="settings-subpage-content">
        <Text className="settings-subpage-group">账户安全</Text>

        <View className="settings-list-card">
          <View
            className="settings-list-row"
            onClick={() => Taro.navigateTo({ url: "/pages/settings/bind-phone" })}
          >
            <Text className="settings-list-label">绑定手机</Text>
            <Text className="settings-list-meta">{user?.phone?.trim() || "未绑定"}</Text>
            <Text className="settings-subpage-arrow">→</Text>
          </View>

          <View
            className="settings-list-row settings-list-row--last"
            onClick={() => Taro.navigateTo({ url: "/pages/settings/bind-email" })}
          >
            <Text className="settings-list-label">绑定邮箱</Text>
            <Text className="settings-list-meta">{user?.email?.trim() || "未绑定"}</Text>
            <Text className="settings-subpage-arrow">→</Text>
          </View>
        </View>

        <Text className="settings-subpage-group">语言设置</Text>

        {LANGUAGE_OPTIONS.map((item) => {
          const active = item.key === settings.language;
          return (
            <View
              key={item.key}
              className={`settings-language-card ${active ? "settings-language-card--active" : ""}`}
              onClick={() => {
                void handleLanguageChange(item.key);
              }}
            >
              <View>
                <Text className="settings-language-label">{item.label}</Text>
                <Text className="settings-language-desc">{getLanguageLabel(item.key)}</Text>
              </View>
              <View className={`settings-language-check ${active ? "settings-language-check--active" : ""}`}>
                {active ? <Text className="settings-language-check-icon">✓</Text> : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
