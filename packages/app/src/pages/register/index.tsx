import { View, Text, Input, Button } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import PageBack from "../../components/PageBack";
import { request, setToken } from "../../utils/request";
import { setUserInfo } from "../../utils/storage";
import { connectWs } from "../../utils/ws";
import "./index.scss";

const REGISTER_DRAFT_KEY = "registerFormDraft";
const PHONE_PATTERN = /^1[3-9]\d{9}$/;

interface AuthResponse {
  token: string;
  user: { id: string };
}

interface SendCodeResponse {
  accepted: boolean;
  expiresIn: number;
  mockCode?: string;
}

export default function Register() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [agreementShaking, setAgreementShaking] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);

  const normalizedPhone = phone.trim();
  const isPhoneValid = PHONE_PATTERN.test(normalizedPhone);

  const canSubmit = useMemo(
    () => Boolean(isPhoneValid && code.trim() && password.trim() && confirmPassword.trim() && agreed),
    [agreed, code, confirmPassword, isPhoneValid, password],
  );

  const triggerAgreementShake = () => {
    setAgreementShaking(false);
    setTimeout(() => setAgreementShaking(true), 10);
    setTimeout(() => setAgreementShaking(false), 420);
  };

  const ensureAgreementAccepted = () => {
    if (agreed) {
      return true;
    }

    triggerAgreementShake();
    Taro.showToast({ title: "请先勾选协议", icon: "none" });
    return false;
  };

  const validatePhone = () => {
    setPhoneTouched(true);
    if (!normalizedPhone) {
      Taro.showToast({ title: "请输入手机号", icon: "none" });
      return false;
    }

    if (!PHONE_PATTERN.test(normalizedPhone)) {
      Taro.showToast({ title: "请输入正确的11位手机号", icon: "none" });
      return false;
    }

    return true;
  };

  useDidShow(() => {
    const draft = Taro.getStorageSync(REGISTER_DRAFT_KEY);
    if (draft && typeof draft === "object") {
      setPhone(typeof draft.phone === "string" ? draft.phone : "");
      setCode(typeof draft.code === "string" ? draft.code : "");
      setPassword(typeof draft.password === "string" ? draft.password : "");
      setConfirmPassword(typeof draft.confirmPassword === "string" ? draft.confirmPassword : "");
      setAgreed(Boolean(draft.agreed));
    }
  });

  useEffect(() => {
    Taro.setStorageSync(REGISTER_DRAFT_KEY, {
      phone,
      code,
      password,
      confirmPassword,
      agreed,
    });
  }, [agreed, code, confirmPassword, password, phone]);

  const handleSendCode = async () => {
    if (sendingCode) return;
    if (!ensureAgreementAccepted()) {
      return;
    }
    if (!validatePhone()) {
      return;
    }

    setSendingCode(true);
    try {
      const res = await request<SendCodeResponse>({
        url: "/api/auth/phone/send-code",
        method: "POST",
        data: { phone: normalizedPhone },
        needAuth: false,
      });

      Taro.showToast({
        title: res.mockCode ? `验证码 ${res.mockCode}` : "验证码已发送",
        icon: "none",
      });
    } catch (error: any) {
      Taro.showToast({
        title: error?.message ?? "验证码发送失败",
        icon: "none",
      });
    } finally {
      setSendingCode(false);
    }
  };

  const handleRegister = async () => {
    if (submitting) return;
    if (!validatePhone()) return;
    if (!code.trim()) {
      Taro.showToast({ title: "请输入验证码", icon: "none" });
      return;
    }
    if (!password.trim()) {
      Taro.showToast({ title: "请输入密码", icon: "none" });
      return;
    }
    if (password !== confirmPassword) {
      Taro.showToast({ title: "两次输入密码不一致", icon: "none" });
      return;
    }
    if (!ensureAgreementAccepted()) {
      return;
    }

    setSubmitting(true);
    try {
      const { token, user } = await request<AuthResponse>({
        url: "/api/auth/phone",
        method: "POST",
        data: { phone: normalizedPhone, code: code.trim() },
        needAuth: false,
      });

      setToken(token);
      Taro.setStorageSync("userId", user.id);
      Taro.removeStorageSync(REGISTER_DRAFT_KEY);

      try {
        const profile = await request<{ user: any }>({ url: "/api/me" });
        if (profile.user) {
          setUserInfo(profile.user);
        }
      } catch {
        // 登录成功即可进入主页，资料预载失败不阻塞注册流程。
      }

      connectWs().catch(() => {
        // WebSocket 后续会在页面生命周期里继续尝试。
      });
      Taro.reLaunch({ url: "/pages/index/index" });
    } catch (error: any) {
      Taro.showToast({
        title: error?.message ?? "注册失败，请重试",
        icon: "none",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openAgreementPage = (event: any, url: string) => {
    event?.stopPropagation?.();
    Taro.navigateTo({ url });
  };

  return (
    <View className="register-page">
      <View className="register-top-strip" />

      <View className="register-shell">
        <View className="register-header">
          <PageBack inline fallbackUrl="/pages/login/index" />
          <Text className="register-top-title">注册账号</Text>
        </View>
        <Text className="register-title">加入 YEHEY</Text>
        <Text className="register-subtitle">开始你的数字宠物之旅</Text>

        <Text className="field-label">手机号</Text>
        <View className={`phone-field ${phoneTouched && !isPhoneValid ? "invalid" : ""}`}>
          <Text className="phone-prefix">+86</Text>
          <Input
            className="phone-input"
            type="number"
            maxlength={11}
            placeholder="请输入手机号"
            placeholderClass="input-placeholder"
            value={phone}
            onInput={(e) => {
              setPhoneTouched(true);
              setPhone(e.detail.value.replace(/\D/g, "").slice(0, 11));
            }}
          />
        </View>
        {phoneTouched && normalizedPhone && !isPhoneValid ? (
          <Text className="field-error">请输入正确的 11 位手机号</Text>
        ) : null}

        <Text className="field-label">验证码</Text>
        <View className="code-row">
          <Input
            className="field-input code-input"
            type="number"
            maxlength={6}
            placeholder="请输入验证码"
            placeholderClass="input-placeholder"
            value={code}
            onInput={(e) => setCode(e.detail.value.replace(/\D/g, "").slice(0, 6))}
          />
          <Button className="code-btn" loading={sendingCode} onClick={handleSendCode}>
            发送验证码
          </Button>
        </View>

        <Text className="field-label">设置密码</Text>
        <Input
          className="field-input"
          password
          placeholder="6-16位数字或字母"
          placeholderClass="input-placeholder"
          value={password}
          onInput={(e) => setPassword(e.detail.value)}
        />

        <Text className="field-label">确认密码</Text>
        <Input
          className="field-input"
          password
          placeholder="再次输入密码"
          placeholderClass="input-placeholder"
          value={confirmPassword}
          onInput={(e) => setConfirmPassword(e.detail.value)}
        />

        <View className={`agreement-row ${agreementShaking ? "shake" : ""}`} onClick={() => setAgreed((prev) => !prev)}>
          <View className={`agreement-check ${agreed ? "checked" : ""}`} />
          <Text className="agreement-text">
            我已阅读并同意
            <Text
              className="agreement-link"
              onClick={(event) => openAgreementPage(event, "/pages/settings/user-agreement")}
            >
              《用户协议》
            </Text>
            和
            <Text
              className="agreement-link"
              onClick={(event) => openAgreementPage(event, "/pages/settings/privacy")}
            >
              《隐私政策》
            </Text>
          </Text>
        </View>

        <Button className="submit-btn" disabled={!canSubmit || submitting} loading={submitting} onClick={handleRegister}>
          立即注册
        </Button>

        <View className="login-entry" onClick={() => Taro.navigateBack()}>
          <Text className="login-label">已有账号？</Text>
          <Text className="login-link">立即登录</Text>
        </View>
      </View>
    </View>
  );
}
