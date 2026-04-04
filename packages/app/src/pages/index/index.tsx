import { View, Text, Image, Swiper, SwiperItem } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useMemo, useRef, useState } from "react";
import { request } from "../../utils/request";
import { subscribe } from "../../utils/ws";
import type { CollarDevice, DesktopDevice, Pet } from "@pet-wechat/shared";
import QuickNav from "../../components/QuickNav";
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
    return `主人，${pet.name}在等一个精彩开场`;
  }

  return `主人，${pet.name}正在${getBehaviorLabel(pet.latestBehavior.actionType)}`;
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
  const isCompletelyEmpty = !hasPet && !hasManagedDevices;
  const activity = currentPet?.activityScore ?? 0;
  const activityHeight = `${Math.max(18, Math.min(activity, 100))}%`;
  const bubbleText = getBubbleText(currentPet);
  const petHeroImage = currentPet?.avatarImageUrl || require("@/assets/images/pet-collar.png");
  const petSubtitle = hasPet
    ? currentPet?.breed || "蓝灰色的小煤球"
    : "点击开始创建宠物";

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
  const handleAddDevice = () =>
    Taro.showActionSheet({
      itemList: ["连接项圈", "连接桌面摆台"],
      success: (res) => {
        if (res.tapIndex === 0) {
          handleConfigCollar();
          return;
        }
        if (res.tapIndex === 1) {
          handleConfigDesktop();
        }
      },
    });
  const handleOpenRecords = () => {
    if (!hasPet) {
      handleAddPet();
      return;
    }
    Taro.navigateTo({ url: "/pages/data/index" });
  };

  return (
    <View className="home-page">
      <Text className="home-brand">YEHEY</Text>

      {hasPet ? (
        <View className="activity-column">
          <View className="activity-dot" />
          <View className="activity-bar">
            <View className="activity-fill" style={{ height: activityHeight }} />
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
      ) : null}

      <View className="home-content">
        <View className="hero-header">
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
              <Text className="pet-subtitle">{petSubtitle}</Text>
            </View>
            {!hasPet ? (
              <View className="top-card-plus">
                <Text className="top-card-plus-text">+</Text>
              </View>
            ) : null}
          </View>

          <View className="message-button" onClick={handleOpenMessages}>
            <Image
              className="message-icon"
              src={require("@/assets/images/bell-icon.png")}
              mode="aspectFit"
            />
            {unreadCount > 0 ? <View className="message-dot" /> : null}
          </View>
        </View>

        <View className={`hero-section ${isCompletelyEmpty ? "empty-layout" : ""}`}>
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
                          src={pet?.avatarImageUrl || require("@/assets/images/pet-collar.png")}
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
                src={require("@/assets/images/pet-collar.png")}
                mode="widthFix"
              />
              <Text className="empty-pet-text">点击创建新宠物</Text>
              <View className="switch-hint empty-switch-hint">
                <Text className="switch-arrow">←</Text>
                <Text className="switch-text">左右滑动切换宠物</Text>
                <Text className="switch-arrow">→</Text>
              </View>
            </View>
          )}
        </View>

        {!isCompletelyEmpty ? (
          <View className="device-card">
            <View className="device-card-header">
              <Text className="device-card-title">设备管理</Text>
              {hasManagedDevices ? (
                <View className="device-badge">
                  <Text className="device-badge-text">已连接</Text>
                </View>
              ) : null}
            </View>
            <View className="device-main-grid">
              <View className="device-option" onClick={handleConfigCollar}>
                <View className="device-icon-wrap">
                  <Image
                    className="device-icon"
                    src={require("@/assets/images/collar-icon.png")}
                    mode="aspectFit"
                  />
                </View>
                <Text className="device-name">
                  {activeCollar ? activeCollar.name || "项圈" : "点击此处配置项圈"}
                </Text>
                <Text className="device-text">
                  {activeCollar
                    ? `${activeCollar.status === "online" ? "在线" : "离线"}${activeCollar.battery ? ` · ${activeCollar.battery}%` : ""}`
                    : "立即完成真实宠物连接"}
                </Text>
              </View>
              <View className="device-option" onClick={handleConfigDesktop}>
                <View className="device-icon-wrap">
                  <Image
                    className="device-icon"
                    src={require("@/assets/images/desktop-icon.png")}
                    mode="aspectFit"
                  />
                </View>
                <Text className="device-name">
                  {activeDesktop ? activeDesktop.name || "桌面端" : "点击此处配置桌面端"}
                </Text>
                <Text className="device-text">
                  {activeDesktop ? `${onlineDesktopCount}个在线设备` : "开启毛毛的大House"}
                </Text>
              </View>
            </View>
            {hasManagedDevices ? (
              <View className="device-manage" onClick={handleManageDevices}>
                <Text className="device-manage-text">›</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <>
            <View className="mode-card" onClick={handleOpenRecords}>
              <Text className="mode-card-title">宠物活动模式</Text>
              <Text className="mode-card-arrow">›</Text>
            </View>

            <View className="device-card empty-device-card">
              <Text className="device-empty-title">设备管理</Text>
              <View className="device-plus-box" onClick={handleAddDevice}>
                <Text className="device-plus-icon">+</Text>
              </View>
            </View>
          </>
        )}

        <View className="quick-nav-wrap">
          <QuickNav showLabels />
        </View>
      </View>
    </View>
  );
}
