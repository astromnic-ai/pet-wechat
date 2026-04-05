import { View, Text, Image, Input, Picker } from "@tarojs/components";
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
  const isEditFormMode = Boolean(petId && router.params.edit === "1");

  const [species, setSpecies] = useState<Species>("cat");
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [birthday, setBirthday] = useState("");
  const [weight, setWeight] = useState("");
  const [age, setAge] = useState("");
  const [personality, setPersonality] = useState("");
  const [gender, setGender] = useState<Gender>("male");
  const [collarId, setCollarId] = useState(routeCollarId);
  const [collarDisplayName, setCollarDisplayName] = useState("");
  const [avatarId, setAvatarId] = useState("");
  const [avatarStatus, setAvatarStatus] = useState<AvatarStatus | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [avatarActions, setAvatarActions] = useState<PetAvatarAction[]>([]);
  const [loading, setLoading] = useState(false);
  const canSubmit = name.trim().length > 0 && breed.trim().length > 0 && !loading;
  const isDetailMode = Boolean(petId) && !isEditFormMode;

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
      setAvatarActions([]);
      return;
    }

    const latestActions = actions
      .filter((item) => item.petAvatarId === latestAvatar.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    setAvatarId(latestAvatar.id);
    setAvatarStatus(latestAvatar.status);
    setAvatarPreviewUrl(latestAvatar.sourceImageUrl || latestActions[0]?.imageUrl || "");
    setAvatarActions(latestActions);
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
        Taro.navigateBack({ fail: () => Taro.reLaunch({ url: "/pages/index/index" }) });
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
  const ageLabel = birthday ? birthday : "3岁半";
  const systemActions = avatarActions.slice(0, 8);
  const customActions = avatarActions.slice(8);

  const breedOptions =
    species === "dog"
      ? ["金毛", "柯基", "哈士奇", "柴犬", "其他（自定义）"]
      : ["英短", "布偶", "橘猫", "狸花", "其他（自定义）"];
  const isCustomBreed = breed.length > 0 && !breedOptions.slice(0, -1).includes(breed);

  const renderAddModeSectionTitle = (title: string) => (
    <Text className="add-mode-section-title">{title}</Text>
  );

  const renderCreateHalfField = (
    label: string,
    value: string,
    onChange: (nextValue: string) => void,
    placeholder: string,
    options?: {
      type?: "text" | "number";
      suffix?: string;
      icon?: string;
    }
  ) => (
    <View className="half-field">
      <Text className="add-mode-section-title add-mode-section-title--compact">{label}</Text>
      <View className="half-field-input-wrap">
        <Input
          className={`single-input single-input--half ${options?.suffix ? "single-input--with-suffix" : ""}`}
          type={options?.type === "number" ? "number" : "text"}
          placeholder={placeholder}
          value={value}
          onInput={(e) => onChange(e.detail.value)}
        />
        {options?.icon ? (
          <Image className="half-field-icon" src={options.icon} mode="aspectFit" />
        ) : null}
        {options?.suffix ? <Text className="half-field-suffix">{options.suffix}</Text> : null}
      </View>
    </View>
  );

  const handlePickBreed = (value: number) => {
    const selected = breedOptions[value];
    if (!selected) return;
    if (selected === "其他（自定义）") {
      setBreed("");
      Taro.showToast({ title: "请在下方输入自定义品种", icon: "none" });
      return;
    }
    setBreed(selected);
  };

  const handleOpenCustomActionUpload = () => {
    if (!petId) return;
    Taro.navigateTo({ url: `/pages/custom-action/index?petId=${petId}` });
  };

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
    if (isDetailMode) {
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
    <View className={`pet-info-page ${isDetailMode ? "pet-info-page--detail" : "pet-info-page--create"}`}>
      {isDetailMode ? (
        <View className="detail-header-shell">
          <View className="detail-top-strip" />
          <View className="detail-header">
            <View className="create-header-back" onClick={() => Taro.navigateBack({ fail: () => Taro.reLaunch({ url: "/pages/index/index" }) })}>
              <Text className="create-header-back-icon">←</Text>
            </View>
            <Text className="detail-header-title">宠物信息</Text>
            <View className="detail-header-switch">
              <Text className="detail-header-switch-icon">⇄</Text>
            </View>
          </View>
        </View>
      ) : (
        <View className="create-header">
          <View className="create-header-back" onClick={() => Taro.navigateBack({ fail: () => Taro.reLaunch({ url: "/pages/index/index" }) })}>
            <Text className="create-header-back-icon">←</Text>
          </View>
          <Text className="create-header-title">{isEditFormMode ? "编辑宠物" : "添加宠物"}</Text>
        </View>
      )}

      <View className="main-card">
        {isDetailMode ? (
          <>
            <View
              className="detail-avatar-panel"
              onClick={handleOpenAvatarPanel}
              onLongPress={handleOpenAvatarPanel}
            >
              <View className="detail-avatar-frame">
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
                  <Image className="detail-avatar-image" src={avatarCardImage} mode="aspectFit" />
                )}
                <Text className="detail-avatar-tip">
                  {avatarStatus === "done"
                    ? "长按图片，重新定制宠物动态"
                    : avatarStatus
                      ? "动态图像定制中，点击查看详情"
                      : "上传宠物照片，专属定制宠物动态图像"}
                </Text>
              </View>
            </View>

            <View className="detail-meta-row">
              <View className="detail-pill">
                <Text className="detail-pill-text">{name || "毛毛"}</Text>
              </View>
              <View className="detail-pill">
                <Text className="detail-pill-text">{breed || "英短蓝猫"}</Text>
              </View>
              <View className="detail-pill">
                <Text className="detail-pill-text">{gender === "female" ? "♀ 母" : "♂ 公"} · {ageLabel}</Text>
              </View>
              <View className="detail-edit-btn" onClick={() => Taro.navigateTo({ url: `/pages/pet-info/index?petId=${petId}&edit=1` })}>
                <Text className="detail-edit-icon">✎</Text>
              </View>
            </View>

            <View className="detail-actions-card">
              <Text className="detail-actions-title">系统动作</Text>
              <View className="detail-action-grid">
                {(systemActions.length > 0 ? systemActions : new Array(8).fill(null)).map((action, index) => (
                  <View key={action?.id || `system-${index}`} className="detail-action-item">
                    <View className="detail-action-thumb-wrap">
                      <Image
                        className="detail-action-thumb"
                        src={action?.imageUrl || avatarCardImage}
                        mode="aspectFill"
                      />
                    </View>
                    <Text className="detail-action-label">{action?.actionType || ["蹲坐", "趴卧", "吃饭", "睡觉", "跑", "走", "舔爪子", "睡觉"][index]}</Text>
                  </View>
                ))}
              </View>

              <Text className="detail-actions-title detail-actions-title--custom">自定义动作</Text>
              <View className="detail-custom-row">
                {customActions[0] ? (
                  <View className="detail-action-item detail-action-item--custom">
                    <View className="detail-action-thumb-wrap">
                      <Image className="detail-action-thumb" src={customActions[0].imageUrl} mode="aspectFill" />
                    </View>
                    <Text className="detail-action-label">{customActions[0].actionType}</Text>
                  </View>
                ) : (
                  <View className="detail-action-item detail-action-item--custom">
                    <View className="detail-action-thumb-wrap">
                      <Image className="detail-action-thumb" src={avatarCardImage} mode="aspectFill" />
                    </View>
                  </View>
                )}
                <View className="detail-add-action" onClick={handleOpenCustomActionUpload}>
                  <Text className="detail-add-action-icon">＋</Text>
                </View>
              </View>
            </View>
          </>
        ) : (
          <Text className="page-title page-title--create">添加宠物</Text>
        )}
        {!isDetailMode ? (
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
        ) : null}

        {!isDetailMode ? (
          <>
            {!isEditFormMode ? renderAddModeSectionTitle("宠物名字") : null}
            {renderTextField(
              "宠物名字",
              name,
              setName,
              isEditFormMode ? "宠物名字" : "请输入宠物名字",
              { required: true }
            )}

            <View className="half-field-row">
              <View className="half-field">
                <Text className="add-mode-section-title add-mode-section-title--compact">品种</Text>
                <Picker
                  mode="selector"
                  range={breedOptions}
                  onChange={(e) => handlePickBreed(Number(e.detail.value))}
                >
                  <View className="half-field-input-wrap">
                    <Input
                      className="single-input single-input--half single-input--with-suffix"
                      placeholder="选择品种"
                      value={breed && !isCustomBreed ? breed : ""}
                      disabled
                    />
                    <Text className="half-field-arrow">▼</Text>
                  </View>
                </Picker>
              </View>
              <View className="half-field">
                <Text className="add-mode-section-title add-mode-section-title--compact">生日</Text>
                <Picker
                  mode="date"
                  value={birthday || "2026-04-05"}
                  onChange={(e) => setBirthday(e.detail.value)}
                >
                  <View className="half-field-input-wrap">
                    <Input
                      className="single-input single-input--half single-input--with-suffix"
                      placeholder="选择日期"
                      value={birthday}
                      disabled
                    />
                    <Image
                      className="half-field-icon"
                      src={require("@/assets/images/icon-gray-1.png")}
                      mode="aspectFit"
                    />
                  </View>
                </Picker>
              </View>
            </View>

            {isCustomBreed || !breed
              ? renderTextField("自定义品种", breed, setBreed, "请输入品种", { required: true })
              : null}

            <View className="half-field-row">
              <View className="half-field">
                <Text className="add-mode-section-title add-mode-section-title--compact">性别</Text>
                <View className="gender-row gender-row--compact">
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
              </View>
              {renderCreateHalfField("年龄", age, setAge, "请输入年龄", {
                type: "number",
                suffix: "岁",
              })}
            </View>

            <View className="half-field-row">
              {renderCreateHalfField("体重", weight, setWeight, "请输入体重", {
                type: "number",
                suffix: "kg",
              })}
              {renderCreateHalfField("性格", personality, setPersonality, "请简要描述")}
            </View>
          </>
        ) : null}

        {isDetailMode ? null : (
          <View className={`submit-btn ${canSubmit ? "" : "submit-btn--disabled"}`} onClick={handleSubmit}>
            <Text className="submit-btn-text">{loading ? "保存中..." : isEditFormMode ? "保存信息" : "保存宠物信息，下一步"}</Text>
          </View>
        )}
      </View>
    </View>
  );
}
