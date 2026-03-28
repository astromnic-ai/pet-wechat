import { View, Text, Image } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useState } from "react";
import type { Pet } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import { request } from "../../utils/request";
import "./index.scss";

type Mode = "week" | "day";

interface StatsResponse {
  weekBars: Array<{
    day: string;
    count: number;
  }>;
  dayBars: Array<{
    hour: number;
    count: number;
  }>;
  pieItems: Array<{
    type: string;
    count: number;
    percentage: number;
  }>;
  daySummary: {
    date: string;
    totalCount: number;
    dominantAction: string | null;
    actionCounts: Record<string, number>;
  };
}

const ACTION_LABELS: Record<string, string> = {
  walking: "散步",
  running: "奔跑",
  sleeping: "睡觉",
  eating: "吃东西",
  playing: "玩耍",
  resting: "休息",
  jumping: "跳跃",
  idle: "发呆",
};

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];
const PIE_COLORS = ["#8f8f8f", "#b4b4b4", "#d0d0d0", "#e2e2e2", "#c4c4c4", "#9f9f9f"];
const DAY_BUCKETS = [
  { label: "0", hours: [0, 1, 2, 3] },
  { label: "4", hours: [4, 5, 6, 7] },
  { label: "8", hours: [8, 9, 10, 11] },
  { label: "12", hours: [12, 13, 14, 15] },
  { label: "16", hours: [16, 17, 18, 19] },
  { label: "20", hours: [20, 21, 22, 23] },
];

function getActionLabel(actionType?: string | null) {
  if (!actionType) return "暂无行为记录";
  return ACTION_LABELS[actionType] ?? actionType;
}

function getActivityScore(count: number) {
  return Math.min(100, Math.max(0, count) * 10);
}

function getWeekdayLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return WEEKDAY_LABELS[weekday] ?? "";
}

function formatDateText(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function buildPieGradient(
  items: Array<{
    value: number;
  }>,
) {
  if (items.length === 0) {
    return "conic-gradient(#e2e2e2 0 100%)";
  }

  let current = 0;
  const parts = items.map((item, index) => {
    const start = current;
    const end = Math.min(100, current + item.value);
    current = end;
    return `${PIE_COLORS[index % PIE_COLORS.length]} ${start}% ${end}%`;
  });

  if (current < 100) {
    parts.push(`#e2e2e2 ${current}% 100%`);
  }

  return `conic-gradient(${parts.join(", ")})`;
}

export default function DataPage() {
  const router = useRouter();
  const routePetId =
    (typeof router.params.petId === "string" && router.params.petId) ||
    (typeof router.params.id === "string" && router.params.id) ||
    "";

  const [mode, setMode] = useState<Mode>("week");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [emptyMessage, setEmptyMessage] = useState("");
  const [petName, setPetName] = useState("宠物");
  const [stats, setStats] = useState<StatsResponse | null>(null);

  useDidShow(() => {
    Taro.hideTabBar();
    void loadStats();
  });

  async function loadStats() {
    setLoading(true);
    setErrorMessage("");
    setEmptyMessage("");

    try {
      const petsRes = await request<{ pets: Pet[]; authorizedPets: Pet[] }>({
        url: "/api/pets",
      });
      const allPets = [...petsRes.pets, ...petsRes.authorizedPets];
      const selectedPet = routePetId
        ? allPets.find((item) => item.id === routePetId) ?? null
        : allPets[0] ?? null;
      const resolvedPetId = routePetId || selectedPet?.id || "";

      if (!resolvedPetId) {
        setPetName("宠物");
        setStats(null);
        setEmptyMessage("暂无宠物数据");
        return;
      }

      setPetName(selectedPet?.name || "宠物");

      const statsRes = await request<StatsResponse>({
        url: `/api/stats/${resolvedPetId}?tz=Asia/Shanghai`,
      });

      setStats(statsRes);

      const hasStats =
        statsRes.weekBars.some((item) => item.count > 0) ||
        statsRes.dayBars.some((item) => item.count > 0) ||
        statsRes.pieItems.length > 0 ||
        statsRes.daySummary.totalCount > 0;

      if (!hasStats) {
        setEmptyMessage("暂无统计数据");
      }
    } catch (error) {
      setStats(null);
      setEmptyMessage("");
      setErrorMessage(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  const weekBars = stats
    ? stats.weekBars.map((item) => ({
        label: getWeekdayLabel(item.day),
        value: getActivityScore(item.count),
      }))
    : [];

  const weekAverage =
    weekBars.length > 0
      ? Math.round(weekBars.reduce((sum, item) => sum + item.value, 0) / weekBars.length)
      : 0;

  const dayBucketCounts = DAY_BUCKETS.map((bucket) => ({
    label: bucket.label,
    count: bucket.hours.reduce((sum, hour) => {
      const matched = stats?.dayBars.find((item) => item.hour === hour);
      return sum + (matched?.count ?? 0);
    }, 0),
  }));
  const dayBucketMax = Math.max(0, ...dayBucketCounts.map((item) => item.count));
  const dominantBucketCount = Math.max(0, ...dayBucketCounts.map((item) => item.count));

  const dayBars = dayBucketCounts.map((item) => ({
    label: item.label,
    value: dayBucketMax > 0 ? Math.round((item.count / dayBucketMax) * 100) : 0,
    tag:
      item.count > 0 &&
      item.count === dominantBucketCount &&
      stats?.daySummary.dominantAction
        ? getActionLabel(stats.daySummary.dominantAction)
        : undefined,
  }));

  const pieItems = stats
    ? stats.pieItems.map((item) => ({
        label: getActionLabel(item.type),
        value: item.percentage,
        text: formatPercent(item.percentage),
      }))
    : [];

  const dayStats = stats
    ? Object.entries(stats.daySummary.actionCounts)
        .sort(([, left], [, right]) => right - left)
        .map(([actionType, count]) => {
          const percent = stats.daySummary.totalCount > 0 ? (count / stats.daySummary.totalCount) * 100 : 0;
          return {
            label: getActionLabel(actionType),
            time: `${count}次`,
            percent: formatPercent(percent),
            width: `${Math.round(percent)}%`,
          };
        })
    : [];

  const dayScore = stats ? getActivityScore(stats.daySummary.totalCount) : 0;
  const dateTitle = stats ? formatDateText(stats.daySummary.date) : "";
  const helperText = stats?.daySummary.totalCount
    ? `今日主要行为：${getActionLabel(stats.daySummary.dominantAction)}`
    : "今日暂无活动记录";
  const pieRingStyle = {
    background: buildPieGradient(pieItems),
  };
  const dayRingStyle = {
    background: `conic-gradient(#8f8f8f 0 ${dayScore}%, #d8d8d8 ${dayScore}% 100%)`,
  };
  const showStatus = loading || Boolean(errorMessage) || Boolean(emptyMessage);
  const statusMessage = loading ? "加载中..." : errorMessage || emptyMessage;

  return (
    <View className="data-page">
      <PageBack />
      <View className="pet-switcher">
        <Text className="pet-arrow">〈</Text>
        <Image className="pet-side" src={require("@/assets/images/black cat 3.png")} mode="aspectFit" />
        <View className="pet-center">
          <Image className="pet-main" src={require("@/assets/images/cat-stand.png")} mode="aspectFit" />
          <Text className="pet-name">{petName}</Text>
        </View>
        <Image className="pet-side" src={require("@/assets/images/husky.png")} mode="aspectFit" />
        <Text className="pet-arrow">〉</Text>
      </View>

      <View className="mode-tabs">
        {[
          { key: "day", label: "日" },
          { key: "week", label: "周" },
          { key: "month", label: "月" },
        ].map((item) => (
          <View
            key={item.key}
            className={`mode-tab ${mode === item.key ? "active" : ""}`}
            onClick={() => item.key !== "month" && setMode(item.key as Mode)}
          >
            <Text className="mode-text">{item.label}</Text>
            <View className="mode-line" />
          </View>
        ))}
      </View>

      {showStatus ? (
        <View className="data-card">
          <Text className="helper-text">{statusMessage}</Text>
        </View>
      ) : mode === "week" ? (
        <>
          <View className="data-card">
            <View className="card-head">
              <Text className="module-title">本周</Text>
              <Text className="nav-arrows">〈 〉</Text>
            </View>
            <Text className="highlight-text">本周平均活跃度：{weekAverage}%</Text>
            <View className="bar-chart">
              {weekBars.map((bar) => (
                <View key={bar.label} className="bar-item">
                  <View className="bar-track">
                    <View className="bar-fill" style={{ height: `${bar.value}%` }} />
                  </View>
                  <Text className="bar-label">{bar.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="data-card">
            <Text className="module-title">活动类型统计</Text>
            {pieItems.length > 0 ? (
              <View className="pie-chart">
                <View className="pie-ring" style={pieRingStyle} />
                <View className="pie-legend">
                  {pieItems.map((item) => (
                    <Text key={item.label} className="legend-item">
                      {item.label} {item.text}
                    </Text>
                  ))}
                </View>
              </View>
            ) : (
              <Text className="helper-text">暂无活动类型数据</Text>
            )}
          </View>
        </>
      ) : (
        <>
          <View className="date-title">{dateTitle}</View>
          <View className="data-card">
            <View className="day-header">
              <View>
                <Text className="highlight-text">活跃度 {dayScore}%</Text>
                <Text className="helper-text">{helperText}</Text>
              </View>
              <View className="day-ring" style={dayRingStyle}>
                <View className="day-ring-fill">
                  <Text className="day-ring-text">{dayScore}%</Text>
                </View>
              </View>
            </View>
            <View className="bar-chart day-chart">
              {dayBars.map((bar) => (
                <View key={bar.label} className="bar-item">
                  <View className="bar-track">
                    <View className="bar-fill" style={{ height: `${bar.value}%` }} />
                  </View>
                  {bar.tag ? <Text className="bar-tag">{bar.tag}</Text> : null}
                  <Text className="bar-label">{bar.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="data-card">
            <Text className="module-title">活动类型统计</Text>
            {dayStats.length > 0 ? (
              dayStats.map((item) => (
                <View key={item.label} className="progress-row">
                  <Text className="progress-label">
                    {item.label}（{item.time}，{item.percent}）
                  </Text>
                  <View className="progress-bar">
                    <View className="progress-inner" style={{ width: item.width }} />
                  </View>
                </View>
              ))
            ) : (
              <Text className="helper-text">暂无日摘要数据</Text>
            )}
          </View>
        </>
      )}

      <View className="safe-btn">
        <Text className="safe-btn-text">暂无异常 安心陪伴</Text>
      </View>
    </View>
  );
}
