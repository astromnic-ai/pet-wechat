import { View, Text, Image } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useState } from "react";
import type { Pet, PetAvatar, User } from "@pet-wechat/shared";
import { request, uploadFile } from "../../utils/request";
import "./index.scss";

const PHOTO_PLACEHOLDER_IMAGE = require("./images/upload-icon.png");
const EXAMPLE_GOOD_IMAGE = require("./images/example-good.png");
const EXAMPLE_BAD_COVERED_IMAGE = require("./images/example-bad-covered.png");
const EXAMPLE_BAD_BACK_IMAGE = require("./images/example-bad-back.png");
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

const PHOTO_EXAMPLES = [
  {
    image: EXAMPLE_GOOD_IMAGE,
    statusLabel: "正确示例",
    description: "面部清晰 光线好",
    status: "good" as const,
  },
  {
    image: EXAMPLE_BAD_COVERED_IMAGE,
    statusLabel: "错误示例",
    description: "宠物特征遮挡",
    status: "bad" as const,
  },
  {
    image: EXAMPLE_BAD_BACK_IMAGE,
    statusLabel: "错误示例",
    description: "避免背面照片",
    status: "bad" as const,
  },
];

function resolveLatestAvatar(avatars: PetAvatar[] = []) {
  return [...avatars].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
}

function getChooseImageErrorMessage(error?: unknown) {
  const message = typeof error === "object" && error && "errMsg" in error ? String((error as any).errMsg) : "";
  if (message.includes("cancel")) return "";
  if (message.includes("auth deny") || message.includes("permission") || message.includes("authorize")) {
    return "需要相册或相机权限";
  }
  return "选择图片失败，请重试";
}

function needsImagePermissionGuide(error?: unknown) {
  const message = typeof error === "object" && error && "errMsg" in error ? String((error as any).errMsg) : "";
  return message.includes("auth deny") || message.includes("permission") || message.includes("authorize");
}

export default function PetAvatar() {
  const router = useRouter();
  const petId = router.params.petId;
  const [previewImage, setPreviewImage] = useState("");
  const [localImagePath, setLocalImagePath] = useState("");
  const [existingImageUrl, setExistingImageUrl] = useState("");
  const [selectedImageSize, setSelectedImageSize] = useState<number | null>(null);
  const [pet, setPet] = useState<Pet | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!petId) {
      setPet(null);
      setPreviewImage("");
      setLocalImagePath("");
      setExistingImageUrl("");
      setSelectedImageSize(null);
      setUser(null);
      return;
    }

    let cancelled = false;

    setPreviewImage("");
    setLocalImagePath("");
    setExistingImageUrl("");
    setSelectedImageSize(null);
    setUser(null);

    void Promise.all([
      request<{ pet: Pet; avatars: PetAvatar[] }>({ url: `/api/pets/${petId}` }),
      request<{ user: User }>({ url: "/api/me" }).catch(() => ({ user: null as User | null })),
    ])
      .then(([res, userRes]) => {
        if (cancelled) return;
        const latestAvatar = resolveLatestAvatar(res.avatars);
        const latestImageUrl = latestAvatar?.sourceImageUrl || "";
        setPet(res.pet);
        setExistingImageUrl(latestImageUrl);
        setPreviewImage(latestImageUrl);
        setUser(userRes.user);
      })
      .catch(() => {
        if (cancelled) return;
        setPet(null);
        setExistingImageUrl("");
        setPreviewImage("");
        setUser(null);
      });

    return () => {
      cancelled = true;
    };
  }, [petId]);

  const chooseImage = async () => {
    try {
      const res = await Taro.chooseImage({
        count: 1,
        sizeType: ["compressed"],
        sourceType: ["album", "camera"],
      });
      const selectedFile = res.tempFiles?.[0];
      const nextImageSize = selectedFile?.size ?? null;
      if (nextImageSize !== null && nextImageSize > MAX_UPLOAD_SIZE) {
        setPreviewImage(existingImageUrl);
        setLocalImagePath("");
        setSelectedImageSize(null);
        Taro.showToast({ title: "文件过大，请上传 10MB 以内的图片", icon: "none" });
        return;
      }
      const nextPath = res.tempFilePaths?.[0] || "";
      if (!nextPath) return;

      setSelectedImageSize(nextImageSize);
      setLocalImagePath(nextPath);
      setPreviewImage(nextPath);
    } catch (error) {
      const errorMessage = getChooseImageErrorMessage(error);
      if (errorMessage) {
        Taro.showToast({ title: errorMessage, icon: "none" });
      }

      if (needsImagePermissionGuide(error)) {
        Taro.showModal({
          title: "需要相册或相机权限",
          content: "请在微信设置中打开相册或相机权限后，再重新上传宠物照片。",
          confirmText: "去设置",
          success: (res) => {
            if (res.confirm) {
              void Taro.openSetting().catch(() => {
                Taro.showToast({ title: "请手动前往设置开启权限", icon: "none" });
              });
            }
          },
        });
      }
    }
  };

  const handleChooseImage = async () => {
    if (existingImageUrl || localImagePath || previewImage) {
      Taro.showModal({
        title: "发现已有图片",
        content: "您已经上传过一张图片，是否要替换为新的图片？",
        cancelText: "取消",
        confirmText: "替换图片",
        confirmColor: "#f4b400",
        success: (res) => {
          if (res.confirm) {
            void chooseImage();
          }
        },
      });
      return;
    }

    await chooseImage();
  };

  const handleUpload = async () => {
    if (!petId || !previewImage || loading) return;
    if (selectedImageSize !== null && selectedImageSize > MAX_UPLOAD_SIZE) {
      Taro.showToast({ title: "文件过大，请上传 10MB 以内的图片", icon: "none" });
      return;
    }
    setLoading(true);
    try {
      let sourceImageUrl = existingImageUrl;

      if (localImagePath) {
        try {
          const uploadData = await uploadFile<{ url: string; fileId: string }>({
            url: "/api/upload",
            filePath: localImagePath,
            name: "file",
          });
          sourceImageUrl = uploadData.url;
        } catch (e: any) {
          Taro.showToast({ title: e.message || "文件上传失败", icon: "none" });
          return;
        }
      }

      if (!sourceImageUrl) {
        Taro.showToast({ title: "请先上传宠物照片", icon: "none" });
        return;
      }

      let avatar: { id: string };
      try {
        const res = await request<{ avatar: { id: string } }>({
          url: "/api/avatars",
          method: "POST",
          data: {
            petId,
            sourceImageUrl,
          },
        });
        avatar = res.avatar;
      } catch (e: any) {
        Taro.showToast({ title: e.message || "创建定制任务失败", icon: "none" });
        return;
      }

      Taro.redirectTo({ url: `/pages/avatar-progress/index?avatarId=${avatar.id}` });
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    Taro.switchTab({ url: "/pages/index/index" });
  };

  const handleBack = () => {
    Taro.navigateBack({
      fail: () => {
        if (petId) {
          Taro.reLaunch({ url: `/pages/pet-info/index?petId=${petId}` });
          return;
        }

        Taro.switchTab({ url: "/pages/index/index" });
      },
    });
  };

  const avatarQuotaRemaining = Math.max(
    0,
    Number(user?.avatarQuotaRemaining ?? user?.avatarQuota ?? 0),
  );
  const avatarQuotaTotal = Math.max(
    avatarQuotaRemaining,
    Number(user?.avatarQuotaTotal ?? 0),
  );
  const quotaText =
    avatarQuotaTotal > 0
      ? `当前可定制${avatarQuotaRemaining}次（${avatarQuotaRemaining}/${avatarQuotaTotal}）`
      : "当前暂无可用定制次数，请先绑定摆台或购买套餐";

  return (
    <View className="pet-avatar-page">
      <View className="upload-page-header">
        <View className="upload-page-title-row">
          <View className="upload-page-back" onClick={handleBack}>
            <Text className="upload-page-back-icon">←</Text>
          </View>
          <Text className="upload-page-title">上传您的宠物照片</Text>
        </View>
        <Text className="upload-page-subtitle">我们将为您生成专属的宠物定制形象</Text>
      </View>

      <View className="main-card">
        <View className="upload-box">
          <View className={`upload-preview-wrap ${previewImage ? "upload-preview-wrap--selected" : ""}`}>
            <Image
              className={`upload-preview ${previewImage ? "upload-preview--selected" : ""}`}
              src={previewImage || PHOTO_PLACEHOLDER_IMAGE}
              mode={previewImage ? "aspectFill" : "aspectFit"}
            />
          </View>
          <Text className="upload-box-title">点击上传或拍摄照片</Text>
          <Text className="upload-box-subtitle">支持 JPG、PNG 格式，最大 10MB</Text>
          <View className="upload-trigger" onClick={handleChooseImage}>
            <Text className="upload-trigger-text">{previewImage ? "重新选择照片" : "点击上传照片"}</Text>
          </View>
          <Text className="quota-text">{quotaText}</Text>
        </View>

        <View className="upload-tips-card">
          <View className="upload-tips-heading">
            <Text className="upload-tips-icon">💡</Text>
            <Text className="upload-tips-title">上传示例</Text>
          </View>
          <View className="upload-example-list">
            {PHOTO_EXAMPLES.map((example) => (
              <View
                key={example.description}
                className={`upload-example-card upload-example-card--${example.status}`}
              >
                <View className="upload-example-status">
                  <View className={`upload-example-status-dot upload-example-status-dot--${example.status}`} />
                  <Text className={`upload-example-status-text upload-example-status-text--${example.status}`}>
                    {example.statusLabel}
                  </Text>
                </View>
                <Image className="upload-example-image" src={example.image} mode="aspectFit" />
                <Text className="upload-example-description">{example.description}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className={`primary-action ${!previewImage ? "disabled" : ""}`} onClick={handleUpload}>
          <Text className="primary-action-text">
            {loading ? "上传中..." : "开始定制宠物动态图像"}
          </Text>
        </View>
      </View>

      <View className="secondary-action" onClick={handleSkip}>
        <Text className="secondary-action-text">跳过，稍后再完成</Text>
      </View>
    </View>
  );
}
