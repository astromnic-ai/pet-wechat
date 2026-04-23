import { View, Text, Image } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useState } from "react";
import { request, uploadFile } from "../../utils/request";
import type { Pet } from "@pet-wechat/shared";
import "./index.scss";

const PHOTO_PLACEHOLDER_IMAGE = require("./images/upload-icon.png");
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const FREE_AVATAR_TOTAL = 2;

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
  const [images, setImages] = useState<string[]>([]);
  const [selectedImageSize, setSelectedImageSize] = useState<number | null>(null);
  const [pet, setPet] = useState<Pet | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!petId) {
      setPet(null);
      return;
    }

    request<{ pet: Pet }>({ url: `/api/pets/${petId}` })
      .then((res) => setPet(res.pet))
      .catch(() => setPet(null));
  }, [petId]);

  const handleChooseImage = async () => {
    try {
      const res = await Taro.chooseImage({
        count: 1,
        sizeType: ["compressed"],
        sourceType: ["album", "camera"],
      });
      const selectedFile = res.tempFiles?.[0];
      const nextImageSize = selectedFile?.size ?? null;
      if (nextImageSize !== null && nextImageSize > MAX_UPLOAD_SIZE) {
        setImages([]);
        setSelectedImageSize(null);
        Taro.showToast({ title: "文件过大，请上传 10MB 以内的图片", icon: "none" });
        return;
      }
      setSelectedImageSize(nextImageSize);
      setImages(res.tempFilePaths.slice(0, 1));
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

  const handleUpload = async () => {
    if (!petId || images.length === 0 || loading) return;
    if (selectedImageSize !== null && selectedImageSize > MAX_UPLOAD_SIZE) {
      Taro.showToast({ title: "文件过大，请上传 10MB 以内的图片", icon: "none" });
      return;
    }
    setLoading(true);
    try {
      let uploadData: { url: string; fileId: string };
      try {
        uploadData = await uploadFile<{ url: string; fileId: string }>({
          url: "/api/upload",
          filePath: images[0],
          name: "file",
        });
      } catch (e: any) {
        Taro.showToast({ title: e.message || "文件上传失败", icon: "none" });
        return;
      }

      let avatar: { id: string };
      try {
        const res = await request<{ avatar: { id: string } }>({
          url: "/api/avatars",
          method: "POST",
          data: {
            petId,
            sourceImageUrl: uploadData.url,
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

  const previewImage = images[0] || "";
  return (
    <View className="pet-avatar-page">
      <View className="upload-page-header">
        <Text className="upload-page-title">上传您的宠物照片</Text>
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
          <Text className="upload-box-subtitle">支持图片，不支持视频</Text>
          <View className="upload-trigger" onClick={handleChooseImage}>
            <Text className="upload-trigger-text">点击上传照片</Text>
          </View>
          <Text className="quota-text">新用户免费定制{FREE_AVATAR_TOTAL}次（{FREE_AVATAR_TOTAL}/{FREE_AVATAR_TOTAL}）</Text>
        </View>

        <View className="upload-tips-card">
          <View className="upload-tips-heading">
            <Text className="upload-tips-icon">💡</Text>
            <Text className="upload-tips-title">上传建议</Text>
          </View>
          <View className="upload-tip-item">
            <View className="upload-tip-dot" />
            <Text className="upload-tip-text">选择清晰、光线充足的照片</Text>
          </View>
          <View className="upload-tip-item">
            <View className="upload-tip-dot" />
            <Text className="upload-tip-text">宠物面部完整可见</Text>
          </View>
          <View className="upload-tip-item">
            <View className="upload-tip-dot" />
            <Text className="upload-tip-text">避免背景杂乱</Text>
          </View>
        </View>

        <View className={`primary-action ${images.length === 0 ? "disabled" : ""}`} onClick={handleUpload}>
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
