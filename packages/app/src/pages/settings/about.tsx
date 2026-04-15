import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import ContentPage from "./ContentPage";

export default function AboutPage() {
  return (
    <ContentPage slug="about" fallbackTitle="关于 YEHEY" hideContentBody>
      <View className="about-link-list">
        <View className="about-link-card" onClick={() => Taro.navigateTo({ url: "/pages/settings/user-agreement" })}>
          <Text className="about-link-label">用户协议</Text>
          <Text className="settings-subpage-arrow">→</Text>
        </View>

        <View className="about-link-card" onClick={() => Taro.navigateTo({ url: "/pages/settings/privacy" })}>
          <Text className="about-link-label">隐私政策</Text>
          <Text className="settings-subpage-arrow">→</Text>
        </View>

        <View className="about-footer-card">
          <Text className="about-footer-main">© 2024 YEHEY Technology</Text>
          <Text className="about-footer-sub">保留所有权利</Text>
        </View>
      </View>
    </ContentPage>
  );
}
