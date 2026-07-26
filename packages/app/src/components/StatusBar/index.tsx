import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";

type StatusBarProps = {
  className?: string;
};

function getStatusBarHeight() {
  try {
    const windowHeight = Taro.getWindowInfo?.().statusBarHeight;
    if (typeof windowHeight === "number") return windowHeight;

    return Taro.getSystemInfoSync().statusBarHeight ?? 0;
  } catch {
    return 0;
  }
}

export default function StatusBar({ className = "" }: StatusBarProps) {
  const statusBarHeight = Math.round(getStatusBarHeight() * 1.4);

  return (
    <View
      className={className}
      style={{
        height: `${statusBarHeight}px`,
        minHeight: `${statusBarHeight}px`,
        background: "#ffd86f",
      }}
    />
  );
}
