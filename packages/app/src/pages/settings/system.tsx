import { View, Text } from "@tarojs/components";
import { useState } from "react";
import PageBack from "../../components/PageBack";
import "./subpages.scss";

type LanguageOption = "简体中文" | "繁體中文" | "English";

export default function SystemSettings() {
  const [language, setLanguage] = useState<LanguageOption>("简体中文");

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
          <View className="settings-list-row">
            <Text className="settings-list-label">修改密码</Text>
            <Text className="settings-subpage-arrow">→</Text>
          </View>

          <View className="settings-list-row">
            <Text className="settings-list-label">绑定手机</Text>
            <Text className="settings-subpage-arrow">→</Text>
          </View>

          <View className="settings-list-row settings-list-row--last">
            <Text className="settings-list-label">绑定邮箱</Text>
            <Text className="settings-subpage-arrow">→</Text>
          </View>
        </View>

        <Text className="settings-subpage-group">语言设置</Text>

        {(["简体中文", "繁體中文", "English"] as LanguageOption[]).map((item) => {
          const active = item === language;
          return (
            <View
              key={item}
              className={`settings-language-card ${active ? "settings-language-card--active" : ""}`}
              onClick={() => setLanguage(item)}
            >
              <Text className="settings-language-label">{item}</Text>
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
