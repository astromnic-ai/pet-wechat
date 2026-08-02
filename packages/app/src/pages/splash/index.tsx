import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { isLoggedIn } from "../../utils/storage";
import StatusBar from "../../components/StatusBar";
import "./index.scss";

export default function Splash() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let finished = false;
    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + Math.random() * 20 + 12;
        if (next >= 100 && !finished) {
          finished = true;
          clearInterval(timer);
          setTimeout(() => {
            if (isLoggedIn()) {
              Taro.switchTab({ url: "/pages/index/index" });
            } else {
              Taro.redirectTo({ url: "/pages/login/index" });
            }
          }, 260);
          return 100;
        }
        return next;
      });
    }, 280);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <View className="splash-page">
      <StatusBar className="splash-top-strip" />
      <View className="splash-content">
        <View className="hero-area">
          <View className="splash-logo-group">
            <Image
              className="splash-logo-mark"
              src={require("@/assets/images/wispnook-logo-mark.png")}
              mode="aspectFit"
            />
            <Image
              className="splash-logo-wordmark"
              src={require("@/assets/images/wispnook-wordmark.png")}
              mode="aspectFit"
            />
          </View>
          <View className="progress-bar">
            <View className="progress-fill" style={{ width: `${Math.min(progress, 100)}%` }} />
          </View>
        </View>
        <Text className="loading-text">加载中...</Text>
      </View>
    </View>
  );
}
