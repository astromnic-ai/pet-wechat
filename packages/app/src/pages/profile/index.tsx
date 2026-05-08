import { View, Text, Image, ScrollView } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import type { Pet, User } from "@pet-wechat/shared";
import { clearToken, request } from "../../utils/request";
import { disconnectWs } from "../../utils/ws";
import PageBack from "../../components/PageBack";
import "./index.scss";

const DEVICE_LIMIT_TOTAL = 3;

function maskPhone(phone?: string | null) {
  const digits = String(phone || "").replace(/\s+/g, "");
  if (!digits) return "未绑定";
  if (digits.length < 7) return digits;
  return `${digits.slice(0, 3)} **** ${digits.slice(-4)}`;
}

export default function Profile() {
  const [user, setUser] = useState<User | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [deviceCount, setDeviceCount] = useState(0);

  const loadProfileData = async () => {
    const [userRes, petRes, collarRes, desktopRes] = await Promise.all([
      request<{ user: User }>({ url: "/api/me" }).catch(() => ({ user: null as User | null })),
      request<{ pets: Pet[] }>({ url: "/api/pets" }).catch(() => ({ pets: [] as Pet[] })),
      request<{ collars: Array<{ id: string }> }>({ url: "/api/devices/collars" }).catch(
        () => ({ collars: [] as Array<{ id: string }> })
      ),
      request<{ desktops: Array<{ id: string }> }>({ url: "/api/devices/desktops" }).catch(
        () => ({ desktops: [] as Array<{ id: string }> })
      ),
    ]);

    setUser(userRes.user);
    setPets(petRes.pets);
    setDeviceCount(collarRes.collars.length + desktopRes.desktops.length);
  };

  useDidShow(() => {
    Taro.hideTabBar();
    void loadProfileData();
  });

  const isPlaceholderNickname = (value?: string | null) => {
    const trimmed = value?.trim() || "";
    return (
      !trimmed ||
      trimmed === "微信用户" ||
      trimmed === "开发用户" ||
      trimmed === "测试用户" ||
      /^用户\d{4}$/.test(trimmed)
    );
  };

  const handleLogout = () => {
    disconnectWs();
    clearToken();
    Taro.removeStorageSync("userInfo");
    Taro.removeStorageSync("userId");
    Taro.removeStorageSync("hasCompletedGuide");
    Taro.reLaunch({ url: "/pages/login/index" });
  };

  const petCards = pets.slice(0, 2).map((pet) => ({
    id: pet.id,
    name: pet.name,
  }));

  const displayName = isPlaceholderNickname(user?.nickname) ? "未设置昵称" : user?.nickname?.trim() || "未设置昵称";
  const displayId = user?.phone?.trim() || user?.id || "--";
  const displayPhone = maskPhone(user?.phone);
  const displayEmail = user?.email?.trim() ? user.email : "未设置";
  const displayCreatedAt = user?.createdAt
    ? String(user.createdAt).slice(0, 10)
    : "--";
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

  const handleEditProfile = () => {
    Taro.navigateTo({ url: "/pages/profile-edit/index" });
  };

  const handleOpenMemberCenter = () => {
    Taro.navigateTo({ url: "/pages/member-center/index" });
  };

  const handleOpenPetList = () => {
    Taro.navigateTo({ url: "/pages/pets/index" });
  };

  const handleOpenPet = (petId?: string) => {
    if (!petId) {
      Taro.navigateTo({ url: "/pages/pet-info/index" });
      return;
    }

    Taro.navigateTo({ url: `/pages/pet-info/index?petId=${petId}` });
  };

  return (
    <View className="profile-page">
      <View className="profile-top-strip" />
      <View className="profile-header">
        <PageBack inline />
        <Text className="profile-title">用户信息</Text>
      </View>

      <ScrollView className="profile-scroll" scrollY>
        <View className="profile-shell">
          <View className="user-card">
            <View className="user-card-top">
              <Image
                className="user-card-avatar"
                src={user?.avatarUrl || require("@/assets/images/black cat 3.png")}
                mode="aspectFill"
              />
              <View className="user-card-texts">
                <Text className="user-card-name">{displayName}</Text>
                <Text className="user-card-id">ID: {displayId}</Text>
              </View>
              <View className="vip-btn" onClick={handleEditProfile}>
                <Text className="vip-btn-text">编辑信息</Text>
              </View>
            </View>

            <View className="account-box">
              <Text className="account-line">手机号：{displayPhone}</Text>
              <Text className="account-line">邮箱：{displayEmail}</Text>
              <Text className="account-line">注册日期：{displayCreatedAt}</Text>
            </View>
          </View>

          <View className="section-head">
            <Text className="section-title">我的宠物</Text>
            <Text
              className="section-more"
              onClick={handleOpenPetList}
            >
              查看全部 〉
            </Text>
          </View>

          <View className="pet-card-row">
            {petCards.map((pet, index) => (
              <View
                key={pet.id}
                className={`pet-card ${index === 0 ? "pet-card--active" : ""}`}
                onClick={() => handleOpenPet(pet.id)}
              >
                <Text className="pet-card-name">{pet.name}</Text>
              </View>
            ))}
            <View
              className="pet-card pet-card--add"
              onClick={() => Taro.navigateTo({ url: "/pages/pet-info/index" })}
            >
              <Text className="pet-card-add-text">添加</Text>
            </View>
          </View>

          <View className="section-head section-head--service">
            <Text className="section-title section-title--service">会员服务</Text>
            <Text className="section-more" onClick={handleOpenMemberCenter}>
              查看详情 〉
            </Text>
          </View>

          <View className="service-card" onClick={handleOpenMemberCenter}>
            <View className="service-header">
              <View>
                <Text className="service-member-title">普通会员</Text>
                <Text className="service-member-subtitle">升级解锁更多权益</Text>
              </View>
              <View className="service-upgrade-btn">
                <Text className="service-upgrade-btn-text">立即升级</Text>
              </View>
            </View>

            <View className="service-quota-panel">
              <View className="service-quota-row">
                <View className="service-quota-head">
                  <Text className="service-quota-icon">◎</Text>
                  <Text className="service-quota-label">定制图像</Text>
                </View>
                <Text className="service-quota-value">剩余 {avatarQuotaRemaining}/{avatarQuotaTotal} 次</Text>
              </View>
              <View className="service-progress-track">
                <View className="service-progress-fill service-progress-fill--avatar" style={{ width: `${avatarQuotaProgress}%` }} />
              </View>

              <View className="service-quota-row service-quota-row--device">
                <View className="service-quota-head">
                  <Text className="service-quota-icon">⚭</Text>
                  <Text className="service-quota-label">绑定终端</Text>
                </View>
                <Text className="service-quota-value">已用 {Math.min(deviceCount, DEVICE_LIMIT_TOTAL)}/{DEVICE_LIMIT_TOTAL} 个</Text>
              </View>
              <View className="service-progress-track">
                <View className="service-progress-fill service-progress-fill--device" style={{ width: `${deviceUsageProgress}%` }} />
              </View>
            </View>
          </View>

          <View className="logout-btn" onClick={handleLogout}>
            <Text className="logout-btn-text">退出登录</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
