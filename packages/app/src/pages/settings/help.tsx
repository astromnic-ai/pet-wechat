import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import PageBack from "../../components/PageBack";
import "./subpages.scss";

const HELP_ITEMS = [
  { key: "faq", label: "常见问题", color: "#dbeeff" },
  { key: "guide", label: "使用指南", color: "#fff1d9" },
  { key: "trouble", label: "故障排查", color: "#ffe3e3" },
  { key: "video", label: "视频教程", color: "#def5d8" },
  { key: "phone", label: "客服电话   400-888-9999", color: "#48a2ff", solid: true },
  { key: "online", label: "在线客服   周一至周日 9:00-21:00", color: "#51c81d", solid: true },
];

export default function HelpCenter() {
  return (
    <View className="settings-subpage">
      <View className="settings-subpage-top-strip" />
      <View className="settings-subpage-header">
        <PageBack inline />
        <Text className="settings-subpage-title">帮助中心</Text>
      </View>

      <View className="settings-subpage-content">
        {HELP_ITEMS.map((item) => (
          <View
            key={item.key}
            className="help-card"
            onClick={() => {
              if (item.key === "phone") {
                Taro.showToast({ title: "请拨打 400-888-9999", icon: "none" });
                return;
              }
              if (item.key === "online") {
                Taro.showToast({ title: "在线客服功能即将开放", icon: "none" });
                return;
              }
              Taro.showToast({ title: `${item.label} 即将开放`, icon: "none" });
            }}
          >
            <View className="help-card-main">
              <View className="help-card-dot" style={{ background: item.color }} />
              <Text className="help-card-label">{item.label}</Text>
            </View>
            {item.key === "phone" || item.key === "online" ? null : (
              <Text className="settings-subpage-arrow">→</Text>
            )}
          </View>
        ))}

        <View className="help-contact-btn" onClick={() => Taro.showToast({ title: "在线联系功能即将开放", icon: "none" })}>
          <Text className="help-contact-btn-text">立即联系</Text>
        </View>
      </View>
    </View>
  );
}
