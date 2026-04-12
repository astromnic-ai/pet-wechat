import { View, Text } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useState } from "react";
import type { PetModeSchedule } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import { request } from "../../utils/request";
import { getPetModeSlots, setPetActivityMode, setPetModeSlots, type PetModeSlot } from "../../utils/storage";
import "./index.scss";

const MODE_CARDS = [
  { key: "free", label: "系统自由" },
  { key: "custom", label: "个性自定义" },
  { key: "real", label: "真实行为" },
];

const DEFAULT_SLOT: PetModeSlot = {
  start: "14:00",
  end: "16:00",
  action: "玩耍",
};

function toUiSlot(schedule: Pick<PetModeSchedule, "startTime" | "endTime" | "actionType">): PetModeSlot {
  return {
    start: schedule.startTime,
    end: schedule.endTime,
    action: schedule.actionType,
  };
}

export default function PetModeCustomPage() {
  const router = useRouter();
  const petId = router.params.petId || "";
  const [slots, setSlots] = useState<PetModeSlot[]>(() => getPetModeSlots(petId));
  const [adding, setAdding] = useState(false);

  useDidShow(() => {
    if (!petId) {
      setPetActivityMode(petId, "custom");
      setSlots(getPetModeSlots(petId));
      return;
    }

    void request({
      url: `/api/pets/${petId}/mode`,
      method: "PUT",
      data: { mode: "custom" },
    })
      .then(async () => {
        setPetActivityMode(petId, "custom");
        const res = await request<{ schedules: PetModeSchedule[] }>({
          url: `/api/pets/${petId}/mode/schedules`,
        });
        const nextSlots = res.schedules.map(toUiSlot);
        setSlots(nextSlots);
        setPetModeSlots(petId, nextSlots);
      })
      .catch(() => {
        setSlots(getPetModeSlots(petId));
      });
  });

  const handleAddSlot = async () => {
    if (adding) return;

    if (!petId) {
      const nextSlots = [...slots, DEFAULT_SLOT];
      setSlots(nextSlots);
      setPetActivityMode(petId, "custom");
      setPetModeSlots(petId, nextSlots);
      return;
    }

    setAdding(true);
    try {
      await request({
        url: `/api/pets/${petId}/mode/schedules`,
        method: "POST",
        data: {
          startTime: DEFAULT_SLOT.start,
          endTime: DEFAULT_SLOT.end,
          actionType: DEFAULT_SLOT.action,
        },
      });

      const res = await request<{ schedules: PetModeSchedule[] }>({
        url: `/api/pets/${petId}/mode/schedules`,
      });
      const nextSlots = res.schedules.map(toUiSlot);
      setSlots(nextSlots);
      setPetModeSlots(petId, nextSlots);
    } catch (e: any) {
      Taro.showToast({ title: e.message || "添加失败", icon: "none" });
    } finally {
      setAdding(false);
    }
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
          <Text className="custom-add-slot-text">{adding ? "添加中..." : "+ 添加时间段"}</Text>
        </View>
      </View>
    </View>
  );
}
