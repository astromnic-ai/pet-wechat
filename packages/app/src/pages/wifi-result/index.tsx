import { View, Text, Image } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { ICON_CHECK_GREEN, ICON_ERROR_RED } from "../../assets/icons";
import PageBack from "../../components/PageBack";
import { markGuideCompleted } from "../../utils/storage";
import "./index.scss";

export default function WifiResult() {
  const router = useRouter();
  const success = router.params.success === "true";
  const stage = (router.params.stage as "connect" | "config" | undefined) ?? "config";
  const deviceType = (router.params.deviceType as "collar" | "desktop" | undefined) ?? "collar";
  const deviceId = router.params.deviceId;
  const collarId = router.params.collarId;
  const desktopId = router.params.desktopId;

  const title = success
    ? stage === "connect"
      ? "网络连接成功"
      : "网络配置成功"
    : stage === "connect"
      ? "网络连接失败"
      : "网络配置失败";

  const buttonText = success
    ? stage === "connect"
      ? "下一步"
      : deviceType === "collar"
        ? "录入该项圈的宠物信息"
        : "进入主页"
    : "重新连接";

  const handleAction = () => {
    if (!success) {
      Taro.navigateBack();
      return;
    }

    if (stage === "connect") {
      const nextDeviceId = deviceId || collarId || desktopId || "";
      Taro.navigateTo({
        url: `/pages/wifi-config/index?deviceType=${deviceType}&deviceId=${nextDeviceId}`,
      });
      return;
    }

    if (stage === "config") {
      markGuideCompleted();

      if (deviceType === "collar") {
        const nextCollarId = collarId || deviceId || "";
        Taro.navigateTo({ url: `/pages/pet-info/index?collarId=${nextCollarId}` });
        return;
      }

      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }

    if (deviceType === "desktop" && desktopId) {
      Taro.navigateTo({ url: `/pages/desktop-pair/index?desktopId=${desktopId}` });
      return;
    }

    if (collarId) {
      Taro.navigateTo({ url: `/pages/pet-info/index?collarId=${collarId}` });
      return;
    }

    Taro.switchTab({ url: "/pages/index/index" });
  };

  return (
    <View className="result-page">
      <PageBack />
      <Text className="result-title">{title}</Text>
      <Image
        className="result-icon"
        src={success ? ICON_CHECK_GREEN : ICON_ERROR_RED}
        mode="aspectFit"
      />
      <View className="result-button" onClick={handleAction}>
        <Text className="result-button-text">{buttonText}</Text>
      </View>
    </View>
  );
}
