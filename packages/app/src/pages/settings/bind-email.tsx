import { Input, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import PageBack from "../../components/PageBack";
import { request } from "../../utils/request";
import "./subpages.scss";

export default function BindEmailPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSendCode = async () => {
    if (sending) return;
    setSending(true);

    try {
      const res = await request<{ mockCode: string }>({
        url: "/api/account/bind-email/send-code",
        method: "POST",
        data: { email: email.trim() },
      });
      Taro.showToast({ title: `验证码 ${res.mockCode}`, icon: "none" });
    } catch (error: any) {
      Taro.showToast({ title: error.message || "发送失败", icon: "none" });
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      await request({
        url: "/api/account/bind-email/verify",
        method: "POST",
        data: { email: email.trim(), code: code.trim() },
      });
      Taro.showToast({ title: "绑定成功", icon: "success" });
      setTimeout(() => {
        Taro.navigateBack();
      }, 300);
    } catch (error: any) {
      Taro.showToast({ title: error.message || "绑定失败", icon: "none" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="settings-subpage">
      <View className="settings-subpage-top-strip" />
      <View className="settings-subpage-header">
        <PageBack inline />
        <Text className="settings-subpage-title">绑定邮箱</Text>
      </View>

      <View className="settings-subpage-content">
        <View className="settings-list-card bind-form-card">
          <Input
            className="bind-input"
            value={email}
            placeholder="请输入邮箱地址"
            onInput={(e) => setEmail(e.detail.value)}
          />

          <View className="bind-row">
            <Input
              className="bind-input"
              type="number"
              maxlength={6}
              value={code}
              placeholder="请输入验证码"
              onInput={(e) => setCode(e.detail.value)}
            />
            <View className="bind-action-btn" onClick={() => void handleSendCode()}>
              <Text>{sending ? "发送中" : "发送验证码"}</Text>
            </View>
          </View>

          <Text className="bind-helper">邮箱验证码当前为 mock 固定值流程，后续会替换为真实邮件服务。</Text>

          <View className="bind-submit-btn" onClick={() => void handleSubmit()}>
            <Text>{submitting ? "提交中" : "确认绑定"}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
