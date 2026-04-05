import { View, Text, Image } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import PageBack from "../../components/PageBack";
import "./index.scss";

const PETS = [
  {
    id: "pet-1",
    name: "小柴",
    image: require("@/assets/images/black cat 3.png"),
    active: true,
  },
  {
    id: "pet-2",
    name: "小橘",
    image: require("@/assets/images/cat-stand.png"),
    active: false,
  },
];

const WEEK_BARS = [34, 58, 39, 86, 64, 57, 69];

export default function DataPage() {
  const [activeTab, setActiveTab] = useState<"interaction" | "activity">("interaction");
  const [range, setRange] = useState<"day" | "week" | "month">("day");

  useDidShow(() => {
    Taro.hideTabBar();
  });

  return (
    <View className="data-page">
      <View className="data-top-strip" />
      <View className="data-header">
        <PageBack />
        <Text className="data-title">宠物记录</Text>
      </View>

      <View className="data-shell">
        <View className="pet-tabs">
          <View className="pet-tab pet-tab--active">
            <Text className="pet-tab-title">小柴的记录</Text>
            <Text className="pet-tab-desc">查看这只宠物的互动和活跃数据</Text>
          </View>
          <View className="pet-tab pet-tab--small">
            <Text className="pet-tab-name">小橘</Text>
          </View>
          <View className="pet-switch-arrow">〉</View>
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
            <Text className="today-title">今日互动指数</Text>
            <View className="today-score-row">
              <Text className="today-score">86</Text>
              <Text className="today-score-unit">/100</Text>
            </View>
          </View>
          <View className="today-badge">
            <Text className="today-badge-top">上升12%</Text>
            <Text className="today-badge-bottom">较昨日</Text>
          </View>
        </View>

        <View className="trend-head">
          <Text className="trend-title">本周趋势</Text>
          <View className="trend-dots">
            <View className="trend-dot trend-dot--active" />
            <View className="trend-dot" />
            <View className="trend-dot" />
          </View>
        </View>

        <View className="chart-card">
          <View className="chart-wrap">
            {WEEK_BARS.map((value, index) => (
              <View key={`${index}-${value}`} className="chart-item">
                <View
                  className={`chart-bar ${index % 2 === 0 ? "chart-bar--yellow" : "chart-bar--blue"}`}
                  style={{ height: `${value}%` }}
                />
                <Text className={`chart-label ${index === 6 ? "chart-label--active" : ""}`}>
                  {["一", "二", "三", "四", "五", "六", "日"][index]}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}
