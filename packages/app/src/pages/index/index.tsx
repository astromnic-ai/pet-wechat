import { View, Text, Image, Swiper, SwiperItem } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useMemo, useRef, useState } from "react";
import { request } from "../../utils/request";
import { subscribe } from "../../utils/ws";
import type { CollarDevice, DesktopDevice, Pet } from "@pet-wechat/shared";
import QuickNav from "../../components/QuickNav";
import { hasCompletedGuide } from "../../utils/storage";
import "./index.scss";

const ACTION_LABELS: Record<string, string> = {
  walking: "散步",
  running: "奔跑",
  sleeping: "睡觉",
  eating: "吃东西",
  playing: "玩耍",
  resting: "休息",
  jumping: "跳跃",
  idle: "发呆",
};

function getBehaviorLabel(actionType?: string | null) {
  if (!actionType) return "暂无行为记录";
  return ACTION_LABELS[actionType] ?? actionType;
}

function getBubbleText(pet: Pet | null) {
  if (!pet) {
    return "还没有宠物，点击添加一只吧";
  }

  if (!pet.latestBehavior?.actionType) {
    return `${pet.name}还没有最新行为`;
  }

  return `${pet.name}最新行为：${getBehaviorLabel(pet.latestBehavior.actionType)}`;
}

export default function Index() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [collars, setCollars] = useState<CollarDevice[]>([]);
  const [desktops, setDesktops] = useState<DesktopDevice[]>([]);
  const [currentPetIndex, setCurrentPetIndex] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const skipNextDidShowRef = useRef(true);

  useDidShow(() => {
    Taro.hideTabBar();
    if (skipNextDidShowRef.current) {
      skipNextDidShowRef.current = false;
      return;
    }

    void loadPets();
    void loadUnreadCount();
    void loadDevices();
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

  useEffect(() => {
    void loadPets();
  }, []);

  useEffect(() => {
    void loadUnreadCount();
  }, []);

  useEffect(() => {
    void loadDevices();

    return () => {
      skipNextDidShowRef.current = true;
    };
  }, []);

  useEffect(() => {
    return subscribe("behavior:new", ({ data }) => {
      setPets((prevPets) =>
        prevPets.map((pet) =>
          pet.id === data.petId
            ? {
                ...pet,
                latestBehavior: {
                  actionType: data.actionType,
                  timestamp: data.timestamp,
                },
              }
            : pet,
        ),
      );
    });
  }, []);

  const loadPets = async () => {
    try {
      const { pets: ownPets, authorizedPets } = await request<{
        pets: Pet[];
        authorizedPets: Pet[];
      }>({ url: "/api/pets" });
      setPets([...ownPets, ...authorizedPets]);
    } catch {
      setPets([]);
    }
  };

  const loadUnreadCount = async () => {
    try {
      const { count } = await request<{ count: number }>({
        url: "/api/messages/unread-count",
      });
      setUnreadCount(count);
    } catch {
      setUnreadCount(0);
    }
  };

  const loadDevices = async () => {
    try {
      const [{ collars: collarList }, { desktops: desktopList }] = await Promise.all([
        request<{ collars: CollarDevice[] }>({ url: "/api/devices/collars" }),
        request<{ desktops: DesktopDevice[] }>({ url: "/api/devices/desktops" }),
      ]);
      setCollars(collarList);
      setDesktops(desktopList);

      if (
        collarList.length === 0 &&
        desktopList.length === 0 &&
        !hasCompletedGuide()
      ) {
        Taro.redirectTo({ url: "/pages/guide/index" });
      }
    } catch {
      setCollars([]);
      setDesktops([]);
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
  const bubbleText = getBubbleText(currentPet);
  const petHeroImage = currentPet?.avatarImageUrl || require("@/assets/images/pet-collar.png");

  const handleAddPet = () => Taro.navigateTo({ url: "/pages/pet-info/index" });
  const handleOpenPetInfo = () => {
    if (hasPet) {
      if (!currentPet) return;
      Taro.navigateTo({ url: `/pages/pet-info/index?petId=${currentPet.id}` });
      return;
    }

    Taro.navigateTo({ url: "/pages/pet-info/index" });
  };
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
        <View className="top-card" onClick={handleOpenPetInfo}>
          <View className="avatar-shell">
            {hasPet ? (
              <Image
                className="avatar-image"
                src={currentPet?.avatarImageUrl || petHeroImage}
                mode="aspectFill"
              />
            ) : (
              <View className="avatar-placeholder" />
            )}
          </View>
          <View className="title-block">
            <Text className="pet-name">{hasPet ? currentPet?.name ?? "" : "宠物的昵称"}</Text>
            <Text className="pet-subtitle">
              {hasPet ? currentPet?.breed || "未设置品种" : "点击开始创建宠物"}
            </Text>
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
              <View className="speech-bubble empty-speech-bubble">
                <Text className="speech-text">{bubbleText}</Text>
              </View>
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
                {activeCollar ? activeCollar.name || "项圈" : "项圈"}
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
                {activeDesktop ? activeDesktop.name || "桌面端" : "桌面端"}
              </Text>
              <Text className="device-text">
                {activeDesktop ? `${onlineDesktopCount}个在线设备` : "点击此处配置桌面端"}
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
