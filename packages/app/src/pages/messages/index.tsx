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

function getTimeText(message: Message) {
  const createdAt = new Date(message.createdAt);
  if (Number.isNaN(createdAt.getTime())) return "";

  const now = new Date();
  const diffMs = now.getTime() - createdAt.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const sameDay = now.toDateString() === createdAt.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;
  if (sameDay) {
    return createdAt.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  if (yesterday.toDateString() === createdAt.toDateString()) return "昨天";

  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays < 7) {
    return `周${"日一二三四五六"[createdAt.getDay()]}`;
  }

  return createdAt.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
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
  const displayMessages = messages.slice(0, 5);

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
            displayMessages.map((message) => {
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
                  <Text className="message-time">{getTimeText(message as Message)}</Text>
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
