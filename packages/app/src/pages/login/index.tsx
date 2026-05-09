import { View, Text, Button } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useState } from "react";
import type { User } from "@pet-wechat/shared";
import { BASE_URL, clearToken, request, setToken, uploadFile } from "../../utils/request";
import { setUserInfo } from "../../utils/storage";
import { connectWs } from "../../utils/ws";
import "./index.scss";

interface AuthResponse {
  token: string;
  user: { id: string };
}

const LOGIN_DRAFT_KEY = "loginAgreementDraft";
const DEV_LOGIN_PHONE = "13800000000";
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

function getChooseImageErrorMessage(error?: unknown) {
  const message = typeof error === "object" && error && "errMsg" in error ? String((error as any).errMsg) : "";
  if (message.includes("cancel")) return "";
  if (message.includes("auth deny") || message.includes("permission") || message.includes("authorize")) {
    return "需要相册或相机权限";
  }
  return "选择头像失败，请重试";
}

function isLocalDevApi() {
  return /127\.0\.0\.1|localhost|192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\./.test(BASE_URL);
}

export default function Login() {
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [loadingType, setLoadingType] = useState<"wechat" | "phone" | null>(null);
  const [agreementShaking, setAgreementShaking] = useState(false);
  const [avatarPromptVisible, setAvatarPromptVisible] = useState(false);
  const [avatarPromptLoading, setAvatarPromptLoading] = useState<"wechat" | "custom" | null>(null);

  const hasAcceptedAgreements = agreedTerms && agreedPrivacy;

  const triggerAgreementShake = () => {
    setAgreementShaking(false);
    setTimeout(() => setAgreementShaking(true), 10);
    setTimeout(() => setAgreementShaking(false), 420);
  };

  const ensureAgreementsAccepted = () => {
    if (hasAcceptedAgreements) {
      return true;
    }

    triggerAgreementShake();
    Taro.showToast({
      title: "请先勾选协议",
      icon: "none",
    });
    return false;
  };

  useDidShow(() => {
    const draft = Taro.getStorageSync(LOGIN_DRAFT_KEY);
    if (draft && typeof draft === "object") {
      setAgreedTerms(Boolean(draft.agreedTerms));
      setAgreedPrivacy(Boolean(draft.agreedPrivacy));
    }
  });

  useEffect(() => {
    Taro.setStorageSync(LOGIN_DRAFT_KEY, {
      agreedTerms,
      agreedPrivacy,
    });
  }, [agreedPrivacy, agreedTerms]);

  const enterHome = (userId: string) => {
    Taro.removeStorageSync(LOGIN_DRAFT_KEY);
    setAvatarPromptVisible(false);
    Taro.setStorageSync("userId", userId);
    Taro.hideLoading();
    Taro.showLoading({
      title: "进入主页中",
      mask: false,
    });
    connectWs().catch(() => {
      // Keep login flow responsive in dev even if websocket connects later.
    });
    Taro.reLaunch({
      url: "/pages/index/index",
      success: () => Taro.hideLoading(),
      fail: () => Taro.hideLoading(),
      complete: () => Taro.hideLoading(),
    });
  };

  const finishLogin = async (token: string, userId: string) => {
    setToken(token);
    Taro.setStorageSync("userId", userId);

    try {
      const res = await request<{ user: User }>({ url: "/api/me" });
      if (res.user) {
        setUserInfo(res.user);
        if (res.user.avatarUrl) {
          enterHome(userId);
          return;
        }
      }
    } catch {
      // Allow avatar confirmation flow to proceed even if profile preload fails.
    }

    setAvatarPromptVisible(true);
  };

  const saveAvatarAndEnter = async (avatarUrl: string) => {
    const res = await request<{ user: User }>({
      url: "/api/me",
      method: "PUT",
      data: { avatarUrl },
    });
    setUserInfo(res.user);
    enterHome(res.user.id);
  };

  const handleUseWechatAvatar = async () => {
    if (avatarPromptLoading) return;
    setAvatarPromptLoading("wechat");
    try {
      const getUserProfile = (Taro as any).getUserProfile as
        | ((options: { desc: string }) => Promise<{ userInfo?: { avatarUrl?: string } }>)
        | undefined;

      if (!getUserProfile) {
        throw new Error("当前微信版本暂不支持获取头像");
      }

      const res = await getUserProfile({
        desc: "用于设置您的头像",
      });
      const avatarUrl = res.userInfo?.avatarUrl?.trim();
      if (!avatarUrl) {
        throw new Error("未获取到微信头像");
      }

      await saveAvatarAndEnter(avatarUrl);
    } catch (error: any) {
      const message = String(error?.errMsg || error?.message || "");
      if (!message.includes("cancel")) {
        Taro.showToast({
          title: error?.message || "获取微信头像失败",
          icon: "none",
        });
      }
    } finally {
      setAvatarPromptLoading(null);
    }
  };

  const handleChooseCustomAvatar = async () => {
    if (avatarPromptLoading) return;
    setAvatarPromptLoading("custom");
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

      const uploadRes = await uploadFile<{ url: string }>({
        url: "/api/upload",
        filePath: nextPath,
        name: "file",
      });

      await saveAvatarAndEnter(uploadRes.url);
    } catch (error: any) {
      const errorMessage = getChooseImageErrorMessage(error);
      if (errorMessage) {
        Taro.showToast({ title: errorMessage, icon: "none" });
      }
    } finally {
      setAvatarPromptLoading(null);
    }
  };

  const handleSkipAvatarSetup = () => {
    const userId = Taro.getStorageSync("userId");
    if (userId) {
      enterHome(userId);
    }
  };

  const loginWithDevAccount = async () => {
    const { token, user } = await request<AuthResponse>({
      url: "/api/auth/dev-login",
      method: "POST",
      data: { phone: DEV_LOGIN_PHONE },
      needAuth: false,
    });

    await finishLogin(token, user.id);
  };

  const tryDevLoginFallback = async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error || "");
    if (!isLocalDevApi() && !message.includes("微信登录未配置")) {
      throw error;
    }

    await loginWithDevAccount();
  };

  const handlePhoneQuickLogin = async (event: any) => {
    if (!ensureAgreementsAccepted() || loadingType) {
      return;
    }

    const phoneCode = event?.detail?.code;

    setLoadingType("phone");
    try {
      clearToken();
      Taro.removeStorageSync("userId");

      if (isLocalDevApi()) {
        await loginWithDevAccount();
        return;
      }

      if (!phoneCode) {
        Taro.showToast({
          title: "未获取到手机号授权",
          icon: "none",
        });
        return;
      }

      const { token, user } = await request<AuthResponse>({
        url: "/api/auth/phone/wechat",
        method: "POST",
        data: { code: phoneCode },
        needAuth: false,
      });

      await finishLogin(token, user.id);
    } catch (error: any) {
      try {
        await tryDevLoginFallback(error);
        return;
      } catch {}

      Taro.showToast({
        title: error?.message ?? "本机号登录失败",
        icon: "none",
      });
    } finally {
      setLoadingType(null);
    }
  };

  const handleWechatLogin = async () => {
    if (!ensureAgreementsAccepted() || loadingType) {
      return;
    }

    setLoadingType("wechat");
    try {
      clearToken();
      Taro.removeStorageSync("userId");

      if (isLocalDevApi()) {
        await loginWithDevAccount();
        return;
      }

      const loginRes = await Taro.login();
      if (!loginRes.code) {
        throw new Error("获取微信登录凭证失败");
      }

      const { token, user } = await request<AuthResponse>({
        url: "/api/auth/wechat",
        method: "POST",
        data: { code: loginRes.code },
        needAuth: false,
      });

      await finishLogin(token, user.id);
    } catch (error: any) {
      try {
        await tryDevLoginFallback(error);
        return;
      } catch {}

      Taro.showToast({
        title: error?.message ?? "微信登录失败",
        icon: "none",
      });
    } finally {
      setLoadingType(null);
    }
  };

  const openAgreementPage = (event: any, url: string) => {
    event?.stopPropagation?.();
    Taro.navigateTo({ url });
  };

  return (
    <View className="login-page">
      <View className="hero-panel">
        <Text className="hero-text">欢迎来到宠物新世界</Text>
      </View>

      <View className="login-card">
        <Text className="welcome-title">欢迎回来</Text>

        <View className="btn-box">
          <Button
            className="btn btn-primary"
            openType={hasAcceptedAgreements ? "getPhoneNumber" : undefined}
            loading={loadingType === "phone"}
            disabled={loadingType !== null}
            onClick={() => {
              if (!hasAcceptedAgreements) {
                ensureAgreementsAccepted();
              }
            }}
            onGetPhoneNumber={handlePhoneQuickLogin}
          >
            本机号码快捷登录
          </Button>

          <Button
            className="btn btn-secondary"
            loading={loadingType === "wechat"}
            disabled={loadingType !== null}
            onClick={handleWechatLogin}
          >
            微信账号登录
          </Button>
        </View>

        <View className={`agreement ${agreementShaking ? "shake" : ""}`}>
          <Text className="agreement-title">本人已阅读并同意以下条款</Text>
          <View className="agreement-item" onClick={() => setAgreedTerms((prev) => !prev)}>
            <View className={`agreement-check ${agreedTerms ? "checked" : ""}`} />
            <Text className="agreement-text">
              我已阅读并同意
              <Text
                className="agreement-link"
                onClick={(event) => openAgreementPage(event, "/pages/settings/user-agreement")}
              >
                《用户协议》
              </Text>
            </Text>
          </View>
          <View className="agreement-item" onClick={() => setAgreedPrivacy((prev) => !prev)}>
            <View className={`agreement-check ${agreedPrivacy ? "checked" : ""}`} />
            <Text className="agreement-text">
              我已阅读并同意
              <Text
                className="agreement-link"
                onClick={(event) => openAgreementPage(event, "/pages/settings/privacy")}
              >
                《隐私政策》
              </Text>
            </Text>
          </View>
        </View>

        <View className="split-line">
          <View className="split-divider" />
          <Text className="split-text">或</Text>
          <View className="split-divider" />
        </View>

        <View
          className="register-entry"
          onClick={() => Taro.navigateTo({ url: "/pages/register/index" })}
        >
          <Text className="register-label">还没有账号？</Text>
          <Text className="register-link">立即注册</Text>
        </View>
      </View>

      {avatarPromptVisible ? (
        <View className="avatar-prompt-mask">
          <View className="avatar-prompt-card">
            <Text className="avatar-prompt-title">设置登录头像</Text>
            <Text className="avatar-prompt-desc">
              是否使用当前微信头像作为默认头像？你也可以现在自己上传，后续在用户信息里继续修改。
            </Text>
            <View className="avatar-prompt-actions">
              <Button
                className="avatar-prompt-btn avatar-prompt-btn--primary"
                loading={avatarPromptLoading === "wechat"}
                disabled={avatarPromptLoading !== null}
                onClick={handleUseWechatAvatar}
              >
                使用微信头像
              </Button>
              <Button
                className="avatar-prompt-btn avatar-prompt-btn--secondary"
                loading={avatarPromptLoading === "custom"}
                disabled={avatarPromptLoading !== null}
                onClick={handleChooseCustomAvatar}
              >
                自己设置头像
              </Button>
            </View>
            <Text className="avatar-prompt-skip" onClick={handleSkipAvatarSetup}>
              稍后设置
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
