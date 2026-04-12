import { View, Text, Image } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { ICON_CHECK_GREEN, ICON_ERROR_RED } from "../../assets/icons";
import PageBack from "../../components/PageBack";
import "./index.scss";

export default function WifiResult() {
  const router = useRouter();
  const success = router.params.success === "true";
  const stage = (router.params.stage as "connect" | "config" | undefined) ?? "config";
  const deviceType = (router.params.deviceType as "collar" | "desktop" | undefined) ?? "collar";
  const deviceId = router.params.deviceId;
  const collarId = router.params.collarId;
  const desktopId = router.params.desktopId;

  const title = success ? "设备连接成功" : "设备连接失败";
  const buttonText = success ? "继续绑定宠物" : "返回重试";

  const handleAction = () => {
    if (!success) {
      Taro.navigateBack();
      return;
    }

    const nextDeviceId = deviceId || collarId || desktopId || "";
    if (!nextDeviceId) {
      Taro.switchTab({ url: "/pages/index/index" });
      return;
    }

    Taro.navigateTo({
      url: `/pages/bind-pet/index?deviceType=${deviceType}&deviceId=${encodeURIComponent(nextDeviceId)}`,
    });
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
