import { View, Text, ScrollView } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useState } from "react";
import PageBack from "../../components/PageBack";
import {
  getPetModePlans,
  setPetActivityMode,
  type PetModePlan,
  type PetModeWeekday,
} from "../../utils/storage";
import "./index.scss";

const WEEKDAY_OPTIONS: Array<{ key: PetModeWeekday; label: string }> = [
  { key: "mon", label: "周一" },
  { key: "tue", label: "周二" },
  { key: "wed", label: "周三" },
  { key: "thu", label: "周四" },
  { key: "fri", label: "周五" },
  { key: "sat", label: "周六" },
  { key: "sun", label: "周日" },
];

function orderDays(days: PetModeWeekday[]) {
  const order = WEEKDAY_OPTIONS.map((item) => item.key);
  return [...new Set(days)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

function getWeekdayLabel(day: PetModeWeekday) {
  return WEEKDAY_OPTIONS.find((item) => item.key === day)?.label || "周一";
}

function formatScheduleDays(days: PetModeWeekday[]) {
  const ordered = orderDays(days);
  if (ordered.length === 0) return "周一";

  const indices = ordered.map((day) => WEEKDAY_OPTIONS.findIndex((item) => item.key === day));
  const labels: string[] = [];
  let startIndex = indices[0];
  let previousIndex = indices[0];

  for (let i = 1; i <= indices.length; i += 1) {
    const currentIndex = indices[i];
    const isContinuous = currentIndex === previousIndex + 1;

    if (isContinuous) {
      previousIndex = currentIndex;
      continue;
    }

    if (startIndex === previousIndex) {
      labels.push(WEEKDAY_OPTIONS[startIndex]?.label || "周一");
    } else {
      labels.push(`${WEEKDAY_OPTIONS[startIndex]?.label || "周一"}-${WEEKDAY_OPTIONS[previousIndex]?.label || "周日"}`);
    }

    startIndex = currentIndex;
    previousIndex = currentIndex;
  }

  return labels.join("、");
}

function getScheduleSummary(plan: PetModePlan) {
  if (plan.slots.length === 0) return "暂未配置时间日程";
  return `已配置${plan.slots.length}个时间日程 -- 点击编辑修改`;
}

export default function PetModeCustomOverviewPage() {
  const router = useRouter();
  const petId = router.params.petId || "";
  const [plans, setPlans] = useState<PetModePlan[]>([]);

  useDidShow(() => {
    setPlans(getPetModePlans(petId));
  });

  const handleOpenSchedule = (scheduleId?: string) => {
    const query = [`petId=${encodeURIComponent(petId)}`];
    if (scheduleId) {
      query.push(`scheduleId=${encodeURIComponent(scheduleId)}`);
    }
    Taro.navigateTo({ url: `/pages/pet-mode/schedule?${query.join("&")}` });
  };

  const handleConfirmApply = () => {
    if (plans.length === 0) return;
    setPetActivityMode(petId, "custom");
    Taro.showToast({ title: "已应用个性自定义", icon: "success" });
    Taro.navigateBack({ fail: () => Taro.switchTab({ url: "/pages/index/index" }) });
  };

  return (
    <View className="custom-overview-page">
      <View className="pet-mode-top-strip" />
      <View className="pet-mode-header">
        <PageBack inline fallbackUrl={`/pages/pet-mode/index?petId=${petId}`} />
        <Text className="pet-mode-title">个性自定义</Text>
      </View>

      <ScrollView className="custom-overview-scroll" scrollY>
        <View className="custom-overview-shell">
          <View className="custom-overview-hero">
            <Text className="custom-overview-hero-text">
              支持上传宠物视频，AI 定制专属动作图像，随心定义它的每刻表现。
            </Text>
            <View className="custom-overview-tags">
              <View className="custom-overview-tag">
                <Text className="custom-overview-tag-text">视频上传</Text>
              </View>
              <View className="custom-overview-tag">
                <Text className="custom-overview-tag-text">AI定制</Text>
              </View>
              <View className="custom-overview-tag">
                <Text className="custom-overview-tag-text">随心定义</Text>
              </View>
            </View>
          </View>

          <View className="custom-overview-list">
            {plans.map((plan) => (
              <View
                key={plan.id}
                className="custom-overview-card"
                onClick={() => handleOpenSchedule(plan.id)}
              >
                <View className="custom-overview-card-head">
                  <Text className="custom-overview-card-title">{formatScheduleDays(plan.days)}</Text>
                  <View className="custom-overview-card-badge">
                    <Text className="custom-overview-card-badge-text">
                      {plan.repeat === "weekly" ? "周期重复" : "本周单次"}
                    </Text>
                  </View>
                </View>
                <View className="custom-overview-card-body">
                  <Text className="custom-overview-card-desc">{getScheduleSummary(plan)}</Text>
                  <Text className="custom-overview-card-arrow">›</Text>
                </View>
              </View>
            ))}
          </View>

          <View className="custom-overview-add-btn" onClick={() => handleOpenSchedule()}>
            <Text className="custom-overview-add-btn-text">+ 添加新日程</Text>
          </View>

          <View
            className={`custom-overview-confirm-btn ${plans.length === 0 ? "custom-overview-confirm-btn--disabled" : ""}`}
            onClick={handleConfirmApply}
          >
            <Text className="custom-overview-confirm-btn-text">确认应用模式 →</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
