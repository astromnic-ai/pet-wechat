import { View, Text } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useMemo, useState } from "react";
import PageBack from "../../components/PageBack";
import { getPetActivityMode, setPetActivityMode, type PetActivityMode } from "../../utils/storage";
import { request } from "../../utils/request";
import type { CollarDevice } from "@pet-wechat/shared";
import "./index.scss";

const MODE_CONTENT: Record<
  PetActivityMode,
  {
    title: string;
    subtitle: string;
    description: string;
    tags: string[];
    actionText: string;
  }
> = {
  free: {
    title: "系统自由模式",
    subtitle: "正常自然宠物作息",
    description: "随时与小柴互动，无需预约。点击喂食、玩耍或抚摸，小柴会立即响应你的每一个动作。",
    tags: ["⚡ 即时响应", "💬 无限制"],
    actionText: "确认应用模式 →",
  },
  custom: {
    title: "个性自定义",
    subtitle: "设定宠物行为时段",
    description: "随时与小柴互动，无需预约。点击喂食、玩耍或抚摸，小柴会立即响应你的每一个动作。",
    tags: ["⚡ 即时响应", "💬 无限制"],
    actionText: "进入自定义 →",
  },
  real: {
    title: "真实行为模式",
    subtitle: "宠物项圈实时反馈",
    description: "随时与小柴互动，无需预约。点击喂食、玩耍或抚摸，小柴会立即响应你的每一个动作。",
    tags: ["🔒 需要连接项圈"],
    actionText: "此处配置项圈 →",
  },
};

const ORDER_MAP: Record<PetActivityMode, PetActivityMode[]> = {
  free: ["custom", "free", "real"],
  custom: ["free", "custom", "real"],
  real: ["custom", "real", "free"],
};

export default function PetModePage() {
  const router = useRouter();
  const petId = router.params.petId || "";
  const initialMode = (router.params.mode as PetActivityMode) || getPetActivityMode(petId);
  const [selectedMode, setSelectedMode] = useState<PetActivityMode>(initialMode);
  const [hasCollar, setHasCollar] = useState(false);

  useDidShow(() => {
    void request<{ collars: CollarDevice[] }>({ url: "/api/devices/collars" })
      .then((res) => {
        setHasCollar(res.collars.some((item) => (petId ? item.petId === petId : true)));
      })
      .catch(() => setHasCollar(false));
  });

  const orderedModes = useMemo(() => ORDER_MAP[selectedMode], [selectedMode]);
  const current = MODE_CONTENT[selectedMode];

  const handleConfirm = () => {
    if (selectedMode === "custom") {
      Taro.navigateTo({ url: `/pages/pet-mode/custom?petId=${petId}` });
      return;
    }

    if (selectedMode === "real" && !hasCollar) {
      Taro.navigateTo({ url: "/pages/collar-bind/index" });
      return;
    }

    setPetActivityMode(petId, selectedMode);
    Taro.showToast({ title: "模式已更新", icon: "success" });
    Taro.navigateBack({ fail: () => Taro.switchTab({ url: "/pages/index/index" }) });
  };

  return (
    <View className="pet-mode-page">
      <View className="pet-mode-top-strip" />
      <View className="pet-mode-header">
        <PageBack inline />
        <Text className="pet-mode-title">宠物活动模式</Text>
      </View>

      <View className="pet-mode-shell">
        <View className="mode-switch-row">
          {orderedModes.map((mode) => {
            const item = MODE_CONTENT[mode];
            const active = mode === selectedMode;
            return (
              <View
                key={mode}
                className={`mode-option-card ${active ? "mode-option-card--active" : ""}`}
                onClick={() => setSelectedMode(mode)}
              >
                <View className={`mode-option-icon ${active ? "mode-option-icon--active" : ""}`} />
                <Text className="mode-option-name">{item.title.replace("模式", "")}</Text>
                <Text className="mode-option-desc">{item.subtitle}</Text>
              </View>
            );
          })}
        </View>

        <Text className="mode-switch-tip">滑动选择模式</Text>

        <View className="mode-detail-card">
          <Text className="mode-detail-title">{current.title}</Text>
          <Text className="mode-detail-desc">{current.description}</Text>
          <View className="mode-tag-row">
            {current.tags.map((tag) => (
              <View key={tag} className="mode-tag">
                <Text className="mode-tag-text">{tag}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="mode-confirm-btn" onClick={handleConfirm}>
          <Text className="mode-confirm-btn-text">
            {selectedMode === "real" && hasCollar ? "确认应用模式 →" : current.actionText}
          </Text>
        </View>
      </View>
    </View>
  );
}
