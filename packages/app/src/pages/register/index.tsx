import { View, Text, Input, Button } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useMemo, useState } from "react";
import PageBack from "../../components/PageBack";
import { request, setToken } from "../../utils/request";
import { connectWs } from "../../utils/ws";
import "./index.scss";

interface AuthResponse {
  token: string;
  user: { id: string };
}

export default function Register() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreed, setAgreed] = useState(true);
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(
    () => Boolean(phone.trim() && code.trim() && password.trim() && confirmPassword.trim() && agreed),
    [agreed, code, confirmPassword, password, phone],
  );

  const handleSendCode = async () => {
    if (sendingCode) return;
    if (!phone.trim()) {
      Taro.showToast({ title: "请输入手机号", icon: "none" });
      return;
    }

    setSendingCode(true);
    Taro.showToast({
      title: "验证码已发送，开发环境固定为123456",
      icon: "none",
      duration: 2200,
    });
    setTimeout(() => setSendingCode(false), 600);
  };

  const handleRegister = async () => {
    if (submitting) return;
    if (!phone.trim()) {
      Taro.showToast({ title: "请输入手机号", icon: "none" });
      return;
    }
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
    if (!agreed) {
      Taro.showToast({ title: "请先勾选协议", icon: "none" });
      return;
    }

    setSubmitting(true);
    try {
      const { token, user } = await request<AuthResponse>({
        url: "/api/auth/phone",
        method: "POST",
        data: {
          phone: phone.trim(),
          code: code.trim(),
        },
        needAuth: false,
      });
      setToken(token);
      Taro.setStorageSync("userId", user.id);
      await connectWs();
      Taro.showToast({ title: "注册成功", icon: "success", duration: 900 });
      setTimeout(() => {
        Taro.showLoading({
          title: "进入主页中",
          mask: true,
        });
        Taro.reLaunch({ url: "/pages/index/index" });
      }, 300);
    } catch (error: any) {
      Taro.showToast({
        title: error?.message ?? "注册失败",
        icon: "none",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="register-page">
      <View className="register-top-strip" />

      <View className="register-shell">
        <View className="register-header">
          <View className="register-back-wrap">
            <PageBack fallbackUrl="/pages/login/index" />
          </View>
          <Text className="register-top-title">注册账号</Text>
        </View>
        <Text className="register-title">加入 YEHEY</Text>
        <Text className="register-subtitle">开始你的数字宠物之旅</Text>

        <Text className="field-label">手机号</Text>
        <View className="phone-field">
          <Text className="phone-prefix">+86</Text>
          <Input
            className="field-input phone-input"
            type="number"
            maxlength={11}
            placeholder="请输入手机号"
            value={phone}
            onInput={(e) => setPhone(e.detail.value)}
          />
        </View>

        <Text className="field-label">验证码</Text>
        <View className="code-row">
          <Input
            className="field-input code-input"
            type="number"
            maxlength={6}
            placeholder="请输入验证码"
            value={code}
            onInput={(e) => setCode(e.detail.value)}
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
          value={password}
          onInput={(e) => setPassword(e.detail.value)}
        />

        <Text className="field-label">确认密码</Text>
        <Input
          className="field-input"
          password
          placeholder="再次输入密码"
          value={confirmPassword}
          onInput={(e) => setConfirmPassword(e.detail.value)}
        />

        <View className="agreement-row" onClick={() => setAgreed((prev) => !prev)}>
          <View className={`agreement-check ${agreed ? "checked" : ""}`} />
          <Text className="agreement-text">
            我已阅读并同意《用户协议》和《隐私政策》
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
