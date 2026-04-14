import { View, Text, Image, ScrollView } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useState } from "react";
import type { Pet, User } from "@pet-wechat/shared";
import { clearToken, request } from "../../utils/request";
import { disconnectWs } from "../../utils/ws";
import PageBack from "../../components/PageBack";
import "./index.scss";

const DEFAULT_AVATAR = require("@/assets/images/black cat 3.png");
const FREE_AVATAR_TOTAL = 2;

export default function Profile() {
  const [user, setUser] = useState<User | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [deviceCount, setDeviceCount] = useState(0);

  useDidShow(() => {
    Taro.hideTabBar();
  });

  useEffect(() => {
    void Promise.all([
      request<{ user: User }>({ url: "/api/me" }).catch(() => ({ user: null as User | null })),
      request<{ pets: Pet[] }>({ url: "/api/pets" }).catch(() => ({ pets: [] as Pet[] })),
      request<{ collars: Array<{ id: string }> }>({ url: "/api/devices/collars" }).catch(
        () => ({ collars: [] as Array<{ id: string }> })
      ),
      request<{ desktops: Array<{ id: string }> }>({ url: "/api/devices/desktops" }).catch(
        () => ({ desktops: [] as Array<{ id: string }> })
      ),
    ]).then(([userRes, petRes, collarRes, desktopRes]) => {
      setUser(userRes.user);
      setPets(petRes.pets);
      setDeviceCount(collarRes.collars.length + desktopRes.desktops.length);
    });
  }, []);

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
    image: pet.avatarImageUrl || DEFAULT_AVATAR,
  }));

  const displayName = isPlaceholderNickname(user?.nickname) ? "未设置昵称" : user?.nickname?.trim() || "未设置昵称";
  const displayId = user?.phone?.trim() || user?.id || "--";
  const displayPhone = user?.phone?.trim() ? user.phone : "未绑定";
  const displayEmail = user?.email?.trim() ? user.email : "未设置";
  const displayCreatedAt = user?.createdAt
    ? String(user.createdAt).slice(0, 10)
    : "--";

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
                src={user?.avatarUrl || DEFAULT_AVATAR}
                mode="aspectFill"
              />
              <View className="user-card-texts">
                <Text className="user-card-name">{displayName}</Text>
                <Text className="user-card-id">ID: {displayId}</Text>
              </View>
              <View className="vip-btn">
                <Text className="vip-btn-text">开通会员</Text>
              </View>
            </View>

            <View className="account-box">
              <Text className="account-title">账户信息</Text>
              <Text className="account-line">手机号：{displayPhone}</Text>
              <Text className="account-line">邮箱：{displayEmail}</Text>
              <Text className="account-line">注册日期：{displayCreatedAt}</Text>
            </View>
          </View>

          <View className="section-head">
            <Text className="section-title">我的宠物</Text>
            <Text
              className="section-more"
              onClick={() =>
                pets[0]?.id
                  ? handleOpenPet(pets[0].id)
                  : Taro.navigateTo({ url: "/pages/pet-info/index" })
              }
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
                <Image className="pet-card-image" src={pet.image} mode="aspectFill" />
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

          <Text className="section-title section-title--service">会员服务</Text>

          <View className="service-card">
            <View className="service-main">
              <View className="service-info-chip">
                <Text className="service-line">
                  定制图像：剩余 {FREE_AVATAR_TOTAL}/{FREE_AVATAR_TOTAL} 次
                </Text>
              </View>
              <View className="service-info-chip">
                <Text className="service-line">已绑定设备：{deviceCount} 台</Text>
              </View>
            </View>
            <View className="service-upgrade-btn">
              <Text className="service-upgrade-btn-text">升级</Text>
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
