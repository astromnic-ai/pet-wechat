import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import PageBack from "../../components/PageBack";
import "./subpages.scss";

export default function AboutPage() {
  return (
    <View className="settings-subpage">
      <View className="settings-subpage-top-strip" />
      <View className="settings-subpage-header">
        <PageBack inline />
        <Text className="settings-subpage-title">关于YEHEY</Text>
      </View>

      <View className="settings-subpage-content">
        <View className="about-link-card" onClick={() => Taro.showToast({ title: "用户协议即将开放", icon: "none" })}>
          <Text className="about-link-label">用户协议</Text>
          <Text className="settings-subpage-arrow">→</Text>
        </View>

        <View className="about-link-card" onClick={() => Taro.showToast({ title: "隐私政策即将开放", icon: "none" })}>
          <Text className="about-link-label">隐私政策</Text>
          <Text className="settings-subpage-arrow">→</Text>
        </View>

        <View className="about-footer-card">
          <Text className="about-footer-main">© 2024 YEHEY Technology</Text>
          <Text className="about-footer-sub">保留所有权利</Text>
        </View>
      </View>
    </View>
  );
}
