import { View, Text, Image, ScrollView } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useMemo, useState } from "react";
import PageBack from "../../components/PageBack";
import "./index.scss";

type PetTabStatus = "owner" | "authorized" | "pending";
type DeviceStatus = "online" | "offline";

interface PetTabItem {
  id: string;
  name: string;
  status: PetTabStatus;
  subtitle: string;
  collarName: string;
  collarStatus: DeviceStatus;
  battery: string;
  petInfo: string;
  canShare: boolean;
  canUnbind: boolean;
  desktopsTitle: string;
  desktops: Array<{
    id: string;
    name: string;
    tag?: string;
    status: DeviceStatus;
    signal: string;
    source: string;
    ownerInfo: string;
    action: "share" | "delete" | "unbind";
  }>;
}

const PET_TABS: PetTabItem[] = [
  {
    id: "maomao",
    name: "毛毛",
    status: "owner",
    subtitle: "属于你的宠物",
    collarName: "毛毛的小圈圈",
    collarStatus: "online",
    battery: "85%",
    petInfo: "毛毛 英短蓝猫 3岁半",
    canShare: true,
    canUnbind: true,
    desktopsTitle: "毛毛&项圈关联的桌面端 (3)",
    desktops: [
      {
        id: "desktop-a",
        name: "桌面端A",
        tag: "你的设备",
        status: "online",
        signal: "信号良好",
        source: "关联来源：绑定已有宠物项圈",
        ownerInfo: "用户昵称：【⭐烨】",
        action: "share",
      },
      {
        id: "grandma-home",
        name: "毛毛的姥姥家",
        status: "online",
        signal: "信号良好",
        source: "关联来源：亲友分享获取权限",
        ownerInfo: "用户昵称：【肿么就这样了】",
        action: "delete",
      },
      {
        id: "desktop-b",
        name: "桌面端B",
        status: "offline",
        signal: "无信号",
        source: "关联来源：亲友分享获取权限",
        ownerInfo: "用户昵称：【一年四季的美好🌹】",
        action: "delete",
      },
    ],
  },
  {
    id: "chouchou",
    name: "臭臭",
    status: "owner",
    subtitle: "属于你的宠物",
    collarName: "臭臭的小圈圈",
    collarStatus: "online",
    battery: "72%",
    petInfo: "臭臭 柯基犬 2岁",
    canShare: true,
    canUnbind: true,
    desktopsTitle: "臭臭&项圈关联的桌面端 (1)",
    desktops: [
      {
        id: "desktop-c",
        name: "桌面端C",
        tag: "你的设备",
        status: "online",
        signal: "信号良好",
        source: "关联来源：绑定已有宠物项圈",
        ownerInfo: "用户昵称：【⭐烨】",
        action: "share",
      },
    ],
  },
  {
    id: "dudu",
    name: "嘟嘟",
    status: "authorized",
    subtitle: "被授权的宠物",
    collarName: "毛毛的小圈圈",
    collarStatus: "online",
    battery: "85%",
    petInfo: "毛毛 英短蓝猫 3岁半",
    canShare: false,
    canUnbind: false,
    desktopsTitle: "毛毛&项圈关联的桌面端 (1)",
    desktops: [
      {
        id: "desktop-b-authorized",
        name: "桌面端B",
        status: "online",
        signal: "信号良好",
        source: "关联来源：获取【⭐烨】的授权",
        ownerInfo: "授权时间：2026年02月28日",
        action: "unbind",
      },
    ],
  },
  {
    id: "pending",
    name: "未知",
    status: "pending",
    subtitle: "等待授权的宠物",
    collarName: "暂未获得授权",
    collarStatus: "offline",
    battery: "85%",
    petInfo: "未知",
    canShare: false,
    canUnbind: false,
    desktopsTitle: "未知&项圈关联的桌面端 (1)",
    desktops: [
      {
        id: "desktop-e",
        name: "桌面端E",
        status: "online",
        signal: "信号良好",
        source: "关联来源：正在等待授权",
        ownerInfo: "授权时间：xxxx年xx月xx日",
        action: "unbind",
      },
    ],
  },
];

function getStatusText(status: PetTabStatus) {
  if (status === "owner") return "属于你的宠物";
  if (status === "authorized") return "被授权的宠物";
  return "等待授权的宠物";
}

function getStatusClass(status: DeviceStatus) {
  return status === "online" ? "online" : "offline";
}

export default function Devices() {
  const [selectedPetId, setSelectedPetId] = useState("maomao");

  useDidShow(() => {
    Taro.hideTabBar();
  });

  const selectedPet = useMemo(
    () => PET_TABS.find((item) => item.id === selectedPetId) ?? PET_TABS[0],
    [selectedPetId]
  );

  const handleAction = (type: "share" | "delete" | "unbind") => {
    const text =
      type === "share"
        ? "分享授权"
        : type === "delete"
          ? "删除设备"
          : "解绑设备";
    Taro.showToast({ title: text, icon: "none" });
  };

  return (
    <View className="devices-page">
      <View className="header">
        <PageBack />
        <Text className="page-title">我的设备</Text>
        <View className="header-placeholder" />
      </View>

      <ScrollView className="content-scroll" scrollX>
        <View className="pet-tabs">
          {PET_TABS.map((pet) => (
            <View
              key={pet.id}
              className={`pet-tab ${selectedPetId === pet.id ? "active" : ""}`}
              onClick={() => setSelectedPetId(pet.id)}
            >
              <Image
                className="pet-avatar"
                src={require("@/assets/images/black cat 3.png")}
                mode="aspectFill"
              />
              <View className="pet-tab-info">
                <Text className="pet-tab-name">{pet.name}</Text>
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
              <Image
                className="collar-icon"
                src={require("@/assets/images/collar-icon.png")}
                mode="aspectFit"
              />
              <View className="collar-main">
                <View className="collar-name-row">
                  <Text className="collar-name">{selectedPet.collarName}</Text>
                  {selectedPet.status === "owner" ? <Text className="edit-icon">✎</Text> : null}
                </View>
                <View className="collar-meta">
                  <View className="status-wrap">
                    <View className={`status-dot ${getStatusClass(selectedPet.collarStatus)}`} />
                    <Text className="status-text">
                      {selectedPet.collarStatus === "online" ? "在线" : "离线"}
                    </Text>
                  </View>
                  <Text className="battery-text">电量 {selectedPet.battery}</Text>
                  <Text className="signal-text">▂▄▆</Text>
                </View>
              </View>
            </View>

            <Text className="pet-bind-info">关联宠物：{selectedPet.petInfo}</Text>

            {(selectedPet.canShare || selectedPet.canUnbind) && (
              <View className="action-row">
                {selectedPet.canShare && (
                  <View className="action-btn" onClick={() => handleAction("share")}>
                    <Text className="action-btn-text">分享授权</Text>
                  </View>
                )}
                {selectedPet.canUnbind && (
                  <View className="action-btn" onClick={() => handleAction("unbind")}>
                    <Text className="action-btn-text">解除当前绑定</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          <Text className="desktop-section-title">{selectedPet.desktopsTitle}</Text>

          {selectedPet.desktops.map((desktop) => (
            <View key={desktop.id} className="desktop-card">
              <View className="desktop-top">
                <Image
                  className="desktop-icon"
                  src={require("@/assets/images/desktop-icon.png")}
                  mode="aspectFit"
                />
                <View className="desktop-main">
                  <View className="desktop-name-row">
                    <Text className="desktop-name">{desktop.name}</Text>
                    {desktop.tag ? <Text className="desktop-tag">({desktop.tag})</Text> : null}
                    {selectedPet.status === "owner" ? <Text className="edit-icon desktop-edit-icon">✎</Text> : null}
                  </View>
                  <View className="desktop-meta">
                    <View className="status-wrap">
                      <View className={`status-dot ${getStatusClass(desktop.status)}`} />
                      <Text className="status-text">
                        {desktop.status === "online" ? "在线" : "离线"}
                      </Text>
                    </View>
                    <Text className="signal-text">{desktop.signal}</Text>
                  </View>
                </View>
                <View className="desktop-action-chip" onClick={() => handleAction(desktop.action)}>
                  <Text className="desktop-action-text">
                    {desktop.action === "share"
                      ? "分享"
                      : desktop.action === "delete"
                        ? "删除权限"
                        : "解绑"}
                  </Text>
                </View>
              </View>

              <Text className="desktop-info-line">{desktop.source}</Text>
              <Text className="desktop-info-line">{desktop.ownerInfo}</Text>
            </View>
          ))}

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

          <Image
            className="outline-image"
            src={require("@/assets/images/pet-outline.png")}
            mode="widthFix"
          />
        </View>
      </ScrollView>
    </View>
  );
}
