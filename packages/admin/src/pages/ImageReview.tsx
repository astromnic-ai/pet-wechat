import { useEffect, useMemo, useState } from "react";
import { CheckOutlined, CloseOutlined, DownloadOutlined, ReloadOutlined, SyncOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Empty,
  Image,
  Input,
  Row,
  Space,
  Spin,
  Statistic,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import type { AvatarStatus, PetAvatar, Species, User } from "shared";
import type { Pet, PetAvatarAction } from "shared";
import { api } from "../api/client";

const { Text, Title } = Typography;
const { TextArea } = Input;

const reviewTabs = ["all", "pending", "rejected", "approved"] as const;

type ReviewTabKey = (typeof reviewTabs)[number];

type ReviewAvatar = PetAvatar & {
  pet:
    | (Pick<Pet, "id" | "name"> & {
        species: Species | "other" | string | null;
      })
    | null;
  user: Pick<User, "id" | "nickname" | "avatarUrl" | "wechatOpenid" | "phone"> | null;
};

type ReviewAvatarDetail = ReviewAvatar & {
  actions: PetAvatarAction[];
};

const speciesLabels: Record<string, string> = {
  cat: "猫",
  dog: "狗",
  other: "其他",
};

const statusMeta: Record<
  AvatarStatus,
  {
    label: string;
    color: string;
  }
> = {
  pending: { label: "待审核", color: "gold" },
  approved: { label: "已通过", color: "green" },
  rejected: { label: "已拒绝", color: "red" },
  failed: { label: "已失败", color: "default" },
  processing: { label: "定制中", color: "processing" },
  done: { label: "已同步", color: "blue" },
};

function isSameDay(value: string | null | undefined, date: Dayjs) {
  return !!value && dayjs(value).isValid() && dayjs(value).isSame(date, "day");
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("YYYY-MM-DD HH:mm") : "-";
}

function getSpeciesLabel(species?: string | null) {
  if (!species) {
    return "未知";
  }

  return speciesLabels[species] ?? species;
}

function openImageDownload(imageUrl: string, fallbackName: string) {
  const link = document.createElement("a");
  link.href = imageUrl;
  link.download = fallbackName;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function formatDeltaText(delta: number, positiveLabel = "较昨日增加", negativeLabel = "较昨日减少") {
  if (delta === 0) {
    return "较昨日持平";
  }

  return `${delta > 0 ? positiveLabel : negativeLabel} ${Math.abs(delta)}`;
}

function formatRate(value: number) {
  return `${Math.round(value * 100)}%`;
}

function getCompletionRate(completed: number, pending: number) {
  const total = completed + pending;
  if (total === 0) {
    return 0;
  }

  return completed / total;
}

function getStatusLabel(status: AvatarStatus) {
  return statusMeta[status].label;
}

function toReviewAvatarSummary(avatar: ReviewAvatarDetail): ReviewAvatar {
  const { actions: _actions, ...summary } = avatar;
  return summary;
}

function buildMockImageUrl(title: string, accent: string, subtitle: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0.92" />
          <stop offset="100%" stop-color="#fff1f0" stop-opacity="1" />
        </linearGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#bg)" />
      <circle cx="920" cy="180" r="120" fill="#ffffff" fill-opacity="0.25" />
      <circle cx="260" cy="650" r="180" fill="#ffffff" fill-opacity="0.2" />
      <rect x="120" y="120" width="960" height="560" rx="40" fill="#ffffff" fill-opacity="0.72" />
      <text x="160" y="300" font-size="80" font-family="Arial, sans-serif" font-weight="700" fill="#1f1f1f">${title}</text>
      <text x="160" y="390" font-size="40" font-family="Arial, sans-serif" fill="#434343">${subtitle}</text>
      <text x="160" y="500" font-size="28" font-family="Arial, sans-serif" fill="#595959">Image Review Demo</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createMockAvatarDetails(): ReviewAvatarDetail[] {
  return [
    {
      id: "mock-avatar-pending-1",
      petId: "mock-pet-1",
      sourceImageUrl: buildMockImageUrl("奶油布丁", "#ffd666", "待审核 · 猫咪上传图"),
      status: "pending",
      rejectReason: null,
      reviewedAt: null,
      createdAt: dayjs().subtract(25, "minute").toISOString(),
      pet: {
        id: "mock-pet-1",
        name: "奶油布丁",
        species: "cat",
      },
      user: {
        id: "mock-user-1",
        nickname: "Luna",
        avatarUrl: null,
        wechatOpenid: "mock-openid-1",
        phone: "13800000001",
      },
      actions: [],
    },
    {
      id: "mock-avatar-pending-2",
      petId: "mock-pet-2",
      sourceImageUrl: buildMockImageUrl("栗子", "#95de64", "待审核 · 狗狗上传图"),
      status: "pending",
      rejectReason: null,
      reviewedAt: null,
      createdAt: dayjs().subtract(2, "hour").toISOString(),
      pet: {
        id: "mock-pet-2",
        name: "栗子",
        species: "dog",
      },
      user: {
        id: "mock-user-2",
        nickname: "Milo",
        avatarUrl: null,
        wechatOpenid: "mock-openid-2",
        phone: "13800000002",
      },
      actions: [],
    },
    {
      id: "mock-avatar-rejected-1",
      petId: "mock-pet-3",
      sourceImageUrl: buildMockImageUrl("雪团", "#ff7875", "已拒绝 · 图片不清晰"),
      status: "rejected",
      rejectReason: "图片不够清晰，宠物面部被遮挡，建议重新上传正面照片。",
      reviewedAt: dayjs().subtract(1, "hour").toISOString(),
      createdAt: dayjs().subtract(4, "hour").toISOString(),
      pet: {
        id: "mock-pet-3",
        name: "雪团",
        species: "cat",
      },
      user: {
        id: "mock-user-3",
        nickname: "Coco",
        avatarUrl: null,
        wechatOpenid: "mock-openid-3",
        phone: "13800000003",
      },
      actions: [],
    },
    {
      id: "mock-avatar-approved-1",
      petId: "mock-pet-4",
      sourceImageUrl: buildMockImageUrl("可颂", "#69b1ff", "已通过 · 待进入定制"),
      status: "approved",
      rejectReason: null,
      reviewedAt: dayjs().subtract(3, "hour").toISOString(),
      createdAt: dayjs().subtract(7, "hour").toISOString(),
      pet: {
        id: "mock-pet-4",
        name: "可颂",
        species: "dog",
      },
      user: {
        id: "mock-user-4",
        nickname: "Cookie",
        avatarUrl: null,
        wechatOpenid: "mock-openid-4",
        phone: "13800000004",
      },
      actions: [
        {
          id: "mock-action-1",
          petAvatarId: "mock-avatar-approved-1",
          actionType: "sit",
          imageUrl: buildMockImageUrl("可颂动作素材", "#91caff", "sit"),
          sortOrder: 0,
        },
      ],
    },
    {
      id: "mock-avatar-done-1",
      petId: "mock-pet-5",
      sourceImageUrl: buildMockImageUrl("团子", "#b37feb", "已同步 · 客户端已完成"),
      status: "done",
      rejectReason: null,
      reviewedAt: dayjs().subtract(1, "day").add(2, "hour").toISOString(),
      createdAt: dayjs().subtract(1, "day").toISOString(),
      pet: {
        id: "mock-pet-5",
        name: "团子",
        species: "cat",
      },
      user: {
        id: "mock-user-5",
        nickname: "Nana",
        avatarUrl: null,
        wechatOpenid: "mock-openid-5",
        phone: "13800000005",
      },
      actions: [
        {
          id: "mock-action-2",
          petAvatarId: "mock-avatar-done-1",
          actionType: "run",
          imageUrl: buildMockImageUrl("团子动作素材", "#d3adf7", "run"),
          sortOrder: 0,
        },
      ],
    },
  ];
}

function applyDemoDataState(
  setDemoAvatarDetails: (details: ReviewAvatarDetail[]) => void,
  setAvatars: (avatars: ReviewAvatar[]) => void,
  setIsDemoMode: (value: boolean) => void,
) {
  const nextDemoDetails = createMockAvatarDetails();
  setDemoAvatarDetails(nextDemoDetails);
  setAvatars(nextDemoDetails.map(toReviewAvatarSummary));
  setIsDemoMode(true);
  return nextDemoDetails;
}

const initialDemoDetails = createMockAvatarDetails();

export default function ImageReview() {
  const [messageApi, contextHolder] = message.useMessage();
  const [avatars, setAvatars] = useState<ReviewAvatar[]>(() => initialDemoDetails.map(toReviewAvatarSummary));
  const [demoAvatarDetails, setDemoAvatarDetails] = useState<ReviewAvatarDetail[]>(() => initialDemoDetails);
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ReviewTabKey>("all");
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const [selectedAvatarDetail, setSelectedAvatarDetail] = useState<ReviewAvatarDetail | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  const loadAvatars = async (options?: { skipDemoFallback?: boolean }) => {
    setLoading(true);

    try {
      const response = await api.getAvatars();
      const nextAvatars = (response.avatars as ReviewAvatar[]) ?? [];
      if (nextAvatars.length === 0) {
        if (options?.skipDemoFallback) {
          setDemoAvatarDetails([]);
          setAvatars([]);
          setIsDemoMode(false);
          return [];
        }

        const nextDemoDetails = applyDemoDataState(setDemoAvatarDetails, setAvatars, setIsDemoMode);
        return nextDemoDetails.map(toReviewAvatarSummary);
      }

      setIsDemoMode(false);
      setDemoAvatarDetails([]);
      setAvatars(nextAvatars);
      return nextAvatars;
    } catch (error) {
      if (options?.skipDemoFallback) {
        setDemoAvatarDetails([]);
        setAvatars([]);
        setIsDemoMode(false);
        messageApi.error(error instanceof Error ? error.message : "图像审核数据加载失败");
        return [];
      }

      const nextDemoDetails = applyDemoDataState(setDemoAvatarDetails, setAvatars, setIsDemoMode);
      messageApi.warning("未获取到真实数据，当前展示演示数据");
      return nextDemoDetails.map(toReviewAvatarSummary);
    } finally {
      setLoading(false);
    }
  };

  const handleShowDemoData = () => {
    applyDemoDataState(setDemoAvatarDetails, setAvatars, setIsDemoMode);
    setActiveTab("all");
    messageApi.success("已切换到演示数据");
  };

  const handleShowRealData = async () => {
    setActiveTab("all");
    const nextAvatars = await loadAvatars({ skipDemoFallback: true });
    if (nextAvatars.length === 0) {
      messageApi.info("当前没有真实审核数据，可点击“查看演示数据”预览页面效果");
      return;
    }

    messageApi.success("已切回真实数据");
  };

  const loadAvatarDetail = async (avatarId: string, options?: { silent?: boolean }) => {
    if (isDemoMode) {
      const detail = demoAvatarDetails.find((avatar) => avatar.id === avatarId) ?? null;
      setSelectedAvatarDetail(detail);
      setRejectReason(detail?.rejectReason?.trim() ?? "");
      return detail;
    }

    if (!options?.silent) {
      setDetailLoading(true);
    }

    try {
      const response = await api.getAvatar(avatarId);
      const detail = response.avatar as ReviewAvatarDetail;
      setSelectedAvatarDetail(detail);
      setRejectReason(detail.rejectReason?.trim() ?? "");
      return detail;
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "图像详情加载失败");
      return null;
    } finally {
      if (!options?.silent) {
        setDetailLoading(false);
      }
    }
  };

  const tabCounts = useMemo(
    () =>
      reviewTabs.reduce<Record<ReviewTabKey, number>>(
        (counts, status) => {
          counts[status] = status === "all" ? avatars.length : avatars.filter((avatar) => avatar.status === status).length;
          return counts;
        },
        {
          all: 0,
          pending: 0,
          rejected: 0,
          approved: 0,
        },
      ),
    [avatars],
  );

  const today = dayjs();
  const yesterday = today.subtract(1, "day");

  const todayPendingCount = useMemo(
    () => avatars.filter((avatar) => avatar.status === "pending" && isSameDay(avatar.createdAt, today)).length,
    [avatars, today],
  );

  const yesterdayPendingCount = useMemo(
    () => avatars.filter((avatar) => avatar.status === "pending" && isSameDay(avatar.createdAt, yesterday)).length,
    [avatars, yesterday],
  );

  const todayCompletedCount = useMemo(
    () =>
      avatars.filter(
        (avatar) =>
          (avatar.status === "approved" || avatar.status === "rejected") && isSameDay(avatar.reviewedAt, today),
      ).length,
    [avatars, today],
  );

  const yesterdayCompletedCount = useMemo(
    () =>
      avatars.filter(
        (avatar) =>
          (avatar.status === "approved" || avatar.status === "rejected") && isSameDay(avatar.reviewedAt, yesterday),
      ).length,
    [avatars, yesterday],
  );

  const syncedDeviceCount = useMemo(
    () => avatars.filter((avatar) => avatar.status === "done").length,
    [avatars],
  );

  const todayCompletionRate = useMemo(
    () => getCompletionRate(todayCompletedCount, todayPendingCount),
    [todayCompletedCount, todayPendingCount],
  );

  const yesterdayCompletionRate = useMemo(
    () => getCompletionRate(yesterdayCompletedCount, yesterdayPendingCount),
    [yesterdayCompletedCount, yesterdayPendingCount],
  );

  const filteredAvatars = useMemo(() => {
    if (activeTab === "all") {
      return avatars;
    }

    return avatars.filter((avatar) => avatar.status === activeTab);
  }, [activeTab, avatars]);

  useEffect(() => {
    if (filteredAvatars.length === 0) {
      setSelectedAvatarId(null);
      setSelectedAvatarDetail(null);
      setRejectReason("");
      return;
    }

    if (!selectedAvatarId || !filteredAvatars.some((avatar) => avatar.id === selectedAvatarId)) {
      setSelectedAvatarId(filteredAvatars[0].id);
    }
  }, [filteredAvatars, selectedAvatarId]);

  useEffect(() => {
    if (!selectedAvatarId) {
      return;
    }

    void loadAvatarDetail(selectedAvatarId);
  }, [demoAvatarDetails, isDemoMode, selectedAvatarId]);

  const selectedSummary = useMemo(
    () => avatars.find((avatar) => avatar.id === selectedAvatarId) ?? null,
    [avatars, selectedAvatarId],
  );

  const selectedStatus = selectedAvatarDetail?.status ?? selectedSummary?.status ?? null;
  const canApprove = selectedStatus === "pending" || selectedStatus === "rejected";
  const canReject = selectedStatus === "pending" || selectedStatus === "rejected";
  const canPushProgress =
    !!selectedAvatarDetail &&
    (selectedAvatarDetail.status === "approved" || selectedAvatarDetail.status === "processing") &&
    selectedAvatarDetail.actions.length > 0;

  const refreshAfterMutation = async (avatarId: string, nextDemoDetails?: ReviewAvatarDetail[]) => {
    if (isDemoMode) {
      const currentDemoDetails = nextDemoDetails ?? demoAvatarDetails;
      const nextDetail = currentDemoDetails.find((avatar) => avatar.id === avatarId) ?? null;
      setAvatars(currentDemoDetails.map(toReviewAvatarSummary));
      setSelectedAvatarDetail(nextDetail);
      setRejectReason(nextDetail?.rejectReason?.trim() ?? "");
      return;
    }

    await loadAvatars();
    await loadAvatarDetail(avatarId, { silent: true });
  };

  const handleApprove = async () => {
    if (!selectedAvatarDetail || !canApprove) {
      return;
    }

    setActionLoading(true);

    try {
      if (isDemoMode) {
        const reviewedAt = dayjs().toISOString();
        const nextDemoDetails = demoAvatarDetails.map((avatar) =>
          avatar.id === selectedAvatarDetail.id
            ? {
                ...avatar,
                status: "approved" as const,
                rejectReason: null,
                reviewedAt,
              }
            : avatar,
        );
        setDemoAvatarDetails(nextDemoDetails);
        await refreshAfterMutation(selectedAvatarDetail.id, nextDemoDetails);
        messageApi.success("审核已通过，当前为演示数据效果");
        return;
      }

      await api.approveAvatar(selectedAvatarDetail.id);
      messageApi.success("审核已通过，已进入定制池");
      await refreshAfterMutation(selectedAvatarDetail.id);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "审核通过失败");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedAvatarDetail || !canReject) {
      return;
    }

    const nextReason = rejectReason.trim();
    if (!nextReason) {
      messageApi.warning("请填写拒绝原因");
      return;
    }

    setActionLoading(true);

    try {
      if (isDemoMode) {
        const reviewedAt = dayjs().toISOString();
        const nextDemoDetails = demoAvatarDetails.map((avatar) =>
          avatar.id === selectedAvatarDetail.id
            ? {
                ...avatar,
                status: "rejected" as const,
                rejectReason: nextReason,
                reviewedAt,
              }
            : avatar,
        );
        setDemoAvatarDetails(nextDemoDetails);
        await refreshAfterMutation(selectedAvatarDetail.id, nextDemoDetails);
        messageApi.success("已切换为拒绝状态，当前为演示数据效果");
        return;
      }

      await api.rejectAvatar(selectedAvatarDetail.id, nextReason);
      messageApi.success("已标记为有问题并通知用户");
      await refreshAfterMutation(selectedAvatarDetail.id);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "审核拒绝失败");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePushProgress = async () => {
    if (!selectedAvatarDetail || !canPushProgress) {
      return;
    }

    setSyncLoading(true);

    try {
      if (isDemoMode) {
        const nextDemoDetails = demoAvatarDetails.map((avatar) =>
          avatar.id === selectedAvatarDetail.id
            ? {
                ...avatar,
                status: "done" as const,
              }
            : avatar,
        );
        setDemoAvatarDetails(nextDemoDetails);
        await refreshAfterMutation(selectedAvatarDetail.id, nextDemoDetails);
        messageApi.success("已切换为同步完成状态，当前为演示数据效果");
        return;
      }

      await api.syncAvatar(selectedAvatarDetail.id);
      messageApi.success("已推送客户端定制进度信息");
      await refreshAfterMutation(selectedAvatarDetail.id);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "推送客户端失败");
    } finally {
      setSyncLoading(false);
    }
  };

  const tabItems = useMemo(
    () =>
      reviewTabs.map((status) => ({
        key: status,
        label: (
          <Space size={8}>
            <span>
              {status === "all"
                ? "全部"
                : status === "pending"
                  ? "待审核"
                  : status === "rejected"
                    ? "已拒绝"
                    : "已通过"}
            </span>
            <Tag bordered={false} color="default">
              {tabCounts[status]}
            </Tag>
          </Space>
        ),
      })),
    [tabCounts],
  );

  return (
    <>
      {contextHolder}
      <Spin spinning={loading} size="large">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Card>
                <Statistic title="今日待处理" value={todayPendingCount} valueStyle={{ color: "#faad14" }} />
                <Text type="secondary">{formatDeltaText(todayPendingCount - yesterdayPendingCount)} 项</Text>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card>
                <Statistic title="今日已完成" value={todayCompletedCount} valueStyle={{ color: "#52c41a" }} />
                <Text type="secondary">
                  完成率 {formatRate(todayCompletionRate)}，较昨日
                  {todayCompletionRate === yesterdayCompletionRate
                    ? "持平"
                    : todayCompletionRate > yesterdayCompletionRate
                      ? `提升 ${formatRate(todayCompletionRate - yesterdayCompletionRate)}`
                      : `下降 ${formatRate(yesterdayCompletionRate - todayCompletionRate)}`}
                </Text>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card>
                <Statistic title="已同步设备" value={syncedDeviceCount} valueStyle={{ color: "#1677ff" }} />
                <Text type="secondary">累计同步成功的设备任务总数</Text>
              </Card>
            </Col>
          </Row>

          <Card
            title="图像审核"
            extra={
              <Space size={8}>
                {isDemoMode ? (
                  <Tag color="gold" style={{ marginInlineEnd: 0 }}>
                    演示数据
                  </Tag>
                ) : null}
                <Button size="small" onClick={isDemoMode ? () => void handleShowRealData() : handleShowDemoData}>
                  {isDemoMode ? "返回真实数据" : "查看演示数据"}
                </Button>
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={isDemoMode ? handleShowDemoData : () => void loadAvatars()}
                >
                  刷新
                </Button>
              </Space>
            }
          >
            {isDemoMode ? (
              <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
                当前未获取到真实审核数据，页面正在展示本地演示样例，你可以直接点选图片查看待审核、已拒绝、已通过和已同步状态效果。
              </Text>
            ) : null}
            <Tabs activeKey={activeTab} items={tabItems} onChange={(key) => setActiveTab(key as ReviewTabKey)} />

            {filteredAvatars.length > 0 ? (
              <Row gutter={[16, 16]}>
                {filteredAvatars.map((avatar) => {
                  const status = statusMeta[avatar.status];
                  const isSelected = avatar.id === selectedAvatarId;
                  const petName = avatar.pet?.name ?? "未命名宠物";

                  return (
                    <Col xs={24} sm={12} xl={8} xxl={6} key={avatar.id}>
                      <Card
                        hoverable
                        onClick={() => setSelectedAvatarId(avatar.id)}
                        style={{
                          borderColor: isSelected ? "#1677ff" : undefined,
                          boxShadow: isSelected ? "0 0 0 2px rgba(22,119,255,0.12)" : undefined,
                        }}
                        bodyStyle={{ padding: 12 }}
                      >
                        <Space direction="vertical" size={12} style={{ display: "flex" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                            <Title level={5} style={{ margin: 0 }}>
                              {petName}
                            </Title>
                            <Tag color={status.color} style={{ marginInlineEnd: 0 }}>
                              {status.label}
                            </Tag>
                          </div>

                          <div
                            style={{
                              height: 180,
                              overflow: "hidden",
                              borderRadius: 12,
                              background: "#f5f5f5",
                            }}
                          >
                            <Image
                              alt={petName}
                              src={avatar.sourceImageUrl}
                              width="100%"
                              height={180}
                              preview={false}
                              style={{ objectFit: "cover" }}
                            />
                          </div>

                          <Space size={[8, 8]} wrap>
                            <Tag>{getSpeciesLabel(avatar.pet?.species)}</Tag>
                            {avatar.user?.nickname ? <Tag color="blue">{avatar.user.nickname}</Tag> : null}
                          </Space>

                          <Text type="secondary">上传时间：{formatDateTime(avatar.createdAt)}</Text>
                        </Space>
                      </Card>
                    </Col>
                  );
                })}
              </Row>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  activeTab === "all"
                    ? "暂无图像审核数据"
                    : `暂无${activeTab === "pending" ? "待审核" : activeTab === "rejected" ? "已拒绝" : "已通过"}数据`
                }
                style={{ padding: "32px 0 16px" }}
              />
            )}
          </Card>

          <Card title="图片详情">
            {selectedAvatarId ? (
              <Spin spinning={detailLoading}>
                {selectedAvatarDetail ? (
                  <Row gutter={[24, 24]}>
                    <Col xs={24} lg={12}>
                      <div
                        style={{
                          minHeight: 360,
                          borderRadius: 16,
                          overflow: "hidden",
                          background: "#f5f5f5",
                        }}
                      >
                        <Image
                          alt={selectedAvatarDetail.pet?.name ?? "宠物图片"}
                          src={selectedAvatarDetail.sourceImageUrl}
                          width="100%"
                          height={360}
                          style={{ objectFit: "cover" }}
                        />
                      </div>
                    </Col>

                    <Col xs={24} lg={12}>
                      <Space direction="vertical" size={16} style={{ display: "flex" }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                          }}
                        >
                          <div>
                            <Title level={4} style={{ margin: 0 }}>
                              {selectedAvatarDetail.pet?.name ?? "未命名宠物"}
                            </Title>
                            <Text type="secondary">
                              {getSpeciesLabel(selectedAvatarDetail.pet?.species)} · 上传于{" "}
                              {formatDateTime(selectedAvatarDetail.createdAt)}
                            </Text>
                          </div>
                          <Tag color={statusMeta[selectedAvatarDetail.status].color}>
                            {getStatusLabel(selectedAvatarDetail.status)}
                          </Tag>
                        </div>

                        <Card size="small" bordered={false} style={{ background: "#fafafa" }}>
                          <Space direction="vertical" size={8} style={{ display: "flex" }}>
                            <Text strong>审核状态</Text>
                            <Text>审核管理员：系统管理员</Text>
                            <Text>
                              当前时间：
                              {formatDateTime(selectedAvatarDetail.reviewedAt ?? dayjs().toISOString())}
                            </Text>
                            <Text>
                              当前动作素材：{selectedAvatarDetail.actions.length} 个
                            </Text>
                          </Space>
                        </Card>

                        <Space wrap>
                          <Button
                            type="primary"
                            icon={<CheckOutlined />}
                            loading={actionLoading && canApprove}
                            disabled={!canApprove}
                            onClick={() => void handleApprove()}
                          >
                            合格通过
                          </Button>
                          <Button
                            danger
                            icon={<CloseOutlined />}
                            loading={actionLoading && canReject}
                            disabled={!canReject}
                            onClick={() => void handleReject()}
                          >
                            有问题
                          </Button>
                          <Button
                            icon={<DownloadOutlined />}
                            onClick={() =>
                              openImageDownload(
                                selectedAvatarDetail.sourceImageUrl,
                                `${selectedAvatarDetail.id}.jpg`,
                              )
                            }
                          >
                            下载
                          </Button>
                        </Space>

                        <div
                          style={{
                            padding: 16,
                            borderRadius: 12,
                            border: "1px solid #ffccc7",
                            background: "#fff2f0",
                          }}
                        >
                          <Text strong style={{ color: "#ff4d4f", display: "block", marginBottom: 8 }}>
                            拒绝原因
                          </Text>
                          <TextArea
                            value={rejectReason}
                            rows={5}
                            maxLength={200}
                            showCount
                            placeholder="请输入拒绝原因，不超过 200 字"
                            disabled={!canReject}
                            onChange={(event) => setRejectReason(event.target.value)}
                          />
                        </div>

                        <Button
                          type="primary"
                          ghost
                          icon={<SyncOutlined />}
                          loading={syncLoading}
                          disabled={!canPushProgress}
                          onClick={() => void handlePushProgress()}
                        >
                          推送客户端定制进度信息
                        </Button>
                        {!canPushProgress ? (
                          <Text type="secondary">
                            需先在定制中心上传至少一个动作素材，且任务处于已通过或定制中状态后才可推送。
                          </Text>
                        ) : null}
                      </Space>
                    </Col>
                  </Row>
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="图像详情加载失败，请重新选择图片" />
                )}
              </Spin>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择一张图片查看详情" />
            )}
          </Card>
        </div>
      </Spin>
    </>
  );
}
