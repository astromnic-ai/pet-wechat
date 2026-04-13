import { View, Text } from "@tarojs/components";
import { useState } from "react";
import PageBack from "../../components/PageBack";
import "./subpages.scss";

type ThemeMode = "light" | "warm";

export default function ThemeSettings() {
  const [theme, setTheme] = useState<ThemeMode>("light");

  return (
    <View className="settings-subpage">
      <View className="settings-subpage-top-strip" />
      <View className="settings-subpage-header">
        <PageBack inline />
        <Text className="settings-subpage-title">主题模式</Text>
      </View>

      <View className="settings-subpage-content">
        <View className={`theme-card ${theme === "light" ? "theme-card--active" : ""}`} onClick={() => setTheme("light")}>
          <View className="theme-preview theme-preview--light">
            <View className="theme-preview-chip" />
            <View className="theme-preview-card" />
            <View className="theme-preview-line" />
            <View className="theme-preview-line theme-preview-line--short" />
          </View>
          <View className="theme-card-copy">
            <Text className="theme-card-title">亮色主题</Text>
            <Text className="theme-card-desc">浅暖底色，舒适柔和</Text>
          </View>
          <View className={`theme-radio ${theme === "light" ? "theme-radio--active" : ""}`} />
        </View>

        <View className={`theme-card ${theme === "warm" ? "theme-card--active" : ""}`} onClick={() => setTheme("warm")}>
          <View className="theme-preview theme-preview--warm">
            <View className="theme-preview-chip" />
            <View className="theme-preview-card" />
            <View className="theme-preview-line" />
            <View className="theme-preview-line theme-preview-line--short" />
          </View>
          <View className="theme-card-copy">
            <Text className="theme-card-title">暖光主题</Text>
            <Text className="theme-card-desc">更明亮的黄色点缀</Text>
          </View>
          <View className={`theme-radio ${theme === "warm" ? "theme-radio--active" : ""}`} />
        </View>
      </View>
    </View>
  );
}
