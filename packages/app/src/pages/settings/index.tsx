import { View, Text, Image } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useState } from "react";
import type { Pet } from "@pet-wechat/shared";
import { clearToken, request } from "../../utils/request";
import { disconnectWs } from "../../utils/ws";
import PageBack from "../../components/PageBack";
import "./index.scss";

declare const ENABLE_DEV_LOGIN: boolean;

const SETTING_ITEMS = [
  "通知设置",
  "隐私设置",
  "主题设置",
  "语言选择",
  "关于我们",
  "帮助与反馈",
  "隐私政策",
  "退出登录",
];

const DEFAULT_PET_THUMBS = [
  require("@/assets/images/black cat 3.png"),
  require("@/assets/images/husky.png"),
];

export default function Settings() {
  const [pets, setPets] = useState<Pet[]>([]);

  useDidShow(() => {
    Taro.hideTabBar();
  });

  useEffect(() => {
    let cancelled = false;

    const loadPets = async () => {
      try {
        const res = await request<{ pets: Pet[] }>({ url: "/api/pets" });
        if (cancelled) return;
        setPets(res.pets);
      } catch {
        if (cancelled) return;
        setPets([]);
      }
    };

    void loadPets();

    return () => {
      cancelled = true;
    };
  }, []);

  const showComingSoon = () => {
    Taro.showToast({ title: "即将上线，敬请期待", icon: "none" });
  };

  const handleLogout = () => {
    clearToken();
    disconnectWs();
    Taro.reLaunch({ url: "/pages/login/index" });
  };

  const handleSettingClick = (item: string) => {
    if (item === "退出登录") {
      handleLogout();
      return;
    }

    showComingSoon();
  };

  const handleCollectData = async () => {
    if (!ENABLE_DEV_LOGIN) {
      return;
    }

    try {
      const result = await request<Record<string, unknown>>({
        url: "/api/debug/collect-data",
      });
      Taro.showModal({
        title: "采集对照数据",
        content: JSON.stringify(result, null, 2),
        showCancel: false,
      });
    } catch (error: any) {
      Taro.showToast({
        title: error?.message || "请求失败",
        icon: "none",
      });
    }
  };

  const petThumbs = DEFAULT_PET_THUMBS.map(
    (fallback, index) => pets[index]?.avatarImageUrl || fallback
  );

  return (
    <View className="settings-page">
      <PageBack />
      <Text className="page-title">设置</Text>

      <View className="settings-card">
        <Text className="section-title">我的宠物</Text>
        <View className="pet-row">
          {petThumbs.map((src, index) => (
            <Image key={`${index}-${src}`} className="pet-thumb" src={src} mode="aspectFill" />
          ))}
        </View>
      </View>

      <View className="settings-card">
        {SETTING_ITEMS.map((item) => (
          <View key={item} className="setting-item" onClick={() => handleSettingClick(item)}>
            <Text className="setting-label">{item}</Text>
            <Text className="setting-arrow">〉</Text>
          </View>
        ))}
      </View>

      {ENABLE_DEV_LOGIN ? (
        <View className="collect-btn" onClick={handleCollectData}>
          <Text className="collect-btn-text">采集对照</Text>
        </View>
      ) : null}
    </View>
  );
}
