import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import PageBack from "../../components/PageBack";
import "./index.scss";

export default function DesktopPair() {
  const handleConnectExisting = () => {
    Taro.navigateTo({ url: "/pages/invite/index?mode=pair" });
  };

  const handleGetPermission = () => {
    Taro.navigateTo({ url: "/pages/invite/index?mode=invite" });
  };

  const handleStartConfig = () => {
    Taro.navigateTo({ url: "/pages/collar-bind/index" });
  };

  const handleSkip = () => {
    Taro.switchTab({ url: "/pages/index/index" });
  };

  return (
    <View className="desktop-home-page">
      <PageBack />
      <Text className="brand">YEHEY</Text>
      <Image
        className="outline-image"
        src={require("@/assets/images/pet-outline.png")}
        mode="widthFix"
      />

      <View className="action-card">
        <Text className="page-title">联接宠物桌面的家</Text>

        <View className="hero-row">
          <Image
            className="hero-pet"
            src={require("@/assets/images/pet-collar.png")}
            mode="aspectFit"
          />
          <Image
            className="hero-link"
            src={require("@/assets/images/link-icon.png")}
            mode="aspectFit"
          />
          <Image
            className="hero-device"
            src={require("@/assets/images/snow-globe.png")}
            mode="aspectFit"
          />
        </View>

        <View className="action-button" onClick={handleConnectExisting}>
          <Image
            className="action-icon"
            src={require("@/assets/images/cat-dog-banner.png")}
            mode="aspectFit"
          />
          <Text className="action-text">一键连接已有宠物&amp;项圈</Text>
        </View>

        <View className="action-button" onClick={handleGetPermission}>
          <Image
            className="action-icon"
            src={require("@/assets/images/btn-user.png")}
            mode="aspectFit"
          />
          <Text className="action-text">向家人/朋友获取绑定权限</Text>
        </View>

        <View className="action-button action-button-center" onClick={handleStartConfig}>
          <Text className="action-text">现在开始配置宠物&amp;项圈</Text>
        </View>

        <Text className="skip-text" onClick={handleSkip}>
          暂时跳过，进入主页
        </Text>
      </View>

      <View className="progress-track">
        <View className="progress-fill" />
      </View>
    </View>
  );
}
