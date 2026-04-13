import { View, Text, Image, ScrollView, Input } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BindingType, CollarDevice, DesktopDevice, DeviceStatus, Pet } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import { request } from "../../utils/request";
import "./index.scss";

type DesktopWithBindings = DesktopDevice & {
  battery?: number | null;
  signal?: number | null;
  bindings: Array<{
    id: string;
    petId: string;
    bindingType: BindingType;
  }>;
};

type DeviceCard = {
  id: string;
  sourceId: string;
  type: "collar" | "desktop";
  name: string;
  status: DeviceStatus;
  signal?: number | null;
  battery?: number | null;
  petId?: string | null;
  petName?: string;
  petStatus?: "owner" | "authorized" | "none";
  bindingId?: string;
  bindingType?: BindingType;
  lastOnlineAt?: string | null;
};

const COLLAR_ICON = require("@/assets/images/collar-icon.png");
const DESKTOP_ICON = require("@/assets/images/desktop-icon.png");
function getStatusText(status: DeviceStatus) {
  if (status === "online") return "在线";
  if (status === "pairing") return "连接中";
  return "离线";
}

function getSignalText(type: "collar" | "desktop", signal?: number | null, status?: DeviceStatus) {
  if (type === "desktop") {
    return status === "online" ? "信号良好" : "无信号";
  }

  if (signal == null) return "信号未知";
  if (signal >= 80) return "信号良好";
  if (signal >= 60) return "信号一般";
  return "信号较弱";
}

function getDeviceNote(item: DeviceCard) {
  if (item.type === "collar") {
    if (item.petName) {
      return `已绑定宠物：${item.petName}`;
    }
    return "暂未绑定宠物";
  }

  if (item.petName) {
    return `当前关联：${item.petName}`;
  }

  if (item.lastOnlineAt) {
    return "设备状态：近期有活跃";
  }

  return "设备状态：等待绑定";
}

export default function Devices() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [authorizedPets, setAuthorizedPets] = useState<Pet[]>([]);
  const [collars, setCollars] = useState<CollarDevice[]>([]);
  const [desktops, setDesktops] = useState<DesktopWithBindings[]>([]);
  const [editingCollarId, setEditingCollarId] = useState("");
  const [collarNameDraft, setCollarNameDraft] = useState("");
  const loadPets = async () => {
    try {
      const res = await request<{ pets: Pet[]; authorizedPets: Pet[] }>({ url: "/api/pets" });
      setPets(res.pets);
      setAuthorizedPets(res.authorizedPets);
    } catch {
      setPets([]);
      setAuthorizedPets([]);
    }
  };

  const loadDevices = async () => {
    try {
      const [collarRes, desktopRes] = await Promise.all([
        request<{ collars: CollarDevice[] }>({ url: "/api/devices/collars" }),
        request<{ desktops: DesktopWithBindings[] }>({ url: "/api/devices/desktops" }),
      ]);
      setCollars(collarRes.collars);
      setDesktops(desktopRes.desktops);
    } catch {
      setCollars([]);
      setDesktops([]);
    }
  };

  const notifyHomeDevicesChanged = () => {
    Taro.eventCenter.trigger("devices:changed");
  };

  useDidShow(() => {
    Taro.hideTabBar();
    void Promise.all([loadPets(), loadDevices()]);
  });

  const petMetaMap = useMemo(() => {
    const map = new Map<string, { name: string; status: "owner" | "authorized" }>();
    pets.forEach((pet) => map.set(pet.id, { name: pet.name, status: "owner" }));
    authorizedPets.forEach((pet) => map.set(pet.id, { name: pet.name, status: "authorized" }));
    return map;
  }, [authorizedPets, pets]);

  const deviceCards = useMemo<DeviceCard[]>(() => {
    const collarCards = collars.map((item) => {
      const petMeta = item.petId ? petMetaMap.get(item.petId) : undefined;
      return {
        id: item.id,
        sourceId: item.id,
        type: "collar" as const,
        name: item.name,
        status: item.status,
        signal: item.signal,
        battery: item.battery,
        petId: item.petId,
        petName: petMeta?.name,
        petStatus: petMeta?.status ?? "none",
        lastOnlineAt: item.lastOnlineAt,
      };
    });

    const desktopCards = desktops.flatMap((item) => {
      if (item.bindings.length === 0) {
        return [
          {
            id: item.id,
            sourceId: item.id,
            type: "desktop" as const,
            name: item.name,
            status: item.status,
            signal: item.signal,
            battery: item.battery,
            petStatus: "none" as const,
            lastOnlineAt: item.lastOnlineAt,
          },
        ];
      }

        return item.bindings.map((binding) => {
          const petMeta = petMetaMap.get(binding.petId);
          return {
            id: `${item.id}-${binding.id}`,
            sourceId: item.id,
            type: "desktop" as const,
          name: item.name,
          status: item.status,
          signal: item.signal,
          battery: item.battery,
          petId: binding.petId,
          petName: petMeta?.name,
          petStatus: petMeta?.status ?? "none",
          bindingId: binding.id,
          bindingType: binding.bindingType,
          lastOnlineAt: item.lastOnlineAt,
        };
      });
    });

    return [...collarCards, ...desktopCards].sort((a, b) => {
      const typeOrder = a.type === b.type ? 0 : a.type === "collar" ? -1 : 1;
      if (typeOrder !== 0) return typeOrder;
      if (a.status === b.status) return 0;
      return a.status === "online" ? -1 : 1;
    });
  }, [collars, desktops, petMetaMap]);

  const handleRenameCollar = async (deviceId: string) => {
    const nextName = collarNameDraft.trim();
    if (!nextName) {
      Taro.showToast({ title: "请输入项圈名称", icon: "none" });
      return;
    }

    try {
      const { collar } = await request<{ collar: CollarDevice }>({
        url: `/api/devices/collars/${deviceId}`,
        method: "PUT",
        data: { name: nextName },
      });
      setCollars((prev) => prev.map((item) => (item.id === collar.id ? collar : item)));
      notifyHomeDevicesChanged();
      setEditingCollarId("");
      Taro.showToast({ title: "名称已更新", icon: "success" });
    } catch (e: any) {
      Taro.showToast({ title: e.message || "修改失败", icon: "none" });
    }
  };

  const handleUnbindCollar = async (deviceId: string) => {
    try {
      await request({
        url: `/api/devices/collars/${deviceId}`,
        method: "PUT",
        data: { petId: null },
      });
      Taro.showToast({ title: "已解除绑定", icon: "success" });
      await loadDevices();
      notifyHomeDevicesChanged();
    } catch (e: any) {
      Taro.showToast({ title: e.message || "操作失败", icon: "none" });
    }
  };

  const handleDesktopRemove = async (desktopId: string, bindingId?: string, bindingType?: BindingType) => {
    try {
      if (bindingId) {
        await request({
          url: `/api/devices/desktops/${desktopId}/bind/${bindingId}`,
          method: "DELETE",
        });
      } else if (bindingType === "authorized") {
        await request({
          url: `/api/devices/desktops/${desktopId}`,
          method: "DELETE",
        });
      } else {
        await request({
          url: `/api/devices/desktops/${desktopId}`,
          method: "DELETE",
        });
      }
      Taro.showToast({ title: "操作成功", icon: "success" });
      await loadDevices();
      notifyHomeDevicesChanged();
    } catch (e: any) {
      Taro.showToast({ title: e.message || "操作失败", icon: "none" });
    }
  };

  return (
    <View className="devices-page">
      <View className="devices-top-strip" />
      <View className="header">
        <PageBack inline />
        <Text className="page-title">设备管理</Text>
      </View>

      <ScrollView className="page-scroll" scrollY>
        <View className="page-content">
          {deviceCards.length === 0 ? (
            <View className="device-empty-card">
              <Text className="device-empty-title">还没有设备</Text>
              <Text className="device-empty-desc">从下方添加新设备开始连接项圈或桌面摆台</Text>
            </View>
          ) : (
            deviceCards.map((item, index) => {
              const isYellow = item.type === "collar";
              const isPrimaryBlue = item.type === "desktop" && index === (collars.length > 0 ? 1 : 0);
              const canShare = Boolean(item.petId && item.petStatus === "owner");
              const canSwitchMode = Boolean(item.petId);

              return (
                <View
                  key={item.id}
                  className={[
                    "device-card",
                    isYellow ? "device-card--yellow" : "",
                    isPrimaryBlue ? "device-card--blue" : "device-card--white",
                  ].join(" ")}
                >
                  <View className="device-card-top">
                    <View className="device-card-icon-wrap">
                      <Image
                        className="device-card-icon"
                        src={item.type === "collar" ? COLLAR_ICON : DESKTOP_ICON}
                        mode="aspectFit"
                      />
                    </View>

                    <View className="device-card-main">
                      <View className="device-card-name-row">
                        {item.type === "collar" && editingCollarId === item.id ? (
                          <>
                            <Input
                              className="device-name-input"
                              value={collarNameDraft}
                              onInput={(e) => setCollarNameDraft(e.detail.value)}
                              placeholder="输入项圈名称"
                              onConfirm={() => handleRenameCollar(item.id)}
                            />
                            <Text className="device-edit-text" onClick={() => handleRenameCollar(item.id)}>
                              保存
                            </Text>
                          </>
                        ) : (
                          <>
                            <Text className="device-card-name">{item.name}</Text>
                            {item.type === "collar" ? (
                              <Text
                                className="device-edit-text"
                                onClick={() => {
                                  setEditingCollarId(item.id);
                                  setCollarNameDraft(item.name);
                                }}
                              >
                                编辑
                              </Text>
                            ) : null}
                          </>
                        )}
                      </View>

                      <View className="device-card-meta-row">
                        <View className="device-status-pill">
                          <View className={`device-status-dot ${item.status === "online" ? "online" : "offline"}`} />
                          <Text className="device-status-pill-text">{getStatusText(item.status)}</Text>
                        </View>
                        <Text className="device-signal">{getSignalText(item.type, item.signal, item.status)}</Text>
                      </View>

                      <Text className="device-note">{getDeviceNote(item)}</Text>
                    </View>
                  </View>

                  <View className="device-card-actions">
                    <View
                      className={`device-action-btn ${!canSwitchMode ? "device-action-btn--disabled" : ""}`}
                      onClick={() => {
                        if (!item.petId) return;
                        Taro.navigateTo({ url: `/pages/pet-mode/index?petId=${item.petId}` });
                      }}
                    >
                      <Text className="device-action-text">活动模式切换</Text>
                    </View>

                    {canShare ? (
                      <View
                        className="device-action-btn"
                        onClick={() => {
                          if (!item.petId) return;
                          Taro.navigateTo({ url: `/pages/invite/index?petId=${item.petId}` });
                        }}
                      >
                        <Text className="device-action-text">分享授权</Text>
                      </View>
                    ) : (
                      <View
                        className="device-action-btn"
                        onClick={() => {
                          if (item.type === "collar") {
                            void handleUnbindCollar(item.id);
                            return;
                          }

                          void handleDesktopRemove(item.sourceId, item.bindingId, item.bindingType);
                        }}
                      >
                        <Text className="device-action-text">
                          {item.type === "collar" ? "解除当前绑定" : "删除当前设备"}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          )}

          <View className="add-device-btn" onClick={() => Taro.navigateTo({ url: "/pages/collar-bind/index" })}>
            <Text className="add-device-text">+ 添加新设备</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
