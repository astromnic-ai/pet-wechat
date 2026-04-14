import { View, Text, Image, Swiper, SwiperItem } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useMemo, useRef, useState } from "react";
import { request } from "../../utils/request";
import { subscribe } from "../../utils/ws";
import type { AvatarStatus, CollarDevice, DesktopDevice, Pet, PetAvatar, PetAvatarAction } from "@pet-wechat/shared";
import { getPetActivityMode, getPetModeSlots } from "../../utils/storage";
import { getDeviceDisplayName, getDeviceStatusText, getUsageLabel } from "../../utils/deviceDisplay";
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

function getPetSubtitle(pet: Pet | null) {
  if (!pet) return "点击开始创建宠物";
  if (pet.breed?.trim()) return pet.breed.trim();
  if (pet.latestBehavior?.actionType) return `${getBehaviorLabel(pet.latestBehavior.actionType)}中`;
  return "待完善宠物资料";
}

function resolveLatestAvatar(avatars: PetAvatar[] = []) {
  return [...avatars].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
}

function normalizeActionKeyword(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function getActionAliases(action?: string | null) {
  const normalized = normalizeActionKeyword(action);
  const labels = [normalized];
  const mapped = normalizeActionKeyword(ACTION_LABELS[action || ""]);

  if (mapped) labels.push(mapped);

  if (normalized.includes("walk") || normalized.includes("散步") || normalized.includes("走")) {
    labels.push("walking", "散步", "走");
  }
  if (normalized.includes("run") || normalized.includes("跑") || normalized.includes("奔跑")) {
    labels.push("running", "跑步", "奔跑", "跑");
  }
  if (normalized.includes("sleep") || normalized.includes("睡")) {
    labels.push("sleeping", "睡觉");
  }
  if (normalized.includes("eat") || normalized.includes("吃")) {
    labels.push("eating", "吃饭", "吃东西");
  }
  if (normalized.includes("play") || normalized.includes("玩")) {
    labels.push("playing", "玩耍");
  }
  if (normalized.includes("rest") || normalized.includes("休息")) {
    labels.push("resting", "休息");
  }

  return Array.from(new Set(labels.filter(Boolean)));
}

function matchActionsByKeyword(actions: PetAvatarAction[], action?: string | null) {
  const aliases = getActionAliases(action);
  if (aliases.length === 0) return [];

  return actions.filter((item) => {
    const target = normalizeActionKeyword(item.actionType);
    return aliases.some((alias) => target.includes(alias));
  });
}

function getCurrentCustomAction(petId?: string) {
  const slots = getPetModeSlots(petId);
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const activeSlot = slots.find((slot) => {
    const [startHour, startMinute] = slot.start.split(":").map(Number);
    const [endHour, endMinute] = slot.end.split(":").map(Number);
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    return currentMinutes >= start && currentMinutes < end;
  });

  return activeSlot?.action || "";
}

export default function Index() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [collars, setCollars] = useState<CollarDevice[]>([]);
  const [desktops, setDesktops] = useState<DesktopDevice[]>([]);
  const [petActionMap, setPetActionMap] = useState<Record<string, PetAvatarAction[]>>({});
  const [petAvatarTaskMap, setPetAvatarTaskMap] = useState<
    Record<string, { avatarId: string; status: AvatarStatus | null }>
  >({});
  const [currentPetIndex, setCurrentPetIndex] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [petMode, setPetMode] = useState<"free" | "custom" | "real">("free");
  const [frameIndex, setFrameIndex] = useState(0);
  const [petDetailRefreshKey, setPetDetailRefreshKey] = useState(0);
  const skipNextDidShowRef = useRef(true);
  const petTouchStartRef = useRef<{ x: number; y: number } | null>(null);

  useDidShow(() => {
    Taro.hideTabBar();
    Taro.hideLoading();
    if (skipNextDidShowRef.current) {
      skipNextDidShowRef.current = false;
      return;
    }

    void loadPets();
    void loadUnreadCount();
    void loadDevices();
    setPetDetailRefreshKey((prev) => prev + 1);
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
    if (!currentPet?.id) return;

    let cancelled = false;

    void request<{ pet: Pet; avatars: PetAvatar[]; actions: PetAvatarAction[] }>({
      url: `/api/pets/${currentPet.id}`,
    })
      .then((res) => {
        if (cancelled) return;

        const latestAvatar = resolveLatestAvatar(res.avatars);

        setPetActionMap((prev) => ({
          ...prev,
          [currentPet.id]: [...res.actions]
            .filter((item) => item.petAvatarId === latestAvatar?.id)
            .sort((a, b) => a.sortOrder - b.sortOrder),
        }));

        setPetAvatarTaskMap((prev) => ({
          ...prev,
          [currentPet.id]: {
            avatarId: latestAvatar?.id || "",
            status: latestAvatar?.status ?? null,
          },
        }));
      })
      .catch(() => {
        if (cancelled) return;

        setPetActionMap((prev) => ({
          ...prev,
          [currentPet.id]: [],
        }));

        setPetAvatarTaskMap((prev) => ({
          ...prev,
          [currentPet.id]: {
            avatarId: "",
            status: null,
          },
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [currentPet?.id, petDetailRefreshKey]);

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

  useEffect(() => {
    const handleDevicesChanged = () => {
      void loadPets();
      void loadDevices();
    };

    Taro.eventCenter.on("devices:changed", handleDevicesChanged);

    return () => {
      Taro.eventCenter.off("devices:changed", handleDevicesChanged);
    };
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
  const hasManagedDevices = Boolean(activeCollar || activeDesktop);
  const primaryManagedDeviceName = primaryManagedDevice
    ? getDeviceDisplayName({
        petName: currentPet?.name,
        deviceName: primaryManagedDevice.name,
        fallbackName: primaryManagedDevice === activeDesktop ? "桌面端" : "项圈",
      })
    : "未命名设备";
  const primaryManagedDeviceLabel = primaryManagedDevice
    ? `${getDeviceStatusText(primaryManagedDevice.status)} · ${getUsageLabel(primaryManagedDevice.createdAt)}`
    : "";
  const isCompletelyEmpty = !hasPet && !hasManagedDevices;
  const hasCompletePetProfile = Boolean(currentPet?.name?.trim() && currentPet?.breed?.trim());
  const defaultPetHeroImage = currentPet?.species === "dog"
    ? require("@/assets/images/dog-hero.png")
    : require("@/assets/images/pet-collar.png");
  const currentPetAvatarTask = currentPet?.id ? petAvatarTaskMap[currentPet.id] : null;
  const currentPetAvatarStatus = currentPetAvatarTask?.status ?? null;
  const isAvatarGenerating =
    currentPetAvatarStatus === "pending" ||
    currentPetAvatarStatus === "processing" ||
    currentPetAvatarStatus === "approved";
  const isAvatarUnavailable =
    !currentPetAvatarStatus ||
    currentPetAvatarStatus === "failed" ||
    currentPetAvatarStatus === "rejected";
  const hasCustomPetAvatar = Boolean(currentPet?.avatarImageUrl);
  const homeHeroState = !currentPet
    ? "empty"
    : hasCustomPetAvatar
      ? "done"
      : isAvatarGenerating
        ? "processing"
        : isAvatarUnavailable
          ? "upload"
          : "upload";
  const bubbleText = !currentPet
    ? "点击开始创建宠物"
    : homeHeroState === "processing"
      ? "正在生成您的宠物定制形象"
      : homeHeroState === "upload"
        ? "上传您的宠物照片"
        : "在家开水龙头喝水？";
  const petHeroImage = homeHeroState === "done" ? currentPet?.avatarImageUrl || defaultPetHeroImage : defaultPetHeroImage;
  const petSubtitle = getPetSubtitle(currentPet);
  const currentPetActions = currentPet?.id ? petActionMap[currentPet.id] || [] : [];

  const currentModeFrames = useMemo(() => {
    if (!currentPet) return [];
    if (currentPetActions.length === 0) return [];

    if (petMode === "real") {
      const matched = matchActionsByKeyword(currentPetActions, currentPet.latestBehavior?.actionType);
      return matched.length > 0 ? matched : currentPetActions.slice(0, 1);
    }

    if (petMode === "custom") {
      const currentAction = getCurrentCustomAction(currentPet.id);
      const matched = matchActionsByKeyword(currentPetActions, currentAction);
      return matched.length > 0 ? matched : currentPetActions.slice(0, 2);
    }

    return currentPetActions.slice(0, Math.min(currentPetActions.length, 4));
  }, [currentPet, currentPetActions, petMode]);

  useEffect(() => {
    setFrameIndex(0);
  }, [currentPet?.id, petMode]);

  useEffect(() => {
    if (currentModeFrames.length <= 1) return;

    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % currentModeFrames.length);
    }, 1200);

    return () => clearInterval(timer);
  }, [currentModeFrames]);

  const currentFrameImage =
    currentModeFrames[frameIndex]?.imageUrl ||
    petHeroImage;

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
  const handleAddPet = () => {
    Taro.navigateTo({ url: "/pages/pet-info/index" });
  };
  const handleConfigCollar = () => Taro.navigateTo({ url: "/pages/collar-bind/index" });
  const handleConfigDesktop = () => Taro.navigateTo({ url: "/pages/collar-bind/index?deviceType=desktop" });
  const handleManageDevices = () => Taro.switchTab({ url: "/pages/devices/index" });
  const handleOpenMessages = () => Taro.switchTab({ url: "/pages/messages/index" });
  const handleAddDevice = () => Taro.navigateTo({ url: "/pages/collar-bind/index" });
  const handleOpenPetMode = () =>
    Taro.navigateTo({ url: `/pages/pet-mode/index?petId=${currentPet?.id || ""}` });
  const handleOpenPetAvatar = () => {
    if (!currentPet?.id) {
      handleAddPet();
      return;
    }

    if (homeHeroState === "done") {
      handleOpenPetInfo();
      return;
    }

    if (homeHeroState === "processing" && currentPetAvatarTask?.avatarId) {
      Taro.navigateTo({ url: `/pages/avatar-progress/index?avatarId=${currentPetAvatarTask.avatarId}` });
      return;
    }

    Taro.navigateTo({ url: `/pages/pet-avatar/index?petId=${currentPet.id}` });
  };

  const handlePetTouchStart = (e: any) => {
    const touch = e.touches?.[0];
    if (!touch) return;

    petTouchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
  };

  const handlePetTouchEnd = (e: any) => {
    const touch = e.changedTouches?.[0];
    const start = petTouchStartRef.current;
    petTouchStartRef.current = null;
    if (!touch || !start) return;

    const deltaX = Math.abs(touch.clientX - start.x);
    const deltaY = Math.abs(touch.clientY - start.y);
    if (deltaX > 18 || deltaY > 18) return;

    handleOpenPetAvatar();
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
          <View className="top-card">
            <View className="top-card-entry">
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
                <Text className="pet-name">{hasPet ? currentPet?.name?.trim() || "未命名宠物" : "宠物的昵称"}</Text>
                <Text className="pet-subtitle">{petSubtitle}</Text>
              </View>
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
                      <View
                        className="pet-slide"
                        onTouchStart={handlePetTouchStart}
                        onTouchEnd={handlePetTouchEnd}
                      >
                        <Image
                          className="pet-showcase"
                          src={
                            pet?.id === currentPet?.id
                              ? currentFrameImage
                              : pet?.avatarImageUrl ||
                                (pet?.species === "dog"
                                  ? require("@/assets/images/dog-hero.png")
                                  : require("@/assets/images/pet-collar.png"))
                          }
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
            <View className="device-card managed-device-card">
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
                    <Text className="managed-device-name">{primaryManagedDeviceName}</Text>
                    <Text className="managed-device-text">{primaryManagedDeviceLabel}</Text>
                  </View>
                  <View className="managed-device-status">
                    <Text className="managed-device-status-text">已连接</Text>
                  </View>
                  <View className="device-manage-btn" onClick={handleManageDevices}>
                    <Text className="device-manage-text">›</Text>
                  </View>
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
