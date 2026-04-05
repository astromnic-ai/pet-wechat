import { View, Text } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useState } from "react";
import PageBack from "../../components/PageBack";
import { getPetModeSlots, setPetActivityMode, setPetModeSlots, type PetModeSlot } from "../../utils/storage";
import "./index.scss";

const MODE_CARDS = [
  { key: "free", label: "系统自由" },
  { key: "custom", label: "个性自定义" },
  { key: "real", label: "真实行为" },
];

export default function PetModeCustomPage() {
  const router = useRouter();
  const petId = router.params.petId || "";
  const [slots, setSlots] = useState<PetModeSlot[]>(() => getPetModeSlots(petId));

  useDidShow(() => {
    setPetActivityMode(petId, "custom");
  });

  const handleAddSlot = () => {
    const nextSlots = [...slots, { start: "14:00", end: "16:00", action: "玩耍" }];
    setSlots(nextSlots);
    setPetModeSlots(petId, nextSlots);
  };

  return (
    <View className="pet-mode-custom-page">
      <View className="pet-mode-top-strip" />
      <View className="pet-mode-header">
        <PageBack fallbackUrl="/pages/index/index" />
        <Text className="pet-mode-title">宠物活动模式</Text>
      </View>

      <View className="pet-mode-shell">
        <View className="mode-switch-row">
          {MODE_CARDS.map((item) => (
            <View
              key={item.key}
              className={`mode-option-card ${item.key === "custom" ? "mode-option-card--active" : ""}`}
              onClick={() => {
                if (item.key === "custom") return;
                Taro.redirectTo({ url: `/pages/pet-mode/index?petId=${petId}&mode=${item.key}` });
              }}
            >
              <View className={`mode-option-icon ${item.key === "custom" ? "mode-option-icon--active" : ""}`} />
              <Text className="mode-option-name">{item.label}</Text>
            </View>
          ))}
        </View>

        <View className="custom-day-card">
          <View className="custom-day-left">
            <Text className="custom-day-emoji">📅</Text>
            <Text className="custom-day-text">今天</Text>
          </View>
          <View className="custom-add-circle" onClick={handleAddSlot}>
            <Text className="custom-add-circle-text">+</Text>
          </View>
        </View>

        <View className="custom-slot-list">
          {slots.map((slot) => (
            <View key={`${slot.start}-${slot.end}-${slot.action}`} className="custom-slot-card">
              <View className="custom-slot-time">
                <Text className="custom-slot-time-text">{slot.start} - {slot.end}</Text>
              </View>
              <View className="custom-slot-action">
                <Text className="custom-slot-action-text">{slot.action}</Text>
              </View>
            </View>
          ))}
        </View>

        <View className="custom-add-slot-btn" onClick={handleAddSlot}>
          <Text className="custom-add-slot-text">+ 添加时间段</Text>
        </View>
      </View>
    </View>
  );
}
