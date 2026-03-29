import { View, Text, Image, ScrollView, Button, Input } from "@tarojs/components";
import Taro, { useDidShow, useShareAppMessage } from "@tarojs/taro";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BindingType,
  CollarDevice,
  DesktopDevice,
  DeviceStatus as SharedDeviceStatus,
  Pet,
} from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import { request } from "../../utils/request";
import "./index.scss";

type PetTabStatus = "owner" | "authorized";
type DeviceAction = "delete" | "unbind";

type DesktopWithBindings = DesktopDevice & {
  battery?: number | null;
  signal?: number | null;
  bindings: Array<{
    id: string;
    petId: string;
    bindingType: BindingType;
  }>;
};

interface PetTabItem {
  id: string;
  pet: Pet;
  status: PetTabStatus;
  collar: CollarDevice | null;
  desktops: DesktopWithBindings[];
}

const DEFAULT_PET_AVATAR = require("@/assets/images/black cat 3.png");
const COLLAR_ICON = require("@/assets/images/collar-icon.png");
const DESKTOP_ICON = require("@/assets/images/desktop-icon.png");
const OUTLINE_IMAGE = require("@/assets/images/pet-outline.png");
const DEFAULT_SHARE_MESSAGE = {
  title: "YEHEY",
  path: "/pages/index/index",
};

function getStatusText(status: PetTabStatus) {
  if (status === "owner") return "属于你的宠物";
  return "被授权的宠物";
}

function getStatusClass(status?: SharedDeviceStatus) {
  return status === "online" ? "online" : "offline";
}

function getDeviceStatusText(status?: SharedDeviceStatus) {
  if (status === "online") return "在线";
  if (status === "pairing") return "配对中";
  return "离线";
}

function formatBattery(battery?: number | null) {
  return battery == null ? "--" : `${battery}%`;
}

function formatSignal(signal?: number | null) {
  if (signal == null) return "信号 --";
  return signal <= 0 ? `信号 ${signal}dBm` : `信号 ${signal}`;
}

function formatPetInfo(pet: Pet) {
  const details = [pet.name, pet.breed].filter(Boolean);
  return details.join(" ") || pet.name;
}

function getDesktopBindingTypeLabel(bindingType?: BindingType) {
  if (bindingType === "authorized") return "授权绑定";
  if (bindingType === "owner") return "主人绑定";
  return "--";
}

export default function Devices() {
  const [selectedPetId, setSelectedPetId] = useState("");
  const [pets, setPets] = useState<Pet[]>([]);
  const [authorizedPets, setAuthorizedPets] = useState<Pet[]>([]);
  const [collars, setCollars] = useState<CollarDevice[]>([]);
  const [desktops, setDesktops] = useState<DesktopWithBindings[]>([]);
  const [editingCollarName, setEditingCollarName] = useState(false);
  const [collarNameDraft, setCollarNameDraft] = useState("");
  const mountedRef = useRef(true);
  const sharePetIdRef = useRef("");

  const loadPets = async () => {
    try {
      const res = await request<{
        pets: Pet[];
        authorizedPets: Pet[];
      }>({ url: "/api/pets" });
      if (!mountedRef.current) return;
      setPets(res.pets);
      setAuthorizedPets(res.authorizedPets);
    } catch {
      if (!mountedRef.current) return;
      setPets([]);
      setAuthorizedPets([]);
    }
  };

  const loadCollars = async () => {
    try {
      const res = await request<{ collars: CollarDevice[] }>({
        url: "/api/devices/collars",
      });
      if (!mountedRef.current) return;
      setCollars(res.collars);
    } catch {
      if (!mountedRef.current) return;
      setCollars([]);
    }
  };

  const loadDesktops = async () => {
    try {
      const res = await request<{ desktops: DesktopWithBindings[] }>({
        url: "/api/devices/desktops",
      });
      if (!mountedRef.current) return;
      setDesktops(res.desktops);
    } catch {
      if (!mountedRef.current) return;
      setDesktops([]);
    }
  };

  useDidShow(() => {
    Taro.hideTabBar();
    void loadPets();
    void loadCollars();
    void loadDesktops();
  });

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const petTabs = useMemo<PetTabItem[]>(() => {
    const mergedPets = [
      ...pets.map((pet) => ({ pet, status: "owner" as const })),
      ...authorizedPets.map((pet) => ({ pet, status: "authorized" as const })),
    ];

    return mergedPets.map(({ pet, status }) => ({
      id: pet.id,
      pet,
      status,
      collar: collars.find((item) => item.petId === pet.id) ?? null,
      desktops: desktops.filter((desktop) => {
        if (desktop.bindings.some((binding) => binding.petId === pet.id)) {
          return true;
        }

        // Development fallback: if bindings are missing from API, still show owned desktops
        // so device management remains visible instead of rendering empty.
        return status === "owner" && desktop.bindings.length === 0;
      }),
    }));
  }, [authorizedPets, collars, desktops, pets]);

  useEffect(() => {
    if (petTabs.length === 0) {
      if (selectedPetId) {
        setSelectedPetId("");
      }
      return;
    }

    if (selectedPetId && petTabs.some((item) => item.id === selectedPetId)) {
      return;
    }

    const nextSelectedPet =
      petTabs.find((item) => item.collar || item.desktops.length > 0) ?? petTabs[0];
    setSelectedPetId(nextSelectedPet.id);
  }, [petTabs, selectedPetId]);

  const selectedPet = useMemo(
    () => petTabs.find((item) => item.id === selectedPetId) ?? petTabs[0] ?? null,
    [petTabs, selectedPetId]
  );

  useEffect(() => {
    setEditingCollarName(false);
    setCollarNameDraft(selectedPet?.collar?.name || "");
  }, [selectedPet?.id, selectedPet?.collar?.name]);

  useEffect(() => {
    if (selectedPet?.status === "owner") {
      void Taro.showShareMenu({});
      return;
    }

    sharePetIdRef.current = "";
    Taro.hideShareMenu();
  }, [selectedPet?.id, selectedPet?.status]);

  useShareAppMessage((res) => {
    const selectedOwnerPetId = selectedPet?.status === "owner" ? selectedPet.pet.id : "";
    const petId =
      res.from === "button"
        ? sharePetIdRef.current || selectedOwnerPetId
        : res.from === "menu"
          ? selectedOwnerPetId
          : "";

    if (!petId) {
      return DEFAULT_SHARE_MESSAGE;
    }

    return new Promise((resolve) => {
      request<{
        inviteCode: string;
        petName: string;
        fromNickname: string;
      }>({
        url: "/api/devices/invite",
        method: "POST",
        data: { petId },
      })
        .then((shareRes) => {
          resolve({
            title: `${shareRes.fromNickname}邀请你一起看${shareRes.petName}`,
            path: `/pages/invite/index?code=${shareRes.inviteCode}`,
          });
        })
        .catch(() => {
          Taro.showToast({ title: "生成邀请链接失败", icon: "none" });
          resolve(DEFAULT_SHARE_MESSAGE);
        });
    });
  });

  const handleAction = (type: "delete" | "unbind") => {
    const text = type === "delete" ? "删除设备" : "解绑设备";
    Taro.showToast({ title: text, icon: "none" });
  };

  const handleSaveCollarName = async () => {
    const activeCollar = selectedPet?.collar;
    if (!activeCollar) return;

    const nextName = collarNameDraft.trim();
    if (!nextName) {
      Taro.showToast({ title: "请输入项圈名称", icon: "none" });
      return;
    }

    try {
      const { collar } = await request<{ collar: CollarDevice }>({
        url: `/api/devices/collars/${activeCollar.id}`,
        method: "PUT",
        data: { name: nextName },
      });
      setCollars((prev) => prev.map((item) => (item.id === collar.id ? collar : item)));
      setEditingCollarName(false);
      Taro.showToast({ title: "已更新名称", icon: "success" });
    } catch (e: any) {
      Taro.showToast({ title: e.message || "修改失败", icon: "none" });
    }
  };

  if (!selectedPet) {
    return (
      <View className="devices-page">
        <View className="header">
          <PageBack />
          <Text className="page-title">我的设备</Text>
          <View className="header-placeholder" />
        </View>

        <ScrollView className="content-scroll" scrollX>
          <View className="pet-tabs" />
        </ScrollView>

        <ScrollView className="page-scroll" scrollY>
          <View className="page-content">
            <View className="collar-card">
              <Text className="collar-name">暂无宠物</Text>
              <Text className="pet-bind-info">请先添加宠物后再管理设备</Text>
            </View>

            <Image className="outline-image" src={OUTLINE_IMAGE} mode="widthFix" />
          </View>
        </ScrollView>
      </View>
    );
  }

  const activeCollar = selectedPet.collar;
  // TODO: Refine what device actions authorized pets should be allowed to see and execute.
  const canManageCollar = selectedPet.status === "owner" && Boolean(activeCollar);
  const collarStatusText = activeCollar ? getDeviceStatusText(activeCollar.status) : "未绑定";
  const desktopsTitle = `${selectedPet.pet.name}&项圈关联的桌面端 (${selectedPet.desktops.length})`;

  return (
    <View className="devices-page">
      <View className="header">
        <PageBack />
        <Text className="page-title">我的设备</Text>
        <View className="header-placeholder" />
      </View>

      <ScrollView className="content-scroll" scrollX>
        <View className="pet-tabs">
          {petTabs.map((pet) => (
            <View
              key={pet.id}
              className={`pet-tab ${selectedPetId === pet.id ? "active" : ""}`}
              onClick={() => setSelectedPetId(pet.id)}
            >
              <Image
                className="pet-avatar"
                src={pet.pet.avatarImageUrl || DEFAULT_PET_AVATAR}
                mode="aspectFill"
              />
              <View className="pet-tab-info">
                <Text className="pet-tab-name">{pet.pet.name}</Text>
                <Text className="pet-tab-status">{getStatusText(pet.status)}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <ScrollView className="page-scroll" scrollY>
        <View className="page-content">
          <View className="collar-card">
            <View className="collar-top">
              <Image className="collar-icon" src={COLLAR_ICON} mode="aspectFit" />
              <View className="collar-main">
                <View className="collar-name-row">
                  {editingCollarName ? (
                    <>
                      <Input
                        className="collar-name-input"
                        value={collarNameDraft}
                        placeholder="输入项圈名称"
                        onInput={(e) => setCollarNameDraft(e.detail.value)}
                        onConfirm={handleSaveCollarName}
                      />
                      <Text className="edit-icon save-icon" onClick={handleSaveCollarName}>保存</Text>
                    </>
                  ) : (
                    <>
                      <Text className="collar-name">{activeCollar?.name || "暂无项圈设备"}</Text>
                      {selectedPet.status === "owner" ? (
                        <Text className="edit-icon" onClick={() => setEditingCollarName(true)}>✎</Text>
                      ) : null}
                    </>
                  )}
                </View>
                <View className="collar-meta">
                  <View className="status-wrap">
                    <View className={`status-dot ${getStatusClass(activeCollar?.status)}`} />
                    <Text className="status-text">{collarStatusText}</Text>
                  </View>
                  <Text className="battery-text">电量 {formatBattery(activeCollar?.battery)}</Text>
                  <Text className="signal-text">{formatSignal(activeCollar?.signal)}</Text>
                </View>
              </View>
            </View>

            <Text className="pet-bind-info">
              关联宠物：{formatPetInfo(selectedPet.pet)} | MAC地址：{activeCollar?.macAddress || "--"}
            </Text>

            {canManageCollar && (
              <View className="action-row">
                <Button
                  openType="share"
                  className="action-btn"
                  onClick={() => {
                    sharePetIdRef.current = selectedPet?.pet.id || "";
                  }}
                >
                  <Text className="action-btn-text">分享授权</Text>
                </Button>
                <View className="action-btn" onClick={() => handleAction("unbind")}>
                  <Text className="action-btn-text">解除当前绑定</Text>
                </View>
              </View>
            )}
          </View>

          <Text className="desktop-section-title">{desktopsTitle}</Text>

          {selectedPet.desktops.map((desktop) => {
            const binding = desktop.bindings.find((item) => item.petId === selectedPet.pet.id);
            const action: "share" | DeviceAction =
              selectedPet.status === "owner"
                ? binding?.bindingType === "authorized"
                  ? "delete"
                  : "share"
                : "unbind";

            return (
              <View key={desktop.id} className="desktop-card">
                <View className="desktop-top">
                  <Image className="desktop-icon" src={DESKTOP_ICON} mode="aspectFit" />
                  <View className="desktop-main">
                    <View className="desktop-name-row">
                      <Text className="desktop-name">{desktop.name}</Text>
                      {binding ? (
                        <Text className="desktop-tag">
                          ({getDesktopBindingTypeLabel(binding.bindingType)})
                        </Text>
                      ) : null}
                      {selectedPet.status === "owner" ? (
                        <Text className="edit-icon desktop-edit-icon">✎</Text>
                      ) : null}
                    </View>
                    <View className="desktop-meta">
                      <View className="status-wrap">
                        <View className={`status-dot ${getStatusClass(desktop.status)}`} />
                        <Text className="status-text">{getDeviceStatusText(desktop.status)}</Text>
                      </View>
                      <Text className="signal-text">{formatSignal(desktop.signal)}</Text>
                    </View>
                  </View>
                  {action === "share" ? (
                    <Button
                      openType="share"
                      className="desktop-action-chip"
                      onClick={() => {
                        sharePetIdRef.current = selectedPet?.pet.id || "";
                      }}
                    >
                      <Text className="desktop-action-text">分享</Text>
                    </Button>
                  ) : (
                    <View
                      className="desktop-action-chip"
                      onClick={() => handleAction(action as "delete" | "unbind")}
                    >
                      <Text className="desktop-action-text">
                        {action === "delete" ? "删除权限" : "解绑"}
                      </Text>
                    </View>
                  )}
                </View>

                <Text className="desktop-info-line">MAC地址：{desktop.macAddress}</Text>
                <Text className="desktop-info-line">
                  电量：{formatBattery(desktop.battery)} | 绑定方式：
                  {getDesktopBindingTypeLabel(binding?.bindingType)}
                </Text>
              </View>
            );
          })}

          <View
            className="add-device-btn"
            onClick={() => {
              Taro.showActionSheet({
                itemList: ["添加项圈", "添加桌面端"],
                success: (res) => {
                  if (res.tapIndex === 0) {
                    Taro.navigateTo({ url: "/pages/collar-bind/index" });
                  } else {
                    Taro.navigateTo({ url: "/pages/desktop-bind/index" });
                  }
                },
              });
            }}
          >
            <Text className="add-device-text">+ 添加新设备</Text>
          </View>

          <Image className="outline-image" src={OUTLINE_IMAGE} mode="widthFix" />
        </View>
      </ScrollView>
    </View>
  );
}
