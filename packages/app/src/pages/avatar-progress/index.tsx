import { View, Text, Image } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import { request } from "../../utils/request";
import type { AvatarStatus, Pet } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import "./index.scss";

export default function AvatarProgress() {
  const router = useRouter();
  const avatarId = router.params.avatarId;
  const petId = router.params.petId;
  const forcedStatus = router.params.status as "done" | "failed" | undefined;

  const [pet, setPet] = useState<Pet | null>(null);
  const [status, setStatus] = useState<AvatarStatus>(forcedStatus === "failed" ? "failed" : "done");

  useEffect(() => {
    if (petId) {
      request<{ pet: Pet }>({ url: `/api/pets/${petId}` })
        .then((res) => setPet(res.pet))
        .catch(() => {});
    }
  }, [petId]);

  useEffect(() => {
    if (!avatarId || forcedStatus) return;
    request<{ avatar: { status: AvatarStatus } }>({ url: `/api/avatars/${avatarId}` })
      .then((res) => setStatus(res.avatar.status))
      .catch(() => setStatus("failed"));
  }, [avatarId, forcedStatus]);

  const isSuccess = status === "done";
  const progress = isSuccess ? 100 : 82;
  const statusIcon = isSuccess
    ? require("@/assets/images/success-icon.png")
    : require("@/assets/images/fail-icon.png");

  const petSummary = useMemo(() => {
    if (!pet) return "毛毛 英短蓝猫 3岁半";
    return `${pet.name} ${pet.breed || "英短蓝猫"} 3岁半`;
  }, [pet]);

  const handleConfigDesktop = () => {
    Taro.navigateTo({ url: "/pages/desktop-bind/index" });
  };

  const handleGoHome = () => {
    Taro.switchTab({ url: "/pages/index/index" });
  };

  const handleRetryUpload = () => {
    if (petId) {
      Taro.navigateTo({ url: `/pages/pet-avatar/index?petId=${petId}` });
      return;
    }
    Taro.navigateBack();
  };

  return (
    <View className="avatar-progress-page">
      <PageBack />
      <Text className="brand">YEHEY</Text>
      <Image
        className="outline-image"
        src={require("@/assets/images/pet-outline.png")}
        mode="widthFix"
      />

      <View className="main-card">
        <Text className="card-title">正在定制专属动态</Text>

        <View className="progress-ring">
          <View
            className="progress-ring-fill"
            style={{
              background: `conic-gradient(${isSuccess ? "#07c160" : "#ff4d4f"} ${progress * 3.6}deg, #d8d8d8 ${progress * 3.6}deg)`,
            }}
          >
            <View className="progress-ring-inner">
              <Image
                className="ring-cat-image"
                src={require("@/assets/images/black-cat.png")}
                mode="aspectFit"
              />
              <Text className="progress-text">{progress}%</Text>
            </View>
          </View>
        </View>

        <View className="status-row">
          <Image
            className="status-icon"
            src={statusIcon}
            mode="aspectFit"
          />
          <Text className="status-text">
            {isSuccess ? "左右滑动查看行为动态" : "定制失败请重新上传图像"}
          </Text>
        </View>

        {isSuccess ? (
          <View className="preview-card">
            <View className="preview-row">
              <Text className="preview-arrow">〈</Text>
              <Image
                className="preview-image"
                src={require("@/assets/images/cat-stand.png")}
                mode="aspectFit"
              />
              <Text className="preview-arrow">〉</Text>
            </View>
            <Text className="preview-label">原地站立</Text>
          </View>
        ) : (
          <View className="preview-card">
            <View className="preview-row">
              <Text className="preview-arrow">〈</Text>
              <View className="preview-placeholder" />
              <Text className="preview-arrow">〉</Text>
            </View>
            <View className="retry-upload-btn" onClick={handleRetryUpload}>
              <Text className="retry-upload-text">重新上传</Text>
            </View>
            <Text className="retry-tip">本次不计入免费定制次数</Text>
          </View>
        )}

        <Text className="pet-summary-text">{petSummary}</Text>

        <View className="bottom-actions">
          <View className="bottom-btn" onClick={handleConfigDesktop}>
            <Text className="bottom-btn-text">立即配置桌面端</Text>
          </View>
          <View className="bottom-btn" onClick={handleGoHome}>
            <Text className="bottom-btn-text">直接进入主页</Text>
          </View>
        </View>

        <Text className="retry-link" onClick={handleRetryUpload}>
          不满意？重新定制
        </Text>
      </View>

      <View className="progress-track">
        <View className="progress-fill progress-step-3" />
      </View>
    </View>
  );
}
