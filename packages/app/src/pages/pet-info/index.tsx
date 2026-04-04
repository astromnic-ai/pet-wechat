import { View, Text, Image, Input } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useState } from "react";
import { request } from "../../utils/request";
import type { AvatarStatus, CollarDevice, Gender, Pet, PetAvatar, PetAvatarAction, Species } from "@pet-wechat/shared";
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
  const [collarDisplayName, setCollarDisplayName] = useState("");
  const [avatarId, setAvatarId] = useState("");
  const [avatarStatus, setAvatarStatus] = useState<AvatarStatus | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const canSubmit = name.trim().length > 0 && breed.trim().length > 0 && !loading;
  const isEditMode = Boolean(petId);

  useDidShow(() => {
    if (routeCollarId) {
      setCollarId(routeCollarId);
      void loadCollar(routeCollarId);
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

  const applyCollarToForm = (collar?: CollarDevice | null) => {
    if (!collar) {
      setCollarDisplayName("");
      return;
    }

    setCollarId(collar.id);
    setCollarDisplayName(collar.name || collar.macAddress || collar.id);
  };

  const applyAvatarState = (avatars: PetAvatar[] = [], actions: PetAvatarAction[] = []) => {
    const latestAvatar = [...avatars].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];

    if (!latestAvatar) {
      setAvatarId("");
      setAvatarStatus(null);
      setAvatarPreviewUrl("");
      return;
    }

    const latestActions = actions
      .filter((item) => item.petAvatarId === latestAvatar.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    setAvatarId(latestAvatar.id);
    setAvatarStatus(latestAvatar.status);
    setAvatarPreviewUrl(latestAvatar.sourceImageUrl || latestActions[0]?.imageUrl || "");
  };

  const loadPet = async () => {
    try {
      const [petRes, collarsRes] = await Promise.all([
        request<{ pet: Pet; avatars: PetAvatar[]; actions: PetAvatarAction[] }>({
          url: `/api/pets/${petId}`,
        }),
        request<{ collars: CollarDevice[] }>({ url: "/api/devices/collars" }),
      ]);

      applyPetToForm(petRes.pet);
      applyAvatarState(petRes.avatars, petRes.actions);

      const matchedCollar = collarsRes.collars.find((collar) =>
        routeCollarId ? collar.id === routeCollarId : collar.petId === petRes.pet.id
      );

      applyCollarToForm(matchedCollar);
    } catch {}
  };

  const loadCollar = async (targetCollarId: string) => {
    try {
      const { collars } = await request<{ collars: CollarDevice[] }>({ url: "/api/devices/collars" });
      const matchedCollar = collars.find((collar) => collar.id === targetCollarId);
      applyCollarToForm(matchedCollar);
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
        applyCollarToForm(collar);
      }

      if (petId) {
        Taro.showToast({ title: "保存成功", icon: "success" });
        return;
      }

      Taro.redirectTo({ url: `/pages/pet-avatar/index?petId=${pet.id}` });
    } catch (e: any) {
      Taro.showToast({ title: e.message || "保存失败", icon: "none" });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAvatarPanel = () => {
    if (!petId) return;

    if (avatarId && avatarStatus && avatarStatus !== "done") {
      Taro.navigateTo({ url: `/pages/avatar-progress/index?avatarId=${avatarId}` });
      return;
    }

    Taro.navigateTo({ url: `/pages/pet-avatar/index?petId=${petId}` });
  };

  const avatarCardImage =
    avatarPreviewUrl || (species === "dog" ? require("@/assets/images/husky.png") : require("@/assets/images/black cat 3.png"));

  const renderAddModeSectionTitle = (title: string) => (
    <Text className="add-mode-section-title">{title}</Text>
  );

  const renderTextField = (
    label: string,
    value: string,
    onChange: (nextValue: string) => void,
    placeholder: string,
    options?: {
      required?: boolean;
      type?: "text" | "number";
      icon?: string;
    }
  ) => {
    if (isEditMode) {
      return (
        <View className="detail-field-row">
          <View className="detail-field-label-wrap">
            {options?.icon ? (
              <Image className="detail-field-icon" src={options.icon} mode="aspectFit" />
            ) : null}
            <Text className="detail-field-label">{label}</Text>
          </View>
          <Input
            className="detail-field-input"
            type={options?.type === "number" ? "number" : "text"}
            value={value}
            placeholder={placeholder}
            onInput={(e) => onChange(e.detail.value)}
          />
          {options?.required ? <Text className="required-text detail-required-text">必填</Text> : null}
        </View>
      );
    }

    return (
      <View className={options?.required ? "required-input" : ""}>
        <Input
          className={`single-input ${options?.required ? "single-input--required" : ""}`}
          type={options?.type === "number" ? "number" : "text"}
          placeholder={placeholder}
          value={value}
          onInput={(e) => onChange(e.detail.value)}
        />
        {options?.required ? <Text className="required-text">必填</Text> : null}
      </View>
    );
  };

  return (
    <View className={`pet-info-page ${isEditMode ? "pet-info-page--detail" : "pet-info-page--create"}`}>
      {isEditMode ? (
        <>
          <PageBack />
          <Text className="brand">YEHEY</Text>
        </>
      ) : (
        <View className="create-header">
          <View className="create-header-back" onClick={() => Taro.navigateBack({ fail: () => Taro.reLaunch({ url: "/pages/index/index" }) })}>
            <Text className="create-header-back-icon">←</Text>
          </View>
          <Text className="create-header-title">添加宠物</Text>
        </View>
      )}

      <View className="main-card">
        {isEditMode ? (
          <View className="page-title-row">
            <Text className="page-title">{`${name || "宠物"}-宠物信息`}</Text>
            <View className="page-switch-btn">
              <Text className="page-switch-icon">⇄</Text>
            </View>
          </View>
        ) : (
          <Text className="page-title page-title--create">添加宠物</Text>
        )}

        {isEditMode ? (
          <View
            className="avatar-panel"
            onClick={handleOpenAvatarPanel}
            onLongPress={handleOpenAvatarPanel}
          >
            <View className="avatar-panel-frame">
              {avatarStatus && avatarStatus !== "done" ? (
                <View className="avatar-progress-box">
                  <View className="avatar-progress-ring">
                    <View className="avatar-progress-inner">
                      <Image className="avatar-panel-image avatar-panel-image--small" src={avatarCardImage} mode="aspectFit" />
                      <Text className="avatar-progress-text">82%</Text>
                    </View>
                  </View>
                </View>
              ) : (
                <Image className="avatar-panel-image" src={avatarCardImage} mode="aspectFit" />
              )}
              <Text className="avatar-panel-tip">
                {avatarStatus === "done"
                  ? "长按图像重新定制宠物动态形象"
                  : avatarStatus
                    ? "动态图像定制中，点击查看详情"
                    : "上传宠物照片，专属定制宠物动态图像"}
              </Text>
            </View>
          </View>
        ) : null}

        {isEditMode ? null : (
          <>
            {renderAddModeSectionTitle("宠物类型")}
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
                <Text className="species-face-label">猫</Text>
              </View>
              <View
                className={`species-face ${species === "dog" ? "active" : ""}`}
                onClick={() => setSpecies("dog")}
              >
                <Image
                  className="species-avatar"
                  src={require("@/assets/images/husky.png")}
                  mode="aspectFit"
                />
                <Text className="species-face-label">狗</Text>
              </View>
              <View className="species-face species-face--disabled">
                <Text className="species-other-label">其他</Text>
              </View>
            </View>

            <Text className="species-tip">选择当前想要添加的宠物类型</Text>
          </>
        )}

        {!isEditMode ? renderAddModeSectionTitle("宠物名字") : null}
        {renderTextField("宠物名字", name, setName, "宠物名字", { required: true })}
        {!isEditMode ? renderAddModeSectionTitle("宠物品种") : null}
        {renderTextField("宠物品种", breed, setBreed, "宠物品种", { required: true })}

        {!isEditMode ? renderAddModeSectionTitle("性别") : null}
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

        {!isEditMode ? renderAddModeSectionTitle("出生日期") : null}
        {renderTextField("出生日期", birthday, setBirthday, "出生日期")}
        {!isEditMode ? renderAddModeSectionTitle("体重") : null}
        {renderTextField("体重（kg）", weight, setWeight, "体重（kg）", { type: "number" })}

        {isEditMode ? (
          <View className="detail-field-row">
            <View className="detail-field-label-wrap">
              <Image
                className="detail-field-icon"
                src={require("@/assets/images/collar-icon.png")}
                mode="aspectFit"
              />
              <Text className="detail-field-label">关联设备</Text>
            </View>
            <Text className="detail-field-value">{collarDisplayName || collarId || "未关联设备"}</Text>
          </View>
        ) : (
          <View className="device-row">
            <Image
              className="device-icon"
              src={require("@/assets/images/collar-icon.png")}
              mode="aspectFit"
            />
            <Text className="device-prefix">当前关联设备：</Text>
            <Text className="device-value">{collarDisplayName || collarId || "未关联设备"}</Text>
          </View>
        )}

        <View className={`submit-btn ${canSubmit ? "" : "submit-btn--disabled"}`} onClick={handleSubmit}>
          <Text className="submit-btn-text">{loading ? "保存中..." : isEditMode ? "保存信息" : "保存，下一步"}</Text>
        </View>
      </View>
      {isEditMode ? (
        <Image
          className="bottom-outline"
          src={require("@/assets/images/pet-outline.png")}
          mode="widthFix"
        />
      ) : null}
    </View>
  );
}
