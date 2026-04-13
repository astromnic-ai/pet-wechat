import { View, Text } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import "./index.scss";

export default function DesktopPair() {
  const router = useRouter();
  const desktopId = router.params.desktopId || "";

  useDidShow(() => {
    if (desktopId) {
      Taro.redirectTo({
        url: `/pages/bind-pet/index?deviceType=desktop&deviceId=${encodeURIComponent(desktopId)}`,
      });
      return;
    }

    setTimeout(() => {
      Taro.switchTab({ url: "/pages/devices/index" });
    }, 80);
  });

  return (
    <View className="desktop-home-page">
      <View className="desktop-home-card">
        <Text className="desktop-home-title">页面已升级</Text>
        <Text className="desktop-home-desc">正在进入新版设备绑定流程…</Text>
      </View>
    </View>
  );
}
