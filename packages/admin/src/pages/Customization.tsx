import { useEffect, useMemo, useRef, useState } from "react";
import { CheckOutlined, DeleteOutlined, SyncOutlined, UploadOutlined } from "@ant-design/icons";
import {
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Image,
  Input,
  Modal,
  Row,
  Select,
  Spin,
  Statistic,
  Tag,
  message,
} from "antd";
import {
  ACTION_LABELS,
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

type CustomizationStatus = "approved" | "processing" | "done";
type TaskFilter = "all" | CustomizationStatus;

type CustomizationAvatar = PetAvatar & {
  pet: (Pick<Pet, "id" | "name"> & {
    species: Species | "other" | string | null;
  }) | null;
  user: Pick<User, "id" | "nickname" | "avatarUrl" | "wechatOpenid" | "phone"> | null;
};

type CustomizationAvatarDetail = CustomizationAvatar & {
  actions: PetAvatarAction[];
};

type CustomizationAction = PetAvatarAction & {
  actionType: ActionType;
};

const TASK_STATUSES: CustomizationStatus[] = ["approved", "processing", "done"];

const filterOptions: Array<{ label: string; value: TaskFilter }> = [
  { label: "全部", value: "all" },
  { label: "待定制", value: "approved" },
  { label: "进行中", value: "processing" },
  { label: "已完成", value: "done" },
];

const statusMeta: Record<CustomizationStatus, { label: string; color: string }> = {
  approved: { label: "待定制", color: "blue" },
  processing: { label: "进行中", color: "orange" },
  done: { label: "已完成", color: "green" },
};

const speciesLabels: Record<string, string> = {
  cat: "猫",
  dog: "狗",
  other: "其他",
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

function getSpeciesLabel(species?: string | null) {
  if (!species) {
    return "未知";
  }

  return speciesLabels[species] ?? species;
}

function buildActionMap(actions: PetAvatarAction[]) {
  return actions.reduce<Record<string, CustomizationAction>>((map, action) => {
    map[action.actionType] = action as CustomizationAction;
    return map;
  }, {});
}

export default function Customization() {
  const [messageApi, contextHolder] = message.useMessage();
  const [avatars, setAvatars] = useState<CustomizationAvatar[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const [selectedAvatarDetail, setSelectedAvatarDetail] = useState<CustomizationAvatarDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadActionType, setUploadActionType] = useState<ActionType | null>(null);
  const [uploadImageUrl, setUploadImageUrl] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);
  const [deletingActionId, setDeletingActionId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const detailRequestRef = useRef(0);

  const loadAvatars = async () => {
    setLoading(true);

    try {
      const response = await api.getAvatars();
      setAvatars(((response.avatars as CustomizationAvatar[]) ?? []).filter((avatar) => TASK_STATUSES.includes(avatar.status as CustomizationStatus)));
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
    if (filter === "all") {
      return avatars;
    }

    return avatars.filter((avatar) => avatar.status === filter);
  }, [avatars, filter]);

  const totalDoneCount = useMemo(
    () => avatars.filter((avatar) => avatar.status === "done").length,
    [avatars],
  );

  const todayNewApprovedCount = useMemo(
    () => avatars.filter((avatar) => avatar.status === "approved" && isTodayInShanghai(avatar.createdAt)).length,
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

  const actionMap = useMemo(
    () => buildActionMap(selectedAvatarDetail?.actions ?? []),
    [selectedAvatarDetail?.actions],
  );

  const completedActionCount = selectedAvatarDetail?.actions.length ?? 0;
  const canEditActions = selectedAvatarDetail?.status === "approved" || selectedAvatarDetail?.status === "processing";
  const canSync = !!selectedAvatarDetail && completedActionCount > 0 && selectedAvatarDetail.status !== "done";

  const refreshCurrentAvatar = async (avatarId: string) => {
    await Promise.all([loadAvatars(), loadAvatarDetail(avatarId, { keepLoading: true })]);
  };

  const handleOpenUploadModal = (actionType: ActionType) => {
    setUploadActionType(actionType);
    setUploadImageUrl("");
    setUploadModalOpen(true);
  };

  const handleCloseUploadModal = () => {
    setUploadModalOpen(false);
    setUploadActionType(null);
    setUploadImageUrl("");
  };

  const handleSubmitAction = async () => {
    if (!selectedAvatarDetail || !uploadActionType) {
      return;
    }

    const imageUrl = uploadImageUrl.trim();
    if (!imageUrl) {
      messageApi.warning("请输入图片 URL");
      return;
    }

    setSubmittingAction(true);

    try {
      await api.createAvatarAction(selectedAvatarDetail.id, {
        actionType: uploadActionType,
        imageUrl,
      });
      messageApi.success("动作素材已上传");
      handleCloseUploadModal();
      await refreshCurrentAvatar(selectedAvatarDetail.id);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "动作素材上传失败");
    } finally {
      setSubmittingAction(false);
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

  const handleSyncAvatar = async () => {
    if (!selectedAvatarDetail) {
      return;
    }

    setSyncing(true);

    try {
      await api.syncAvatar(selectedAvatarDetail.id);
      messageApi.success("已同步到用户端");
      await refreshCurrentAvatar(selectedAvatarDetail.id);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "同步失败");
    } finally {
      setSyncing(false);
    }
  };

  const renderActionGrid = (title: string, actions: readonly ActionType[]) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
      <Row gutter={[16, 16]}>
        {actions.map((actionType) => {
          const action = actionMap[actionType];
          const isDeleting = deletingActionId === action?.id;

          return (
            <Col key={actionType} xs={12} sm={8} xl={6} xxl={4}>
              <Badge
                count={action ? "✓" : 0}
                showZero={false}
                offset={[-10, 10]}
                style={{ backgroundColor: "#52c41a", boxShadow: "none" }}
              >
                <Card
                  size="small"
                  styles={{
                    body: {
                      minHeight: 120,
                      height: 120,
                      padding: 12,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    },
                  }}
                >
                  {action ? (
                    <>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#262626",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {ACTION_LABELS[actionType] ?? actionType}
                        </div>
                        <CheckOutlined style={{ color: "#52c41a" }} />
                      </div>
                      <Image
                        src={action.imageUrl}
                        alt={ACTION_LABELS[actionType] ?? actionType}
                        width="100%"
                        height={58}
                        style={{ objectFit: "cover", borderRadius: 8 }}
                      />
                      <Button
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        disabled={!canEditActions}
                        loading={isDeleting}
                        onClick={() => void handleDeleteAction(action)}
                      >
                        删除
                      </Button>
                    </>
                  ) : (
                    <>
                      <div
                        style={{
                          minHeight: 44,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          textAlign: "center",
                          fontSize: 14,
                          fontWeight: 600,
                          color: "#262626",
                        }}
                      >
                        {ACTION_LABELS[actionType] ?? actionType}
                      </div>
                      <div
                        style={{
                          flex: 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#8c8c8c",
                          fontSize: 12,
                        }}
                      >
                        暂未上传
                      </div>
                      <Button
                        type="primary"
                        size="small"
                        icon={<UploadOutlined />}
                        disabled={!canEditActions}
                        onClick={() => handleOpenUploadModal(actionType)}
                      >
                        上传
                      </Button>
                    </>
                  )}
                </Card>
              </Badge>
            </Col>
          );
        })}
      </Row>
    </div>
  );

  return (
    <>
      {contextHolder}
      <Spin spinning={loading} size="large">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Card>
                <Statistic title="累计定制总量" value={totalDoneCount} valueStyle={{ color: "#52c41a" }} />
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card>
                <Statistic title="今日新增待定制数" value={todayNewApprovedCount} valueStyle={{ color: "#1677ff" }} />
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} align="stretch">
            <Col xs={24} lg={8}>
              <Card
                title="任务列表"
                extra={
                  <Select
                    value={filter}
                    onChange={(value) => setFilter(value)}
                    options={filterOptions}
                    style={{ width: 160 }}
                  />
                }
                styles={{ body: { padding: 16 } }}
              >
                {filteredAvatars.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "calc(100vh - 280px)", overflowY: "auto", paddingRight: 4 }}>
                    {filteredAvatars.map((avatar) => {
                      const status = statusMeta[avatar.status as CustomizationStatus];
                      const isSelected = avatar.id === selectedAvatarId;

                      return (
                        <Card
                          key={avatar.id}
                          hoverable
                          onClick={() => setSelectedAvatarId(avatar.id)}
                          style={{
                            borderColor: isSelected ? "#1677ff" : "#f0f0f0",
                            boxShadow: isSelected ? "0 0 0 2px rgba(22,119,255,0.12)" : "none",
                            cursor: "pointer",
                          }}
                          styles={{ body: { padding: 16 } }}
                        >
                          <div style={{ display: "flex", gap: 12 }}>
                            <Image
                              src={avatar.sourceImageUrl}
                              alt={avatar.pet?.name ?? "宠物原图"}
                              width={64}
                              height={64}
                              preview={false}
                              style={{ objectFit: "cover", borderRadius: 8 }}
                            />
                            <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                              <div
                                style={{
                                  fontSize: 16,
                                  fontWeight: 600,
                                  color: "#262626",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {avatar.user?.nickname ?? "未知用户"}
                              </div>
                              <div
                                style={{
                                  fontSize: 14,
                                  color: "#595959",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {avatar.pet?.name ?? "未命名宠物"}
                              </div>
                              <div>
                                <Tag color={status?.color}>{status?.label ?? avatar.status}</Tag>
                              </div>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <Empty description="暂无定制任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </Card>
            </Col>

            <Col xs={24} lg={16}>
              {!selectedAvatarId || !selectedAvatarSummary ? (
                <Card style={{ minHeight: 520 }}>
                  <Empty description="请选择左侧任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                </Card>
              ) : (
                <Spin spinning={detailLoading}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <Card title="工作区" styles={{ body: { padding: 16 } }}>
                      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                        <Image
                          src={selectedAvatarDetail?.sourceImageUrl ?? selectedAvatarSummary.sourceImageUrl}
                          alt={selectedAvatarDetail?.pet?.name ?? selectedAvatarSummary.pet?.name ?? "宠物原图"}
                          width={96}
                          height={96}
                          preview={false}
                          style={{ objectFit: "cover", borderRadius: 12 }}
                        />
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ fontSize: 22, fontWeight: 700, color: "#262626" }}>
                            {selectedAvatarDetail?.pet?.name ?? selectedAvatarSummary.pet?.name ?? "未命名宠物"}
                          </div>
                          <div style={{ fontSize: 14, color: "#595959" }}>
                            类型：{getSpeciesLabel(selectedAvatarDetail?.pet?.species ?? selectedAvatarSummary.pet?.species)}
                          </div>
                          <div style={{ fontSize: 14, color: "#595959" }}>
                            所属用户：{selectedAvatarDetail?.user?.nickname ?? selectedAvatarSummary.user?.nickname ?? "未知用户"}
                          </div>
                          <div>
                            <Tag color={statusMeta[(selectedAvatarDetail?.status ?? selectedAvatarSummary.status) as CustomizationStatus]?.color}>
                              {statusMeta[(selectedAvatarDetail?.status ?? selectedAvatarSummary.status) as CustomizationStatus]?.label ??
                                (selectedAvatarDetail?.status ?? selectedAvatarSummary.status)}
                            </Tag>
                            <Tag color="default">{completedActionCount}/14 已上传</Tag>
                          </div>
                        </div>
                      </div>
                    </Card>

                    <Card styles={{ body: { padding: 16 } }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                        {renderActionGrid("基础动作", BASIC_ACTIONS)}
                        {renderActionGrid("趣味动作", FUN_ACTIONS)}
                      </div>
                    </Card>

                    <Card styles={{ body: { padding: 16 } }}>
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <Button
                          type="primary"
                          size="large"
                          icon={<SyncOutlined />}
                          disabled={!canSync}
                          loading={syncing}
                          onClick={() => void handleSyncAvatar()}
                        >
                          {selectedAvatarDetail?.status === "done" ? "已同步" : "一键同步"}
                        </Button>
                      </div>
                    </Card>
                  </div>
                </Spin>
              )}
            </Col>
          </Row>
        </div>
      </Spin>

      <Modal
        title={uploadActionType ? `上传${ACTION_LABELS[uploadActionType] ?? uploadActionType}` : "上传动作素材"}
        open={uploadModalOpen}
        onOk={() => void handleSubmitAction()}
        okText="确认"
        cancelText="取消"
        confirmLoading={submittingAction}
        onCancel={handleCloseUploadModal}
        destroyOnClose
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Input
            placeholder="请输入图片 URL"
            value={uploadImageUrl}
            onChange={(event) => setUploadImageUrl(event.target.value)}
          />

          {uploadImageUrl.trim() ? (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Image
                src={uploadImageUrl.trim()}
                alt={uploadActionType ? ACTION_LABELS[uploadActionType] ?? uploadActionType : "动作预览"}
                width={240}
                height={240}
                style={{ objectFit: "cover", borderRadius: 12 }}
              />
            </div>
          ) : (
            <Empty description="输入图片 URL 后可预览" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </div>
      </Modal>
    </>
  );
}
