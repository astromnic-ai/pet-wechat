import { View, Text, Image, ScrollView } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useMemo, useState } from "react";
import { request } from "../../utils/request";
import PageBack from "../../components/PageBack";
import type { Message, Pet } from "@pet-wechat/shared";
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

function extractPetName(message: Message) {
  const patterns = [
    /您的宠物\s+(.+?)\s+的图像/,
    /^(.+?)\s+的新形象已生成/,
  ];

  for (const pattern of patterns) {
    const match = message.content.match(pattern);
    const name = match?.[1]?.trim();
    if (name) return name;
  }

  return "";
}

function buildMessagePreview(message: Message) {
  return message.content.trim();
}

function buildMessageAction(message: Message, pets: Pet[]) {
  const petName = extractPetName(message);
  const matchedPet = petName ? pets.find((item) => item.name === petName) ?? null : null;
  const openPetDetail = matchedPet
    ? () => Taro.navigateTo({ url: `/pages/pet-info/index?petId=${matchedPet.id}` })
    : null;

  if (message.title.includes("图像审核未通过")) {
    return matchedPet
      ? {
          label: "重新上传图像",
          onClick: () => Taro.navigateTo({ url: `/pages/pet-avatar/index?petId=${matchedPet.id}` }),
        }
      : null;
  }

  if (message.title.includes("图像审核通过")) {
    return openPetDetail
      ? {
          label: "查看审核结果",
          onClick: openPetDetail,
        }
      : null;
  }

  if (message.title.includes("形象已就绪")) {
    return openPetDetail
      ? {
          label: "查看新形象",
          onClick: openPetDetail,
        }
      : null;
  }

  return null;
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [authorizedPets, setAuthorizedPets] = useState<Pet[]>([]);
  const [activeMessage, setActiveMessage] = useState<Message | null>(null);

  useDidShow(() => {
    Taro.hideTabBar();
    void Promise.all([loadMessages(), loadPets()]);
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

  const loadPets = async () => {
    try {
      const res = await request<{ pets: Pet[]; authorizedPets: Pet[] }>({ url: "/api/pets" });
      setPets(res.pets);
      setAuthorizedPets(res.authorizedPets);
    } catch {
      setPets([]);
      setAuthorizedPets([]);
    }
  };

  const messagePets = useMemo(() => [...pets, ...authorizedPets], [authorizedPets, pets]);
  const activeAction = activeMessage ? buildMessageAction(activeMessage, messagePets) : null;

  return (
    <View className="messages-page">
      <View className="messages-top-strip" />
      <View className="messages-header">
        <PageBack inline />
        <Text className="messages-title">消息</Text>
      </View>

      <ScrollView className="messages-scroll" scrollY>
        <View className="messages-list">
          {messages.length > 0 ? (
            messages.map((message) => {
              const type = normalizeType(message as Message);
              return (
                <View key={message.id} className="message-card" onClick={() => setActiveMessage(message)}>
                  <View
                    className="message-icon-wrap"
                    style={{ background: ICON_MAP[type as keyof typeof ICON_MAP] }}
                  />
                  <View className="message-main">
                    <Text className="message-title-text">{message.title}</Text>
                    <Text className="message-content">{buildMessagePreview(message)}</Text>
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

      {activeMessage ? (
        <View className="message-detail-mask" onClick={() => setActiveMessage(null)}>
          <View className="message-detail-sheet" onClick={(e) => e.stopPropagation()}>
            <View className="message-detail-handle" />
            <Text className="message-detail-title">{activeMessage.title}</Text>
            <Text className="message-detail-time">{getTimeText(activeMessage)}</Text>
            <Text className="message-detail-content">{activeMessage.content}</Text>

            {activeAction ? (
              <View
                className="message-detail-primary-btn"
                onClick={() => {
                  setActiveMessage(null);
                  activeAction.onClick();
                }}
              >
                <Text className="message-detail-primary-btn-text">{activeAction.label}</Text>
              </View>
            ) : null}

            <View className="message-detail-secondary-btn" onClick={() => setActiveMessage(null)}>
              <Text className="message-detail-secondary-btn-text">关闭</Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
