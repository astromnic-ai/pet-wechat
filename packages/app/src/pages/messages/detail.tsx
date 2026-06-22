import { View, Text, ScrollView } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useState } from "react";
import type { Message } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import { request } from "../../utils/request";
import { parseMessageContent } from "../../utils/messageAction";
import "./detail.scss";

function getTimeText(message?: Message | null) {
  if (!message) return "";
  const createdAt = new Date(message.createdAt);
  if (Number.isNaN(createdAt.getTime())) return "";

  const diffMinutes = Math.floor((Date.now() - createdAt.getTime()) / 60000);
  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;
  if (diffMinutes < 24 * 60) return `${Math.floor(diffMinutes / 60)}小时前`;

  return createdAt.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

export default function MessageDetail() {
  const router = useRouter();
  const messageId = router.params.id || "";
  const [message, setMessage] = useState<Message | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!messageId) {
      setLoadError("消息不存在");
      return;
    }

    let cancelled = false;
    void request<Message>({ url: `/api/messages/${messageId}` })
      .then((res) => {
        if (cancelled) return;
        setMessage(res);
        setLoadError("");
        if (res.isRead === false) {
          void request({ url: `/api/messages/${messageId}/read`, method: "PUT" }).catch(() => {});
        }
      })
      .catch((error: any) => {
        if (cancelled) return;
        setLoadError(error?.message || "消息读取失败");
      });

    return () => {
      cancelled = true;
    };
  }, [messageId]);

  const { displayContent, action } = parseMessageContent(message?.content || "");
  const canRetryAvatar = action?.type === "avatar-retry" || message?.title.includes("图像审核未通过");

  const handleRetryUpload = () => {
    if (action?.petId) {
      Taro.navigateTo({ url: `/pages/pet-avatar/index?petId=${encodeURIComponent(action.petId)}` });
      return;
    }

    Taro.navigateTo({ url: "/pages/pets/index" });
  };

  return (
    <View className="message-detail-page">
      <View className="message-detail-top-strip" />
      <View className="message-detail-header">
        <PageBack inline />
        <Text className="message-detail-title">消息详情</Text>
      </View>

      <ScrollView className="message-detail-scroll" scrollY>
        {message ? (
          <View className="message-detail-content">
            <View className="message-detail-card">
              <View className="message-detail-card-header">
                <View className="message-detail-icon" />
                <View className="message-detail-heading">
                  <Text className="message-detail-card-title">{message.title}</Text>
                  {canRetryAvatar ? <Text className="message-detail-card-subtitle">宠物身体存在遮挡</Text> : null}
                </View>
                <Text className="message-detail-time">{getTimeText(message)}</Text>
              </View>
              <View className="message-detail-divider" />
              <Text className="message-detail-body">{displayContent}</Text>
            </View>

            {canRetryAvatar ? (
              <View className="message-detail-tips">
                <Text className="message-detail-tips-title">拍照小贴士</Text>
                <Text className="message-detail-tip">• 确保宠物全身在画面中</Text>
                <Text className="message-detail-tip">• 避免其他物体遮挡宠物身体</Text>
                <Text className="message-detail-tip">• 光线充足，背景简洁</Text>
                <Text className="message-detail-tip">• 宠物正面或侧面角度最佳</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View className="message-detail-empty">
            <Text className="message-detail-empty-title">{loadError || "正在读取消息"}</Text>
          </View>
        )}
      </ScrollView>

      <View className="message-detail-footer">
        {canRetryAvatar ? (
          <View className="message-detail-primary-btn" onClick={handleRetryUpload}>
            <Text className="message-detail-primary-btn-text">重新上传宠物图像</Text>
          </View>
        ) : null}
        <View className="message-detail-secondary-btn" onClick={() => Taro.navigateBack()}>
          <Text className="message-detail-secondary-btn-text">返回消息列表</Text>
        </View>
      </View>
    </View>
  );
}
