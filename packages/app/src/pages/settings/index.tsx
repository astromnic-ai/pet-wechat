import { View, Text, Image } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import PageBack from "../../components/PageBack";
import "./index.scss";

const SETTING_ITEMS = [
  "通知设置",
  "隐私设置",
  "主题设置",
  "语言选择",
  "关于我们",
  "帮助与反馈",
  "隐私政策",
];

export default function Settings() {
  useDidShow(() => {
    Taro.hideTabBar();
  });

  const showComingSoon = (label: string) => {
    Taro.showToast({ title: label, icon: "none" });
  };

  return (
    <View className="settings-page">
      <PageBack />
      <Text className="page-title">设置</Text>

      <View className="settings-card">
        <Text className="section-title">我的宠物</Text>
        <View className="pet-row">
          <Image className="pet-thumb" src={require("@/assets/images/black cat 3.png")} mode="aspectFill" />
          <Image className="pet-thumb" src={require("@/assets/images/husky.png")} mode="aspectFill" />
        </View>
      </View>

      <View className="settings-card">
        {SETTING_ITEMS.map((item) => (
          <View key={item} className="setting-item" onClick={() => showComingSoon(item)}>
            <Text className="setting-label">{item}</Text>
            <Text className="setting-arrow">〉</Text>
          </View>
        ))}
      </View>

      <View className="collect-btn" onClick={() => showComingSoon("采集对照")}>
        <Text className="collect-btn-text">采集对照</Text>
      </View>
    </View>
  );
}
