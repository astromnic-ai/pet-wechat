import { View, Text } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import "./index.scss";

export default function DesktopBind() {
  useDidShow(() => {
    Taro.redirectTo({ url: "/pages/collar-bind/index" });
  });

  return (
    <View className="device-search-page">
      <View className="device-search-top-strip" />
      <View className="device-search-header">
        <View className="device-search-back" />
        <Text className="device-search-title">搜索设备</Text>
      </View>
      <View className="device-search-content">
        <View className="step-outline-card">
          <Text className="step-main-copy">正在切换到统一搜索页...</Text>
          <Text className="step-sub-copy">桌面端和项圈现在使用同一套连接流程</Text>
        </View>
      </View>
    </View>
  );
}
