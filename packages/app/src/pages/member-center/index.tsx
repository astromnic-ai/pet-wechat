import { View, Text, ScrollView } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import type { User } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import { request } from "../../utils/request";
import "./index.scss";

const DEVICE_LIMIT_TOTAL = 2;

type PackageType = "custom" | "single";

export default function MemberCenter() {
  const [user, setUser] = useState<User | null>(null);
  const [deviceCount, setDeviceCount] = useState(0);
  const [selectedPackage, setSelectedPackage] = useState<PackageType>("single");

  const loadData = async () => {
    const [userRes, collarRes, desktopRes] = await Promise.all([
      request<{ user: User }>({ url: "/api/me" }).catch(() => ({ user: null as User | null })),
      request<{ collars: Array<{ id: string }> }>({ url: "/api/devices/collars" }).catch(
        () => ({ collars: [] as Array<{ id: string }> })
      ),
      request<{ desktops: Array<{ id: string }> }>({ url: "/api/devices/desktops" }).catch(
        () => ({ desktops: [] as Array<{ id: string }> })
      ),
    ]);

    setUser(userRes.user);
    const totalDevices = collarRes.collars.length + desktopRes.desktops.length;
    setDeviceCount(totalDevices);
  };

  useDidShow(() => {
    Taro.hideTabBar();
    void loadData();
  });

  const avatarQuotaRemaining = Math.max(
    0,
    Number(user?.avatarQuotaRemaining ?? user?.avatarQuota ?? 0),
  );
  const avatarQuotaTotal = Math.max(
    avatarQuotaRemaining,
    Number(user?.avatarQuotaTotal ?? 0),
  );
  const avatarQuotaProgress =
    avatarQuotaTotal > 0
      ? Math.max(8, Math.min((avatarQuotaRemaining / avatarQuotaTotal) * 100, 100))
      : 0;
  const deviceUsageProgress = Math.max(8, Math.min((deviceCount / DEVICE_LIMIT_TOTAL) * 100, 100));

  const handleOrderHistory = () => {
    Taro.showToast({ title: "订单记录功能即将上线", icon: "none" });
  };

  const handleUpgrade = () => {
    const title = selectedPackage === "custom" ? "个性化定制套餐" : "新形象定制套餐";
    Taro.showToast({ title: `已选择${title}`, icon: "none" });
  };

  return (
    <View className="member-center-page">
      <View className="member-center-top-strip" />
      <View className="member-center-header">
        <PageBack inline fallbackUrl="/pages/profile/index" />
        <Text className="member-center-title">会员中心</Text>
        <View className="member-center-order-btn" onClick={handleOrderHistory}>
          <Text className="member-center-order-btn-text">订单记录</Text>
        </View>
      </View>

      <ScrollView className="member-center-scroll" scrollY>
        <View className="member-center-shell">
          <View className="quota-card">
            <Text className="quota-card-title">我的额度</Text>

            <View className="quota-row">
              <View className="quota-head">
                <Text className="quota-icon">◎</Text>
                <Text className="quota-label">定制图像</Text>
              </View>
              <Text className="quota-value">剩余 {avatarQuotaRemaining}/{avatarQuotaTotal} 次</Text>
            </View>
            <View className="quota-track">
              <View className="quota-fill quota-fill--avatar" style={{ width: `${avatarQuotaProgress}%` }} />
            </View>

            <View className="quota-row quota-row--device">
              <View className="quota-head">
                <Text className="quota-icon">⚭</Text>
                <Text className="quota-label">绑定终端</Text>
              </View>
              <Text className="quota-value">已用 {Math.min(deviceCount, DEVICE_LIMIT_TOTAL)}/{DEVICE_LIMIT_TOTAL} 个</Text>
            </View>
            <View className="quota-track">
              <View className="quota-fill quota-fill--device" style={{ width: `${deviceUsageProgress}%` }} />
            </View>
          </View>

          <View className="member-status-card">
            <View className="member-status-avatar" />
            <View className="member-status-texts">
              <Text className="member-status-title">普通会员</Text>
              <Text className="member-status-subtitle">未开通会员</Text>
            </View>
          </View>

          <View className="package-row">
            <View
              className={`package-card ${selectedPackage === "custom" ? "package-card--selected" : ""}`}
              onClick={() => setSelectedPackage("custom")}
            >
              <Text className="package-card-title">个性化定制</Text>
              <Text className="package-card-price">¥169.9/5个</Text>
            </View>

            <View
              className={`package-card ${selectedPackage === "single" ? "package-card--selected" : ""}`}
              onClick={() => setSelectedPackage("single")}
            >
              <Text className="package-card-title">新形象定制</Text>
              <Text className="package-card-price">¥199.9/个</Text>
            </View>
          </View>

          <View className="benefit-card">
            <View className="benefit-header">
              <Text className="benefit-title">会员专属权益</Text>
              <Text className="benefit-count">4项</Text>
            </View>

            <View className="annual-card" onClick={handleUpgrade}>
              <Text className="annual-card-text">会员权益包年 999/年</Text>
            </View>

            <View className="benefit-grid">
              <View className="benefit-item benefit-item--yellow">
                <Text className="benefit-item-title">升级定制</Text>
                <Text className="benefit-item-subtitle">定制次数升级</Text>
              </View>
              <View className="benefit-item benefit-item--cream">
                <Text className="benefit-item-title">多设备</Text>
                <Text className="benefit-item-subtitle">绑定上限提升</Text>
              </View>
              <View className="benefit-item benefit-item--pink">
                <Text className="benefit-item-title">专属客服</Text>
                <Text className="benefit-item-subtitle">7×24小时支持</Text>
              </View>
              <View className="benefit-item benefit-item--rose">
                <Text className="benefit-item-title">云端备份</Text>
                <Text className="benefit-item-subtitle">数据延长保存</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
