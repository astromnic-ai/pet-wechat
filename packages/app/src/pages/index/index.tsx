import { View, Text, Image, Swiper, SwiperItem } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import { request } from "../../utils/request";
import type { CollarDevice, DesktopDevice, Pet } from "@pet-wechat/shared";
import QuickNav from "../../components/QuickNav";
import "./index.scss";

export default function Index() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [collars, setCollars] = useState<CollarDevice[]>([]);
  const [desktops, setDesktops] = useState<DesktopDevice[]>([]);
  const [currentPetIndex, setCurrentPetIndex] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  useDidShow(() => {
    Taro.hideTabBar();
    void loadData();
  });

  useEffect(() => {
    if (pets.length === 0) {
      setCurrentPetIndex(0);
      return;
    }
    if (currentPetIndex > pets.length - 1) {
      setCurrentPetIndex(0);
    }
  }, [pets, currentPetIndex]);

  const loadData = async () => {
    try {
      const [
        { pets: petList },
        { collars: collarList },
        { desktops: desktopList },
        { count },
      ] =
        await Promise.all([
          request<{ pets: Pet[] }>({ url: "/api/pets" }),
          request<{ collars: CollarDevice[] }>({ url: "/api/devices/collars" }),
          request<{ desktops: DesktopDevice[] }>({ url: "/api/devices/desktops" }),
          request<{ count: number }>({ url: "/api/messages/unread-count" }),
        ]);
      setPets(petList);
      setCollars(collarList);
      setDesktops(desktopList);
      setUnreadCount(count);
    } catch {
      setPets([]);
      setCollars([]);
      setDesktops([]);
      setUnreadCount(0);
    }
  };

  const hasPet = pets.length > 0;
  const currentPet = pets[currentPetIndex] ?? null;
  const petSlides = hasPet ? pets : [null];
  const activeCollar = useMemo(() => {
    if (!currentPet) return collars[0] ?? null;
    return collars.find((item) => item.petId === currentPet.id) ?? collars[0] ?? null;
  }, [collars, currentPet]);
  const activeDesktop = desktops[0] ?? null;
  const onlineDesktopCount = desktops.filter((item) => item.status === "online").length;
  const hasManagedDevices = Boolean(activeCollar || activeDesktop);
  const activity = currentPet?.activityScore ?? 0;
  const activityHeight = `${Math.max(18, Math.min(activity, 100))}%`;
  const bubbleText = "主人，我要戴上项链，住进大House";
  const petHeroImage = currentPet?.avatarImageUrl || require("@/assets/images/pet-collar.png");

  const handleAddPet = () => Taro.navigateTo({ url: "/pages/pet-info/index" });
  const handleConfigCollar = () => Taro.navigateTo({ url: "/pages/collar-bind/index" });
  const handleConfigDesktop = () => Taro.navigateTo({ url: "/pages/desktop-bind/index" });
  const handleManageDevices = () => Taro.switchTab({ url: "/pages/devices/index" });
  const handleOpenMessages = () => Taro.switchTab({ url: "/pages/messages/index" });

  return (
    <View className="home-page">
      <View className="activity-column">
        <View className="activity-dot" />
        <View className="activity-bar">
          <View className="activity-fill" style={{ height: hasPet ? activityHeight : "0%" }} />
        </View>
        <Text className="activity-label">活跃值</Text>
        <View className="activity-bell-wrap" onClick={handleOpenMessages}>
          <Image
            className="activity-bell"
            src={require("@/assets/images/bell-icon.png")}
            mode="aspectFit"
          />
          {unreadCount > 0 ? <View className="activity-bell-dot" /> : null}
        </View>
      </View>

      <View className="home-content">
        <View className="top-card">
          <View className="avatar-shell">
            {hasPet ? (
              <Image
                className="avatar-image"
                src={require("@/assets/images/black cat 3.png")}
                mode="aspectFill"
              />
            ) : (
              <View className="avatar-placeholder" />
            )}
          </View>
          <View className="title-block">
            <Text className="pet-name">{hasPet ? currentPet?.name || "毛毛" : "宠物的昵称"}</Text>
            <Text className="pet-subtitle">{hasPet ? "属于你的宠物" : "点击开始创建宠物"}</Text>
          </View>
        </View>

        <View className="hero-section">
          {hasPet ? (
            <View className="pet-stage">
              <View className="pet-showcase-wrap">
                <View className="speech-bubble">
                  <Text className="speech-text">{bubbleText}</Text>
                </View>
                <Swiper
                  className="pet-swiper"
                  current={currentPetIndex}
                  circular
                  duration={280}
                  onChange={(e) => setCurrentPetIndex(e.detail.current)}
                >
                  {petSlides.map((pet, index) => (
                    <SwiperItem key={pet?.id ?? `pet-${index}`}>
                      <View className="pet-slide">
                        <Image
                          className="pet-showcase"
                          src={pet?.avatarImageUrl || petHeroImage}
                          mode="widthFix"
                        />
                      </View>
                    </SwiperItem>
                  ))}
                </Swiper>
              </View>
              <View className="switch-hint">
                <Text className="switch-arrow">〈</Text>
                <View className="switch-line" />
                <Text className="switch-text">左右滑动切换宠物</Text>
                <View className="switch-line" />
                <Text className="switch-arrow">〉</Text>
              </View>
            </View>
          ) : (
            <View className="empty-pet" onClick={handleAddPet}>
              <Image
                className="empty-pet-image"
                src={require("@/assets/images/pet-hero.png")}
                mode="widthFix"
              />
              <Text className="empty-pet-text">点击添加宠物</Text>
            </View>
          )}
        </View>

        <View className="device-card">
          <View className="device-main-grid">
            <View className="device-option" onClick={handleConfigCollar}>
              <Image
                className="device-icon"
                src={require("@/assets/images/collar-icon.png")}
                mode="aspectFit"
              />
              <Text className="device-name">
                {activeCollar ? activeCollar.name || `${currentPet?.name || "毛毛"}的小圈圈` : "项圈"}
              </Text>
              <Text className="device-text">
                {activeCollar ? `${activeCollar.status === "online" ? "在线" : "离线"}${activeCollar.battery ? ` · ${activeCollar.battery}%` : ""}` : "点击此处配置项圈"}
              </Text>
            </View>
            <View className="device-option" onClick={handleConfigDesktop}>
              <Image
                className="device-icon"
                src={require("@/assets/images/desktop-icon.png")}
                mode="aspectFit"
              />
              <Text className="device-name">
                {activeDesktop ? activeDesktop.name || `${currentPet?.name || "毛毛"}的秘密基地` : "桌面端"}
              </Text>
              <Text className="device-text">
                {activeDesktop ? `${onlineDesktopCount || desktops.length}个在线设备` : "点击此处配置桌面端"}
              </Text>
            </View>
          </View>
          {hasManagedDevices ? (
            <View className="device-manage" onClick={handleManageDevices}>
              <Text className="device-manage-text">管理设备</Text>
            </View>
          ) : null}
        </View>

        <QuickNav />
      </View>
    </View>
  );
}
