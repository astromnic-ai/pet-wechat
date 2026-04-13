import { View, Text } from "@tarojs/components";
import { useState } from "react";
import PageBack from "../../components/PageBack";
import "./subpages.scss";

type LanguageOption = "zh-CN" | "en-US";

const LANGUAGE_OPTIONS: Array<{ value: LanguageOption; label: string; desc: string }> = [
  { value: "zh-CN", label: "简体中文", desc: "推荐中国大陆用户使用" },
  { value: "en-US", label: "English", desc: "Use English for menus and copy" },
];

export default function LanguageSettings() {
  const [language, setLanguage] = useState<LanguageOption>("zh-CN");

  return (
    <View className="settings-subpage">
      <View className="settings-subpage-top-strip" />
      <View className="settings-subpage-header">
        <PageBack inline />
        <Text className="settings-subpage-title">语言设置</Text>
      </View>

      <View className="settings-subpage-content">
        {LANGUAGE_OPTIONS.map((item) => {
          const active = item.value === language;
          return (
            <View
              key={item.value}
              className={`theme-card ${active ? "theme-card--active" : ""}`}
              onClick={() => setLanguage(item.value)}
            >
              <View className={`language-dot ${active ? "language-dot--active" : ""}`} />
              <View className="theme-card-copy">
                <Text className="theme-card-title">{item.label}</Text>
                <Text className="theme-card-desc">{item.desc}</Text>
              </View>
              <View className={`theme-radio ${active ? "theme-radio--active" : ""}`} />
            </View>
          );
        })}
      </View>
    </View>
  );
}
