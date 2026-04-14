import { useEffect, useMemo, useState } from "react";
import { CheckOutlined, CloseOutlined, DownloadOutlined } from "@ant-design/icons";
import {
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Image,
  Input,
  Modal,
  Radio,
  Row,
  Space,
  Spin,
  Statistic,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import dayjs from "dayjs";
import type { AvatarStatus, PetAvatar, Species, User } from "shared";
import type { Pet } from "shared";
import { api } from "../api/client";

const { Text, Title } = Typography;
const { TextArea } = Input;

const reviewTabs = ["pending", "approved", "rejected", "failed"] as const;
const rejectReasonOptions = ["图片不清晰", "内容不合规", "非宠物图片", "其他"] as const;

type ReviewTabKey = (typeof reviewTabs)[number];
type RejectReasonOption = (typeof rejectReasonOptions)[number];

type ReviewAvatar = PetAvatar & {
  pet: Pick<Pet, "id" | "name"> & {
    species: Species | "other" | string | null;
  } | null;
  user: Pick<User, "id" | "nickname" | "avatarUrl" | "wechatOpenid" | "phone"> | null;
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

function isToday(value?: string | null) {
  if (!value) {
    return false;
  }

  return dayjs(value).isValid() && dayjs(value).isSame(dayjs(), "day");
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

function resolveRejectReason(option: RejectReasonOption, customReason: string) {
  return option === "其他" ? customReason.trim() : option;
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

export default function ImageReview() {
  const [messageApi, contextHolder] = message.useMessage();
  const [avatars, setAvatars] = useState<ReviewAvatar[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ReviewTabKey>("pending");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingAvatar, setRejectingAvatar] = useState<ReviewAvatar | null>(null);
  const [selectedRejectReason, setSelectedRejectReason] = useState<RejectReasonOption>("图片不清晰");
  const [customRejectReason, setCustomRejectReason] = useState("");

  const loadAvatars = async () => {
    setLoading(true);

    try {
      const response = await api.getAvatars();
      setAvatars((response.avatars as ReviewAvatar[]) ?? []);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "图像审核数据加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAvatars();
  }, []);

  const tabCounts = useMemo(
    () =>
      reviewTabs.reduce<Record<ReviewTabKey, number>>(
        (counts, status) => {
          counts[status] = avatars.filter((avatar) => avatar.status === status).length;
          return counts;
        },
        {
          pending: 0,
          approved: 0,
          rejected: 0,
          failed: 0,
        },
      ),
    [avatars],
  );

  const todayPendingCount = useMemo(
    () => avatars.filter((avatar) => avatar.status === "pending" && isToday(avatar.createdAt)).length,
    [avatars],
  );

  const todayCompletedCount = useMemo(
    () =>
      avatars.filter(
        (avatar) =>
          (avatar.status === "approved" || avatar.status === "rejected") && isToday(avatar.reviewedAt),
      ).length,
    [avatars],
  );

  const syncedDeviceCount = useMemo(
    () => avatars.filter((avatar) => avatar.status === "done").length,
    [avatars],
  );

  const filteredAvatars = useMemo(
    () => avatars.filter((avatar) => avatar.status === activeTab),
    [activeTab, avatars],
  );

  const tabItems = useMemo(
    () =>
      reviewTabs.map((status) => ({
        key: status,
        label: (
          <Space size={8}>
            <span>{statusMeta[status].label}</span>
            <Badge count={tabCounts[status]} overflowCount={999} />
          </Space>
        ),
      })),
    [tabCounts],
  );

  const closeRejectModal = () => {
    setRejectModalOpen(false);
    setRejectingAvatar(null);
    setSelectedRejectReason("图片不清晰");
    setCustomRejectReason("");
  };

  const handleApprove = async (avatarId: string) => {
    setActionLoadingId(avatarId);

    try {
      await api.approveAvatar(avatarId);
      messageApi.success("审核已通过");
      await loadAvatars();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "审核通过失败");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenRejectModal = (avatar: ReviewAvatar) => {
    const currentReason = avatar.rejectReason?.trim() ?? "";
    const matchedReason = rejectReasonOptions.find(
      (option) => option !== "其他" && option === currentReason,
    );

    setRejectingAvatar(avatar);
    setSelectedRejectReason(matchedReason ?? "其他");
    setCustomRejectReason(matchedReason ? "" : currentReason);
    setRejectModalOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!rejectingAvatar) {
      return;
    }

    const reason = resolveRejectReason(selectedRejectReason, customRejectReason);
    if (!reason) {
      messageApi.warning("请填写拒绝原因");
      return;
    }

    setActionLoadingId(rejectingAvatar.id);

    try {
      await api.rejectAvatar(rejectingAvatar.id, reason);
      messageApi.success("已拒绝该图片");
      closeRejectModal();
      await loadAvatars();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "图片拒绝失败");
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <>
      {contextHolder}
      <Spin spinning={loading} size="large">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Card>
                <Statistic title="今日待处理数" value={todayPendingCount} valueStyle={{ color: "#faad14" }} />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card>
                <Statistic title="今日已完成数" value={todayCompletedCount} valueStyle={{ color: "#52c41a" }} />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card>
                <Statistic title="已同步设备总数" value={syncedDeviceCount} valueStyle={{ color: "#1677ff" }} />
              </Card>
            </Col>
          </Row>

          <Card>
            <Tabs activeKey={activeTab} items={tabItems} onChange={(key) => setActiveTab(key as ReviewTabKey)} />

            {filteredAvatars.length > 0 ? (
              <Row gutter={[16, 16]}>
                {filteredAvatars.map((avatar) => {
                  const status = statusMeta[avatar.status];
                  const petName = avatar.pet?.name ?? "未命名宠物";
                  const isActionLoading = actionLoadingId === avatar.id;
                  const actions =
                    avatar.status === "pending"
                      ? [
                          <Button
                            key="approve"
                            type="text"
                            icon={<CheckOutlined />}
                            loading={isActionLoading}
                            style={{ color: "#52c41a", fontWeight: 500 }}
                            onClick={() => void handleApprove(avatar.id)}
                          >
                            通过
                          </Button>,
                          <Button
                            key="reject"
                            type="text"
                            icon={<CloseOutlined />}
                            loading={isActionLoading}
                            style={{ color: "#ff4d4f", fontWeight: 500 }}
                            onClick={() => handleOpenRejectModal(avatar)}
                          >
                            拒绝
                          </Button>,
                          <Button
                            key="download"
                            type="text"
                            icon={<DownloadOutlined />}
                            onClick={() => openImageDownload(avatar.sourceImageUrl, `${avatar.id}.jpg`)}
                          >
                            下载
                          </Button>,
                        ]
                      : [
                          <Button
                            key="download"
                            type="text"
                            icon={<DownloadOutlined />}
                            onClick={() => openImageDownload(avatar.sourceImageUrl, `${avatar.id}.jpg`)}
                          >
                            下载
                          </Button>,
                        ];

                  return (
                    <Col xs={24} sm={12} xl={8} xxl={6} key={avatar.id}>
                      <Card
                        hoverable
                        cover={
                          <div
                            style={{
                              height: 200,
                              overflow: "hidden",
                              background: "#f5f5f5",
                            }}
                          >
                            <Image
                              alt={petName}
                              src={avatar.sourceImageUrl}
                              width="100%"
                              height={200}
                              style={{ objectFit: "cover" }}
                            />
                          </div>
                        }
                        actions={actions}
                      >
                        <Space direction="vertical" size={12} style={{ display: "flex" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                            <Title level={5} style={{ margin: 0 }}>
                              {petName}
                            </Title>
                            <Tag color={status.color}>{status.label}</Tag>
                          </div>

                          <Space size={[8, 8]} wrap>
                            <Tag>{getSpeciesLabel(avatar.pet?.species)}</Tag>
                          </Space>

                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <Text type="secondary">上传时间：{formatDateTime(avatar.createdAt)}</Text>
                            {avatar.reviewedAt ? (
                              <Text type="secondary">审核时间：{formatDateTime(avatar.reviewedAt)}</Text>
                            ) : null}
                          </div>

                          {avatar.status === "rejected" && avatar.rejectReason ? (
                            <div
                              style={{
                                padding: 12,
                                borderRadius: 8,
                                background: "#fff2f0",
                                border: "1px solid #ffccc7",
                              }}
                            >
                              <Text strong style={{ display: "block", marginBottom: 4 }}>
                                拒绝原因
                              </Text>
                              <Text>{avatar.rejectReason}</Text>
                            </div>
                          ) : null}
                        </Space>
                      </Card>
                    </Col>
                  );
                })}
              </Row>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={`暂无${statusMeta[activeTab].label}数据`}
                style={{ padding: "32px 0 16px" }}
              />
            )}
          </Card>
        </div>
      </Spin>

      <Modal
        title="拒绝图片"
        open={rejectModalOpen}
        destroyOnClose
        okText="确认拒绝"
        cancelText="取消"
        okButtonProps={{
          danger: true,
          loading: rejectingAvatar ? actionLoadingId === rejectingAvatar.id : false,
        }}
        onCancel={closeRejectModal}
        onOk={() => void handleConfirmReject()}
      >
        <Space direction="vertical" size={16} style={{ display: "flex" }}>
          <Radio.Group
            value={selectedRejectReason}
            onChange={(event) => setSelectedRejectReason(event.target.value as RejectReasonOption)}
          >
            <Space direction="vertical">
              {rejectReasonOptions.map((reason) => (
                <Radio key={reason} value={reason}>
                  {reason}
                </Radio>
              ))}
            </Space>
          </Radio.Group>

          {selectedRejectReason === "其他" ? (
            <TextArea
              value={customRejectReason}
              rows={4}
              maxLength={100}
              showCount
              placeholder="请输入拒绝原因"
              onChange={(event) => setCustomRejectReason(event.target.value)}
            />
          ) : null}
        </Space>
      </Modal>
    </>
  );
}
