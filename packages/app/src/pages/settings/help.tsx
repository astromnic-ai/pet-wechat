import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import ContentPage from "./ContentPage";

const HELP_ITEMS = [
  { label: "常见问题", color: "#e8f4ff", arrow: true },
  { label: "使用指南", color: "#fff2df", arrow: true },
  { label: "故障排查", color: "#ffe8e8", arrow: true },
  { label: "视频教程", color: "#e7ffe5", arrow: true },
  { label: "客服电话", color: "#4aa4ff", value: "400-888-9999" },
  { label: "在线客服", color: "#52c41a", value: "周一至周日 9:00-21:00" },
] as const;

export default function HelpCenter() {
  return (
    <ContentPage slug="help" fallbackTitle="帮助中心" hideContentBody>
      <View className="help-list">
        {HELP_ITEMS.map((item) => (
          <View
            key={item.label}
            className="help-card"
            onClick={() => {
              if (item.label === "客服电话") {
                Taro.makePhoneCall({ phoneNumber: "4008889999" }).catch(() => {});
                return;
              }

              if (item.label === "在线客服") {
                Taro.showToast({ title: "在线客服即将上线", icon: "none" });
                return;
              }

              Taro.showToast({ title: "内容建设中", icon: "none" });
            }}
          >
            <View className="help-card-main">
              <View className="help-card-dot" style={{ background: item.color }} />
              <Text className="help-card-label">{item.label}</Text>
              {item.value ? <Text className="help-card-value">{item.value}</Text> : null}
            </View>
            {item.arrow ? <Text className="settings-subpage-arrow">→</Text> : null}
          </View>
        ))}
      </View>

      <View
        className="help-contact-btn"
        onClick={() => {
          Taro.showToast({ title: "在线客服即将上线", icon: "none" });
        }}
      >
        <Text className="help-contact-btn-text">立即联系</Text>
      </View>
    </ContentPage>
  );
}
