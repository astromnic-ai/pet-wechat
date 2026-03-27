import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useMemo, useState } from "react";
import { request } from "../../utils/request";
import type { CollarDevice } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import "./index.scss";

const FALLBACK_COLLAR: CollarDevice = {
  id: "mock-collar-001",
  name: "666777888",
  macAddress: "666777888",
  status: "idle",
  userId: null,
  petId: null,
  battery: 100,
  signal: 4,
  firmwareVersion: "mock-1.0.0",
  lastOnlineAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export default function CollarBind() {
  const [devices, setDevices] = useState<CollarDevice[]>([]);
  const [loading, setLoading] = useState(false);

  const selectedDevice = useMemo(
    () => devices[0] ?? FALLBACK_COLLAR,
    [devices]
  );

  const handleSearch = async () => {
    if (loading) return;
    setLoading(true);
    Taro.showLoading({ title: "搜索中..." });

    try {
      const { collars } = await request<{ collars: CollarDevice[] }>({
        url: "/api/devices/collars/unowned",
      });
      setDevices(collars.length > 0 ? collars : [FALLBACK_COLLAR]);
      Taro.showToast({ title: "已发现设备", icon: "success" });
    } catch {
      setDevices([FALLBACK_COLLAR]);
      Taro.showToast({ title: "已载入模拟设备", icon: "none" });
    } finally {
      Taro.hideLoading();
      setLoading(false);
    }
  };

  const handleConnect = () => {
    const deviceId = selectedDevice.id || FALLBACK_COLLAR.id;
    Taro.navigateTo({
      url: `/pages/wifi-config/index?deviceType=collar&deviceId=${deviceId}`,
    });
  };

  return (
    <View className="device-guide-page">
      <PageBack />
      <Text className="brand">YEHEY</Text>
      <Image
        className="outline-image"
        src={require("@/assets/images/pet-outline.png")}
        mode="widthFix"
      />

      <View className="guide-card">
        <Text className="guide-title">配置宠物项圈</Text>

        <View className="device-hero">
          <Image
            className="pet-device-icon pet-icon"
            src={require("@/assets/images/Group 1.png")}
            mode="aspectFit"
          />
          <Image
            className="pet-device-icon link-icon"
            src={require("@/assets/images/link-icon.png")}
            mode="aspectFit"
          />
          <Image
            className="pet-device-icon device-icon"
            src={require("@/assets/images/mirror-icon.png")}
            mode="aspectFit"
          />
        </View>

        <View className="step-block">
          <Text className="step-title">Step 1：</Text>
          <Text className="step-text">使用磁吸充电电线给项圈充电以启动设备</Text>
          <View className="step-panel plug-panel">
            <Text className="plug-icon">⌁</Text>
          </View>
        </View>

        <View className="step-block">
          <Text className="step-title">Step 2：</Text>
          <Text className="step-text">确保手机蓝牙开启，长按蓝牙按键搜索设备</Text>
          <View
            className={`step-panel device-panel ${devices.length > 0 ? "is-ready" : ""}`}
            onClick={devices.length > 0 ? handleConnect : handleSearch}
          >
            <Image
              className="panel-device-image"
              src={require("@/assets/images/mirror-icon.png")}
              mode="aspectFit"
            />
            <Text className="panel-device-id">ID:{selectedDevice.macAddress}</Text>
            <Text className="panel-tip">
              {devices.length > 0 ? "点击连接设备" : loading ? "搜索设备中..." : "点击搜索附近设备"}
            </Text>
          </View>
        </View>
      </View>

      <View className="progress-track">
        <View className="progress-fill progress-step-1" />
      </View>
    </View>
  );
}
