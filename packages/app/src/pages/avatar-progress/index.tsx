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

function getDisplayPetName(pet?: Pet | null) {
  return pet?.name?.trim() || "宠物";
}

function getProgress(status: AvatarStatus) {
  if (status === "done") return 100;
  if (status === "processing") return 72;
  if (status === "failed") return 72;
  return 28;
}

function getStatusText(status: AvatarStatus) {
  if (status === "done") return "新形象已生成";
  if (status === "failed") return "定制失败请重新上传图像";
  if (status === "processing") return "预计需要 2-3 分钟";
  return "预计需要 2-3 分钟";
}

export default function AvatarProgress() {
  const router = useRouter();
  const avatarId = router.params.avatarId;
  const forcedStatus = router.params.status as AvatarStatus | undefined;
  const customLabel = router.params.label ? decodeURIComponent(router.params.label) : "";
  const source = router.params.source || "";
  const [pet, setPet] = useState<Pet | null>(null);
  const [avatar, setAvatar] = useState<PetAvatar | null>(null);
  const [actions, setActions] = useState<PetAvatarAction[]>([]);
  const [status, setStatus] = useState<AvatarStatus>("pending");
  const [loadError, setLoadError] = useState("");
  const petRequestIdRef = useRef<string | null>(null);

  const warnFetchAvatarError = (source: string, error: unknown) => {
    console.warn(`[avatar-progress] ${source} failed`, error);
  };

  const getErrorMessage = (error: unknown) => {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    return "无法读取定制任务，请稍后重试";
  };

  const fetchAvatar = async (id: string) => {
    const res = await request<{ avatar: PetAvatar; actions: PetAvatarAction[] }>({
      url: `/api/avatars/${id}`,
    });

    setLoadError("");
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
    if (!avatarId) {
      if (forcedStatus) {
        setStatus(forcedStatus);
      }
      return;
    }

    let cancelled = false;

    const loadAvatar = async () => {
      try {
        await fetchAvatar(avatarId);
      } catch (error) {
        if (cancelled) return;
        warnFetchAvatarError("initial load", error);
        setLoadError(getErrorMessage(error));
      }
    };

    void loadAvatar();

    return () => {
      cancelled = true;
    };
  }, [avatarId, forcedStatus]);

  useEffect(() => {
    if (!avatarId || status === "done" || status === "failed") return;

    const timer = setInterval(() => {
      void fetchAvatar(avatarId).catch((error) => {
        warnFetchAvatarError("polling refresh", error);
        if (!avatar) {
          setLoadError(getErrorMessage(error));
        }
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

  useEffect(() => {
    const routePetId = router.params.petId;
    if (avatarId || !routePetId) return;

    void request<{ pet: Pet }>({ url: `/api/pets/${routePetId}` })
      .then((res) => setPet(res.pet))
      .catch(() => setPet(null));
  }, [avatarId, router.params.petId]);

  const hasLoadError = !!loadError && !!avatarId && !avatar;
  const isSuccess = !hasLoadError && status === "done";
  const isFailed = hasLoadError || status === "failed";
  const isCustomActionFlow = source === "custom-action";
  const previewAction = actions[0] ?? null;
  const progress = getProgress(status);
  const statusIcon = isFailed
    ? require("@/assets/images/fail-icon.png")
    : require("@/assets/images/success-icon.png");

  const ringColor = isFailed ? "#ff4d4f" : "#07c160";
  const handleGoHome = () => {
    Taro.switchTab({ url: "/pages/index/index" });
  };

  const handleRetryUpload = () => {
    if (avatar?.petId) {
      Taro.navigateTo({ url: `/pages/pet-avatar/index?petId=${avatar.petId}` });
      return;
    }
    if (router.params.petId) {
      Taro.navigateTo({ url: `/pages/pet-avatar/index?petId=${router.params.petId}` });
      return;
    }
    Taro.navigateBack();
  };

  const handleRetryLoad = () => {
    if (!avatarId) {
      handleRetryUpload();
      return;
    }

    setLoadError("");
    void fetchAvatar(avatarId).catch((error) => {
      warnFetchAvatarError("manual retry", error);
      setLoadError(getErrorMessage(error));
    });
  };

  const handlePrimarySuccessAction = () => {
    if (isCustomActionFlow) {
      Taro.navigateBack({ delta: 1, fail: () => Taro.switchTab({ url: "/pages/index/index" }) });
      return;
    }

    handleGoHome();
  };

  return (
    <View className="avatar-progress-page">
      <PageBack />
      {isSuccess ? (
        <View className="success-shell">
          <View className="success-badge">
            <Image className="success-badge-icon" src={statusIcon} mode="aspectFit" />
          </View>
          <Text className="success-title">定制成功!</Text>
          <Text className="success-subtitle">
            {isCustomActionFlow
              ? `${customLabel || "自定义动作"}已生成`
              : `${getDisplayPetName(pet)}的新形象已生成`}
          </Text>

          <View className="success-preview-card">
            <View className="success-preview-header">
              <Text className="success-preview-title">预览</Text>
              <View className="success-preview-tag">
                <Text className="success-preview-tag-text">新</Text>
              </View>
            </View>

            <View className="success-preview-stage">
              <Image
                className="success-preview-image"
                src={previewAction?.imageUrl || require("@/assets/images/cat-stand.png")}
                mode="aspectFit"
              />
              <Text className="success-preview-label">
                {isCustomActionFlow
                  ? `${customLabel || "自定义宠物行为"}`
                  : `${getDisplayPetName(pet)}的定制形象`}
              </Text>
            </View>
          </View>

          <View className="success-primary-btn" onClick={handlePrimarySuccessAction}>
            <Text className="success-primary-btn-text">{isCustomActionFlow ? "添加自定义" : "设为头像"}</Text>
          </View>

          <View className="success-secondary-row">
            <View className="success-secondary-btn" onClick={handleRetryUpload}>
              <Text className="success-secondary-btn-text">⟳ 重新定制</Text>
            </View>
            <View className="success-secondary-btn" onClick={() => Taro.showToast({ title: "已保存到相册", icon: "success" })}>
              <Text className="success-secondary-btn-text">▣ 保存到相册</Text>
            </View>
          </View>

          <Text className="success-tip">
            {isCustomActionFlow ? "可以在宠物信息页继续管理自定义动作" : "可以随时在宠物信息设置中更换形象"}
          </Text>
        </View>
      ) : isFailed ? (
        <View className="progress-shell">
          <View className="preview-stage-card preview-stage-card--failed">
            <View className="preview-stage-card-inner preview-stage-card-inner--failed">
              <Image className="status-hero-icon" src={statusIcon} mode="aspectFit" />
            </View>
          </View>

          <Text className="progress-title">{hasLoadError ? "定制任务读取失败" : "生成失败"}</Text>
          <Text className="progress-subtitle">{hasLoadError ? loadError : getStatusText(status)}</Text>

          <View className="progress-panel">
            <View className="progress-meta">
              <Text className="progress-meta-label">处理进度</Text>
              <Text className="progress-meta-value">{progress}%</Text>
            </View>
            <View className="progress-bar">
              <View className="progress-bar-fill" style={{ width: `${progress}%` }} />
            </View>
          </View>

          <View className="step-card">
            <View className="step-item">
              <View className="step-icon step-icon--done">✓</View>
              <Text className="step-text">上传照片完成</Text>
            </View>
            <View className="step-item">
              <View className="step-icon step-icon--error">✕</View>
              <Text className="step-text">{hasLoadError ? "未能确认定制任务" : "生成专属形象失败"}</Text>
            </View>
          </View>

          <View className="footer-card">
            <View className="footer-primary-btn" onClick={hasLoadError ? handleRetryLoad : handleRetryUpload}>
              <Text className="footer-primary-btn-text">{hasLoadError ? "重新读取" : "重新上传"}</Text>
            </View>
            <Text className="footer-tip">
              {hasLoadError ? `任务编号：${avatarId}` : "失败后本次定制次数不会被占用"}
            </Text>
          </View>
        </View>
      ) : (
        <View className="progress-shell">
          <View className="preview-stage-card">
            <View className="preview-stage-card-inner">
              <View className="preview-stage-dot" />
            </View>
          </View>

          <Text className="progress-title">正在生成您的宠物定制形象</Text>
          <Text className="progress-subtitle">预计需要 2-3 分钟</Text>

          <View className="progress-panel">
            <View className="progress-meta">
              <Text className="progress-meta-label">处理进度</Text>
              <Text className="progress-meta-value">{progress}%</Text>
            </View>
            <View className="progress-bar">
              <View className="progress-bar-fill" style={{ width: `${progress}%` }} />
            </View>
          </View>

          <View className="step-card">
            <View className="step-item">
              <View className="step-icon step-icon--done">✓</View>
              <Text className="step-text">上传照片完成</Text>
            </View>
            <View className="step-item">
              <View className="step-icon step-icon--active">…</View>
              <Text className="step-text">正在分析宠物特征…</Text>
            </View>
            <View className="step-item">
              <View className="step-icon step-icon--pending">•</View>
              <Text className="step-text step-text--muted">生成专属形象</Text>
            </View>
          </View>

          <View className="footer-card">
            <View className="footer-primary-btn" onClick={handleGoHome}>
              <Text className="footer-primary-btn-text">进入主页</Text>
            </View>
            <Text className="footer-tip">可先进入主页，生成完成后将通知您</Text>
          </View>
        </View>
      )}
    </View>
  );
}
