import { View, Text, Image, Input } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import type { User } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import { request, uploadFile } from "../../utils/request";
import { setUserInfo } from "../../utils/storage";
import "./index.scss";

const DEFAULT_AVATAR = require("@/assets/images/black cat 3.png");
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

function isPlaceholderNickname(value?: string | null) {
  const trimmed = value?.trim() || "";
  return (
    !trimmed ||
    trimmed === "微信用户" ||
    trimmed === "开发用户" ||
    trimmed === "测试用户" ||
    /^用户\d{4}$/.test(trimmed)
  );
}

function getChooseImageErrorMessage(error?: unknown) {
  const message = typeof error === "object" && error && "errMsg" in error ? String((error as any).errMsg) : "";
  if (message.includes("cancel")) return "";
  if (message.includes("auth deny") || message.includes("permission") || message.includes("authorize")) {
    return "需要相册或相机权限";
  }
  return "选择头像失败，请重试";
}

function needsImagePermissionGuide(error?: unknown) {
  const message = typeof error === "object" && error && "errMsg" in error ? String((error as any).errMsg) : "";
  return message.includes("auth deny") || message.includes("permission") || message.includes("authorize");
}

export default function ProfileEdit() {
  const [user, setUser] = useState<User | null>(null);
  const [nickname, setNickname] = useState("");
  const [avatarPreview, setAvatarPreview] = useState("");
  const [localAvatarPath, setLocalAvatarPath] = useState("");
  const [saving, setSaving] = useState(false);

  const loadUser = async () => {
    const res = await request<{ user: User }>({ url: "/api/me" }).catch(() => ({ user: null as User | null }));
    setUser(res.user);
    setNickname(isPlaceholderNickname(res.user?.nickname) ? "" : res.user?.nickname?.trim() || "");
    setAvatarPreview(res.user?.avatarUrl || "");
    setLocalAvatarPath("");
  };

  useDidShow(() => {
    Taro.hideTabBar();
    void loadUser();
  });

  const handleChooseAvatar = async () => {
    try {
      const res = await Taro.chooseImage({
        count: 1,
        sizeType: ["compressed"],
        sourceType: ["album", "camera"],
      });
      const selectedFile = res.tempFiles?.[0];
      const nextImageSize = selectedFile?.size ?? null;
      if (nextImageSize !== null && nextImageSize > MAX_UPLOAD_SIZE) {
        Taro.showToast({ title: "文件过大，请上传 10MB 以内的图片", icon: "none" });
        return;
      }
      const nextPath = res.tempFilePaths?.[0] || "";
      if (!nextPath) return;
      setAvatarPreview(nextPath);
      setLocalAvatarPath(nextPath);
    } catch (error) {
      const errorMessage = getChooseImageErrorMessage(error);
      if (errorMessage) {
        Taro.showToast({ title: errorMessage, icon: "none" });
      }

      if (needsImagePermissionGuide(error)) {
        Taro.showModal({
          title: "需要相册或相机权限",
          content: "请在微信设置中打开相册或相机权限后，再重新上传头像。",
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

  const handleSave = async () => {
    const trimmedNickname = nickname.trim();
    if (!trimmedNickname) {
      Taro.showToast({ title: "请输入昵称", icon: "none" });
      return;
    }

    if (saving) return;
    setSaving(true);
    try {
      let nextAvatarUrl = user?.avatarUrl || null;

      if (localAvatarPath) {
        const uploadRes = await uploadFile<{ url: string }>({
          url: "/api/upload",
          filePath: localAvatarPath,
          name: "file",
        });
        nextAvatarUrl = uploadRes.url;
      }

      const res = await request<{ user: User }>({
        url: "/api/me",
        method: "PUT",
        data: {
          nickname: trimmedNickname,
          avatarUrl: nextAvatarUrl,
        },
      });

      setUserInfo(res.user);
      Taro.showToast({ title: "保存成功", icon: "success" });
      setTimeout(() => {
        Taro.navigateBack();
      }, 400);
    } catch (error: any) {
      Taro.showToast({ title: error?.message || "保存失败，请稍后重试", icon: "none" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="profile-edit-page">
      <View className="profile-edit-top-strip" />
      <View className="profile-edit-header">
        <PageBack inline fallbackUrl="/pages/profile/index" />
        <Text className="profile-edit-title">编辑用户信息</Text>
      </View>

      <View className="profile-edit-shell">
        <View className="profile-edit-card">
          <View className="avatar-section">
            <Image
              className="avatar-preview"
              src={avatarPreview || user?.avatarUrl || DEFAULT_AVATAR}
              mode="aspectFill"
              onClick={handleChooseAvatar}
            />
            <View className="avatar-change-btn" onClick={handleChooseAvatar}>
              <Text className="avatar-change-btn-text">更换头像</Text>
            </View>
            <Text className="avatar-tip">支持拍照或从相册选择</Text>
          </View>

          <View className="field-block">
            <Text className="field-label">用户昵称</Text>
            <View className="field-input-wrap">
              <Input
                className="field-input"
                value={nickname}
                maxlength={20}
                placeholder="请输入昵称"
                placeholderClass="field-placeholder"
                onInput={(e) => setNickname(e.detail.value)}
              />
            </View>
          </View>

          <View className="field-block">
            <Text className="field-label">当前账号ID</Text>
            <View className="field-readonly">
              <Text className="field-readonly-text">{user?.phone?.trim() || user?.id || "--"}</Text>
            </View>
          </View>

          <View className={`save-btn ${saving ? "save-btn--disabled" : ""}`} onClick={handleSave}>
            <Text className="save-btn-text">{saving ? "保存中..." : "保存信息"}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
