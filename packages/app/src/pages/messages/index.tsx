import { View, Text, Image, ScrollView } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useState } from "react";
import { request } from "../../utils/request";
import PageBack from "../../components/PageBack";
import type { Message, MessageType } from "@pet-wechat/shared";
import "./index.scss";

type TabType = "all" | MessageType;

const variantMap = {
  success: require("@/assets/images/icon-gray-1.png"),
  fail: require("@/assets/images/icon-gray-2.png"),
  refresh: require("@/assets/images/icon-gray-3.png"),
  paw: require("@/assets/images/paw.png"),
};

function getVariant(message: Message) {
  if (message.title.includes("失败") || message.title.includes("拒绝")) return "fail";
  if (message.title.includes("更新")) return "refresh";
  if (message.title.includes("定制") || message.title.includes("宠物")) return "paw";
  return "success";
}

export default function Messages() {
  const [tab, setTab] = useState<TabType>("all");
  const [messages, setMessages] = useState<Message[]>([]);
  const [, setUnreadCount] = useState(0);
  const [refreshToken, setRefreshToken] = useState<number | null>(null);

  useDidShow(() => {
    setRefreshToken(Date.now());
  });

  useEffect(() => {
    if (refreshToken === null) return;

    let active = true;

    const loadMessages = async () => {
      try {
        const list = await request<Message[]>({ url: "/api/messages" });
        if (active) {
          setMessages(list);
        }
      } catch {
        if (active) {
          setMessages([]);
        }
      }
    };

    void loadMessages();

    return () => {
      active = false;
    };
  }, [refreshToken]);

  useEffect(() => {
    if (refreshToken === null) return;

    let active = true;

    const loadUnreadCount = async () => {
      try {
        const { count } = await request<{ count: number }>({
          url: "/api/messages/unread-count",
        });
        if (active) {
          setUnreadCount(count);
        }
      } catch {
        if (active) {
          setUnreadCount(0);
        }
      }
    };

    void loadUnreadCount();

    return () => {
      active = false;
    };
  }, [refreshToken]);

  const markAllRead = async () => {
    try {
      await request({ url: "/api/messages/read-all", method: "PUT" });
      setMessages((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    } catch {}
  };

  const markOneRead = async (message: Message) => {
    if (message.isRead) return;
    try {
      await request({ url: `/api/messages/${message.id}/read`, method: "PUT" });
      setMessages((prev) =>
        prev.map((item) => (item.id === message.id ? { ...item, isRead: true } : item))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {}
  };

  const handleOpenMessage = async (message: Message, actionText: string) => {
    await markOneRead(message);
    Taro.showModal({
      title: message.title,
      content: message.content,
      confirmText: actionText,
      showCancel: false,
    });
  };

  const filteredMessages =
    tab === "all" ? messages : messages.filter((message) => message.type === tab);

  return (
    <View className="messages-page">
      <PageBack />
      <View className="messages-header">
        <Text className="header-title">消息中心</Text>
        <Text className="header-action" onClick={markAllRead}>
          全部已读
        </Text>
      </View>

      <View className="tab-bar">
        {[
          { key: "all", label: "全部" },
          { key: "authorization", label: "授权通知" },
          { key: "system", label: "系统消息" },
        ].map((item) => (
          <View
            key={item.key}
            className={`tab-item ${tab === item.key ? "active" : ""}`}
            onClick={() => setTab(item.key as TabType)}
          >
            <Text className="tab-text">{item.label}</Text>
            <View className="tab-line" />
          </View>
        ))}
      </View>

      <ScrollView className="messages-scroll" scrollY>
        {filteredMessages.length === 0 ? (
          <Text className="empty-text">暂无消息</Text>
        ) : (
          filteredMessages.map((message) => {
            const variant = getVariant(message);
            const actionText = variant === "refresh" ? "查看更新" : "查看详情";
            return (
              <View key={message.id} className={`message-item ${message.isRead ? "" : "is-unread"}`}>
                <Image className="message-icon" src={variantMap[variant]} mode="aspectFit" />
                <View className="message-main">
                  <Text className="message-title">{message.title}</Text>
                  <Text className="message-content">{message.content}</Text>
                </View>
                <View className="message-side">
                  <Text className="message-time">
                    {new Date(message.createdAt).toLocaleDateString() === new Date().toLocaleDateString()
                      ? "2小时前"
                      : new Date(message.createdAt).toLocaleDateString()}
                  </Text>
                  <Text className="message-action" onClick={() => handleOpenMessage(message, actionText)}>
                    {actionText}
                  </Text>
                </View>
              </View>
            );
          })
        )}

        <Image
          className="bottom-outline"
          src={require("@/assets/images/pet-outline.png")}
          mode="widthFix"
        />
      </ScrollView>
    </View>
  );
}
