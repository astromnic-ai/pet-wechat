import { View, Text, Image, ScrollView, Input } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useMemo, useState } from "react";
import type {
  BindingType,
  DeviceFirmwareStatus,
  DeviceStatus,
  DeviceSummary,
  Pet,
} from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import { request } from "../../utils/request";
import { getDeviceDisplayName, getDeviceStatusText, getUsageLabel } from "../../utils/deviceDisplay";
import "./index.scss";

type DeviceCard = {
  id: string;
  deviceId: string;
  deviceType: "collar" | "desktop";
  name: string;
  status: DeviceStatus;
  petId?: string | null;
  petName?: string;
  petStatus?: "owner" | "authorized" | "none";
  bindingId?: string;
  bindingType?: BindingType;
  lastOnlineAt?: string | null;
  inactiveDays: number | null;
  isInactive: boolean;
  usageDurationMinutes: number;
  interactionCount: number;
  claimStatus: DeviceSummary["claimStatus"];
  upgradeStatus: DeviceSummary["upgradeStatus"];
  firmwareStatus: DeviceFirmwareStatus | null;
};

const COLLAR_ICON = require("@/assets/images/collar-icon.png");
const DESKTOP_ICON = require("@/assets/images/desktop-icon.png");

function getSignalText(type: "collar" | "desktop", status?: DeviceStatus) {
  if (type === "desktop") {
    return status === "online" ? "信号良好" : "无信号";
  }

  if (status === "online") return "信号良好";
  if (status === "pairing") return "连接中";
  return "信号离线";
}

function getDeviceNote(item: DeviceCard) {
  const usage = getUsageLabel(item.usageDurationMinutes);
  const interactions = `互动${item.interactionCount}次`;

  if (item.petName) {
    return `${usage} · ${interactions} · 已关联${item.petName}`;
  }

  if (item.claimStatus === "reset_required") {
    return `${usage} · ${interactions} · 设备等待恢复出厂设置`;
  }

  return `${usage} · ${interactions} · 暂未绑定宠物`;
}

function getFirmwareText(item: DeviceCard) {
  if (!item.firmwareStatus) return "固件信息暂不可用";
  if (item.firmwareStatus.upgradeStatus === "pending") {
    return `升级中 ${item.firmwareStatus.currentVersion || "--"} → ${item.firmwareStatus.latestVersion || "--"}`;
  }
  if (item.firmwareStatus.hasUpdate) {
    return `待升级 ${item.firmwareStatus.currentVersion || "--"} → ${item.firmwareStatus.latestVersion || "--"}`;
  }
  if (item.firmwareStatus.currentVersion) {
    return `当前固件 ${item.firmwareStatus.currentVersion}`;
  }
  return "设备未上报固件版本";
}

function getDeviceTypeLabel(type: DeviceCard["deviceType"]) {
  return type === "collar" ? "智能项圈" : "桌面摆台";
}

function getShortDeviceId(id: string) {
  return id ? id.slice(-6).toUpperCase() : "------";
}

export default function Devices() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [authorizedPets, setAuthorizedPets] = useState<Pet[]>([]);
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [firmwareDevices, setFirmwareDevices] = useState<DeviceFirmwareStatus[]>([]);
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
      const [deviceRes, firmwareRes] = await Promise.all([
        request<{ devices: DeviceSummary[] }>({ url: "/api/devices" }),
        request<{ devices: DeviceFirmwareStatus[] }>({ url: "/api/devices/firmware/status" }),
      ]);
      setDevices(deviceRes.devices);
      setFirmwareDevices(firmwareRes.devices);
    } catch {
      setDevices([]);
      setFirmwareDevices([]);
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

  const firmwareMap = useMemo(() => {
    const map = new Map<string, DeviceFirmwareStatus>();
    firmwareDevices.forEach((item) => {
      map.set(`${item.deviceType}:${item.deviceId}`, item);
    });
    return map;
  }, [firmwareDevices]);

  const deviceCards = useMemo<DeviceCard[]>(() => {
    const cards: DeviceCard[] = [];

    devices.forEach((item) => {
      const firmwareStatus =
        firmwareMap.get(`${item.deviceType}:${item.deviceId}`) ?? null;

      if (item.deviceType === "collar") {
        const petMeta = item.petId ? petMetaMap.get(item.petId) : undefined;
        cards.push({
          id: item.deviceId,
          deviceId: item.deviceId,
          deviceType: "collar",
          name: item.name,
          status: item.status,
          petId: item.petId ?? null,
          petName: petMeta?.name,
          petStatus: petMeta?.status ?? "none",
          lastOnlineAt: item.lastOnlineAt,
          inactiveDays: item.inactiveDays,
          isInactive: item.isInactive,
          usageDurationMinutes: item.usageDurationMinutes,
          interactionCount: item.interactionCount,
          claimStatus: item.claimStatus,
          upgradeStatus: item.upgradeStatus,
          firmwareStatus,
        });
        return;
      }

      if (!item.bindings || item.bindings.length === 0) {
        cards.push({
          id: item.deviceId,
          deviceId: item.deviceId,
          deviceType: "desktop",
          name: item.name,
          status: item.status,
          petStatus: "none",
          lastOnlineAt: item.lastOnlineAt,
          inactiveDays: item.inactiveDays,
          isInactive: item.isInactive,
          usageDurationMinutes: item.usageDurationMinutes,
          interactionCount: item.interactionCount,
          claimStatus: item.claimStatus,
          upgradeStatus: item.upgradeStatus,
          firmwareStatus,
        });
        return;
      }

      item.bindings.forEach((binding) => {
        const petMeta = petMetaMap.get(binding.petId);
        cards.push({
          id: `${item.deviceId}-${binding.id}`,
          deviceId: item.deviceId,
          deviceType: "desktop",
          name: item.name,
          status: item.status,
          petId: binding.petId,
          petName: petMeta?.name,
          petStatus: petMeta?.status ?? "none",
          bindingId: binding.id,
          bindingType: binding.bindingType,
          lastOnlineAt: item.lastOnlineAt,
          inactiveDays: item.inactiveDays,
          isInactive: item.isInactive,
          usageDurationMinutes: item.usageDurationMinutes,
          interactionCount: item.interactionCount,
          claimStatus: item.claimStatus,
          upgradeStatus: item.upgradeStatus,
          firmwareStatus,
        });
      });
    });

    return cards.sort((a, b) => {
      const typeOrder = a.deviceType === b.deviceType ? 0 : a.deviceType === "collar" ? -1 : 1;
      if (typeOrder !== 0) return typeOrder;
      if (a.status === b.status) return 0;
      return a.status === "online" ? -1 : 1;
    });
  }, [devices, firmwareMap, petMetaMap]);

  const handleRenameCollar = async (deviceId: string) => {
    const nextName = collarNameDraft.trim();
    if (!nextName) {
      Taro.showToast({ title: "请输入项圈名称", icon: "none" });
      return;
    }

    try {
      await request({
        url: `/api/devices/collars/${deviceId}`,
        method: "PUT",
        data: { name: nextName },
      });
      await loadDevices();
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
      await request({
        url: `/api/devices/${item.deviceType}/${item.deviceId}`,
        method: "DELETE",
      });
      Taro.showToast({ title: "设备已删除", icon: "success" });
      await loadDevices();
      notifyHomeDevicesChanged();
    } catch (e: any) {
      Taro.showToast({ title: e.message || "操作失败", icon: "none" });
    }
  };

  const handleUpgradeDevice = async (item: DeviceCard) => {
    if (!item.firmwareStatus) {
      Taro.showToast({ title: "固件信息暂不可用", icon: "none" });
      return;
    }
    if (item.firmwareStatus.upgradeStatus === "pending") {
      Taro.showToast({ title: "升级请求已提交", icon: "none" });
      return;
    }
    if (!item.firmwareStatus.hasUpdate) {
      Taro.showToast({ title: "当前已是最新版本", icon: "none" });
      return;
    }

    try {
      await request({
        url: `/api/devices/${item.deviceType}/${item.deviceId}/firmware/upgrade`,
        method: "POST",
      });
      Taro.showToast({ title: "升级请求已提交", icon: "success" });
      await loadDevices();
    } catch (e: any) {
      Taro.showToast({ title: e.message || "升级失败", icon: "none" });
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
          url: `/pages/bind-pet/index?deviceType=${item.deviceType}&deviceId=${encodeURIComponent(
            item.deviceId
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
        if (item.deviceType === "collar") {
          void handleUnbindCollar(item.deviceId);
          return;
        }
        void handleUnbindDesktop(item.deviceId, item.bindingId);
      },
    });
  };

  const handleDelete = (item: DeviceCard) => {
    Taro.showModal({
      title: "删除设备",
      content: "删除后设备会释放为可认领状态，后续可重新绑定到其他账号。",
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
            deviceCards.map((item) => {
              const isOnline = item.status === "online";
              const isYellow = isOnline && item.deviceType === "collar";
              const isPrimaryBlue = isOnline && item.deviceType === "desktop";
              const isOffline = !isOnline;
              const hasBinding = Boolean(item.petId);
              const displayName = getDeviceDisplayName({
                petName: item.petName,
                deviceName: item.name,
                fallbackName: item.deviceType === "collar" ? "项圈" : "桌面端",
              });
              const deviceIdentity = `${getDeviceTypeLabel(item.deviceType)} #${getShortDeviceId(item.deviceId)}`;
              const bindingLabel = hasBinding
                ? `已绑定 ${item.petName || "未命名宠物"}`
                : "待绑定宠物";

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
                        src={item.deviceType === "collar" ? COLLAR_ICON : DESKTOP_ICON}
                        mode="aspectFit"
                      />
                    </View>

                    <View className="device-card-main">
                      <View className="device-card-name-row">
                        {item.deviceType === "collar" && editingCollarId === item.id ? (
                          <>
                            <Input
                              className="device-name-input"
                              value={collarNameDraft}
                              onInput={(e) => setCollarNameDraft(e.detail.value)}
                              placeholder="输入项圈名称"
                              onConfirm={() => handleRenameCollar(item.deviceId)}
                            />
                            <Text className="device-edit-text" onClick={() => handleRenameCollar(item.deviceId)}>
                              保存
                            </Text>
                          </>
                        ) : (
                          <>
                            <Text className="device-card-name">{displayName}</Text>
                            {item.deviceType === "collar" ? (
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
                        <Text className="device-signal">{getSignalText(item.deviceType, item.status)}</Text>
                        <View className="device-tag device-tag--identity">
                          <Text className="device-tag-text">{deviceIdentity}</Text>
                        </View>
                        <View className={`device-tag ${hasBinding ? "device-tag--binding" : "device-tag--unbound"}`}>
                          <Text className="device-tag-text">{bindingLabel}</Text>
                        </View>
                        {item.isInactive ? (
                          <View className="device-tag">
                            <Text className="device-tag-text">可删除</Text>
                          </View>
                        ) : null}
                        {item.firmwareStatus?.hasUpdate ? (
                          <View className="device-tag device-tag--accent">
                            <Text className="device-tag-text">待升级</Text>
                          </View>
                        ) : null}
                      </View>

                      <Text className="device-note">{getDeviceNote(item)}</Text>
                      <Text className="device-firmware-note">{getFirmwareText(item)}</Text>
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
                          url: `/pages/bind-pet/index?deviceType=${item.deviceType}&deviceId=${encodeURIComponent(
                            item.deviceId
                          )}&deviceName=${encodeURIComponent(item.name)}`,
                        });
                      }}
                    >
                      <Text className="device-action-text">{hasBinding ? "更换绑定宠物" : "选择绑定宠物"}</Text>
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
                      <Text className="device-action-text">{hasBinding ? "解除当前绑定" : "删除未绑定设备"}</Text>
                    </View>

                    <View
                      className={`device-action-btn ${
                        !item.firmwareStatus?.hasUpdate || item.firmwareStatus.upgradeStatus === "pending"
                          ? "device-action-btn--disabled"
                          : ""
                      }`}
                      onClick={() => {
                        void handleUpgradeDevice(item);
                      }}
                    >
                      <Text className="device-action-text">
                        {item.firmwareStatus?.upgradeStatus === "pending"
                          ? "升级中"
                          : item.firmwareStatus?.hasUpdate
                          ? "升级固件"
                          : "固件已最新"}
                      </Text>
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
