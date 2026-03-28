import { View, Text, Image, ScrollView } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useState } from "react";
import type { Pet, User } from "@pet-wechat/shared";
import { clearToken } from "../../utils/request";
import { request } from "../../utils/request";
import { disconnectWs } from "../../utils/ws";
import PageBack from "../../components/PageBack";
import "./index.scss";

const BENEFITS = [
  "升级宠物数量",
  "升级定制图像",
  "云端存储扩容",
  "优先客服支持",
  "专属主题皮肤",
];

const DEFAULT_AVATAR = require("@/assets/images/black cat 3.png");

function getSpeciesLabel(species: Pet["species"]) {
  return species === "cat" ? "猫咪" : "狗狗";
}

function getPetMeta(pet: Pet) {
  return `品种：${pet.breed || getSpeciesLabel(pet.species)}`;
}

function getPetBehavior(pet: Pet) {
  if (!pet.latestBehavior?.actionType) {
    return `活跃值：${pet.activityScore}`;
  }

  return `最新行为：${pet.latestBehavior.actionType}`;
}

export default function Profile() {
  const [user, setUser] = useState<User | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [authorizedPetsCount, setAuthorizedPetsCount] = useState(0);

  useDidShow(() => {
    Taro.hideTabBar();
  });

  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
      try {
        const res = await request<{ user: User }>({ url: "/api/me" });
        if (cancelled) return;
        setUser(res.user);
      } catch {
        if (cancelled) return;
        setUser(null);
      }
    };

    void loadUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadPets = async () => {
      try {
        const res = await request<{ pets: Pet[]; authorizedPets: Pet[] }>({ url: "/api/pets" });
        if (cancelled) return;
        setPets(res.pets);
        setAuthorizedPetsCount(res.authorizedPets.length);
      } catch {
        if (cancelled) return;
        setPets([]);
        setAuthorizedPetsCount(0);
      }
    };

    void loadPets();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = () => {
    disconnectWs();
    clearToken();
    Taro.removeStorageSync("userInfo");
    Taro.reLaunch({ url: "/pages/login/index" });
  };

  return (
    <View className="profile-page">
      <PageBack />
      <Text className="page-title">用户信息</Text>
      <ScrollView className="profile-scroll" scrollY>
        <View className="profile-card user-card">
          <View className="user-top">
            <View className="user-main">
              <Image
                className="user-avatar"
                src={user?.avatarUrl || DEFAULT_AVATAR}
                mode="aspectFill"
              />
              <View className="user-texts">
                <Text className="user-name">{user?.nickname || "用户"}</Text>
                <Text className="user-id">
                  {user?.phone ? `手机号：${user.phone}` : `形象配额：${user?.avatarQuota ?? 0}`}
                </Text>
              </View>
            </View>
            <View className="vip-btn">
              <Text className="vip-btn-text">开通会员</Text>
            </View>
          </View>
        </View>

        <View className="profile-card">
          <View className="section-header">
            <Text className="section-title">账户信息</Text>
            <View className="mini-btn">
              <Text className="mini-btn-text">编辑资料</Text>
            </View>
          </View>
          {user?.phone ? <Text className="info-line">手机号：{user.phone}</Text> : null}
          <Text className="info-line">形象配额：{user?.avatarQuota ?? 0}</Text>
        </View>

        <View className="profile-card">
          <Text className="section-title">我的服务</Text>
          {authorizedPetsCount > 0 ? (
            <Text className="service-pet-meta">已授权宠物：{authorizedPetsCount}只</Text>
          ) : null}
          {pets.map((pet) => (
            <View key={pet.id} className="service-pet-card">
              <Image
                className="service-pet-avatar"
                src={pet.avatarImageUrl || DEFAULT_AVATAR}
                mode="aspectFill"
              />
              <View className="service-pet-info">
                <Text className="service-pet-name">{pet.name}</Text>
                <Text className="service-pet-meta">{getPetMeta(pet)}</Text>
                <Text className="service-pet-meta">{getPetBehavior(pet)}</Text>
              </View>
              <View className="mini-btn">
                <Text className="mini-btn-text">升级</Text>
              </View>
            </View>
          ))}
          {pets.length === 0 ? <Text className="info-line">暂无宠物</Text> : null}
        </View>

        <View className="profile-card">
          <Text className="section-title">会员专属权益</Text>
          <View className="benefit-grid">
            {BENEFITS.map((item) => (
              <View key={item} className="benefit-row">
                <Text className="benefit-check">✓</Text>
                <Text className="benefit-text">{item}</Text>
              </View>
            ))}
          </View>
          <View className="detail-btn">
            <Text className="detail-btn-text">查看详情</Text>
          </View>
        </View>

        <View className="logout-btn" onClick={handleLogout}>
          <Text className="logout-btn-text">退出登录</Text>
        </View>
      </ScrollView>
    </View>
  );
}
