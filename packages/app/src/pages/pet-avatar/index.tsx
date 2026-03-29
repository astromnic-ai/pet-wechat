import { View, Text, Image } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useState } from "react";
import { request, uploadFile } from "../../utils/request";
import type { Pet, User } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import "./index.scss";

const EXAMPLE_LABELS = [
  "完整正面露出尾巴",
  "完整侧面面部清晰",
  "光线不足面部模糊",
  "局部遮挡身体缺失",
];

const CAT_EXAMPLE_IMAGES = [
  require("@/assets/images/black cat 3.png"),
  require("@/assets/images/black cat 3.png"),
  require("@/assets/images/pet-avatar-default.png"),
  require("@/assets/images/pet-avatar-default.png"),
];

const DOG_EXAMPLE_IMAGES = [
  require("@/assets/images/husky.png"),
  require("@/assets/images/husky.png"),
  require("@/assets/images/pet-avatar-default.png"),
  require("@/assets/images/pet-avatar-default.png"),
];

const DEFAULT_CAT_IMAGE = require("@/assets/images/black cat 3.png");
const DEFAULT_DOG_IMAGE = require("@/assets/images/husky.png");
const PHOTO_PLACEHOLDER_IMAGE = require("@/assets/images/pet-avatar-default.png");
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

function parseQuota(value?: string) {
  const quota = Number(value);
  return Number.isFinite(quota) && quota >= 0 ? quota : null;
}

function getSpeciesLabel(species: Pet["species"]) {
  return species === "cat" ? "猫咪" : "狗狗";
}

function getPetSummary(pet: Pet | null) {
  if (!pet) return "";
  return [pet.name, pet.breed || getSpeciesLabel(pet.species)].filter(Boolean).join(" ");
}

function getSpeciesExamples(species: Pet["species"] | undefined) {
  return species === "dog" ? DOG_EXAMPLE_IMAGES : CAT_EXAMPLE_IMAGES;
}

function getSpeciesAvatar(species: Pet["species"] | undefined) {
  return species === "dog" ? DEFAULT_DOG_IMAGE : DEFAULT_CAT_IMAGE;
}

export default function PetAvatar() {
  const router = useRouter();
  const petId = router.params.petId;
  const routeQuota = parseQuota(router.params.avatarQuota);
  const [images, setImages] = useState<string[]>([]);
  const [selectedImageSize, setSelectedImageSize] = useState<number | null>(null);
  const [pet, setPet] = useState<Pet | null>(null);
  const [quota, setQuota] = useState({
    remaining: routeQuota ?? 0,
    total: routeQuota ?? 0,
  });
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

  useEffect(() => {
    if (routeQuota !== null) {
      setQuota({ remaining: routeQuota, total: routeQuota });
      return;
    }

    request<{ user: User }>({ url: "/api/me" })
      .then((res) => {
        const avatarQuota = res.user.avatarQuota ?? 0;
        setQuota({ remaining: avatarQuota, total: avatarQuota });
      })
      .catch(() => {
        setQuota({ remaining: 0, total: 0 });
      });
  }, [routeQuota]);

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
    } catch {}
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

  const exampleImages = getSpeciesExamples(pet?.species);
  const summaryImage = getSpeciesAvatar(pet?.species);
  const previewImage = images[0] || "";

  return (
    <View className="pet-avatar-page">
      <PageBack />
      <Text className="brand">YEHEY</Text>
      <Image
        className="outline-image"
        src={require("@/assets/images/pet-outline.png")}
        mode="widthFix"
      />

      <View className="main-card">
        <Text className="card-title">定制宠物动态</Text>

        <View className="pet-summary">
          <Image
            className="pet-summary-image"
            src={summaryImage}
            mode="aspectFit"
          />
          {pet ? <Text className="pet-summary-text">{getPetSummary(pet)}</Text> : null}
        </View>

        <Text className="example-title">图像上传示例：</Text>
        <View className="example-row">
          {EXAMPLE_LABELS.map((label, index) => (
            <View key={label} className="example-item">
              <Image
                className="example-image"
                src={exampleImages[index]}
                mode="aspectFit"
              />
              <Text className="example-label">{label}</Text>
            </View>
          ))}
        </View>

        <Text className="upload-tip">上传宠物照片，专属定制宠物动态图像</Text>

        <View className="upload-box">
          <Image
            className={`upload-preview ${previewImage ? "upload-preview--selected" : ""}`}
            src={previewImage || PHOTO_PLACEHOLDER_IMAGE}
            mode={previewImage ? "aspectFill" : "aspectFit"}
          />
          <View className="upload-trigger" onClick={handleChooseImage}>
            <Text className="upload-trigger-text">点击上传照片</Text>
          </View>
          <Text className="quota-text">当前定制额度（{quota.remaining}/{quota.total}）</Text>
        </View>

        <View className={`primary-action ${images.length === 0 ? "disabled" : ""}`} onClick={handleUpload}>
          <Text className="primary-action-text">
            {loading ? "上传中..." : "开始定制宠物动态图像"}
          </Text>
        </View>

        <View className="secondary-action" onClick={handleSkip}>
          <Text className="secondary-action-text">跳过，稍后再完成</Text>
        </View>
      </View>

      <View className="progress-track">
        <View className="progress-fill progress-step-2" />
      </View>
    </View>
  );
}
