import { View, Text, Image, Input, Picker, ScrollView, Button } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import type { User } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import { request, uploadFile } from "../../utils/request";
import { getUserProfileExtras, setUserInfo, setUserProfileExtras, type ProfileGender } from "../../utils/storage";
import "./index.scss";

const DEFAULT_AVATAR = require("@/assets/images/black cat 3.png");
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const GENDER_OPTIONS: Array<{ value: ProfileGender; label: string }> = [
  { value: "female", label: "女" },
  { value: "male", label: "男" },
  { value: "unknown", label: "保密" },
];

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

function maskPhone(phone?: string | null) {
  const digits = String(phone || "").replace(/\s+/g, "");
  if (!digits) return "未绑定";
  if (digits.length < 7) return digits;
  return `${digits.slice(0, 3)} **** ${digits.slice(-4)}`;
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

function getGenderLabel(gender: ProfileGender) {
  return GENDER_OPTIONS.find((item) => item.value === gender)?.label || "保密";
}

export default function ProfileEdit() {
  const [user, setUser] = useState<User | null>(null);
  const [nickname, setNickname] = useState("");
  const [avatarPreview, setAvatarPreview] = useState("");
  const [localAvatarPath, setLocalAvatarPath] = useState("");
  const [gender, setGender] = useState<ProfileGender>("female");
  const [birthday, setBirthday] = useState("2002-08-15");
  const [saving, setSaving] = useState(false);

  const loadUser = async () => {
    const res = await request<{ user: User }>({ url: "/api/me" }).catch(() => ({ user: null as User | null }));
    const extras = getUserProfileExtras(res.user?.id || null);

    setUser(res.user);
    setNickname(isPlaceholderNickname(res.user?.nickname) ? "" : res.user?.nickname?.trim() || "");
    setAvatarPreview(res.user?.avatarUrl || "");
    setLocalAvatarPath("");
    setGender(extras.gender);
    setBirthday(extras.birthday || "2002-08-15");
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

  const handleWechatAvatarChosen = (event: any) => {
    const avatarPath = event?.detail?.avatarUrl?.trim?.() || "";
    if (!avatarPath) return;
    setAvatarPreview(avatarPath);
    setLocalAvatarPath(avatarPath);
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
      setUserProfileExtras(res.user.id, {
        gender,
        birthday,
        verified: true,
      });
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

  const handleModifyPhone = () => {
    Taro.navigateTo({ url: "/pages/settings/bind-phone" });
  };

  const handleModifyEmail = () => {
    Taro.navigateTo({ url: "/pages/settings/bind-email" });
  };

  const handleChangePassword = () => {
    Taro.showToast({ title: "修改密码功能即将上线", icon: "none" });
  };

  const handleVerified = () => {
    Taro.showToast({ title: "当前账号已认证", icon: "none" });
  };

  const handleDeleteAccount = () => {
    Taro.showModal({
      title: "确认注销账号？",
      content: "当前仅保留页面流程，真实注销能力后续接入。",
      confirmText: "知道了",
      success: () => {
        Taro.showToast({ title: "注销流程预留中", icon: "none" });
      },
    });
  };

  const displayId = user?.phone?.trim() || user?.id || "--";

  return (
    <View className="profile-edit-page">
      <View className="profile-edit-top-strip" />
      <View className="profile-edit-header">
        <PageBack inline fallbackUrl="/pages/profile/index" />
        <Text className="profile-edit-title">编辑资料</Text>
        <View className={`profile-edit-save-chip ${saving ? "profile-edit-save-chip--disabled" : ""}`} onClick={handleSave}>
          <Text className="profile-edit-save-chip-text">{saving ? "保存中" : "保存"}</Text>
        </View>
      </View>

      <ScrollView className="profile-edit-scroll" scrollY>
        <View className="profile-edit-shell">
          <View className="avatar-section">
            <View className="avatar-ring" onClick={handleChooseAvatar}>
              <Image
                className="avatar-preview"
                src={avatarPreview || user?.avatarUrl || DEFAULT_AVATAR}
                mode="aspectFill"
              />
            </View>
            <Button
              className="avatar-change-link"
              openType="chooseAvatar"
              onChooseAvatar={handleWechatAvatarChosen}
            >
              更换头像
            </Button>
          </View>

          <View className="info-card">
            <View className="info-row">
              <Text className="info-label">昵称</Text>
              <Input
                className="info-input"
                value={nickname}
                maxlength={20}
                placeholder="请输入昵称"
                placeholderClass="info-placeholder"
                onInput={(e) => setNickname(e.detail.value)}
              />
            </View>

            <View className="info-row">
              <Text className="info-label">用户ID</Text>
              <Text className="info-value info-value--muted">{displayId}</Text>
            </View>

            <Picker
              mode="selector"
              range={GENDER_OPTIONS.map((item) => item.label)}
              value={Math.max(0, GENDER_OPTIONS.findIndex((item) => item.value === gender))}
              onChange={(e) => setGender(GENDER_OPTIONS[Number(e.detail.value)]?.value || "unknown")}
            >
              <View className="info-row">
                <Text className="info-label">性别</Text>
                <View className="info-value-wrap">
                  <Text className="info-value">{getGenderLabel(gender)}</Text>
                  <Text className="info-arrow">›</Text>
                </View>
              </View>
            </Picker>

            <Picker mode="date" value={birthday} start="1970-01-01" end="2099-12-31" onChange={(e) => setBirthday(e.detail.value)}>
              <View className="info-row info-row--last">
                <Text className="info-label">生日</Text>
                <View className="info-value-wrap">
                  <Text className="info-value">{birthday}</Text>
                  <Text className="info-arrow">›</Text>
                </View>
              </View>
            </Picker>
          </View>

          <View className="account-card">
            <Text className="account-card-title">账号信息</Text>

            <View className="account-row">
              <View className="account-row-main">
                <Text className="account-label">手机号</Text>
                <Text className="account-value">{maskPhone(user?.phone)}</Text>
              </View>
              <View className="account-action-btn" onClick={handleModifyPhone}>
                <Text className="account-action-btn-text">修改</Text>
              </View>
            </View>

            <View className="account-row">
              <View className="account-row-main">
                <Text className="account-label">邮箱</Text>
                <Text className="account-value">{user?.email?.trim() || "未设置"}</Text>
              </View>
              <View className="account-action-btn" onClick={handleModifyEmail}>
                <Text className="account-action-btn-text">修改</Text>
              </View>
            </View>

            <View className="account-row account-row--plain" onClick={handleChangePassword}>
              <Text className="account-link-label">修改密码</Text>
              <Text className="info-arrow">›</Text>
            </View>

            <View className="account-row account-row--plain" onClick={handleVerified}>
              <Text className="account-link-label">实名认证</Text>
              <View className="verified-wrap">
                <Text className="verified-chip">已认证</Text>
                <Text className="info-arrow">›</Text>
              </View>
            </View>

            <View className="account-row account-row--plain account-row--danger" onClick={handleDeleteAccount}>
              <Text className="account-link-label account-link-label--danger">注销账号</Text>
              <Text className="info-arrow info-arrow--danger">›</Text>
            </View>
          </View>

          <View className={`save-btn ${saving ? "save-btn--disabled" : ""}`} onClick={handleSave}>
            <Text className="save-btn-text">{saving ? "保存中..." : "保存修改"}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
