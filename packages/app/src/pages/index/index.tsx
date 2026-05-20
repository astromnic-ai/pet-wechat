import { View, Text, Image, Swiper, SwiperItem } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useMemo, useRef, useState } from "react";
import { request } from "../../utils/request";
import { subscribe } from "../../utils/ws";
import type { AvatarStatus, DeviceSummary, Pet, PetAvatar, PetAvatarAction } from "@pet-wechat/shared";
import { getPetActivityMode, getPetModePlans } from "../../utils/storage";
import { fetchPetActivityMode, syncPetModeCache } from "../../utils/petModeApi";
import { getDeviceDisplayName, getDeviceStatusText, getUsageLabel } from "../../utils/deviceDisplay";
import { getPetFallbackImage } from "../../utils/petVisual";
import QuickNav from "../../components/QuickNav";
import { PET_ACTION_LABELS as SHARED_ACTION_LABELS } from "../../utils/petActions";
import "./index.scss";

const HOME_LOGO_IMAGE = require("@/assets/images/logo.png");
const HOME_CAT_SIT_IMAGE = require("@/assets/images/home-cat-sit-blue.png");
const HOME_CAT_LIE_IMAGE = require("@/assets/images/home-cat-lie-blue.png");
const HOME_DOG_SIT_IMAGE = require("@/assets/images/home-dog-sit-corgi.png");
const HOME_DOG_LIE_IMAGE = require("@/assets/images/home-dog-lie-corgi.png");
const HOME_PET_QUESTION_IMAGE = require("@/assets/images/home-pet-question.png");
const ACTION_LABELS: Record<string, string> = {
  ...SHARED_ACTION_LABELS,
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

function getPetSubtitle(pet: Pet | null, petDescription?: string | null) {
  if (!pet) return "点击开始创建宠物";
  if (petDescription?.trim()) return petDescription.trim();
  return "待完善宠物描述";
}

function resolveLatestAvatar(avatars: PetAvatar[] = []) {
  return [...avatars].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
}

function isAvatarGeneratingStatus(status?: AvatarStatus | null) {
  return status === "pending" || status === "processing" || status === "approved";
}

function isAvatarUnavailableStatus(status?: AvatarStatus | null) {
  return !status || status === "failed" || status === "rejected";
}

function getHomeHeroState(pet: Pet | null, avatarStatus?: AvatarStatus | null) {
  if (!pet) return "empty" as const;
  if (pet.avatarImageUrl) return "done" as const;
  if (isAvatarGeneratingStatus(avatarStatus)) return "processing" as const;
  if (isAvatarUnavailableStatus(avatarStatus)) return "upload" as const;
  return "upload" as const;
}

function getHomeCustomizingImage(pet?: Pick<Pet, "species"> | null, pose: "sit" | "lie" = "lie") {
  if (pet?.species === "dog") {
    return pose === "sit" ? HOME_DOG_SIT_IMAGE : HOME_DOG_LIE_IMAGE;
  }

  return pose === "sit" ? HOME_CAT_SIT_IMAGE : HOME_CAT_LIE_IMAGE;
}

function getPetThemeClass(pet?: Pick<Pet, "species"> | null) {
  return pet?.species === "dog" ? "theme-dog" : "theme-cat";
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
  const plans = getPetModePlans(petId);
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
  const dayMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  const todayWeekday = dayMap[now.getDay()];

  const activePlan = plans.find((plan) => {
    const appliesToToday =
      plan.repeat === "weekly"
        ? plan.days.includes(todayWeekday)
        : plan.days.includes(todayWeekday) || plan.date === today;

    return appliesToToday;
  });

  if (!activePlan) return "";

  const activeSlot = activePlan.slots.find((slot) => {
    if (slot.day && slot.day !== todayWeekday) {
      return false;
    }

    const [startHour, startMinute] = String(slot.start).split(":").map(Number);
    const [endHour, endMinute] = String(slot.end).split(":").map(Number);
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    return currentMinutes >= start && currentMinutes < end;
  });

  return activeSlot?.action || "";
}

export default function Index() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [petActionMap, setPetActionMap] = useState<Record<string, PetAvatarAction[]>>({});
  const [petDescriptionMap, setPetDescriptionMap] = useState<Record<string, string>>({});
  const [petAvatarTaskMap, setPetAvatarTaskMap] = useState<
    Record<string, { avatarId: string; status: AvatarStatus | null }>
  >({});
  const [currentPetIndex, setCurrentPetIndex] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [petMode, setPetMode] = useState<"free" | "custom" | "real">("free");
  const [petDetailRefreshKey, setPetDetailRefreshKey] = useState(0);
  const [customizingPose, setCustomizingPose] = useState<"sit" | "lie">("sit");
  const skipNextDidShowRef = useRef(true);
  const hasPet = pets.length > 0;
  const currentPet = pets[currentPetIndex] ?? null;
  const petSlides = hasPet ? pets : [null];

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
    void loadPetActivityMode(pets[currentPetIndex]?.id);
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
    const timer = setInterval(() => {
      setCustomizingPose((prev) => (prev === "sit" ? "lie" : "sit"));
    }, 1800);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    void loadPetActivityMode(currentPet?.id);
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

        setPetDescriptionMap((prev) => ({
          ...prev,
          [currentPet.id]: latestAvatar?.petDescription?.trim() || "",
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

        setPetDescriptionMap((prev) => ({
          ...prev,
          [currentPet.id]: "",
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
    return subscribe("message:new", () => {
      void loadUnreadCount();
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
      const { devices: deviceList } = await request<{ devices: DeviceSummary[] }>({
        url: "/api/devices",
      });
      setDevices(deviceList);
    } catch {
      setDevices([]);
    }
  };

  const loadPetActivityMode = async (petId?: string) => {
    setPetMode(getPetActivityMode(petId));
    if (!petId) return;

    try {
      const res = await fetchPetActivityMode(petId);
      syncPetModeCache(petId, res);
      setPetMode(res.mode);
    } catch {
      setPetMode(getPetActivityMode(petId));
    }
  };

  const activeCollar = useMemo(() => {
    if (!currentPet) return null;
    return devices.find((item) => item.deviceType === "collar" && item.petId === currentPet.id) ?? null;
  }, [currentPet, devices]);
  const activeDesktop = useMemo(() => {
    if (!currentPet) return null;
    return (
      devices.find((item) => item.deviceType === "desktop" && item.bindings?.some((binding) => binding.petId === currentPet.id)) ?? null
    );
  }, [currentPet, devices]);
  const primaryManagedDevice = activeDesktop ?? activeCollar;
  const hasManagedDevices = Boolean(primaryManagedDevice);
  const primaryManagedDeviceName = primaryManagedDevice
    ? getDeviceDisplayName({
        petName: currentPet?.name,
        deviceName: primaryManagedDevice.name,
        fallbackName: primaryManagedDevice === activeDesktop ? "桌面端" : "项圈",
      })
    : "未命名设备";
  const primaryManagedDeviceLabel = primaryManagedDevice ? getUsageLabel(primaryManagedDevice.usageDurationMinutes) : "";
  const primaryManagedDeviceStatus = primaryManagedDevice ? getDeviceStatusText(primaryManagedDevice.status) : "";
  const isCompletelyEmpty = !hasPet && !hasManagedDevices;
  const defaultPetHeroImage = getPetFallbackImage(currentPet?.species);
  const currentPetAvatarTask = currentPet?.id ? petAvatarTaskMap[currentPet.id] : null;
  const currentPetAvatarStatus =
    currentPetAvatarTask?.status ?? currentPet?.latestAvatarStatus ?? null;
  const isAvatarGenerating = isAvatarGeneratingStatus(currentPetAvatarStatus);
  const homeHeroState = getHomeHeroState(currentPet, currentPetAvatarStatus);
  const bubbleText = !currentPet
    ? "点击开始创建宠物"
    : homeHeroState === "done"
      ? "在家开水龙头喝水？"
      : "";
  const heroOverlayText = homeHeroState === "processing"
    ? "宠物形象定制中..."
    : homeHeroState === "upload"
      ? "点击创建专属宠物"
      : "";
  const topCardAvatarImage = currentPet?.avatarImageUrl || HOME_LOGO_IMAGE;
  const petHeroImage =
    homeHeroState === "done"
      ? currentPet?.avatarImageUrl || defaultPetHeroImage
      : homeHeroState === "processing"
        ? getHomeCustomizingImage(currentPet, customizingPose)
        : HOME_PET_QUESTION_IMAGE;
  const currentPetDescription = currentPet?.id ? petDescriptionMap[currentPet.id] : "";
  const petSubtitle = getPetSubtitle(currentPet, currentPetDescription);
  const currentPetActions = currentPet?.id ? petActionMap[currentPet.id] || [] : [];

  const currentModeFrames = useMemo(() => {
    if (!currentPet) return [];
    if (homeHeroState !== "done") return [];
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
  }, [currentPet, currentPetActions, petMode, homeHeroState]);

  const currentFrameImage =
    homeHeroState === "done"
      ? currentModeFrames[0]?.imageUrl || petHeroImage
      : petHeroImage;

  const handleOpenPetInfo = () => {
    if (currentPet?.id) {
      Taro.navigateTo({ url: `/pages/pet-info/index?petId=${currentPet.id}` });
      return;
    }

    Taro.navigateTo({ url: "/pages/pet-info/index" });
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

    if (homeHeroState === "processing" && isAvatarGenerating && currentPetAvatarTask?.avatarId) {
      Taro.navigateTo({ url: `/pages/avatar-progress/index?avatarId=${currentPetAvatarTask.avatarId}` });
      return;
    }

    Taro.navigateTo({ url: `/pages/pet-avatar/index?petId=${currentPet.id}` });
  };

  const getSlideAvatarStatus = (pet: Pet | null) =>
    pet ? petAvatarTaskMap[pet.id]?.status ?? pet.latestAvatarStatus ?? null : null;

  const getSlideHeroState = (pet: Pet | null) => getHomeHeroState(pet, getSlideAvatarStatus(pet));

  const getSlideImage = (pet: Pet | null) => {
    if (!pet) return HOME_PET_QUESTION_IMAGE;

    const slideState = getSlideHeroState(pet);
    if (slideState === "done") {
      if (pet.id === currentPet?.id) {
        return currentFrameImage;
      }

      return pet.avatarImageUrl || getPetFallbackImage(pet.species);
    }

    if (slideState === "processing") {
      return getHomeCustomizingImage(pet, customizingPose);
    }

    return HOME_PET_QUESTION_IMAGE;
  };

  const getSlideImageClassName = (pet: Pet | null) => {
    const slideState = getSlideHeroState(pet);
    const poseClass = slideState === "processing" ? `pet-showcase--pose-${customizingPose}` : "";
    return `pet-showcase pet-showcase--${slideState} ${poseClass}`;
  };

  const handlePetStageClick = () => {
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
                <Image
                  className="avatar-image"
                  src={topCardAvatarImage}
                  mode="aspectFill"
                  onClick={(e) => {
                    e.stopPropagation?.();
                    if (hasPet) {
                      handleOpenPetInfo();
                      return;
                    }
                    handleAddPet();
                  }}
                />
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
                {bubbleText ? (
                  <View className="speech-bubble">
                    <Text className="speech-text">{bubbleText}</Text>
                  </View>
                ) : null}
                <Swiper
                  className="pet-swiper"
                  current={currentPetIndex}
                  circular={false}
                  duration={280}
                  onChange={(e) => setCurrentPetIndex(e.detail.current)}
                >
                  {petSlides.map((pet, index) => (
                    <SwiperItem key={pet?.id ?? `pet-${index}`}>
                      <View
                        className="pet-slide"
                        onClick={handlePetStageClick}
                      >
                        <Image
                          className={getSlideImageClassName(pet)}
                          src={getSlideImage(pet)}
                          mode="widthFix"
                        />
                        {pet?.id === currentPet?.id && heroOverlayText ? (
                          <View className={`pet-showcase-overlay pet-showcase-overlay--${homeHeroState} ${getPetThemeClass(pet)}`}>
                            <Text className="pet-showcase-overlay-text">{heroOverlayText}</Text>
                          </View>
                        ) : null}
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
                src={HOME_PET_QUESTION_IMAGE}
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
                    <Text className="managed-device-status-text">{primaryManagedDeviceStatus}</Text>
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
