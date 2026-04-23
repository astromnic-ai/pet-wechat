import { ScrollView, View, Text } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import type { CollarDevice, InteractionStats, Pet, PetBehavior } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import { request } from "../../utils/request";
import "./index.scss";

const WEEK_LABELS = ["一", "二", "三", "四", "五", "六", "日"];
const MONTH_BUCKET_LABELS = ["1-4", "5-8", "9-12", "13-16", "17-20", "21-24", "25-28"];
const ACTION_LABELS: Record<string, string> = {
  sleeping: "睡觉",
  eating: "吃饭",
  playing: "玩耍",
  walking: "散步",
  running: "奔跑",
  resting: "休息",
  jumping: "跳跃",
  idle: "发呆",
};

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay();
  const diff = day === 0 ? 6 : day - 1;
  next.setDate(next.getDate() - diff);
  return next;
}

function normalizeBars(values: number[]) {
  const max = Math.max(...values, 1);
  return values.map((value) => Math.max(value > 0 ? 18 : 12, Math.round((value / max) * 100)));
}

function buildDayBuckets(behaviors: PetBehavior[]) {
  const now = new Date();
  const todayStart = startOfDay(now).getTime();
  const values = new Array(7).fill(0);

  behaviors.forEach((behavior) => {
    const time = new Date(behavior.timestamp).getTime();
    if (Number.isNaN(time) || time < todayStart) return;

    const hour = new Date(time).getHours();
    const index = Math.min(6, Math.floor(hour / 4));
    values[index] += 1;
  });

  return {
    labels: ["0", "4", "8", "12", "16", "20", "24"],
    raw: values,
    bars: normalizeBars(values),
  };
}

function buildWeekBuckets(behaviors: PetBehavior[]) {
  const weekStart = startOfWeek(new Date()).getTime();
  const values = new Array(7).fill(0);

  behaviors.forEach((behavior) => {
    const time = new Date(behavior.timestamp);
    if (Number.isNaN(time.getTime()) || time.getTime() < weekStart) return;

    const jsDay = time.getDay();
    const index = jsDay === 0 ? 6 : jsDay - 1;
    values[index] += 1;
  });

  return {
    labels: WEEK_LABELS,
    raw: values,
    bars: normalizeBars(values),
  };
}

function buildMonthBuckets(behaviors: PetBehavior[]) {
  const values = new Array(7).fill(0);
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  behaviors.forEach((behavior) => {
    const time = new Date(behavior.timestamp);
    if (Number.isNaN(time.getTime())) return;
    if (time.getFullYear() !== year || time.getMonth() !== month) return;

    const day = time.getDate();
    const index = Math.min(6, Math.floor((day - 1) / 4));
    values[index] += 1;
  });

  return {
    labels: MONTH_BUCKET_LABELS,
    raw: values,
    bars: normalizeBars(values),
  };
}

function buildInteractionChart(range: "day" | "week" | "month", stats: InteractionStats | null) {
  const expectedLength = range === "day" ? 24 : range === "week" ? 7 : 30;
  const buckets =
    stats?.buckets && stats.buckets.length > 0
      ? stats.buckets
      : Array.from({ length: expectedLength }, (_, index) => ({
          label: range === "day" ? `${String(index).padStart(2, "0")}:00` : `${index + 1}`,
          count: 0,
        }));

  const raw = buckets.map((item) => item.count);
  const labels = buckets.map((item, index) => {
    if (range === "day") return index % 4 === 0 ? item.label.slice(0, 2) : "";
    if (range === "month") return index % 5 === 0 || index === buckets.length - 1 ? item.label : "";
    return item.label;
  });

  return {
    labels,
    raw,
    bars: normalizeBars(raw),
  };
}

function formatActionStats(behaviors: PetBehavior[]) {
  const counts = new Map<string, number>();
  behaviors.forEach((behavior) => {
    const label = ACTION_LABELS[behavior.actionType] || behavior.actionType || "其他";
    counts.set(label, (counts.get(label) || 0) + 1);
  });

  const total = behaviors.length;
  if (total === 0) return [];

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, count]) => ({
      label,
      count,
      value: Math.max(10, Math.round((count / total) * 100)),
    }));
}

function getRangeSummaryTitle(range: "day" | "week" | "month", activeTab: "interaction" | "activity") {
  if (activeTab === "interaction") {
    if (range === "day") return "今日互动指数";
    if (range === "week") return "本周互动指数";
    return "本月互动指数";
  }

  if (range === "day") return "今日活跃表现";
  if (range === "week") return "本周活跃表现";
  return "本月活跃表现";
}

function getTrendTitle(range: "day" | "week" | "month") {
  if (range === "day") return "今日趋势";
  if (range === "week") return "本周趋势";
  return "本月趋势";
}

function getCompareLabel(range: "day" | "week" | "month") {
  if (range === "day") return "较昨日";
  if (range === "week") return "较上周";
  return "较上月";
}

function formatDeltaValue(activeTab: "interaction" | "activity", delta: number) {
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  const absolute = Math.abs(delta);

  if (activeTab === "interaction") {
    return `${sign}${absolute}次`;
  }

  return `${sign}${absolute}`;
}

export default function DataPage() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [authorizedPets, setAuthorizedPets] = useState<Pet[]>([]);
  const [collars, setCollars] = useState<CollarDevice[]>([]);
  const [selectedPetId, setSelectedPetId] = useState("");
  const [activeTab, setActiveTab] = useState<"interaction" | "activity">("interaction");
  const [range, setRange] = useState<"day" | "week" | "month">("day");
  const [behaviors, setBehaviors] = useState<PetBehavior[]>([]);
  const [interactionStats, setInteractionStats] = useState<InteractionStats | null>(null);
  const [interactionWeekStats, setInteractionWeekStats] = useState<InteractionStats | null>(null);
  const [interactionLoading, setInteractionLoading] = useState(false);

  useDidShow(() => {
    Taro.hideTabBar();
    void Promise.all([
      request<{ pets: Pet[]; authorizedPets: Pet[] }>({ url: "/api/pets" }).catch(() => ({ pets: [], authorizedPets: [] })),
      request<{ collars: CollarDevice[] }>({ url: "/api/devices/collars" }).catch(() => ({ collars: [] })),
    ]).then(([petRes, collarRes]) => {
      const merged = [...petRes.pets, ...petRes.authorizedPets];
      setPets(petRes.pets);
      setAuthorizedPets(petRes.authorizedPets);
      setCollars(collarRes.collars);
      setSelectedPetId((prev) => prev || merged[0]?.id || "");
    });
  });

  const mergedPets = useMemo(() => [...pets, ...authorizedPets], [authorizedPets, pets]);
  const currentPet = useMemo(
    () => mergedPets.find((item) => item.id === selectedPetId) ?? mergedPets[0] ?? null,
    [mergedPets, selectedPetId]
  );
  const hasCollar = Boolean(currentPet && collars.some((item) => item.petId === currentPet.id));

  useEffect(() => {
    if (!currentPet?.id) {
      setBehaviors([]);
      return;
    }

    request<{ behaviors: PetBehavior[] }>({ url: `/api/behaviors/${currentPet.id}?limit=500` })
      .then((res) => setBehaviors(res.behaviors || []))
      .catch(() => setBehaviors([]));
  }, [currentPet?.id]);

  useEffect(() => {
    if (!currentPet?.id) {
      setInteractionStats(null);
      setInteractionWeekStats(null);
      return;
    }

    setInteractionLoading(true);
    request<InteractionStats>({
      url: `/api/pets/${currentPet.id}/interaction-stats?range=${range}`,
    })
      .then((res) => setInteractionStats(res))
      .catch(() =>
        setInteractionStats({
          totalCount: 0,
          todayCount: 0,
          weekCount: 0,
          monthCount: 0,
          buckets: [],
        })
      )
      .finally(() => setInteractionLoading(false));
  }, [currentPet?.id, range]);

  useEffect(() => {
    if (!currentPet?.id) {
      setInteractionWeekStats(null);
      return;
    }

    request<InteractionStats>({
      url: `/api/pets/${currentPet.id}/interaction-stats?range=week`,
    })
      .then((res) => setInteractionWeekStats(res))
      .catch(() =>
        setInteractionWeekStats({
          totalCount: 0,
          todayCount: 0,
          weekCount: 0,
          monthCount: 0,
          buckets: [],
        })
      );
  }, [currentPet?.id]);

  const dayData = useMemo(() => buildDayBuckets(behaviors), [behaviors]);
  const weekData = useMemo(() => buildWeekBuckets(behaviors), [behaviors]);
  const monthData = useMemo(() => buildMonthBuckets(behaviors), [behaviors]);
  const activityChartData = range === "day" ? dayData : range === "week" ? weekData : monthData;
  const interactionChartData = useMemo(() => buildInteractionChart(range, interactionStats), [interactionStats, range]);
  const interactionWeekChartData = useMemo(
    () => buildInteractionChart("week", interactionWeekStats),
    [interactionWeekStats]
  );
  const chartData =
    activeTab === "interaction"
      ? range === "day"
        ? interactionWeekChartData
        : interactionChartData
      : activityChartData;
  const activityStats = useMemo(() => formatActionStats(behaviors), [behaviors]);
  const summaryScore = useMemo(() => {
    if (!currentPet) return 0;

    if (activeTab === "interaction") {
      const interactionValue =
        range === "day"
          ? interactionStats?.todayCount ?? 0
          : range === "week"
          ? interactionStats?.weekCount ?? 0
          : interactionStats?.monthCount ?? 0;

      return Math.max(0, Math.min(100, Math.round(interactionValue)));
    }

    return Math.max(0, Math.min(100, Math.round(currentPet.activityScore || 0)));
  }, [activeTab, currentPet, interactionStats, range]);
  const compareDelta = useMemo(() => {
    const values = chartData.raw;
    const current = values[values.length - 1] || 0;
    const previous = values[values.length - 2] || 0;

    return current - previous;
  }, [chartData]);
  const compareText = formatDeltaValue(activeTab, compareDelta);
  const headerDescription =
    activeTab === "interaction" ? "查看真实互动事件聚合结果" : "查看佩戴项圈后的真实活跃表现";
  const trendTitle =
    activeTab === "interaction" && range === "day" ? "本周趋势" : getTrendTitle(range);

  const handleCyclePet = () => {
    if (!currentPet || mergedPets.length <= 1) return;
    const currentIndex = mergedPets.findIndex((item) => item.id === currentPet.id);
    const nextPet = mergedPets[(currentIndex + 1) % mergedPets.length];
    setSelectedPetId(nextPet?.id || currentPet.id);
  };

  return (
    <View className="data-page">
      <View className="data-top-strip" />
      <View className="data-header">
        <PageBack inline />
        <Text className="data-title">宠物记录</Text>
      </View>

      <View className="data-shell">
        {currentPet ? (
          <>
            <View className="pet-switch-row">
              <ScrollView className="pet-tabs-scroll" scrollX enhanced showScrollbar={false}>
                <View className="pet-tabs">
                  {mergedPets.map((item) => {
                    const active = item.id === currentPet.id;
                    return (
                      <View
                        key={item.id}
                        className={`pet-tab ${active ? "pet-tab--active" : "pet-tab--small"}`}
                        onClick={() => setSelectedPetId(item.id)}
                      >
                        {active ? (
                          <>
                            <Text className="pet-tab-title">{item.name}的记录</Text>
                            <Text className="pet-tab-desc">{headerDescription}</Text>
                          </>
                        ) : (
                          <Text className="pet-tab-name">{item.name}</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </ScrollView>

              {mergedPets.length > 1 ? (
                <View className="pet-switch-arrow" onClick={handleCyclePet}>
                  <Text className="pet-switch-arrow-text">›</Text>
                </View>
              ) : null}
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
                <Text className="today-title">{getRangeSummaryTitle(range, activeTab)}</Text>
                <View className="today-score-row">
                  <Text className="today-score">{summaryScore}</Text>
                </View>
              </View>
              <View className="today-badge">
                <Text className="today-badge-top">{compareText}</Text>
                <Text className="today-badge-bottom">{getCompareLabel(range)}</Text>
              </View>
            </View>

            <View className="trend-head">
              <Text className="trend-title">{trendTitle}</Text>
            </View>

            <View className="chart-card">
              {activeTab === "activity" && !hasCollar ? (
                <View className="empty-state">
                  <Text className="empty-state-title">需要连接项圈后查看活跃表现</Text>
                  <Text className="empty-state-desc">当前可以先查看设备管理，完成项圈连接后这里会显示真实行为趋势</Text>
                </View>
              ) : activeTab === "interaction" && interactionLoading ? (
                <View className="empty-state">
                  <Text className="empty-state-title">互动数据加载中</Text>
                  <Text className="empty-state-desc">正在拉取当前宠物的互动事件聚合结果</Text>
                </View>
              ) : (
                <>
                  <View className={`chart-wrap ${activeTab === "interaction" ? "chart-wrap--weekly" : ""}`}>
                    {chartData.bars.map((value, index) => (
                      <View
                        key={`${index}-${value}`}
                        className={`chart-item ${activeTab === "interaction" ? "chart-item--weekly" : ""}`}
                      >
                        <View
                          className={`chart-bar ${index % 2 === 0 ? "chart-bar--yellow" : "chart-bar--blue"} ${
                            activeTab === "interaction" ? "chart-bar--weekly" : ""
                          }`}
                          style={{ height: `${value}%` }}
                        />
                      </View>
                    ))}
                  </View>
                  <View className={`chart-label-row ${activeTab === "interaction" ? "chart-label-row--weekly" : ""}`}>
                    {chartData.labels.map((label, index) => (
                      <Text
                        key={`${label}-${index}`}
                        className={`chart-label ${index === chartData.labels.length - 1 ? "chart-label--active" : ""} ${
                          activeTab === "interaction" ? "chart-label--weekly" : ""
                        }`}
                      >
                        {label}
                      </Text>
                    ))}
                  </View>
                </>
              )}
            </View>

            {activeTab === "activity" ? (
              <View className="stats-card">
                <Text className="stats-title">活动类型统计</Text>
                {activityStats.length > 0 ? (
                  activityStats.map((item) => (
                    <View key={item.label} className="stats-row">
                      <Text className="stats-label">{item.label}</Text>
                      <View className="stats-track">
                        <View className="stats-fill" style={{ width: `${item.value}%` }} />
                      </View>
                      <Text className="stats-value">{item.count}次</Text>
                    </View>
                  ))
                ) : (
                  <View className="empty-state empty-state--compact">
                    <Text className="empty-state-title">暂无行为记录</Text>
                    <Text className="empty-state-desc">项圈开始同步行为后，这里会按真实数据汇总活动类型</Text>
                  </View>
                )}
              </View>
            ) : (
              <View className="stats-card">
                <Text className="stats-title">互动摘要</Text>
                <View className="stats-summary-grid">
                  <View className="stats-summary-card">
                    <Text className="stats-summary-label">交互次数</Text>
                    <Text className="stats-summary-value">
                      {summaryScore}
                      <Text className="stats-summary-unit">次</Text>
                    </Text>
                  </View>
                  <View className="stats-summary-card">
                    <Text className="stats-summary-label">数值变化</Text>
                    <Text className="stats-summary-value">
                      {formatDeltaValue(activeTab, compareDelta)}
                    </Text>
                  </View>
                </View>
              </View>
            )}
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
