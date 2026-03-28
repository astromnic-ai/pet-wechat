import { View, Text, Image, Input } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useState } from "react";
import { request } from "../../utils/request";
import type { CollarDevice, Gender, Pet, Species } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import "./index.scss";

export default function PetInfo() {
  const router = useRouter();
  const petId = router.params.petId || router.params.id;
  const routeCollarId = router.params.collarId || router.params.deviceId || "";

  const [species, setSpecies] = useState<Species>("cat");
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [birthday, setBirthday] = useState("");
  const [weight, setWeight] = useState("");
  const [gender, setGender] = useState<Gender>("male");
  const [collarId, setCollarId] = useState(routeCollarId);
  const [loading, setLoading] = useState(false);
  const canSubmit = name.trim().length > 0 && breed.trim().length > 0 && !loading;

  useDidShow(() => {
    if (routeCollarId) {
      setCollarId(routeCollarId);
    }
    if (!petId) return;
    void loadPet();
  });

  const applyPetToForm = (pet: Pet) => {
    setName(pet.name);
    setSpecies(pet.species);
    setBreed(pet.breed || "");
    setBirthday(pet.birthday || "");
    setWeight(pet.weight ? String(pet.weight) : "");
    setGender(pet.gender === "female" ? "female" : "male");
  };

  const loadPet = async () => {
    try {
      const [{ pet }, collarsRes] = await Promise.all([
        request<{ pet: Pet }>({ url: `/api/pets/${petId}` }),
        routeCollarId
          ? Promise.resolve(null)
          : request<{ collars: CollarDevice[] }>({ url: "/api/devices/collars" }),
      ]);

      applyPetToForm(pet);

      if (!routeCollarId) {
        const matchedCollar = collarsRes?.collars.find((collar) => collar.petId === pet.id);
        setCollarId(matchedCollar?.id || "");
      }
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
        const res = await request<{ pet: Pet }>({
          url: `/api/pets/${petId}`,
          method: "PUT",
          data,
        });
        pet = res.pet;
      } else {
        const res = await request<{ pet: Pet }>({
          url: "/api/pets",
          method: "POST",
          data,
        });
        pet = res.pet;
      }

      applyPetToForm(pet);

      if (collarId) {
        const { collar } = await request<{ collar: CollarDevice }>({
          url: `/api/devices/collars/${collarId}`,
          method: "PUT",
          data: { petId: pet.id },
        });
        setCollarId(collar.id);
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
          <Text className="device-value">Collar ID：{collarId}</Text>
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
