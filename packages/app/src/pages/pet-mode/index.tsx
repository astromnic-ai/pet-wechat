import { View, Text } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useMemo, useRef, useState } from "react";
import PageBack from "../../components/PageBack";
import { getPetActivityMode, setPetActivityMode, type PetActivityMode } from "../../utils/storage";
import { request } from "../../utils/request";
import type { CollarDevice } from "@pet-wechat/shared";
import "./index.scss";

const MODE_CONTENT: Record<
  PetActivityMode,
  {
    name: string;
    title: string;
    subtitle: string;
    description: string;
    tags: string[];
    actionText: string;
  }
> = {
  free: {
    name: "系统自由",
    title: "系统自由模式",
    subtitle: "自然规律\n宠物作息",
    description: "系统智能编排全天日程，自动呈现宠物进食、玩耍与休息的规律作息。",
    tags: ["智能编排", "全天日程", "规律作息"],
    actionText: "确认应用模式 →",
  },
  custom: {
    name: "个性自定义",
    title: "个性自定义模式",
    subtitle: "自定义\n行为时段",
    description: "自由设定宠物的显示状态与每日作息，何时撒欢、何时打盹，都由你来决定。",
    tags: ["个性作息", "随心定义", "视频上传"],
    actionText: "进入自定义 →",
  },
  real: {
    name: "真实行为",
    title: "真实行为模式",
    subtitle: "项圈实时\n反馈数据",
    description: "配合智能项圈，实时捕获并同步爱宠在现实中的一举一动，跨屏相伴。",
    tags: ["需要连接项圈"],
    actionText: "此处配置项圈 →",
  },
};

const ORDER_MAP: Record<PetActivityMode, PetActivityMode[]> = {
  free: ["custom", "free", "real"],
  custom: ["free", "custom", "real"],
  real: ["custom", "real", "free"],
};

const MODE_SEQUENCE: PetActivityMode[] = ["free", "custom", "real"];

function renderModeIcon(mode: PetActivityMode) {
  if (mode === "custom") {
    return (
      <View className="mode-calendar-icon">
        <View className="mode-calendar-icon-rings">
          <View className="mode-calendar-icon-ring" />
          <View className="mode-calendar-icon-ring" />
        </View>
        <View className="mode-calendar-icon-line" />
        <View className="mode-calendar-icon-grid">
          <View className="mode-calendar-icon-dot" />
          <View className="mode-calendar-icon-dot" />
          <View className="mode-calendar-icon-dot" />
          <View className="mode-calendar-icon-dot" />
        </View>
      </View>
    );
  }

  if (mode === "real") {
    return (
      <View className="mode-paw-icon">
        <View className="mode-paw-icon-toes">
          <View className="mode-paw-icon-toe" />
          <View className="mode-paw-icon-toe" />
          <View className="mode-paw-icon-toe" />
          <View className="mode-paw-icon-toe" />
        </View>
        <View className="mode-paw-icon-pad" />
      </View>
    );
  }

  return <Text className="mode-option-icon-text">☆</Text>;
}

export default function PetModePage() {
  const router = useRouter();
  const petId = router.params.petId || "";
  const initialMode = (router.params.mode as PetActivityMode) || getPetActivityMode(petId);
  const [selectedMode, setSelectedMode] = useState<PetActivityMode>(initialMode);
  const [hasCollar, setHasCollar] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useDidShow(() => {
    void request<{ collars: CollarDevice[] }>({ url: "/api/devices/collars" })
      .then((res) => {
        setHasCollar(res.collars.some((item) => (petId ? item.petId === petId : true)));
      })
      .catch(() => setHasCollar(false));
  });

  const orderedModes = useMemo(() => ORDER_MAP[selectedMode], [selectedMode]);
  const current = MODE_CONTENT[selectedMode];

  const switchModeBySwipe = (direction: "left" | "right") => {
    const currentIndex = MODE_SEQUENCE.indexOf(selectedMode);
    if (currentIndex < 0) return;

    const nextIndex =
      direction === "left"
        ? (currentIndex + 1) % MODE_SEQUENCE.length
        : (currentIndex - 1 + MODE_SEQUENCE.length) % MODE_SEQUENCE.length;

    setSelectedMode(MODE_SEQUENCE[nextIndex]);
  };

  const handleTouchStart = (e: any) => {
    const touch = e.touches?.[0];
    if (!touch) return;

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
  };

  const handleTouchEnd = (e: any) => {
    const touch = e.changedTouches?.[0];
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!touch || !start) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;

    if (Math.abs(deltaX) < 28 || Math.abs(deltaX) <= Math.abs(deltaY)) return;

    switchModeBySwipe(deltaX < 0 ? "left" : "right");
  };

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
        <View className="mode-switch-row" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {orderedModes.map((mode) => {
            const item = MODE_CONTENT[mode];
            const active = mode === selectedMode;
            return (
              <View
                key={mode}
                className={`mode-option-card mode-option-card--${mode} ${active ? "mode-option-card--active" : ""}`}
                onClick={() => setSelectedMode(mode)}
              >
                <View className={`mode-option-icon mode-option-icon--${mode} ${active ? "mode-option-icon--active" : ""}`}>
                  {renderModeIcon(mode)}
                </View>
                <Text className="mode-option-name">{item.name}</Text>
                <Text className="mode-option-desc">{item.subtitle}</Text>
              </View>
            );
          })}
        </View>

        <Text className="mode-switch-tip">滑动选择模式</Text>

        <View className={`mode-detail-card mode-detail-card--${selectedMode}`}>
          <Text className="mode-detail-title">{current.title}</Text>
          <Text className="mode-detail-desc">{current.description}</Text>
          <View className="mode-tag-row">
            {current.tags.map((tag) => (
              <View key={tag} className={`mode-tag mode-tag--${selectedMode}`}>
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
