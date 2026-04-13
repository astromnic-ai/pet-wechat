import { View, Text, Button } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import { request, setToken } from "../../utils/request";
import { connectWs } from "../../utils/ws";
import "./index.scss";

interface AuthResponse {
  token: string;
  user: { id: string };
}

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
    Taro.showLoading({
      title: "进入主页中",
      mask: true,
    });
    connectWs().catch(() => {
      // Keep login flow responsive in dev even if websocket connects later.
    });
    Taro.reLaunch({ url: "/pages/index/index" });
  };

  const handlePhoneQuickLogin = async (event: any) => {
    if (!ensureAgreementsAccepted() || loadingType) {
      return;
    }

    const phoneCode = event?.detail?.code;
    if (!phoneCode) {
      Taro.showToast({
        title: "未获取到手机号授权",
        icon: "none",
      });
      return;
    }

    setLoadingType("phone");
    try {
      const { token, user } = await request<AuthResponse>({
        url: "/api/auth/phone/wechat",
        method: "POST",
        data: { code: phoneCode },
        needAuth: false,
      });

      await finishLogin(token, user.id);
    } catch (error: any) {
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
            openType="getPhoneNumber"
            loading={loadingType === "phone"}
            disabled={loadingType !== null}
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
