import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircleFilled,
  DeleteOutlined,
  LoadingOutlined,
  PlusOutlined,
  SaveOutlined,
  SyncOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Empty,
  Image,
  Input,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
  message,
} from "antd";
import {
  ACTION_LABELS,
  ALL_ACTIONS,
  BASIC_ACTIONS,
  FUN_ACTIONS,
  type ActionType,
  type Pet,
  type PetAvatar,
  type PetAvatarAction,
  type Species,
  type User,
} from "shared";
import { api } from "../api/client";

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

type CustomizationStatus = "approved" | "processing" | "done";
type TaskFilter = "all" | CustomizationStatus;
type CustomizationCategory = "basic" | "personalized";
type CategoryFilter = "all" | CustomizationCategory;

type CustomizationPet = Pick<Pet, "id" | "name" | "breed" | "gender" | "birthday" | "weight"> & {
  species: Species | "other" | string | null;
};

type CustomizationAvatar = PetAvatar & {
  pet: CustomizationPet | null;
  user: Pick<User, "id" | "nickname" | "avatarUrl" | "wechatOpenid" | "phone"> | null;
};

type CustomizationAvatarDetail = CustomizationAvatar & {
  actions: PetAvatarAction[];
};

type CustomizationAction = PetAvatarAction & {
  actionType: ActionType;
};

const TASK_STATUSES: CustomizationStatus[] = ["approved", "processing", "done"];

const statusOptions: Array<{ label: string; value: TaskFilter }> = [
  { label: "全部状态", value: "all" },
  { label: "待处理", value: "approved" },
  { label: "进行中", value: "processing" },
  { label: "已完成", value: "done" },
];

const categoryOptions: Array<{ label: string; value: CategoryFilter }> = [
  { label: "全部类型", value: "all" },
  { label: "基本图像", value: "basic" },
  { label: "个性化定制", value: "personalized" },
];

const statusMeta: Record<CustomizationStatus, { label: string; color: string; helper: string }> = {
  approved: { label: "待处理", color: "blue", helper: "有需求未处理" },
  processing: { label: "进行中", color: "orange", helper: "已上传部分动作，尚未全部完成" },
  done: { label: "已完成", color: "green", helper: "全部动作已完成并同步到用户端" },
};

const speciesLabels: Record<string, string> = {
  cat: "猫",
  dog: "狗",
  other: "其他",
};

const genderLabels: Record<string, string> = {
  male: "公",
  female: "母",
  unknown: "未知",
};

function padNumber(value: number) {
  return String(value).padStart(2, "0");
}

function toShanghaiDayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const shanghaiOffsetMs = 8 * 60 * 60 * 1000;
  const shifted = new Date(date.getTime() + shanghaiOffsetMs);
  return `${shifted.getUTCFullYear()}-${padNumber(shifted.getUTCMonth() + 1)}-${padNumber(shifted.getUTCDate())}`;
}

function isTodayInShanghai(value?: string | null) {
  if (!value) {
    return false;
  }

  return toShanghaiDayKey(value) === toShanghaiDayKey(new Date());
}

function enteredCustomizationToday(avatar: CustomizationAvatar) {
  if (!TASK_STATUSES.includes(avatar.status as CustomizationStatus)) {
    return false;
  }

  return isTodayInShanghai(avatar.reviewedAt);
}

function getSpeciesLabel(species?: string | null) {
  if (!species) {
    return "未知";
  }

  return speciesLabels[species] ?? species;
}

function getGenderLabel(gender?: string | null) {
  if (!gender) {
    return "未知";
  }

  return genderLabels[gender] ?? gender;
}

function parseAdditionalImages(value?: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  } catch {
    return [];
  }
}

function resolveCustomizationCategory(avatar: Pick<CustomizationAvatar, "additionalImageUrls">): CustomizationCategory {
  return parseAdditionalImages(avatar.additionalImageUrls).length > 0 ? "personalized" : "basic";
}

function getCategoryMeta(category: CustomizationCategory) {
  return category === "personalized"
    ? { label: "个性化定制", color: "magenta" as const }
    : { label: "基本图像", color: "default" as const };
}

function buildActionMap(actions: PetAvatarAction[]) {
  return actions.reduce<Record<string, CustomizationAction>>((map, action) => {
    map[action.actionType] = action as CustomizationAction;
    return map;
  }, {});
}

function buildPetInfoLine(pet?: CustomizationPet | null) {
  if (!pet) {
    return "未补充宠物基础信息";
  }

  const fields = [
    pet.name ? `昵称 ${pet.name}` : null,
    pet.species ? `品类 ${getSpeciesLabel(pet.species)}` : null,
    pet.breed ? `品种 ${pet.breed}` : null,
    pet.gender ? `性别 ${getGenderLabel(pet.gender)}` : null,
    typeof pet.weight === "number" ? `体重 ${pet.weight}kg` : null,
  ].filter(Boolean);

  return fields.length > 0 ? fields.join(" · ") : "未补充宠物基础信息";
}

function getUserDisplayName(user?: CustomizationAvatar["user"]) {
  return user?.nickname?.trim() || "微信用户";
}

export default function Customization() {
  const [messageApi, contextHolder] = message.useMessage();
  const [avatars, setAvatars] = useState<CustomizationAvatar[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TaskFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const [selectedAvatarDetail, setSelectedAvatarDetail] = useState<CustomizationAvatarDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [uploadingActionType, setUploadingActionType] = useState<ActionType | null>(null);
  const [deletingActionId, setDeletingActionId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [petDescription, setPetDescription] = useState("");
  const [funFact, setFunFact] = useState("");
  const [pendingUploadActionType, setPendingUploadActionType] = useState<ActionType | null>(null);
  const detailRequestRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadAvatars = async () => {
    setLoading(true);

    try {
      const response = await api.getAvatars();
      setAvatars(
        ((response.avatars as CustomizationAvatar[]) ?? []).filter((avatar) =>
          TASK_STATUSES.includes(avatar.status as CustomizationStatus),
        ),
      );
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "定制任务加载失败");
    } finally {
      setLoading(false);
    }
  };

  const loadAvatarDetail = async (avatarId: string, options?: { keepLoading?: boolean }) => {
    const requestId = ++detailRequestRef.current;

    if (!options?.keepLoading) {
      setDetailLoading(true);
    }

    try {
      const response = await api.getAvatar(avatarId);
      const detail = response.avatar as CustomizationAvatarDetail;

      if (detailRequestRef.current === requestId) {
        setSelectedAvatarDetail(detail);
      }

      return detail;
    } catch (error) {
      if (detailRequestRef.current === requestId) {
        setSelectedAvatarDetail(null);
      }

      messageApi.error(error instanceof Error ? error.message : "定制详情加载失败");
      return null;
    } finally {
      if (!options?.keepLoading && detailRequestRef.current === requestId) {
        setDetailLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadAvatars();
  }, []);

  const filteredAvatars = useMemo(() => {
    return avatars.filter((avatar) => {
      const matchesStatus = statusFilter === "all" || avatar.status === statusFilter;
      const category = resolveCustomizationCategory(avatar);
      const matchesCategory = categoryFilter === "all" || category === categoryFilter;
      return matchesStatus && matchesCategory;
    });
  }, [avatars, statusFilter, categoryFilter]);

  const pendingCount = useMemo(
    () => avatars.filter((avatar) => avatar.status === "approved").length,
    [avatars],
  );

  const totalDoneCount = useMemo(
    () => avatars.filter((avatar) => avatar.status === "done").length,
    [avatars],
  );

  const todayNewCount = useMemo(
    () => avatars.filter((avatar) => enteredCustomizationToday(avatar)).length,
    [avatars],
  );

  useEffect(() => {
    if (filteredAvatars.length === 0) {
      setSelectedAvatarId(null);
      setSelectedAvatarDetail(null);
      return;
    }

    if (!selectedAvatarId || !filteredAvatars.some((avatar) => avatar.id === selectedAvatarId)) {
      setSelectedAvatarId(filteredAvatars[0].id);
    }
  }, [filteredAvatars, selectedAvatarId]);

  useEffect(() => {
    if (!selectedAvatarId) {
      setSelectedAvatarDetail(null);
      return;
    }

    void loadAvatarDetail(selectedAvatarId);
  }, [selectedAvatarId]);

  const selectedAvatarSummary = useMemo(
    () => avatars.find((avatar) => avatar.id === selectedAvatarId) ?? null,
    [avatars, selectedAvatarId],
  );

  useEffect(() => {
    const source = selectedAvatarDetail ?? selectedAvatarSummary;
    setPetDescription(source?.petDescription ?? "");
    setFunFact(source?.funFact ?? "");
  }, [selectedAvatarDetail, selectedAvatarSummary]);

  const actionMap = useMemo(
    () => buildActionMap(selectedAvatarDetail?.actions ?? []),
    [selectedAvatarDetail?.actions],
  );

  const completedActionCount = Object.keys(actionMap).length;
  const completionPercent = Math.round((completedActionCount / ALL_ACTIONS.length) * 100);
  const canEditActions = selectedAvatarDetail?.status === "approved" || selectedAvatarDetail?.status === "processing";
  const canSync = !!selectedAvatarDetail && completedActionCount === ALL_ACTIONS.length && selectedAvatarDetail.status !== "done";
  const selectedCategory = resolveCustomizationCategory(selectedAvatarDetail ?? selectedAvatarSummary ?? { additionalImageUrls: null });
  const selectedCategoryMeta = getCategoryMeta(selectedCategory);
  const referenceImages = parseAdditionalImages(selectedAvatarDetail?.additionalImageUrls ?? selectedAvatarSummary?.additionalImageUrls ?? null);

  const refreshCurrentAvatar = async (avatarId: string) => {
    await Promise.all([loadAvatars(), loadAvatarDetail(avatarId, { keepLoading: true })]);
  };

  const handleTriggerUpload = (actionType: ActionType) => {
    if (!canEditActions) {
      return;
    }

    setPendingUploadActionType(actionType);
    fileInputRef.current?.click();
  };

  const handleUploadFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const actionType = pendingUploadActionType;
    event.target.value = "";

    if (!file || !actionType || !selectedAvatarDetail) {
      return;
    }

    setUploadingActionType(actionType);

    try {
      const uploadRes = await api.uploadAdminImage(file);
      await api.createAvatarAction(selectedAvatarDetail.id, {
        actionType,
        imageUrl: uploadRes.url,
      });
      messageApi.success(`${ACTION_LABELS[actionType] ?? actionType} 已上传`);
      await refreshCurrentAvatar(selectedAvatarDetail.id);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "动作素材上传失败");
    } finally {
      setUploadingActionType(null);
      setPendingUploadActionType(null);
    }
  };

  const handleDeleteAction = async (action: CustomizationAction) => {
    if (!selectedAvatarDetail) {
      return;
    }

    setDeletingActionId(action.id);

    try {
      await api.deleteAvatarAction(selectedAvatarDetail.id, action.id);
      messageApi.success("动作素材已删除");
      await refreshCurrentAvatar(selectedAvatarDetail.id);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "动作素材删除失败");
    } finally {
      setDeletingActionId(null);
    }
  };

  const handleSaveMeta = async () => {
    if (!selectedAvatarSummary) {
      return;
    }

    setSavingMeta(true);

    try {
      await api.updateAvatarMeta(selectedAvatarSummary.id, {
        petDescription,
        funFact,
      });
      messageApi.success("描述信息已保存");
      await refreshCurrentAvatar(selectedAvatarSummary.id);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "描述保存失败");
    } finally {
      setSavingMeta(false);
    }
  };

  const handleSyncAvatar = async () => {
    if (!selectedAvatarDetail) {
      return;
    }

    setSyncing(true);

    try {
      await api.syncAvatar(selectedAvatarDetail.id);
      messageApi.success("定制图像与描述已同步到用户端");
      await refreshCurrentAvatar(selectedAvatarDetail.id);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "同步失败");
    } finally {
      setSyncing(false);
    }
  };

  const renderActionGrid = (title: string, actions: readonly ActionType[]) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Text strong style={{ fontSize: 16 }}>
          {title}
        </Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          系统预置动作位，未上传显示 +，上传成功显示 ✓
        </Text>
      </div>
      <Row gutter={[14, 14]}>
        {actions.map((actionType) => {
          const action = actionMap[actionType];
          const isUploading = uploadingActionType === actionType;
          const isDeleting = deletingActionId === action?.id;

          return (
            <Col key={actionType} xs={24} sm={12} xl={8} xxl={6}>
              <Card
                hoverable={canEditActions}
                bodyStyle={{ padding: 14 }}
                style={{
                  borderRadius: 16,
                  borderColor: action ? "#b7eb8f" : "#e8e8e8",
                  boxShadow: action ? "0 8px 22px rgba(82, 196, 26, 0.08)" : "0 6px 18px rgba(15, 23, 42, 0.05)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <Text strong style={{ fontSize: 15 }}>
                      {ACTION_LABELS[actionType] ?? actionType}
                    </Text>
                    {isUploading ? (
                      <LoadingOutlined style={{ color: "#1677ff", fontSize: 16 }} />
                    ) : action ? (
                      <CheckCircleFilled style={{ color: "#52c41a", fontSize: 18 }} />
                    ) : (
                      <PlusOutlined style={{ color: "#bfbfbf", fontSize: 16 }} />
                    )}
                  </div>

                  {action ? (
                    <Image
                      src={action.imageUrl}
                      alt={ACTION_LABELS[actionType] ?? actionType}
                      height={120}
                      style={{ width: "100%", objectFit: "cover", borderRadius: 12 }}
                    />
                  ) : (
                    <div
                      style={{
                        height: 120,
                        borderRadius: 12,
                        border: "1px dashed #d9d9d9",
                        background: "linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#8c8c8c",
                        gap: 10,
                      }}
                    >
                      <PlusOutlined style={{ fontSize: 22 }} />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        点击从本地上传
                      </Text>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8 }}>
                    <Button
                      type={action ? "default" : "primary"}
                      icon={<UploadOutlined />}
                      loading={isUploading}
                      disabled={!canEditActions}
                      onClick={() => handleTriggerUpload(actionType)}
                    >
                      {action ? "重新上传" : "上传"}
                    </Button>
                    {action ? (
                      <Button
                        danger
                        icon={<DeleteOutlined />}
                        loading={isDeleting}
                        disabled={!canEditActions}
                        onClick={() => void handleDeleteAction(action)}
                      >
                        删除
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            </Col>
          );
        })}
      </Row>
    </div>
  );

  return (
    <>
      {contextHolder}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: "none" }}
        onChange={(event) => void handleUploadFileChange(event)}
      />
      <Spin spinning={loading} size="large">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Card bordered={false} style={{ borderRadius: 18 }}>
                <Statistic title="待处理累计" value={pendingCount} valueStyle={{ color: "#1677ff" }} />
                <Text type="secondary">审核通过后进入定制流程</Text>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card bordered={false} style={{ borderRadius: 18 }}>
                <Statistic title="已完成累计" value={totalDoneCount} valueStyle={{ color: "#52c41a" }} />
                <Text type="secondary">完成全部动作并同步成功</Text>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card bordered={false} style={{ borderRadius: 18 }}>
                <Statistic title="今日新增定制数" value={todayNewCount} valueStyle={{ color: "#fa8c16" }} />
                <Text type="secondary">按进入定制池时间统计</Text>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} align="stretch">
            <Col xs={24} lg={9}>
              <Card
                title="宠物-用户-定制任务"
                bordered={false}
                style={{ borderRadius: 20 }}
                extra={(
                  <Space wrap size={8} style={{ justifyContent: "flex-end" }}>
                    <Select
                      value={categoryFilter}
                      onChange={(value) => setCategoryFilter(value)}
                      options={categoryOptions}
                      style={{ width: 146 }}
                    />
                    <Select
                      value={statusFilter}
                      onChange={(value) => setStatusFilter(value)}
                      options={statusOptions}
                      style={{ width: 132 }}
                    />
                  </Space>
                )}
                styles={{ body: { padding: 16 } }}
              >
                {filteredAvatars.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "calc(100vh - 276px)", overflowY: "auto", paddingRight: 4 }}>
                    {filteredAvatars.map((avatar) => {
                      const status = statusMeta[avatar.status as CustomizationStatus];
                      const category = resolveCustomizationCategory(avatar);
                      const categoryMeta = getCategoryMeta(category);
                      const isSelected = avatar.id === selectedAvatarId;
                      const referenceCount = parseAdditionalImages(avatar.additionalImageUrls).length;

                      return (
                        <Card
                          key={avatar.id}
                          hoverable
                          onClick={() => setSelectedAvatarId(avatar.id)}
                          bodyStyle={{ padding: 14 }}
                          style={{
                            cursor: "pointer",
                            borderRadius: 18,
                            borderColor: isSelected ? "#1677ff" : "#f0f0f0",
                            boxShadow: isSelected ? "0 0 0 3px rgba(22,119,255,0.12)" : "0 8px 24px rgba(15, 23, 42, 0.04)",
                            background: isSelected ? "linear-gradient(180deg, #f6fbff 0%, #ffffff 100%)" : "#fff",
                          }}
                        >
                          <div style={{ display: "flex", gap: 14 }}>
                            <Image
                              src={avatar.sourceImageUrl}
                              alt={avatar.pet?.name ?? "宠物原图"}
                              width={88}
                              height={88}
                              preview={false}
                              style={{ objectFit: "cover", borderRadius: 14, flexShrink: 0 }}
                            />

                            <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 16, fontWeight: 700, color: "#262626", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {getUserDisplayName(avatar.user)}
                                  </div>
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    ID：{avatar.user?.id ?? "-"}
                                  </Text>
                                </div>

                                <Space size={[6, 6]} wrap style={{ justifyContent: "flex-end" }}>
                                  <Tag color={categoryMeta.color}>{categoryMeta.label}</Tag>
                                  <Tag color={status.color}>{status.label}</Tag>
                                </Space>
                              </div>

                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                <Text strong>{avatar.pet?.name ?? "未命名宠物"}</Text>
                                <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.6 }}>
                                  {buildPetInfoLine(avatar.pet)}
                                </Text>
                              </div>

                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  原图 1 张{referenceCount > 0 ? ` · 参考图 ${referenceCount} 张` : ""}
                                </Text>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  {status.helper}
                                </Text>
                              </div>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <Empty description="暂无符合筛选条件的定制任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </Card>
            </Col>

            <Col xs={24} lg={15}>
              {!selectedAvatarId || !selectedAvatarSummary ? (
                <Card bordered={false} style={{ minHeight: 560, borderRadius: 20 }}>
                  <Empty description="请选择左侧任务，查看该宠物的定制进度和内容分类" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                </Card>
              ) : (
                <Spin spinning={detailLoading}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <Card bordered={false} style={{ borderRadius: 20 }} styles={{ body: { padding: 20 } }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                        <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
                          <Image.PreviewGroup>
                            <Image
                              src={selectedAvatarDetail?.sourceImageUrl ?? selectedAvatarSummary.sourceImageUrl}
                              alt={selectedAvatarDetail?.pet?.name ?? selectedAvatarSummary.pet?.name ?? "宠物原图"}
                              width={140}
                              height={140}
                              style={{ objectFit: "cover", borderRadius: 18 }}
                            />
                            {referenceImages.map((url) => (
                              <Image
                                key={url}
                                src={url}
                                alt="个性化参考图"
                                width={0}
                                height={0}
                                style={{ display: "none" }}
                              />
                            ))}
                          </Image.PreviewGroup>

                          <div style={{ minWidth: 260, flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                              <Text strong style={{ fontSize: 24 }}>
                                {selectedAvatarDetail?.pet?.name ?? selectedAvatarSummary.pet?.name ?? "未命名宠物"}
                              </Text>
                              <Space wrap>
                                <Tag color={selectedCategoryMeta.color}>{selectedCategoryMeta.label}</Tag>
                                <Tag color={statusMeta[(selectedAvatarDetail?.status ?? selectedAvatarSummary.status) as CustomizationStatus]?.color}>
                                  {statusMeta[(selectedAvatarDetail?.status ?? selectedAvatarSummary.status) as CustomizationStatus]?.label}
                                </Tag>
                              </Space>
                            </div>

                            <Text type="secondary">微信用户：{getUserDisplayName(selectedAvatarDetail?.user ?? selectedAvatarSummary.user)}</Text>
                            <Text type="secondary">用户 ID：{selectedAvatarDetail?.user?.id ?? selectedAvatarSummary.user?.id ?? "-"}</Text>
                            <Text type="secondary">宠物信息：{buildPetInfoLine(selectedAvatarDetail?.pet ?? selectedAvatarSummary.pet)}</Text>
                            <Text type="secondary">
                              内容分类：{selectedCategoryMeta.label}
                              {referenceImages.length > 0 ? ` · 额外参考图 ${referenceImages.length} 张` : ""}
                            </Text>

                            <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 8 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                                <Text strong>宠物定制进度</Text>
                                <Text type="secondary">
                                  {completedActionCount}/{ALL_ACTIONS.length} 已完成
                                </Text>
                              </div>
                              <Progress percent={completionPercent} strokeColor="#52c41a" />
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {statusMeta[(selectedAvatarDetail?.status ?? selectedAvatarSummary.status) as CustomizationStatus]?.helper}
                              </Text>
                            </div>
                          </div>
                        </div>

                        {referenceImages.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <Text strong>个性化参考图</Text>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                              {referenceImages.map((url) => (
                                <Image
                                  key={url}
                                  src={url}
                                  alt="个性化参考图"
                                  width={84}
                                  height={84}
                                  style={{ objectFit: "cover", borderRadius: 12 }}
                                />
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </Card>

                    <Card bordered={false} style={{ borderRadius: 20 }} styles={{ body: { padding: 20 } }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                          <Text strong style={{ fontSize: 16 }}>
                            宠物定制描述
                          </Text>
                          <Button
                            type="primary"
                            icon={<SaveOutlined />}
                            loading={savingMeta}
                            onClick={() => void handleSaveMeta()}
                          >
                            保存描述
                          </Button>
                        </div>

                        <Row gutter={[16, 16]}>
                          <Col xs={24} xl={14}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              <Text strong>宠物描述</Text>
                              <TextArea
                                rows={4}
                                maxLength={300}
                                placeholder="可填写该宠物的性格、外观特点、拟人化描述，供定制完成后同步给用户端。"
                                value={petDescription}
                                onChange={(event) => setPetDescription(event.target.value)}
                              />
                            </div>
                          </Col>
                          <Col xs={24} xl={10}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              <Text strong>趣味小点</Text>
                              <TextArea
                                rows={4}
                                maxLength={120}
                                placeholder="例如：最爱晒太阳、跑两步就想躺、听到开罐头会立刻冲来。"
                                value={funFact}
                                onChange={(event) => setFunFact(event.target.value)}
                              />
                            </div>
                          </Col>
                        </Row>
                      </div>
                    </Card>

                    <Card bordered={false} style={{ borderRadius: 20 }} styles={{ body: { padding: 20 } }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                        {renderActionGrid("基础动作", BASIC_ACTIONS)}
                        {renderActionGrid("趣味动作", FUN_ACTIONS)}
                      </div>
                    </Card>

                    <Card bordered={false} style={{ borderRadius: 20 }} styles={{ body: { padding: 20 } }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <Text strong>同步到用户端</Text>
                          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                            需要 14 个动作全部上传完成后才可同步。同步后任务状态变为“已完成”，图像与描述会一起进入用户端。
                          </Paragraph>
                        </div>

                        <Button
                          type="primary"
                          size="large"
                          icon={<SyncOutlined />}
                          disabled={!canSync}
                          loading={syncing}
                          onClick={() => void handleSyncAvatar()}
                        >
                          {selectedAvatarDetail?.status === "done" ? "已同步" : "完成定制并同步"}
                        </Button>
                      </div>
                      {!canSync && selectedAvatarDetail?.status !== "done" ? (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          当前还差 {ALL_ACTIONS.length - completedActionCount} 个动作未完成
                        </Text>
                      ) : null}
                      {selectedAvatarDetail?.status === "done" ? (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          当前任务已完成同步
                        </Text>
                      ) : null}
                    </Card>
                  </div>
                </Spin>
              )}
            </Col>
          </Row>
        </div>
      </Spin>
    </>
  );
}
