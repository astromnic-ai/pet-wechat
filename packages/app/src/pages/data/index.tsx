import { View, Text, Image } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import PageBack from "../../components/PageBack";
import "./index.scss";

const weekBars = [
  { label: "一", value: 60 },
  { label: "二", value: 72 },
  { label: "三", value: 86 },
  { label: "四", value: 78 },
  { label: "五", value: 88 },
  { label: "六", value: 92 },
  { label: "日", value: 83 },
];

const dayBars = [
  { label: "0", value: 20 },
  { label: "4", value: 12 },
  { label: "8", value: 35 },
  { label: "12", value: 85, tag: "玩耍" },
  { label: "16", value: 52 },
  { label: "20", value: 40 },
  { label: "24", value: 18 },
];

const pieItems = [
  { label: "睡觉", value: "53%" },
  { label: "吃饭", value: "20%" },
  { label: "跑酷", value: "10%" },
  { label: "其他", value: "17%" },
];

const dayStats = [
  { label: "睡觉", time: "10小时", percent: "70%" },
  { label: "吃饭", time: "1小时", percent: "10%" },
  { label: "玩耍", time: "1小时", percent: "10%" },
];

export default function DataPage() {
  const [mode, setMode] = useState<"week" | "day">("week");

  useDidShow(() => {
    Taro.hideTabBar();
  });

  return (
    <View className="data-page">
      <PageBack />
      <View className="pet-switcher">
        <Text className="pet-arrow">〈</Text>
        <Image className="pet-side" src={require("@/assets/images/black cat 3.png")} mode="aspectFit" />
        <View className="pet-center">
          <Image className="pet-main" src={require("@/assets/images/cat-stand.png")} mode="aspectFit" />
          <Text className="pet-name">毛毛</Text>
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
            onClick={() => item.key !== "month" && setMode(item.key as "day" | "week")}
          >
            <Text className="mode-text">{item.label}</Text>
            <View className="mode-line" />
          </View>
        ))}
      </View>

      {mode === "week" ? (
        <>
          <View className="data-card">
            <View className="card-head">
              <Text className="module-title">本周</Text>
              <Text className="nav-arrows">〈 〉</Text>
            </View>
            <Text className="highlight-text">本周平均活跃度：83%</Text>
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
            <View className="pie-chart">
              <View className="pie-ring" />
              <View className="pie-legend">
                {pieItems.map((item) => (
                  <Text key={item.label} className="legend-item">
                    {item.label} {item.value}
                  </Text>
                ))}
              </View>
            </View>
          </View>
        </>
      ) : (
        <>
          <View className="date-title">2026年3月3日</View>
          <View className="data-card">
            <View className="day-header">
              <View>
                <Text className="highlight-text">活跃度 85%</Text>
                <Text className="helper-text">今日表现优秀</Text>
              </View>
              <View className="day-ring">
                <View className="day-ring-fill">
                  <Text className="day-ring-text">85%</Text>
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
            {dayStats.map((item) => (
              <View key={item.label} className="progress-row">
                <Text className="progress-label">
                  {item.label}（{item.time}，{item.percent}）
                </Text>
                <View className="progress-bar">
                  <View
                    className="progress-inner"
                    style={{ width: item.percent }}
                  />
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      <View className="safe-btn">
        <Text className="safe-btn-text">暂无异常 安心陪伴</Text>
      </View>
    </View>
  );
}
