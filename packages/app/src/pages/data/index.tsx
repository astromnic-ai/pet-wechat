import { View, Text } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useMemo, useState } from "react";
import type { CollarDevice, DesktopDevice, Pet } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import { request } from "../../utils/request";
import "./index.scss";

const WEEK_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

function buildWeekBars(seed: number) {
  return [38, 56, 44, 82, 63, 54, 70].map((item, index) => Math.max(24, Math.min(100, item + ((seed + index * 7) % 13) - 6)));
}

function buildDayBars(seed: number) {
  return [18, 14, 32, 72, 58, 40, 22].map((item, index) => Math.max(16, Math.min(100, item + ((seed + index * 5) % 11) - 5)));
}

export default function DataPage() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [authorizedPets, setAuthorizedPets] = useState<Pet[]>([]);
  const [collars, setCollars] = useState<CollarDevice[]>([]);
  const [desktops, setDesktops] = useState<DesktopDevice[]>([]);
  const [selectedPetId, setSelectedPetId] = useState("");
  const [activeTab, setActiveTab] = useState<"interaction" | "activity">("interaction");
  const [range, setRange] = useState<"day" | "week" | "month">("day");

  useDidShow(() => {
    Taro.hideTabBar();
    void Promise.all([
      request<{ pets: Pet[]; authorizedPets: Pet[] }>({ url: "/api/pets" }).catch(() => ({ pets: [], authorizedPets: [] })),
      request<{ collars: CollarDevice[] }>({ url: "/api/devices/collars" }).catch(() => ({ collars: [] })),
      request<{ desktops: DesktopDevice[] }>({ url: "/api/devices/desktops" }).catch(() => ({ desktops: [] })),
    ]).then(([petRes, collarRes, desktopRes]) => {
      const mergedPets = [...petRes.pets, ...petRes.authorizedPets];
      setPets(petRes.pets);
      setAuthorizedPets(petRes.authorizedPets);
      setCollars(collarRes.collars);
      setDesktops(desktopRes.desktops);
      setSelectedPetId((prev) => prev || mergedPets[0]?.id || "");
    });
  });

  const mergedPets = useMemo(() => [...pets, ...authorizedPets], [authorizedPets, pets]);
  const currentPet = useMemo(
    () => mergedPets.find((item) => item.id === selectedPetId) ?? mergedPets[0] ?? null,
    [mergedPets, selectedPetId]
  );
  const hasCollar = Boolean(currentPet && collars.some((item) => item.petId === currentPet.id));
  const connectedDesktopCount = desktops.length;
  const weekBars = buildWeekBars(currentPet?.activityScore ?? 60);
  const dayBars = buildDayBars(currentPet?.activityScore ?? 60);
  const interactionScore = Math.min(100, 60 + connectedDesktopCount * 8 + (currentPet?.activityScore ?? 0) / 5);

  const activityStats = useMemo(
    () => [
      { label: "睡觉", value: 70, hours: "10小时" },
      { label: "吃饭", value: 10, hours: "1小时" },
      { label: "玩耍", value: 10, hours: "1小时" },
    ],
    []
  );

  const headerDescription =
    activeTab === "interaction" ? "查看这只宠物的互动和活跃数据" : "查看佩戴项圈后的活跃表现";

  return (
    <View className="data-page">
      <View className="data-top-strip" />
      <View className="data-header">
        <PageBack />
        <Text className="data-title">宠物记录</Text>
      </View>

      <View className="data-shell">
        {currentPet ? (
          <>
            <View className="pet-tabs">
              <View className="pet-tab pet-tab--active">
                <Text className="pet-tab-title">{currentPet.name}的记录</Text>
                <Text className="pet-tab-desc">{headerDescription}</Text>
              </View>
              {mergedPets
                .filter((item) => item.id !== currentPet.id)
                .slice(0, 1)
                .map((item) => (
                  <View key={item.id} className="pet-tab pet-tab--small" onClick={() => setSelectedPetId(item.id)}>
                    <Text className="pet-tab-name">{item.name}</Text>
                  </View>
                ))}
              {mergedPets.length > 1 ? <View className="pet-switch-arrow">〉</View> : null}
            </View>

            <View className="segment-wrap">
              <View
                className={`segment-item ${activeTab === "interaction" ? "active" : ""}`}
                onClick={() => setActiveTab("interaction")}
              >
                <Text className="segment-text">互动记录</Text>
              </View>
              <View
                className={`segment-item ${activeTab === "activity" ? "active" : ""}`}
                onClick={() => setActiveTab("activity")}
              >
                <Text className="segment-text">活跃表现</Text>
              </View>
            </View>

            <View className="range-wrap">
              {[
                { key: "day", label: "天" },
                { key: "week", label: "周" },
                { key: "month", label: "月" },
              ].map((item) => (
                <View
                  key={item.key}
                  className={`range-item ${range === item.key ? "active" : ""}`}
                  onClick={() => setRange(item.key as "day" | "week" | "month")}
                >
                  <Text className="range-text">{item.label}</Text>
                </View>
              ))}
            </View>

            <View className="today-card">
              <View className="today-main">
                <Text className="today-title">
                  {activeTab === "interaction" ? "今日互动指数" : "今日活跃值"}
                </Text>
                <View className="today-score-row">
                  <Text className="today-score">
                    {activeTab === "interaction" ? Math.round(interactionScore) : currentPet.activityScore}
                  </Text>
                  <Text className="today-score-unit">/100</Text>
                </View>
              </View>
              <View className="today-badge">
                <Text className="today-badge-top">
                  {activeTab === "interaction" ? `桌面端${connectedDesktopCount}台` : hasCollar ? "已连接项圈" : "未连接项圈"}
                </Text>
                <Text className="today-badge-bottom">
                  {activeTab === "interaction" ? "互动来源" : hasCollar ? "实时同步" : "活跃数据受限"}
                </Text>
              </View>
            </View>

            <View className="trend-head">
              <Text className="trend-title">{range === "day" ? "今日趋势" : range === "week" ? "本周趋势" : "本月趋势"}</Text>
            </View>

            <View className="chart-card">
              {activeTab === "activity" && !hasCollar ? (
                <View className="empty-state">
                  <Text className="empty-state-title">需要连接项圈后查看活跃表现</Text>
                  <Text className="empty-state-desc">当前可以先查看互动记录，或去设备管理里完成项圈连接</Text>
                </View>
              ) : (
                <View className="chart-wrap">
                  {(range === "day" ? dayBars : weekBars).map((value, index) => (
                    <View key={`${index}-${value}`} className="chart-item">
                      <View
                        className={`chart-bar ${index % 2 === 0 ? "chart-bar--yellow" : "chart-bar--blue"}`}
                        style={{ height: `${value}%` }}
                      />
                      <Text className={`chart-label ${index === 6 ? "chart-label--active" : ""}`}>
                        {WEEK_LABELS[index]}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View className="stats-card">
              <Text className="stats-title">活动类型统计</Text>
              {activityStats.map((item) => (
                <View key={item.label} className="stats-row">
                  <Text className="stats-label">{item.label}</Text>
                  <View className="stats-track">
                    <View className="stats-fill" style={{ width: `${item.value}%` }} />
                  </View>
                  <Text className="stats-value">{item.hours}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <View className="chart-card chart-card--empty">
            <View className="empty-state">
              <Text className="empty-state-title">还没有宠物记录</Text>
              <Text className="empty-state-desc">先去主页创建宠物，后续这里会展示互动和活跃数据</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
