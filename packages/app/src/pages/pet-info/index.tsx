import { View, Text, Image, Input } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useState } from "react";
import { request } from "../../utils/request";
import type { Gender, Pet, Species } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import "./index.scss";

export default function PetInfo() {
  const router = useRouter();
  const petId = router.params.id;
  const collarId = router.params.collarId;

  const [species, setSpecies] = useState<Species>("cat");
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [birthday, setBirthday] = useState("");
  const [weight, setWeight] = useState("");
  const [gender, setGender] = useState<Gender>("male");
  const [loading, setLoading] = useState(false);
  const canSubmit = name.trim().length > 0 && breed.trim().length > 0 && !loading;

  useDidShow(() => {
    if (!petId) return;
    void loadPet();
  });

  const loadPet = async () => {
    try {
      const { pet } = await request<{ pet: Pet }>({ url: `/api/pets/${petId}` });
      setName(pet.name);
      setSpecies(pet.species);
      setBreed(pet.breed || "");
      setBirthday(pet.birthday || "");
      setWeight(pet.weight ? String(pet.weight) : "");
      setGender(pet.gender === "female" ? "female" : "male");
    } catch {}
  };

  const handleSubmit = async () => {
    if (loading) return;
    if (!name.trim()) {
      Taro.showToast({ title: "请输入宠物名字", icon: "none" });
      return;
    }

    if (!breed.trim()) {
      Taro.showToast({ title: "请输入宠物品种", icon: "none" });
      return;
    }

    setLoading(true);
    try {
      const data = {
        name: name.trim(),
        species,
        breed: breed || null,
        gender,
        birthday: birthday || null,
        weight: weight ? Number(weight) : null,
      };
      let pet: Pet;

      if (petId) {
        await request({
          url: `/api/pets/${petId}`,
          method: "PUT",
          data,
        });
        pet = {
          id: petId,
          userId: "mock-user",
          name: data.name,
          species: data.species,
          breed: data.breed,
          gender: data.gender,
          birthday: data.birthday,
          weight: data.weight,
          activityScore: 82,
          latestBehavior: null,
          avatarImageUrl: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      } else {
        const res = await request<{ pet: Pet }>({
          url: "/api/pets",
          method: "POST",
          data,
        });
        pet = res.pet;
      }

      if (collarId) {
        await request({
          url: `/api/devices/collars/${collarId}`,
          method: "PUT",
          data: { petId: pet.id },
        });
      }

      Taro.navigateTo({ url: `/pages/pet-avatar/index?petId=${pet.id}` });
    } catch (e: any) {
      Taro.showToast({ title: e.message || "保存失败", icon: "none" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="pet-info-page">
      <PageBack />
      <Text className="brand">YEHEY</Text>
      <Image
        className="top-outline"
        src={require("@/assets/images/pet-outline.png")}
        mode="widthFix"
      />

      <View className="main-card">
        <Text className="page-title">录入宠物信息</Text>

        <View className="species-showcase">
          <View
            className={`species-face ${species === "cat" ? "active" : ""}`}
            onClick={() => setSpecies("cat")}
          >
            <Image
              className="species-avatar"
              src={require("@/assets/images/black cat 3.png")}
              mode="aspectFit"
            />
          </View>
          <Text className="species-or">or</Text>
          <View
            className={`species-face ${species === "dog" ? "active" : ""}`}
            onClick={() => setSpecies("dog")}
          >
            <Image
              className="species-avatar"
              src={require("@/assets/images/husky.png")}
              mode="aspectFit"
            />
          </View>
        </View>

        <Text className="species-tip">选择当前想要添加的宠物类型</Text>

        <View className="required-input">
          <Input
            className="single-input single-input--required"
            placeholder="宠物名字"
            value={name}
            onInput={(e) => setName(e.detail.value)}
          />
          <Text className="required-text">必填</Text>
        </View>
        <View className="required-input">
          <Input
            className="single-input single-input--required"
            placeholder="宠物品种"
            value={breed}
            onInput={(e) => setBreed(e.detail.value)}
          />
          <Text className="required-text">必填</Text>
        </View>

        <View className="gender-row">
          <View
            className={`gender-btn ${gender === "male" ? "active" : ""}`}
            onClick={() => setGender("male")}
          >
            <Text className="gender-text">公</Text>
          </View>
          <View
            className={`gender-btn ${gender === "female" ? "active" : ""}`}
            onClick={() => setGender("female")}
          >
            <Text className="gender-text">母</Text>
          </View>
        </View>

        <Input
          className="single-input"
          placeholder="出生日期"
          value={birthday}
          onInput={(e) => setBirthday(e.detail.value)}
        />
        <Input
          className="single-input"
          type="number"
          placeholder="体重（kg）"
          value={weight}
          onInput={(e) => setWeight(e.detail.value)}
        />

        <View className="device-row">
          <Image
            className="device-icon"
            src={require("@/assets/images/collar-icon.png")}
            mode="aspectFit"
          />
          <Text className="device-prefix">当前关联设备：</Text>
          <Text className="device-value">Collar ID：{collarId || "666777888"}</Text>
        </View>

        <View className={`submit-btn ${canSubmit ? "" : "submit-btn--disabled"}`} onClick={handleSubmit}>
          <Text className="submit-btn-text">{loading ? "保存中..." : "保存，下一步"}</Text>
        </View>
      </View>

      <View className="progress-track">
        <View className="progress-segment" />
        <View className="progress-segment" />
        <View className="progress-segment active" />
        <View className="progress-segment" />
      </View>
    </View>
  );
}
