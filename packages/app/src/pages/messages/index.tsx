import { View, Text, Image, ScrollView } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { request } from "../../utils/request";
import PageBack from "../../components/PageBack";
import type { Message } from "@pet-wechat/shared";
import "./index.scss";

const ICON_MAP = {
  system: "#4ba0ff",
  activity: "#ffd66a",
  health: "#f4f4f4",
  device: "#f4f4f4",
  community: "#f4f4f4",
};

function normalizeType(message: Message) {
  if (message.title.includes("活动") || message.title.includes("提醒")) return "activity";
  if (message.title.includes("健康")) return "health";
  if (message.title.includes("设备")) return "device";
  if (message.title.includes("社区")) return "community";
  return "system";
}

function getTimeText(message: Message, index: number) {
  if (index === 0) return "10:30";
  if (index === 1) return "09:15";
  if (index === 2) return "昨天";
  if (index === 3) return "周一";
  return "周日";
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);

  useDidShow(() => {
    Taro.hideTabBar();
    void loadMessages();
  });

  const loadMessages = async () => {
    try {
      const list = await request<Message[]>({ url: "/api/messages" });
      setMessages(list);
      if (list.some((item) => item.isRead === false)) {
        void request({
          url: "/api/messages/read-all",
          method: "PUT",
        }).catch(() => {});
      }
    } catch {
      setMessages([]);
    }
  };
  const displayMessages = messages.slice(0, 5).map((item) => ({
    id: item.id,
    title: item.title,
    content: item.content,
  }));

  return (
    <View className="messages-page">
      <View className="messages-top-strip" />
      <View className="messages-header">
        <PageBack inline />
        <Text className="messages-title">消息</Text>
      </View>

      <ScrollView className="messages-scroll" scrollY>
        <View className="messages-list">
          {displayMessages.length > 0 ? (
            displayMessages.map((message, index) => {
              const type = normalizeType(message as Message);
              return (
                <View key={message.id} className="message-card">
                  <View
                    className="message-icon-wrap"
                    style={{ background: ICON_MAP[type as keyof typeof ICON_MAP] }}
                  />
                  <View className="message-main">
                    <Text className="message-title-text">{message.title}</Text>
                    <Text className="message-content">{message.content}</Text>
                  </View>
                  <Text className="message-time">{getTimeText(message as Message, index)}</Text>
                </View>
              );
            })
          ) : (
            <View className="messages-empty-card">
              <Text className="messages-empty-title">暂无消息</Text>
              <Text className="messages-empty-text">当前没有新的系统通知或设备消息</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
