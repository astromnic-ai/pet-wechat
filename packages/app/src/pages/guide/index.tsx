import { View, Text } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import "./index.scss";

export default function Guide() {
  useDidShow(() => {
    setTimeout(() => {
      Taro.switchTab({ url: "/pages/index/index" });
    }, 80);
  });

  return (
    <View className="guide-page guide-page--legacy">
      <View className="guide-legacy-card">
        <Text className="guide-legacy-title">页面已升级</Text>
        <Text className="guide-legacy-desc">正在返回主页，进入新版宠物流程…</Text>
      </View>
    </View>
  );
}
