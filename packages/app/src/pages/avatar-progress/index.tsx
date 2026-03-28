import { View, Text, Image } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { request } from "../../utils/request";
import { connectWs, subscribe } from "../../utils/ws";
import type {
  AvatarStatus,
  Pet,
  PetAvatar,
  PetAvatarAction,
} from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import "./index.scss";

const DEFAULT_PET_IMAGE = require("@/assets/images/black-cat.png");

function getSpeciesLabel(species: Pet["species"]) {
  return species === "cat" ? "猫咪" : "狗狗";
}

function getPetSummary(pet: Pet | null) {
  if (!pet) return "";
  return [pet.name, pet.breed || getSpeciesLabel(pet.species)].filter(Boolean).join(" ");
}

function getProgress(status: AvatarStatus) {
  if (status === "done") return 100;
  if (status === "processing") return 72;
  if (status === "failed") return 72;
  return 28;
}

function getStatusText(status: AvatarStatus) {
  if (status === "done") return "左右滑动查看行为动态";
  if (status === "failed") return "定制失败请重新上传图像";
  if (status === "processing") return "正在生成宠物动态图像";
  return "已收到照片，正在排队处理中";
}

export default function AvatarProgress() {
  const router = useRouter();
  const avatarId = router.params.avatarId;
  const [pet, setPet] = useState<Pet | null>(null);
  const [avatar, setAvatar] = useState<PetAvatar | null>(null);
  const [actions, setActions] = useState<PetAvatarAction[]>([]);
  const [status, setStatus] = useState<AvatarStatus>("pending");
  const petRequestIdRef = useRef<string | null>(null);

  const warnFetchAvatarError = (source: string, error: unknown) => {
    console.warn(`[avatar-progress] ${source} failed`, error);
  };

  const fetchAvatar = async (id: string) => {
    const res = await request<{ avatar: PetAvatar; actions: PetAvatarAction[] }>({
      url: `/api/avatars/${id}`,
    });

    setAvatar(res.avatar);
    setStatus(res.avatar.status);
    setActions([...res.actions].sort((a, b) => a.sortOrder - b.sortOrder));

    if (petRequestIdRef.current === res.avatar.petId) {
      return;
    }

    petRequestIdRef.current = res.avatar.petId;

    try {
      const petRes = await request<{ pet: Pet }>({ url: `/api/pets/${res.avatar.petId}` });
      setPet(petRes.pet);
    } catch {
      setPet(null);
    }
  };

  useEffect(() => {
    if (!avatarId) return;

    let cancelled = false;

    const loadAvatar = async () => {
      try {
        await fetchAvatar(avatarId);
      } catch (error) {
        if (cancelled) return;
        warnFetchAvatarError("initial load", error);
      }
    };

    void loadAvatar();

    return () => {
      cancelled = true;
    };
  }, [avatarId]);

  useEffect(() => {
    if (!avatarId || status === "done" || status === "failed") return;

    const timer = setInterval(() => {
      void fetchAvatar(avatarId).catch((error) => {
        warnFetchAvatarError("polling refresh", error);
      });
    }, 3000);

    return () => {
      clearInterval(timer);
    };
  }, [avatarId, status]);

  useEffect(() => {
    if (!avatarId) return;

    void connectWs();
    const unsubscribe = subscribe("avatar:done", (message) => {
      if (message.data.avatarId !== avatarId) {
        return;
      }

      void fetchAvatar(avatarId).catch((error) => {
        warnFetchAvatarError("ws refresh", error);
      });
    });

    return () => {
      unsubscribe();
    };
  }, [avatarId]);

  useEffect(() => {
    if (avatar?.petId) {
      return;
    }
    petRequestIdRef.current = null;
  }, [avatar?.petId]);

  const isSuccess = status === "done";
  const isFailed = status === "failed";
  const previewAction = actions[0] ?? null;
  const progress = getProgress(status);
  const statusIcon = isFailed
    ? require("@/assets/images/fail-icon.png")
    : require("@/assets/images/success-icon.png");

  const ringColor = isFailed ? "#ff4d4f" : "#07c160";
  const petSummary = getPetSummary(pet);

  const handleConfigDesktop = () => {
    Taro.navigateTo({ url: "/pages/desktop-bind/index" });
  };

  const handleGoHome = () => {
    Taro.switchTab({ url: "/pages/index/index" });
  };

  const handleRetryUpload = () => {
    if (avatar?.petId) {
      Taro.navigateTo({ url: `/pages/pet-avatar/index?petId=${avatar.petId}` });
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
              background: `conic-gradient(${ringColor} ${progress * 3.6}deg, #d8d8d8 ${progress * 3.6}deg)`,
            }}
          >
            <View className="progress-ring-inner">
              <Image
                className="ring-cat-image"
                src={DEFAULT_PET_IMAGE}
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
          <Text className="status-text">{getStatusText(status)}</Text>
        </View>

        {isSuccess ? (
          <View className="preview-card">
            <View className="preview-row">
              <Text className="preview-arrow">〈</Text>
              <Image
                className="preview-image"
                src={previewAction?.imageUrl || require("@/assets/images/cat-stand.png")}
                mode="aspectFit"
              />
              <Text className="preview-arrow">〉</Text>
            </View>
            <Text className="preview-label">{previewAction?.actionType || "定制完成"}</Text>
          </View>
        ) : isFailed ? (
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
        ) : (
          <View className="preview-card">
            <View className="preview-row">
              <Text className="preview-arrow">〈</Text>
              <View className="preview-placeholder" />
              <Text className="preview-arrow">〉</Text>
            </View>
            <Text className="preview-label">结果生成后将在这里展示</Text>
          </View>
        )}

        {petSummary ? <Text className="pet-summary-text">{petSummary}</Text> : null}

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
