import { View, Text, Image } from "@tarojs/components";
import PageBack from "../../components/PageBack";
import "./subpages.scss";

export default function AboutPage() {
  return (
    <View className="settings-subpage">
      <View className="settings-subpage-top-strip" />
      <View className="settings-subpage-header">
        <PageBack inline />
        <Text className="settings-subpage-title">关于 YEHEY</Text>
      </View>

      <View className="settings-subpage-content">
        <View className="about-hero-card">
          <View className="about-logo-wrap">
            <Image className="about-logo" src={require("@/assets/images/black cat 3.png")} mode="aspectFit" />
          </View>
          <Text className="about-title">YEHEY 宠物在场</Text>
          <Text className="about-desc">陪伴、记录、连接与定制，让数字宠物更贴近真实生活。</Text>
        </View>

        <View className="settings-subpage-card about-info-card">
          <Text className="about-info-label">当前版本</Text>
          <Text className="about-info-value">v2.1.0</Text>
        </View>

        <View className="settings-subpage-card about-info-card">
          <Text className="about-info-label">服务状态</Text>
          <Text className="about-info-value">运行正常</Text>
        </View>
      </View>
    </View>
  );
}
