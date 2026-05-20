import { View, Text, Image, Input } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import { request } from "../../utils/request";
import type { AvatarStatus, CollarDevice, Gender, Pet, PetAvatar, PetAvatarAction, Species } from "@pet-wechat/shared";
import PageBack from "../../components/PageBack";
import { getPetFallbackImage } from "../../utils/petVisual";
import { normalizePetActionLabel, SYSTEM_PRESET_ACTION_KEYS } from "../../utils/petActions";
import "./index.scss";

const CAT_SYSTEM_ACTION_FALLBACKS = [
  { label: normalizePetActionLabel(SYSTEM_PRESET_ACTION_KEYS[0]), image: require("./images/action-sit.png") },
  { label: normalizePetActionLabel(SYSTEM_PRESET_ACTION_KEYS[1]), image: require("./images/action-eat.png") },
  { label: normalizePetActionLabel(SYSTEM_PRESET_ACTION_KEYS[2]), image: require("./images/action-sleep.png") },
  { label: normalizePetActionLabel(SYSTEM_PRESET_ACTION_KEYS[3]), image: require("./images/action-lie.png") },
  { label: normalizePetActionLabel(SYSTEM_PRESET_ACTION_KEYS[4]), image: require("./images/action-run.png") },
  { label: normalizePetActionLabel(SYSTEM_PRESET_ACTION_KEYS[5]), image: require("./images/action-walk.png") },
  { label: normalizePetActionLabel(SYSTEM_PRESET_ACTION_KEYS[6]), image: require("./images/action-sit.png") },
  { label: normalizePetActionLabel(SYSTEM_PRESET_ACTION_KEYS[7]), image: require("./images/action-run.png") },
];

const DOG_SYSTEM_ACTION_FALLBACKS = [
  { label: normalizePetActionLabel(SYSTEM_PRESET_ACTION_KEYS[0]), image: require("./images/dog-action-sit.png") },
  { label: normalizePetActionLabel(SYSTEM_PRESET_ACTION_KEYS[1]), image: require("./images/dog-action-eat.png") },
  { label: normalizePetActionLabel(SYSTEM_PRESET_ACTION_KEYS[2]), image: require("./images/dog-action-sleep.png") },
  { label: normalizePetActionLabel(SYSTEM_PRESET_ACTION_KEYS[3]), image: require("./images/dog-action-lie.png") },
  { label: normalizePetActionLabel(SYSTEM_PRESET_ACTION_KEYS[4]), image: require("./images/dog-action-run.png") },
  { label: normalizePetActionLabel(SYSTEM_PRESET_ACTION_KEYS[5]), image: require("./images/dog-action-walk.png") },
  { label: normalizePetActionLabel(SYSTEM_PRESET_ACTION_KEYS[6]), image: require("./images/dog-action-sit.png") },
  { label: normalizePetActionLabel(SYSTEM_PRESET_ACTION_KEYS[7]), image: require("./images/dog-action-run.png") },
];

const AVATAR_PROGRESS_BASE = 12;
const AVATAR_PROGRESS_TARGET = 90;
const AVATAR_PROGRESS_TARGET_DAYS = 3;

function calculateAgeLabel(birthday?: string | null) {
  if (!birthday) return "年龄待补充";

  const birthDate = new Date(birthday);
  if (Number.isNaN(birthDate.getTime())) return "年龄待补充";

  const today = new Date();
  if (birthDate.getTime() > today.getTime()) return "年龄待补充";

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age >= 0 ? `${age}岁` : "年龄待补充";
}

function calculateAvatarProgressPercent(status: AvatarStatus | null, createdAt?: string | null) {
  if (status === "done") return 100;
  if (status === "failed" || status === "rejected" || !createdAt) return 0;
  if (status !== "pending" && status !== "processing" && status !== "approved") return 0;

  const createdAtMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdAtMs)) return AVATAR_PROGRESS_BASE;

  const elapsedMs = Math.max(Date.now() - createdAtMs, 0);
  const targetMs = AVATAR_PROGRESS_TARGET_DAYS * 24 * 60 * 60 * 1000;
  const progressRatio = Math.min(elapsedMs / targetMs, 1);

  return Math.round(AVATAR_PROGRESS_BASE + progressRatio * (AVATAR_PROGRESS_TARGET - AVATAR_PROGRESS_BASE));
}

export default function PetInfo() {
  const router = useRouter();
  const petId = router.params.petId || router.params.id;
  const routeCollarId = router.params.collarId || router.params.deviceId || "";
  const bindDeviceType = router.params.bindDeviceType as "collar" | "desktop" | undefined;
  const bindDeviceId = router.params.bindDeviceId || "";
  const isAvatarDraftConfirmMode = Boolean(petId && router.params.avatarDraft === "1");
  const isEditFormMode = Boolean(petId && (router.params.edit === "1" || isAvatarDraftConfirmMode));

  const [species, setSpecies] = useState<Species>("cat");
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [birthday, setBirthday] = useState("");
  const [weight, setWeight] = useState("");
  const [age, setAge] = useState("");
  const [personality, setPersonality] = useState("");
  const [gender, setGender] = useState<Gender>("male");
  const [breedSheetVisible, setBreedSheetVisible] = useState(false);
  const [birthdaySheetVisible, setBirthdaySheetVisible] = useState(false);
  const [birthdayDraft, setBirthdayDraft] = useState({
    year: "2026",
    month: "04",
    day: "05",
  });
  const [collarId, setCollarId] = useState(routeCollarId);
  const [collarDisplayName, setCollarDisplayName] = useState("");
  const [avatarId, setAvatarId] = useState("");
  const [avatarStatus, setAvatarStatus] = useState<AvatarStatus | null>(null);
  const [avatarCreatedAt, setAvatarCreatedAt] = useState("");
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [avatarActions, setAvatarActions] = useState<PetAvatarAction[]>([]);
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState("");
  const [selectedPreviewLabel, setSelectedPreviewLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [nameLockedDialogVisible, setNameLockedDialogVisible] = useState(false);
  const canSubmit = name.trim().length > 0 && !loading;
  const isDetailMode = Boolean(petId) && !isEditFormMode;
  const isNameLocked = Boolean(petId && isEditFormMode);

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
      setAvatarCreatedAt("");
      setAvatarPreviewUrl("");
      setAvatarActions([]);
      return;
    }

    const latestActions = actions
      .filter((item) => item.petAvatarId === latestAvatar.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    setAvatarId(latestAvatar.id);
    setAvatarStatus(latestAvatar.status);
    setAvatarCreatedAt(latestAvatar.createdAt);
    setAvatarPreviewUrl(latestActions[0]?.imageUrl || latestAvatar.sourceImageUrl || "");
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

    setLoading(true);
    try {
      const data = {
        ...(petId ? {} : { name: name.trim() }),
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

      if (petId) {
        Taro.showToast({ title: "保存成功", icon: "success" });
        if (isAvatarDraftConfirmMode) {
          Taro.redirectTo({ url: `/pages/pet-avatar/index?petId=${petId}` });
          return;
        }
        Taro.navigateBack({ fail: () => Taro.switchTab({ url: "/pages/index/index" }) });
        return;
      }

      if (bindDeviceType && bindDeviceId) {
        Taro.redirectTo({
          url: `/pages/bind-pet/index?deviceType=${bindDeviceType}&deviceId=${encodeURIComponent(
            bindDeviceId
          )}&selectedPetId=${encodeURIComponent(pet.id)}`,
        });
        return;
      }

      Taro.navigateTo({ url: `/pages/pet-avatar/index?petId=${pet.id}` });
    } catch (e: any) {
      Taro.showToast({ title: e.message || "保存失败", icon: "none" });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAvatarPanel = () => {
    if (!petId) return;

    const isAvatarGenerating =
      avatarStatus === "pending" ||
      avatarStatus === "processing" ||
      avatarStatus === "approved";

    if (avatarId && isAvatarGenerating) {
      Taro.navigateTo({ url: `/pages/avatar-progress/index?avatarId=${avatarId}` });
      return;
    }

    Taro.navigateTo({ url: `/pages/pet-avatar/index?petId=${petId}` });
  };

  const fallbackPetImage = getPetFallbackImage(species);
  const isAvatarGenerating =
    avatarStatus === "pending" ||
    avatarStatus === "processing" ||
    avatarStatus === "approved";
  const isAvatarFailed =
    avatarStatus === "failed" ||
    avatarStatus === "rejected";
  const isAvatarDone = avatarStatus === "done";
  const avatarProgressPercent = calculateAvatarProgressPercent(avatarStatus, avatarCreatedAt);
  const avatarProgressDegrees = `${Math.round((avatarProgressPercent / 100) * 360)}deg`;
  const avatarCardImage = selectedPreviewUrl || avatarPreviewUrl || fallbackPetImage;
  const ageLabel = calculateAgeLabel(birthday);
  const systemActions = avatarActions.slice(0, 8);
  const systemActionFallbacks = species === "dog" ? DOG_SYSTEM_ACTION_FALLBACKS : CAT_SYSTEM_ACTION_FALLBACKS;
  const displaySystemActions = systemActionFallbacks.map((fallback, index) => {
    const action = systemActions[index];
    return {
      id: action?.id || `system-${index}`,
      imageUrl: isAvatarDone ? action?.imageUrl || fallback.image || avatarCardImage : "",
      label: normalizePetActionLabel(action?.actionType || fallback.label || "动作"),
      ready: Boolean(isAvatarDone && (action?.imageUrl || fallback.image)),
    };
  });
  const detailTipText =
    avatarStatus === "done"
      ? "长按图片，重新定制宠物动态"
      : isAvatarGenerating
        ? "正在生成您的宠物定制形象"
        : isAvatarFailed
          ? "上传宠物照片，专属定制宠物动态图像"
          : "上传宠物照片，专属定制宠物动态图像";
  const previewCaption = selectedPreviewLabel || detailTipText;

  const breedOptions =
    species === "dog"
      ? ["金毛", "柯基", "哈士奇", "柴犬", "其他（自定义）"]
      : ["英短", "布偶", "橘猫", "狸花", "其他（自定义）"];
  const isCustomBreed = breed.length > 0 && !breedOptions.slice(0, -1).includes(breed);
  const birthYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 20 }, (_, index) => String(currentYear - index));
  }, []);
  const birthMonths = useMemo(
    () => Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")),
    []
  );
  const birthDays = useMemo(() => {
    const maxDays = new Date(
      Number(birthdayDraft.year),
      Number(birthdayDraft.month),
      0
    ).getDate();

    return Array.from({ length: maxDays }, (_, index) =>
      String(index + 1).padStart(2, "0")
    );
  }, [birthdayDraft.month, birthdayDraft.year]);

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
      setBreedSheetVisible(false);
      Taro.showToast({ title: "请在下方输入自定义品种", icon: "none" });
      return;
    }
    setBreed(selected);
    setBreedSheetVisible(false);
  };

  const handleOpenBirthdaySheet = () => {
    const [year = "2026", month = "04", day = "05"] = (birthday || "2026-04-05").split("-");
    setBirthdayDraft({
      year,
      month,
      day,
    });
    setBirthdaySheetVisible(true);
  };

  const handleConfirmBirthday = () => {
    setBirthday(`${birthdayDraft.year}-${birthdayDraft.month}-${birthdayDraft.day}`);
    setBirthdaySheetVisible(false);
  };

  const handleOpenCustomActionUpload = () => {
    if (!petId) return;
    Taro.navigateTo({ url: `/pages/custom-action/index?petId=${petId}` });
  };

  const handleOpenNameLockedDialog = () => {
    if (!isNameLocked) return;
    setNameLockedDialogVisible(true);
  };

  const handleCreateAnotherPet = () => {
    setNameLockedDialogVisible(false);
    Taro.redirectTo({ url: "/pages/pet-info/index" });
  };

  useEffect(() => {
    if (!selectedPreviewUrl) return;
    const existsInActions = avatarActions.some((item) => item.imageUrl === selectedPreviewUrl);
    if (!existsInActions && selectedPreviewUrl !== avatarPreviewUrl) {
      setSelectedPreviewUrl("");
      setSelectedPreviewLabel("");
    }
  }, [avatarActions, avatarPreviewUrl, selectedPreviewUrl]);

  useEffect(() => {
    if (!selectedPreviewUrl) {
      setSelectedPreviewLabel("");
    }
  }, [selectedPreviewUrl]);

  // 当前后端还没有独立返回“用户自定义动作”数据，这里先保持空态，
  // 避免把系统生成动作或占位内容误展示成自定义动作。
  const customActionItems = useMemo(() => [], []);

  const handlePreviewAction = (imageUrl: string, label: string, ready: boolean) => {
    if (!ready || !imageUrl) {
      Taro.showToast({ title: "定制完成后可预览系统动作", icon: "none" });
      return;
    }

    setSelectedPreviewUrl(imageUrl);
    setSelectedPreviewLabel(label);
    void Taro.previewImage({
      current: imageUrl,
      urls: [imageUrl],
    });
  };

  const handleResetPreview = () => {
    setSelectedPreviewUrl("");
    setSelectedPreviewLabel("");
    handleOpenAvatarPanel();
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

    const shouldLockName = label === "宠物名字" && isNameLocked;

    return (
      <View
        className={`${options?.required ? "required-input" : ""} ${shouldLockName ? "locked-input-wrap" : ""}`}
        onClick={shouldLockName ? handleOpenNameLockedDialog : undefined}
      >
        <Input
          className={`single-input ${options?.required ? "single-input--required" : ""} ${shouldLockName ? "single-input--locked" : ""}`}
          type={options?.type === "number" ? "number" : "text"}
          placeholder={placeholder}
          value={value}
          disabled={shouldLockName}
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
            <View className="create-header-back" onClick={() => Taro.navigateBack({ fail: () => Taro.switchTab({ url: "/pages/index/index" }) })}>
              <Text className="create-header-back-icon">←</Text>
            </View>
            <Text className="detail-header-title">宠物信息</Text>
          </View>
        </View>
      ) : (
        <View className="create-header">
          <View className="create-header-back" onClick={() => Taro.navigateBack({ fail: () => Taro.switchTab({ url: "/pages/index/index" }) })}>
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
              onClick={handleResetPreview}
              onLongPress={handleOpenAvatarPanel}
            >
              <View className="detail-avatar-frame">
                {avatarStatus && avatarStatus !== "done" ? (
                  <View className="avatar-progress-box">
                    <View className="avatar-progress-ring">
                      <View
                        className="avatar-progress-ring-fill"
                        style={{ background: `conic-gradient(#9f9f9f ${avatarProgressDegrees}, #d8d8d8 ${avatarProgressDegrees})` }}
                      />
                      <View className="avatar-progress-inner">
                        <Text className="avatar-progress-text">{avatarProgressPercent}%</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <Image className="detail-avatar-image" src={avatarCardImage} mode="aspectFit" />
                )}
                <Text className="detail-avatar-tip">{previewCaption}</Text>
              </View>
            </View>

            <View className="detail-meta-row">
              <View className="detail-meta-pills">
                <View className="detail-pill">
                  <Text className="detail-pill-text">{name.trim() || "未设置名称"}</Text>
                </View>
                <View className="detail-pill">
                  <Text className="detail-pill-text">{breed.trim() || "未设置品种"}</Text>
                </View>
                <View className="detail-pill">
                  <View className="detail-pill-gender">
                    <View className="detail-pill-gender-main">
                      <View className="detail-pill-symbol-box">
                        <Text className="detail-pill-symbol">{gender === "female" ? "♀" : "♂"}</Text>
                      </View>
                      <Text className="detail-pill-text detail-pill-text--gender">{gender === "female" ? "母" : "公"}</Text>
                    </View>
                    <Text className="detail-pill-separator">·</Text>
                    <Text className="detail-pill-text detail-pill-text--age">{ageLabel}</Text>
                  </View>
                </View>
              </View>
              <View className="detail-edit-btn" onClick={() => Taro.navigateTo({ url: `/pages/pet-info/index?petId=${petId}&edit=1` })}>
                <Text className="detail-edit-icon">✎</Text>
                <Text className="detail-edit-label">编辑</Text>
              </View>
            </View>

            <View className="detail-actions-card">
              <Text className="detail-actions-title">系统动作</Text>
              <View className="detail-action-grid">
                {displaySystemActions.map((action) => (
                  <View
                    key={action.id}
                    className={`detail-action-item ${action.ready ? "" : "detail-action-item--disabled"}`}
                    onClick={() => handlePreviewAction(action.imageUrl, action.label, action.ready)}
                  >
                    <View className={`detail-action-thumb-wrap ${action.ready ? "" : "detail-action-thumb-wrap--placeholder"}`}>
                      {action.ready ? (
                        <Image className="detail-action-thumb" src={action.imageUrl} mode="aspectFill" />
                      ) : (
                        <Text className="detail-action-placeholder-text">生成中</Text>
                      )}
                    </View>
                    <Text className="detail-action-label">{action.label}</Text>
                  </View>
                ))}
              </View>

              <Text className="detail-actions-title detail-actions-title--custom">自定义动作</Text>
              <View className="detail-custom-row">
                {customActionItems.map((action) => (
                  <View
                    key={action.id}
                    className="detail-action-item detail-action-item--custom"
                    onClick={() => handlePreviewAction(action.imageUrl, action.actionType, true)}
                  >
                    <View className="detail-action-thumb-wrap">
                      <Image className="detail-action-thumb" src={action.imageUrl} mode="aspectFill" />
                    </View>
                    <Text className="detail-action-label">{action.actionType}</Text>
                  </View>
                ))}
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
                  src={require("@/assets/images/pet-type-cat-blue.png")}
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
                  src={require("@/assets/images/pet-type-dog-corgi.png")}
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
                <View className="half-field-input-wrap" onClick={() => setBreedSheetVisible(true)}>
                  <Input
                    className="single-input single-input--half single-input--with-suffix"
                    placeholder="选择品种"
                    value={breed && !isCustomBreed ? breed : ""}
                    disabled
                  />
                  <Text className="half-field-arrow">▼</Text>
                </View>
              </View>
              <View className="half-field">
                <Text className="add-mode-section-title add-mode-section-title--compact">生日</Text>
                <View className="half-field-input-wrap" onClick={handleOpenBirthdaySheet}>
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
              </View>
            </View>

            {isCustomBreed || !breed
              ? renderTextField("自定义品种", breed, setBreed, "请输入品种")
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
            <Text className="submit-btn-text">
              {loading
                ? "保存中..."
                : isAvatarDraftConfirmMode
                  ? "保存修改信息，进入下一步"
                  : isEditFormMode
                    ? "保存信息"
                    : "保存宠物信息，下一步"}
            </Text>
          </View>
        )}
      </View>

      {breedSheetVisible ? (
        <View className="selector-mask" onClick={() => setBreedSheetVisible(false)}>
          <View className="selector-sheet" onClick={(e) => e.stopPropagation?.()}>
            <Text className="selector-sheet-title">选择品种</Text>
            <View className="selector-options">
              {breedOptions.map((item, index) => (
                <View
                  key={item}
                  className={`selector-option ${breed === item ? "selector-option--active" : ""}`}
                  onClick={() => handlePickBreed(index)}
                >
                  <Text className="selector-option-text">{item}</Text>
                </View>
              ))}
            </View>
            <View className="selector-sheet-footer">
              <View className="selector-sheet-btn selector-sheet-btn--ghost" onClick={() => setBreedSheetVisible(false)}>
                <Text className="selector-sheet-btn-text selector-sheet-btn-text--ghost">取消</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {birthdaySheetVisible ? (
        <View className="selector-mask" onClick={() => setBirthdaySheetVisible(false)}>
          <View className="selector-sheet selector-sheet--date" onClick={(e) => e.stopPropagation?.()}>
            <Text className="selector-sheet-title">选择生日</Text>
            <View className="date-picker-row">
              <View className="date-picker-column">
                <Text className="date-picker-label">年份</Text>
                <View className="date-picker-options">
                  {birthYears.map((item) => (
                    <View
                      key={item}
                      className={`date-picker-option ${birthdayDraft.year === item ? "date-picker-option--active" : ""}`}
                      onClick={() => setBirthdayDraft((prev) => ({ ...prev, year: item }))}
                    >
                      <Text className="date-picker-option-text">{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View className="date-picker-column">
                <Text className="date-picker-label">月份</Text>
                <View className="date-picker-options">
                  {birthMonths.map((item) => (
                    <View
                      key={item}
                      className={`date-picker-option ${birthdayDraft.month === item ? "date-picker-option--active" : ""}`}
                      onClick={() => setBirthdayDraft((prev) => ({ ...prev, month: item }))}
                    >
                      <Text className="date-picker-option-text">{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View className="date-picker-column">
                <Text className="date-picker-label">日期</Text>
                <View className="date-picker-options">
                  {birthDays.map((item) => (
                    <View
                      key={item}
                      className={`date-picker-option ${birthdayDraft.day === item ? "date-picker-option--active" : ""}`}
                      onClick={() => setBirthdayDraft((prev) => ({ ...prev, day: item }))}
                    >
                      <Text className="date-picker-option-text">{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
            <View className="selector-sheet-footer selector-sheet-footer--split">
              <View className="selector-sheet-btn selector-sheet-btn--ghost" onClick={() => setBirthdaySheetVisible(false)}>
                <Text className="selector-sheet-btn-text selector-sheet-btn-text--ghost">取消</Text>
              </View>
              <View className="selector-sheet-btn" onClick={handleConfirmBirthday}>
                <Text className="selector-sheet-btn-text">确认</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {nameLockedDialogVisible ? (
        <View className="name-locked-mask" onClick={() => setNameLockedDialogVisible(false)}>
          <View className="name-locked-dialog" onClick={(e) => e.stopPropagation?.()}>
            <View className="name-locked-icon-wrap">
              <View className="name-locked-icon">
                <View className="name-locked-icon-dot name-locked-icon-dot--one" />
                <View className="name-locked-icon-dot name-locked-icon-dot--two" />
                <View className="name-locked-icon-dot name-locked-icon-dot--three" />
                <Text className="name-locked-icon-mark">∞</Text>
              </View>
            </View>
            <Text className="name-locked-title">宠物信息已存在</Text>
            <Text className="name-locked-desc">该宠物信息已建立，名称暂时不可修改。是否要新建一个宠物信息？</Text>
            <View className="name-locked-actions">
              <View className="name-locked-btn name-locked-btn--cancel" onClick={() => setNameLockedDialogVisible(false)}>
                <Text className="name-locked-btn-text name-locked-btn-text--cancel">取消</Text>
              </View>
              <View className="name-locked-btn name-locked-btn--primary" onClick={handleCreateAnotherPet}>
                <Text className="name-locked-btn-text">新建宠物</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
