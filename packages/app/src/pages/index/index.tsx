import { View, Text, Image, Swiper, SwiperItem, Video } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useMemo, useRef, useState } from "react";
import { request } from "../../utils/request";
import { subscribe } from "../../utils/ws";
import type { AvatarStatus, CollarDevice, DesktopDevice, Pet, PetAvatar, PetAvatarAction } from "@pet-wechat/shared";
import { getPetActivityMode, getPetModePlans } from "../../utils/storage";
import { getDeviceDisplayName, getDeviceStatusText, getUsageLabel } from "../../utils/deviceDisplay";
import { getPetDisplayImage, getPetFallbackImage } from "../../utils/petVisual";
import QuickNav from "../../components/QuickNav";
import "./index.scss";

const HOME_LOGO_IMAGE = require("@/assets/home/pet-logo.png");
const HOME_PET_SIT_IMAGE = require("@/assets/home/pet-sit.png");
const HOME_PET_LIE_IMAGE = require("@/assets/home/pet-lie.png");
const HOME_WAITING_VIDEO = require("@/assets/home/pet-waiting-loop.mp4");

type DesktopDeviceWithBindings = DesktopDevice & {
  bindings?: Array<{
    id: string;
    petId: string;
    bindingType: string;
  }>;
};

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

function getPetSubtitle(pet: Pet | null, petDescription?: string | null) {
  if (!pet) return "点击开始创建宠物";
  if (petDescription?.trim()) return petDescription.trim();
  return "待完善宠物描述";
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
        : plan.date === today;

    return appliesToToday;
  });

  if (!activePlan) return "";

  const activeSlot = activePlan.slots.find((slot) => {
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
  const [collars, setCollars] = useState<CollarDevice[]>([]);
  const [desktops, setDesktops] = useState<DesktopDeviceWithBindings[]>([]);
  const [petActionMap, setPetActionMap] = useState<Record<string, PetAvatarAction[]>>({});
  const [petDescriptionMap, setPetDescriptionMap] = useState<Record<string, string>>({});
  const [petAvatarTaskMap, setPetAvatarTaskMap] = useState<
    Record<string, { avatarId: string; status: AvatarStatus | null }>
  >({});
  const [currentPetIndex, setCurrentPetIndex] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [petMode, setPetMode] = useState<"free" | "custom" | "real">("free");
  const [frameIndex, setFrameIndex] = useState(0);
  const [petDetailRefreshKey, setPetDetailRefreshKey] = useState(0);
  const [isWaitingVideoPlaying, setIsWaitingVideoPlaying] = useState(false);
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
        request<{ desktops: DesktopDeviceWithBindings[] }>({ url: "/api/devices/desktops" }),
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
    if (!currentPet) return null;
    return collars.find((item) => item.petId === currentPet.id) ?? null;
  }, [collars, currentPet]);
  const activeDesktop = useMemo(() => {
    if (!currentPet) return null;
    return (
      desktops.find((item) => item.bindings?.some((binding) => binding.petId === currentPet.id)) ?? null
    );
  }, [currentPet, desktops]);
  const primaryManagedDevice = activeDesktop ?? activeCollar;
  const hasManagedDevices = Boolean(primaryManagedDevice);
  const primaryManagedDeviceName = primaryManagedDevice
    ? getDeviceDisplayName({
        petName: currentPet?.name,
        deviceName: primaryManagedDevice.name,
        fallbackName: primaryManagedDevice === activeDesktop ? "桌面端" : "项圈",
      })
    : "未命名设备";
  const primaryManagedDeviceLabel = primaryManagedDevice ? getUsageLabel(primaryManagedDevice.createdAt) : "";
  const primaryManagedDeviceStatus = primaryManagedDevice ? getDeviceStatusText(primaryManagedDevice.status) : "";
  const isCompletelyEmpty = !hasPet && !hasManagedDevices;
  const hasCompletePetProfile = Boolean(currentPet?.name?.trim() && currentPet?.breed?.trim());
  const defaultPetHeroImage = getPetFallbackImage(currentPet?.species);
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
    : homeHeroState === "done"
      ? "在家开水龙头喝水？"
      : "";
  const heroOverlayText = homeHeroState === "processing"
    ? isWaitingVideoPlaying
      ? ""
      : "点击猫咪播放等待动画"
    : homeHeroState === "upload"
      ? "上传您的宠物照片"
      : "";
  const topCardAvatarImage = currentPet?.avatarImageUrl || HOME_LOGO_IMAGE;
  const petHeroImage =
    homeHeroState === "done"
      ? currentPet?.avatarImageUrl || defaultPetHeroImage
      : homeHeroState === "processing"
        ? HOME_PET_LIE_IMAGE
        : HOME_PET_SIT_IMAGE;
  const waitingVideoId = `home-waiting-video-${currentPet?.id || "default"}`;
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

  useEffect(() => {
    setFrameIndex(0);
  }, [currentPet?.id, petMode]);

  useEffect(() => {
    setIsWaitingVideoPlaying(false);
  }, [currentPet?.id, homeHeroState]);

  useEffect(() => {
    if (currentModeFrames.length <= 1) return;

    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % currentModeFrames.length);
    }, 1200);

    return () => clearInterval(timer);
  }, [currentModeFrames]);

  const currentFrameImage =
    homeHeroState === "done"
      ? currentModeFrames[frameIndex]?.imageUrl || petHeroImage
      : petHeroImage;

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

    if (homeHeroState === "processing" && isAvatarGenerating && currentPetAvatarTask?.avatarId) {
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

    if (homeHeroState === "processing") {
      setIsWaitingVideoPlaying(true);
      Taro.nextTick(() => {
        const context = Taro.createVideoContext(waitingVideoId);
        context.seek?.(0);
        context.play?.();
      });
      return;
    }

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
                        {pet?.id === currentPet?.id && homeHeroState === "processing" ? (
                          <View className="pet-showcase-media-stage">
                            <Image
                              className={`pet-showcase ${isWaitingVideoPlaying ? "pet-showcase--hidden" : ""}`}
                              src={currentFrameImage}
                              mode="widthFix"
                            />
                            <Video
                              id={waitingVideoId}
                              className={`pet-showcase-video ${
                                isWaitingVideoPlaying ? "pet-showcase-video--active" : "pet-showcase-video--hidden"
                              }`}
                              src={HOME_WAITING_VIDEO}
                              autoplay={false}
                              loop={false}
                              muted
                              controls={false}
                              showCenterPlayBtn={false}
                              enableProgressGesture={false}
                              objectFit="contain"
                              poster={HOME_PET_LIE_IMAGE}
                              onEnded={() => {
                                const context = Taro.createVideoContext(waitingVideoId);
                                context.seek?.(0);
                                setIsWaitingVideoPlaying(false);
                              }}
                              onPause={() => setIsWaitingVideoPlaying(false)}
                              onError={() => setIsWaitingVideoPlaying(false)}
                            />
                          </View>
                        ) : (
                          <Image
                            className="pet-showcase"
                            src={
                              pet?.id === currentPet?.id
                                ? currentFrameImage
                                : getPetDisplayImage(pet)
                            }
                            mode="widthFix"
                          />
                        )}
                        {pet?.id === currentPet?.id && heroOverlayText ? (
                          <View className="pet-showcase-overlay">
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
                src={HOME_PET_SIT_IMAGE}
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
