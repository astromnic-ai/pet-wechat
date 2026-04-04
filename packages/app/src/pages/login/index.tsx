import { View, Text, Button } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import { request, setToken } from "../../utils/request";
import { connectWs } from "../../utils/ws";
import "./index.scss";

declare const ENABLE_DEV_LOGIN: boolean;

interface AuthResponse {
  token: string;
  user: { id: string };
}

const DEFAULT_DEV_PHONE = "18652931629";

export default function Login() {
  const [agreedTerms, setAgreedTerms] = useState(true);
  const [agreedPrivacy, setAgreedPrivacy] = useState(true);
  const [loadingType, setLoadingType] = useState<"wechat" | "phone" | null>(null);

  const ensureAgreementsAccepted = () => {
    if (agreedTerms && agreedPrivacy) {
      return true;
    }

    Taro.showToast({
      title: "请先勾选协议",
      icon: "none",
    });
    return false;
  };

  const finishLogin = async (token: string, userId: string) => {
    setToken(token);
    Taro.setStorageSync("userId", userId);
    await connectWs();
    Taro.reLaunch({ url: "/pages/index/index" });
  };

  const handleQuickLogin = async () => {
    if (!ensureAgreementsAccepted() || loadingType) {
      return;
    }

    if (!ENABLE_DEV_LOGIN) {
      Taro.showToast({
        title: "请使用微信登录",
        icon: "none",
      });
      return;
    }

    setLoadingType("phone");
    try {
      const cachedPhone = Taro.getStorageSync("devLoginPhone") || DEFAULT_DEV_PHONE;
      const { token, user } = await request<AuthResponse>({
        url: "/api/auth/dev-login",
        method: "POST",
        data: { phone: cachedPhone },
        needAuth: false,
      });
      Taro.setStorageSync("devLoginPhone", cachedPhone);
      await finishLogin(token, user.id);
    } catch (error: any) {
      Taro.showToast({
        title: error?.message ?? "快捷登录失败",
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
      Taro.showToast({
        title: error?.message ?? "微信登录失败",
        icon: "none",
      });
    } finally {
      setLoadingType(null);
    }
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
            loading={loadingType === "phone"}
            disabled={loadingType !== null}
            onClick={handleQuickLogin}
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

        {ENABLE_DEV_LOGIN ? (
          <Text className="dev-mode-tip">开发模式下将使用本机测试账号登录</Text>
        ) : null}

        <View className="agreement">
          <Text className="agreement-title">本人已阅读并同意以下条款</Text>
          <View className="agreement-item" onClick={() => setAgreedTerms((prev) => !prev)}>
            <View className={`agreement-check ${agreedTerms ? "checked" : ""}`} />
            <Text className="agreement-text">
              我同意《YEHEY平台个人及宠物信息收集声明》中所述与第三方共享信息
            </Text>
          </View>
          <View className="agreement-item" onClick={() => setAgreedPrivacy((prev) => !prev)}>
            <View className={`agreement-check ${agreedPrivacy ? "checked" : ""}`} />
            <Text className="agreement-text">
              我已阅读关于七七七八八八九九九六六的《xxxxxx细则》
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
    </View>
  );
}
