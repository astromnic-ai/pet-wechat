import { View, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import "./index.scss";

type QuickNavKey = "profile" | "data" | "settings";

interface QuickNavProps {
  active?: QuickNavKey;
}

function jumpTo(url: string, type: "tab" | "page") {
  const pages = Taro.getCurrentPages();
  const currentRoute = pages[pages.length - 1]?.route;
  const targetRoute = url.replace(/^\//, "");

  if (currentRoute === targetRoute) {
    return;
  }

  if (type === "tab") {
    Taro.switchTab({ url });
    return;
  }

  Taro.redirectTo({ url });
}

const ITEMS: Array<{ key: QuickNavKey; icon: string; action: () => void }> = [
  {
    key: "profile",
    icon: require("@/assets/images/btn-user.png"),
    action: () => jumpTo("/pages/profile/index", "tab"),
  },
  {
    key: "data",
    icon: require("@/assets/images/btn-data.png"),
    action: () => jumpTo("/pages/data/index", "page"),
  },
  {
    key: "settings",
    icon: require("@/assets/images/btn-settings.png"),
    action: () => jumpTo("/pages/settings/index", "page"),
  },
];

export default function QuickNav({ active }: QuickNavProps) {
  return (
    <View className="quick-nav">
      {ITEMS.map((item) => (
        <View
          key={item.key}
          className={`quick-nav-item ${active === item.key ? "active" : ""}`}
          onClick={() => {
            if (active === item.key) return;
            item.action();
          }}
        >
          <Image className="quick-nav-icon" src={item.icon} mode="aspectFit" />
        </View>
      ))}
    </View>
  );
}
