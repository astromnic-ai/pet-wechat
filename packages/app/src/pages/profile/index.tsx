import { View, Text, Image, ScrollView } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { clearToken } from "../../utils/request";
import { disconnectWs } from "../../utils/ws";
import PageBack from "../../components/PageBack";
import "./index.scss";

const SERVICE_PETS = [
  { id: "1", name: "毛毛", imageQuota: "定制图像：2/2", deviceQuota: "绑定终端：3/5" },
  { id: "2", name: "臭臭", imageQuota: "定制图像：1/2", deviceQuota: "绑定终端：1/5" },
];

const BENEFITS = [
  "升级宠物数量",
  "升级定制图像",
  "云端存储扩容",
  "优先客服支持",
  "专属主题皮肤",
];

export default function Profile() {
  useDidShow(() => {
    Taro.hideTabBar();
  });

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
                src={require("@/assets/images/black cat 3.png")}
                mode="aspectFill"
              />
              <View className="user-texts">
                <Text className="user-name">烨子（微信用户）</Text>
                <Text className="user-id">用户ID：6667779898</Text>
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
          <Text className="info-line">手机号：135 **** 8888</Text>
          <Text className="info-line">邮箱：YEHEY6789@guagua.com</Text>
          <Text className="info-line">注册日期：2025-02-28</Text>
        </View>

        <View className="profile-card">
          <Text className="section-title">我的服务</Text>
          {SERVICE_PETS.map((pet) => (
            <View key={pet.id} className="service-pet-card">
              <Image
                className="service-pet-avatar"
                src={require("@/assets/images/black cat 3.png")}
                mode="aspectFill"
              />
              <View className="service-pet-info">
                <Text className="service-pet-name">{pet.name}</Text>
                <Text className="service-pet-meta">{pet.imageQuota}</Text>
                <Text className="service-pet-meta">{pet.deviceQuota}</Text>
              </View>
              <View className="mini-btn">
                <Text className="mini-btn-text">升级</Text>
              </View>
            </View>
          ))}
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
