import { View, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { ICON_ARROW_LEFT } from "../../assets/icons";
import { useSafeArea } from "../../hooks/useSafeArea";
import "./index.scss";

interface PageBackProps {
  fallbackUrl?: string;
  inline?: boolean;
}

const TABBAR_PAGES = new Set([
  "/pages/index/index",
  "/pages/devices/index",
  "/pages/messages/index",
  "/pages/profile/index",
]);

export default function PageBack({ fallbackUrl = "/pages/index/index", inline = false }: PageBackProps) {
  const { statusBarHeight } = useSafeArea();

  const handleBack = () => {
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack();
      return;
    }

    if (TABBAR_PAGES.has(fallbackUrl)) {
      Taro.switchTab({ url: fallbackUrl });
      return;
    }

    Taro.reLaunch({ url: fallbackUrl });
  };

  return (
    <View
      className={`page-back ${inline ? "page-back--inline" : ""}`}
      style={inline ? undefined : { top: `${statusBarHeight + 12}px` }}
      onClick={handleBack}
    >
      <Image className="page-back-icon" src={ICON_ARROW_LEFT} mode="aspectFit" />
    </View>
  );
}
