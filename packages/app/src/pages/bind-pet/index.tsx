import { View, Text, Image } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useMemo, useState } from "react";
import { request } from "../../utils/request";
import type { Pet } from "@pet-wechat/shared";
import "./index.scss";

export default function BindPet() {
  const router = useRouter();
  const deviceType = router.params.deviceType as "collar" | "desktop" | undefined;
  const deviceId = router.params.deviceId || "";
  const deviceName = decodeURIComponent(router.params.deviceName || "");

  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPetId, setSelectedPetId] = useState("");
  const [loading, setLoading] = useState(false);

  useDidShow(() => {
    void request<{ pets: Pet[] }>({ url: "/api/pets" })
      .then((res) => {
        setPets(res.pets);
        setSelectedPetId((current) => current || res.pets[0]?.id || "");
      })
      .catch(() => setPets([]));
  });

  const deviceImage = useMemo(
    () =>
      deviceType === "desktop"
        ? require("@/assets/images/desktop-icon.png")
        : require("@/assets/images/collar-icon.png"),
    [deviceType]
  );

  const handleCreatePet = () => {
    Taro.navigateTo({
      url: `/pages/pet-info/index?bindDeviceType=${deviceType || "collar"}&bindDeviceId=${encodeURIComponent(deviceId)}`,
    });
  };

  const handleConfirmBind = async () => {
    if (!selectedPetId) {
      Taro.showToast({ title: "请选择宠物", icon: "none" });
      return;
    }

    setLoading(true);
    try {
      if (deviceType === "desktop") {
        await request({
          url: `/api/devices/desktops/${deviceId}/bind`,
          method: "POST",
          data: {
            petId: selectedPetId,
            bindingType: "owner",
          },
        });
      } else {
        await request({
          url: `/api/devices/collars/${deviceId}`,
          method: "PUT",
          data: { petId: selectedPetId },
        });
      }

      Taro.showToast({ title: "绑定成功", icon: "success" });
      Taro.switchTab({ url: "/pages/index/index" });
    } catch (e: any) {
      Taro.showToast({ title: e.message || "绑定失败", icon: "none" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="bind-pet-page">
      <View className="bind-pet-top-strip" />

      <View className="bind-pet-header">
        <View className="bind-pet-back" onClick={() => Taro.navigateBack({ fail: () => Taro.switchTab({ url: "/pages/index/index" }) })}>
          <Text className="bind-pet-back-text">‹</Text>
        </View>
        <Text className="bind-pet-title">绑定宠物</Text>
      </View>

      <View className="bind-pet-content">
        <View className="connected-device-card">
          <View className="connected-device-icon">
            <Image className="connected-device-image" src={deviceImage} mode="aspectFit" />
          </View>
          <View className="connected-device-body">
            <Text className="connected-device-name">{deviceName || "YEHEY-Collar-001"}</Text>
            <Text className="connected-device-meta">已连接：请选择要绑定的宠物</Text>
          </View>
        </View>

        <Text className="bind-section-title">选择宠物形象</Text>
        <Text className="bind-section-subtitle">我的宠物</Text>

        <View className="pet-option-list">
          {pets.map((pet) => {
            const active = selectedPetId === pet.id;
            return (
              <View
                key={pet.id}
                className={`pet-option-card ${active ? "pet-option-card--active" : ""}`}
                onClick={() => setSelectedPetId(pet.id)}
              >
                <View className={`pet-option-avatar ${active ? "pet-option-avatar--active" : ""}`}>
                  <Image
                    className="pet-option-image"
                    src={pet.species === "dog" ? require("@/assets/images/husky.png") : require("@/assets/images/black cat 3.png")}
                    mode="aspectFit"
                  />
                </View>
                <View className="pet-option-body">
                  <Text className="pet-option-name">{pet.name}</Text>
                  <Text className="pet-option-meta">{`${pet.breed || "未设置品种"} · ${pet.birthday || "3岁半"}`}</Text>
                </View>
                <View className={`pet-option-check ${active ? "pet-option-check--active" : ""}`}>
                  <Text className="pet-option-check-text">{active ? "✓" : ""}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <Text className="bind-section-subtitle bind-section-subtitle--spaced">或创建新宠物</Text>

        <View className="create-pet-card" onClick={handleCreatePet}>
          <View className="create-pet-icon">
            <Text className="create-pet-icon-text">+</Text>
          </View>
          <View className="create-pet-body">
            <Text className="create-pet-title">创建新宠物</Text>
            <Text className="create-pet-meta">上传照片、设置名字和品种</Text>
          </View>
          <Text className="create-pet-arrow">→</Text>
        </View>

        <View className="bind-confirm-btn" onClick={handleConfirmBind}>
          <Text className="bind-confirm-btn-text">{loading ? "绑定中..." : "确认绑定"}</Text>
        </View>
      </View>
    </View>
  );
}
