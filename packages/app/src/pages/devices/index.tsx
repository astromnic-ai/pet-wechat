import { View, Text, Image, ScrollView, Input } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BindingType, CollarDevice, DesktopDevice, DeviceStatus, Pet } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import { request } from "../../utils/request";
import { getDeviceDisplayName, getDeviceStatusText, getUsageLabel } from "../../utils/deviceDisplay";
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
  createdAt?: string | null;
  lastOnlineAt?: string | null;
};

const COLLAR_ICON = require("@/assets/images/collar-icon.png");
const DESKTOP_ICON = require("@/assets/images/desktop-icon.png");

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
  const usage = getUsageLabel(item.createdAt);

  if (item.petName) {
    return `${usage} · 已关联${item.petName}`;
  }

  return `${usage} · 暂未绑定宠物`;
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
        createdAt: item.createdAt,
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
            createdAt: item.createdAt,
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
          createdAt: item.createdAt,
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

  const handleUnbindDesktop = async (desktopId: string, bindingId?: string) => {
    if (!bindingId) {
      Taro.showToast({ title: "当前没有可解绑的宠物", icon: "none" });
      return;
    }

    try {
      await request({
        url: `/api/devices/desktops/${desktopId}/bind/${bindingId}`,
        method: "DELETE",
      });
      Taro.showToast({ title: "已解除绑定", icon: "success" });
      await loadDevices();
      notifyHomeDevicesChanged();
    } catch (e: any) {
      Taro.showToast({ title: e.message || "操作失败", icon: "none" });
    }
  };

  const handleDeleteDevice = async (item: DeviceCard) => {
    try {
      if (item.type === "collar") {
        await request({
          url: `/api/devices/collars/${item.sourceId}`,
          method: "DELETE",
        });
      } else {
        await request({
          url: `/api/devices/desktops/${item.sourceId}`,
          method: "DELETE",
        });
      }
      Taro.showToast({ title: "设备已删除", icon: "success" });
      await loadDevices();
      notifyHomeDevicesChanged();
    } catch (e: any) {
      Taro.showToast({ title: e.message || "操作失败", icon: "none" });
    }
  };

  const handleChangePet = (item: DeviceCard) => {
    Taro.showModal({
      title: "更换绑定宠物",
      content: "将重新选择要绑定的宠物，设备信息和设备 ID 会继续保留。",
      confirmText: "去更换",
      success: (res) => {
        if (!res.confirm) return;
        Taro.navigateTo({
          url: `/pages/bind-pet/index?deviceType=${item.type}&deviceId=${encodeURIComponent(
            item.sourceId
          )}&deviceName=${encodeURIComponent(item.name)}`,
        });
      },
    });
  };

  const handleUnbind = (item: DeviceCard) => {
    Taro.showModal({
      title: "解除绑定",
      content: "解除绑定后，设备会保留在当前账号下，你可以稍后重新绑定其他宠物。",
      confirmText: "确认解绑",
      success: (res) => {
        if (!res.confirm) return;
        if (item.type === "collar") {
          void handleUnbindCollar(item.sourceId);
          return;
        }
        void handleUnbindDesktop(item.sourceId, item.bindingId);
      },
    });
  };

  const handleDelete = (item: DeviceCard) => {
    Taro.showModal({
      title: "删除设备",
      content: "删除后，手机端将不再显示这个设备。若硬件转卖或更换用户，请确保已删除，否则需要在硬件端 reset 后再绑定。",
      confirmText: "确认删除",
      confirmColor: "#ff4d4f",
      success: (res) => {
        if (!res.confirm) return;
        void handleDeleteDevice(item);
      },
    });
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
              const isOnline = item.status === "online";
              const isYellow = isOnline && item.type === "collar";
              const isPrimaryBlue = isOnline && item.type === "desktop";
              const isOffline = !isOnline;
              const hasBinding = Boolean(item.petId);
              const displayName = getDeviceDisplayName({
                petName: item.petName,
                deviceName: item.name,
                fallbackName: item.type === "collar" ? "项圈" : "桌面端",
              });

              return (
                <View
                  key={item.id}
                  className={[
                    "device-card",
                    isYellow ? "device-card--yellow" : "",
                    isPrimaryBlue ? "device-card--blue" : "device-card--white",
                    isOffline ? "device-card--offline" : "",
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
                            <Text className="device-card-name">{displayName}</Text>
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
                          <Text className="device-status-pill-text">{getDeviceStatusText(item.status)}</Text>
                        </View>
                        <Text className="device-signal">{getSignalText(item.type, item.signal, item.status)}</Text>
                      </View>

                      <Text className="device-note">{getDeviceNote(item)}</Text>
                    </View>
                  </View>

                  <View className="device-card-actions">
                    <View
                      className="device-action-btn"
                      onClick={() => {
                        if (hasBinding) {
                          handleChangePet(item);
                          return;
                        }
                        Taro.navigateTo({
                          url: `/pages/bind-pet/index?deviceType=${item.type}&deviceId=${encodeURIComponent(
                            item.sourceId
                          )}&deviceName=${encodeURIComponent(item.name)}`,
                        });
                      }}
                    >
                      <Text className="device-action-text">{hasBinding ? "更换绑定宠物" : "绑定宠物"}</Text>
                    </View>

                    <View
                      className="device-action-btn"
                      onClick={() => {
                        if (hasBinding) {
                          handleUnbind(item);
                          return;
                        }
                        handleDelete(item);
                      }}
                    >
                      <Text className="device-action-text">{hasBinding ? "解除当前绑定" : "删除当前设备"}</Text>
                    </View>
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
