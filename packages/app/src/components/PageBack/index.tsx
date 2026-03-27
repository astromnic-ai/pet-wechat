import { View, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { ICON_ARROW_LEFT } from "../../assets/icons";
import { useSafeArea } from "../../hooks/useSafeArea";
import "./index.scss";

interface PageBackProps {
  fallbackUrl?: string;
}

export default function PageBack({ fallbackUrl = "/pages/index/index" }: PageBackProps) {
  const { statusBarHeight } = useSafeArea();

  const handleBack = () => {
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack();
      return;
    }
    Taro.switchTab({ url: fallbackUrl });
  };

  return (
    <View
      className="page-back"
      style={{ top: `${statusBarHeight + 12}px` }}
      onClick={handleBack}
    >
      <Image className="page-back-icon" src={ICON_ARROW_LEFT} mode="aspectFit" />
    </View>
  );
}
