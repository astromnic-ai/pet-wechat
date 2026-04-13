import { View, Text } from "@tarojs/components";
import PageBack from "../../components/PageBack";
import "./subpages.scss";

const HELP_ITEMS = [
  "如何快速创建宠物并完成绑定？",
  "设备连接失败怎么办？",
  "宠物活动模式如何切换？",
  "如何重新定制宠物动态形象？",
  "如何邀请家人一起使用？",
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
          <View key={item} className="settings-subpage-card settings-subpage-card--row">
            <Text className="settings-subpage-label settings-subpage-label--regular">{item}</Text>
            <Text className="settings-subpage-arrow">→</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
