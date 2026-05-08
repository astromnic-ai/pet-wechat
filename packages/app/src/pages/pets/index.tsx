import { View, Text, Image, ScrollView } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import type { Pet } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import { request } from "../../utils/request";
import { getPetDisplayImage } from "../../utils/petVisual";
import "./index.scss";
const DELETE_ACTION_WIDTH = 168;

function calculateAgeLabel(birthday?: string | null) {
  if (!birthday) return "年龄待补充";

  const birthDate = new Date(birthday);
  if (Number.isNaN(birthDate.getTime())) return "年龄待补充";

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age >= 0 ? `${age}岁` : "年龄待补充";
}

type TouchPoint = {
  x: number;
  y: number;
};

export default function PetsPage() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [authorizedPets, setAuthorizedPets] = useState<Pet[]>([]);
  const [openDeleteId, setOpenDeleteId] = useState("");
  const [touchStart, setTouchStart] = useState<TouchPoint | null>(null);
  const [deletingId, setDeletingId] = useState("");

  const loadPets = async () => {
    try {
      const res = await request<{ pets: Pet[]; authorizedPets: Pet[] }>({ url: "/api/pets" });
      setPets(res.pets);
      setAuthorizedPets(res.authorizedPets);
    } catch {
      setPets([]);
      setAuthorizedPets([]);
    }
  };

  useDidShow(() => {
    Taro.hideTabBar();
    void loadPets();
  });

  const handleOpenPet = (petId?: string) => {
    if (!petId) {
      Taro.navigateTo({ url: "/pages/pet-info/index" });
      return;
    }

    Taro.navigateTo({ url: `/pages/pet-info/index?petId=${petId}` });
  };

  const handleTouchStart = (e: any, petId: string) => {
    const touch = e.changedTouches?.[0];
    if (!touch) return;
    setTouchStart({ x: touch.clientX, y: touch.clientY });
    if (openDeleteId && openDeleteId !== petId) {
      setOpenDeleteId("");
    }
  };

  const handleTouchEnd = (e: any, petId: string) => {
    const touch = e.changedTouches?.[0];
    if (!touch || !touchStart) return;

    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;

    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      setTouchStart(null);
      return;
    }

    if (deltaX < -36) {
      setOpenDeleteId(petId);
    } else if (deltaX > 24) {
      setOpenDeleteId("");
    }

    setTouchStart(null);
  };

  const handleDeletePet = (pet: Pet) => {
    if (deletingId) return;

    Taro.showModal({
      title: "删除宠物",
      content: `删除“${pet.name}”后，会同时清除该宠物的定制形象、行为记录，并解除关联设备绑定。确定继续吗？`,
      confirmColor: "#ff5454",
      success: async (res) => {
        if (!res.confirm) return;

        setDeletingId(pet.id);
        try {
          await request({
            url: `/api/pets/${pet.id}`,
            method: "DELETE",
          });

          Taro.showToast({ title: "宠物已删除", icon: "success" });
          setOpenDeleteId("");
          await loadPets();
          Taro.eventCenter.trigger("devices:changed");
          Taro.eventCenter.trigger("pets:changed");
        } catch (error: any) {
          Taro.showToast({ title: error?.message || "删除失败，请稍后重试", icon: "none" });
        } finally {
          setDeletingId("");
        }
      },
    });
  };

  return (
    <View className="pets-page">
      <View className="pets-top-strip" />
      <View className="pets-header">
        <PageBack inline fallbackUrl="/pages/profile/index" />
        <Text className="pets-title">我的宠物</Text>
      </View>

      <ScrollView className="pets-scroll" scrollY>
        <View className="pets-content">
          {pets.length === 0 && authorizedPets.length === 0 ? (
            <View className="pets-empty-card">
              <Text className="pets-empty-title">还没有宠物</Text>
              <Text className="pets-empty-desc">点击下方按钮，先添加一只属于你的宠物吧。</Text>
            </View>
          ) : null}

          {pets.length > 0 ? (
            <View className="pets-section">
              <Text className="pets-section-title">我的宠物</Text>
              {pets.map((pet) => (
                <View key={pet.id} className="pet-swipe-row">
                  <View
                    className={`pet-delete-action ${openDeleteId === pet.id ? "pet-delete-action--open" : ""}`}
                    onClick={() => handleDeletePet(pet)}
                  >
                    <Text className="pet-delete-action-text">
                      {deletingId === pet.id ? "删除中" : "删除"}
                    </Text>
                  </View>

                  <View
                    className="pet-card-viewport"
                    onTouchStart={(e) => handleTouchStart(e, pet.id)}
                    onTouchEnd={(e) => handleTouchEnd(e, pet.id)}
                    onClick={() => {
                      if (openDeleteId === pet.id) {
                        setOpenDeleteId("");
                        return;
                      }
                      handleOpenPet(pet.id);
                    }}
                  >
                    <View
                      className="pet-list-card"
                      style={{
                        transform: openDeleteId === pet.id ? `translateX(-${DELETE_ACTION_WIDTH}rpx)` : "translateX(0)",
                      }}
                    >
                      <Image className="pet-list-avatar" src={getPetDisplayImage(pet)} mode="aspectFill" />

                      <View className="pet-list-body">
                        <View className="pet-list-name-row">
                          <Text className="pet-list-name">{pet.name}</Text>
                          <Text className="pet-list-badge">我的宠物</Text>
                        </View>
                        <Text className="pet-list-meta">
                          {(pet.breed?.trim() || (pet.species === "dog" ? "狗狗" : "猫咪"))} · {calculateAgeLabel(pet.birthday)}
                        </Text>
                      </View>

                      <Text className="pet-list-arrow">〉</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {authorizedPets.length > 0 ? (
            <View className="pets-section">
              <Text className="pets-section-title">被授权宠物</Text>
              {authorizedPets.map((pet) => (
                <View key={pet.id} className="pet-list-card pet-list-card--plain" onClick={() => handleOpenPet(pet.id)}>
                  <Image className="pet-list-avatar" src={getPetDisplayImage(pet)} mode="aspectFill" />

                  <View className="pet-list-body">
                    <View className="pet-list-name-row">
                      <Text className="pet-list-name">{pet.name}</Text>
                      <Text className="pet-list-badge pet-list-badge--blue">已授权</Text>
                    </View>
                    <Text className="pet-list-meta">
                      {(pet.breed?.trim() || (pet.species === "dog" ? "狗狗" : "猫咪"))} · {calculateAgeLabel(pet.birthday)}
                    </Text>
                  </View>

                  <Text className="pet-list-arrow">〉</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View className="pets-add-btn" onClick={() => Taro.navigateTo({ url: "/pages/pet-info/index" })}>
            <Text className="pets-add-btn-text">+ 添加宠物</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
