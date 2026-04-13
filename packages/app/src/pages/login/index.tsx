import { View, Text, Button, Input } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import { BASE_URL, request, setToken } from "../../utils/request";
import { connectWs } from "../../utils/ws";
import "./index.scss";

declare const ENABLE_DEV_LOGIN: boolean;

interface AuthResponse {
  token: string;
  user: { id: string };
}

export default function Login() {
  const [agreedTerms, setAgreedTerms] = useState(true);
  const [agreedPrivacy, setAgreedPrivacy] = useState(true);
  const [loadingType, setLoadingType] = useState<"wechat" | "phone" | null>(null);
  const [devPhone, setDevPhone] = useState("");

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
    connectWs().catch(() => {
      // Keep login flow responsive in dev even if websocket connects later.
    });
    Taro.switchTab({ url: "/pages/index/index" });
  };

  const handleQuickLogin = async () => {
    if (!ensureAgreementsAccepted() || loadingType) {
      return;
    }

    const normalizedPhone = devPhone.trim();
    if (!normalizedPhone) {
      Taro.showToast({
        title: "请输入测试手机号",
        icon: "none",
      });
      return;
    }

    setLoadingType("phone");
    try {
      const { token, user } = await request<AuthResponse>({
        url: "/api/auth/dev-login",
        method: "POST",
        data: { phone: normalizedPhone },
        needAuth: false,
      });
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

        <View className="dev-env-banner">
          <Text className="dev-env-banner-text">
            当前为开发环境，已启用测试登录
          </Text>
          <Text className="dev-env-banner-subtext">
            API：{BASE_URL || "本地默认地址"}
          </Text>
        </View>

        <View className="btn-box">
          <View className="dev-login-box">
            <Text className="dev-login-label">开发者测试账号</Text>
            <Input
              className="dev-login-input"
              type="number"
              maxlength={11}
              value={devPhone}
              placeholder="请输入开发测试手机号"
              onInput={(e) => setDevPhone(e.detail.value)}
            />
          </View>

          <Button
            className="btn btn-primary"
            loading={loadingType === "phone"}
            disabled={loadingType !== null}
            onClick={handleQuickLogin}
          >
            开发者账号登录
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

        <Text className="dev-mode-tip">开发模式已启用，可直接输入测试手机号登录</Text>

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
