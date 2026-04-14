import { View, Text } from "@tarojs/components";
import { useState } from "react";
import Taro from "@tarojs/taro";
import PageBack from "../../components/PageBack";
import "./subpages.scss";

type ThemeMode = "light" | "dark" | "blue";

const THEMES: Array<{ key: ThemeMode; label: string; color: string }> = [
  { key: "light", label: "浅色模式", color: "#fff3cf" },
  { key: "dark", label: "深色模式", color: "#2f2f33" },
  { key: "blue", label: "蓝色模式", color: "#a9adb3" },
];

export default function ThemeSettings() {
  const [theme, setTheme] = useState<ThemeMode>(() => Taro.getStorageSync("settings:theme") || "light");

  return (
    <View className="settings-subpage">
      <View className="settings-subpage-top-strip" />
      <View className="settings-subpage-header">
        <PageBack inline />
        <Text className="settings-subpage-title">主题模式</Text>
      </View>

      <View className="settings-subpage-content">
        {THEMES.map((item) => {
          const active = item.key === theme;
          return (
            <View
              key={item.key}
              className={`theme-option-card ${active ? "theme-option-card--active" : ""}`}
              onClick={() => {
                setTheme(item.key);
                Taro.setStorageSync("settings:theme", item.key);
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
