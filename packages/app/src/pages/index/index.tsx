import { View, Text, Image, Swiper, SwiperItem } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useMemo, useRef, useState } from "react";
import { request } from "../../utils/request";
import { subscribe } from "../../utils/ws";
import type { CollarDevice, DesktopDevice, Pet } from "@pet-wechat/shared";
import { getPetActivityMode } from "../../utils/storage";
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
  const [petMode, setPetMode] = useState<"free" | "custom" | "real">("free");
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
    setPetMode(getPetActivityMode(pets[currentPetIndex]?.id));
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
    setPetMode(getPetActivityMode(currentPet?.id));
  }, [currentPet?.id]);

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
  const primaryManagedDevice = activeDesktop ?? activeCollar;
  const primaryManagedDeviceLabel = activeDesktop ? "累计在线366天" : activeCollar ? `${activeCollar.status === "online" ? "在线" : "离线"}${activeCollar.battery ? ` · ${activeCollar.battery}%` : ""}` : "";
  const hasManagedDevices = Boolean(activeCollar || activeDesktop);
  const isCompletelyEmpty = !hasPet && !hasManagedDevices;
  const hasCompletePetProfile = Boolean(currentPet?.name?.trim() && currentPet?.breed?.trim());
  const bubbleText = currentPet ? "在家开水龙头喝水？" : "点击开始创建宠物";
  const petHeroImage = currentPet?.avatarImageUrl || require("@/assets/images/pet-collar.png");
  const petSubtitle = hasPet
    ? currentPet?.breed || "蓝灰色的小煤球"
    : "点击开始创建宠物";

  const handleAddPet = () => Taro.navigateTo({ url: "/pages/pet-info/index" });
  const handleOpenPetInfo = () => {
    if (hasPet && hasCompletePetProfile) {
      if (!currentPet) return;
      Taro.navigateTo({ url: `/pages/pet-info/index?petId=${currentPet.id}` });
      return;
    }

    const incompletePetId = currentPet?.id;
    Taro.navigateTo({
      url: incompletePetId ? `/pages/pet-info/index?petId=${incompletePetId}&edit=1` : "/pages/pet-info/index",
    });
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
  const handleOpenPetMode = () => {
    if (!hasPet) {
      handleAddPet();
      return;
    }
    Taro.navigateTo({ url: `/pages/pet-mode/index?petId=${currentPet?.id || ""}` });
  };

  const modeLabelMap = {
    free: "系统自由模式",
    custom: "个性自定义",
    real: "真实行为模式",
  };

  return (
    <View className="home-page">
      <Text className="home-brand">YEHEY</Text>

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
            <View
              className="top-card-plus"
              onClick={(e) => {
                e.stopPropagation?.();
                handleAddPet();
              }}
            >
              <Text className="top-card-plus-text">+</Text>
            </View>
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

        <View className="mode-card" onClick={handleOpenPetMode}>
          <Text className="mode-card-title">宠物活动模式</Text>
          <View className="mode-card-meta">
            <Text className="mode-card-caption">当前</Text>
            <Text className="mode-card-status">{modeLabelMap[petMode]}</Text>
            <Text className="mode-card-arrow">›</Text>
          </View>
        </View>

        {hasPet && (
          <>
            <View className="device-card managed-device-card" onClick={hasManagedDevices ? handleManageDevices : handleAddDevice}>
              <Text className="device-card-title visible">设备管理</Text>
              {hasManagedDevices ? (
                <View className="managed-device-row">
                  <View className="device-icon-wrap managed">
                    <Image
                      className="device-icon"
                      src={activeDesktop ? require("@/assets/images/desktop-icon.png") : require("@/assets/images/collar-icon.png")}
                      mode="aspectFit"
                    />
                  </View>
                  <View className="managed-device-main">
                    <Text className="managed-device-name">{primaryManagedDevice?.name || "毛毛的大House"}</Text>
                    <Text className="managed-device-text">{primaryManagedDeviceLabel}</Text>
                  </View>
                  <View className="managed-device-status">
                    <Text className="managed-device-status-text">已连接</Text>
                  </View>
                  <Text className="device-manage-text">›</Text>
                </View>
              ) : (
                <View className="device-plus-box managed-empty" onClick={handleAddDevice}>
                  <Text className="device-plus-icon">+</Text>
                </View>
              )}
            </View>
          </>
        )}

        {!hasPet && (
          <View className="device-card empty-device-card">
            <Text className="device-empty-title">设备管理</Text>
            <View className="device-plus-box" onClick={handleAddDevice}>
              <Text className="device-plus-icon">+</Text>
            </View>
          </View>
        )}

        <View className="quick-nav-wrap">
          <QuickNav showLabels />
        </View>
      </View>
    </View>
  );
}
