import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import ContentPage from "./ContentPage";

export default function HelpCenter() {
  return (
    <ContentPage slug="help" fallbackTitle="帮助中心">
      <View
        className="help-contact-btn"
        onClick={() => {
          Taro.showToast({ title: "在线客服即将上线", icon: "none" });
        }}
      >
        <Text className="help-contact-btn-text">联系客服</Text>
      </View>
    </ContentPage>
  );
}
