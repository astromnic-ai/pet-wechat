import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { TableProps } from "antd";
import {
  Button,
  Card,
  Col,
  Divider,
  Input,
  Popconfirm,
  Progress,
  Row,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { ArrowLeftOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { AdminDeviceDetail, AdminDeviceListItem, DeviceType } from "shared";
import { api } from "../api/client";

const { Text, Title } = Typography;
type PetSpeciesValue = "cat" | "dog" | "other";

type SelectedDeviceRef = {
  id: string;
  type: DeviceType;
};

const DEVICE_MODEL_LABELS: Record<DeviceType, string> = {
  desktop: "桌面宠物1.0",
  collar: "宠物项圈1.0",
};

const STATUS_LABELS = {
  online: "在线",
  offline: "离线",
  pairing: "连接中断",
} satisfies Record<AdminDeviceListItem["status"], string>;

const STATUS_COLORS: Record<AdminDeviceListItem["status"], string> = {
  online: "green",
  offline: "default",
  pairing: "orange",
};

const SPECIES_LABELS: Record<PetSpeciesValue, string> = {
  cat: "猫",
  dog: "狗",
  other: "其他",
};

function formatTime(value: string | null | undefined) {
  return value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-";
}

function formatShortDate(value: string | null | undefined) {
  return value ? dayjs(value).format("YYYY-MM-DD") : "-";
}

function formatRelativeTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return "-";
  }

  const diffMinutes = dayjs().diff(parsed, "minute");
  if (diffMinutes < 1) {
    return "刚刚";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}分钟前`;
  }

  const diffHours = dayjs().diff(parsed, "hour");
  if (diffHours < 24) {
    return `${diffHours}小时前`;
  }

  return parsed.format("YYYY-MM-DD HH:mm");
}

function getSignalLabel(signal: number | null | undefined, status: string) {
  if (status !== "online") {
    return "-";
  }

  if (signal == null) {
    return "强";
  }

  if (signal >= -55) {
    return "强";
  }

  if (signal >= -70) {
    return "中";
  }

  return "弱";
}

function getSignalColor(signalLabel: string) {
  if (signalLabel === "强") {
    return "#16a34a";
  }

  if (signalLabel === "中") {
    return "#d97706";
  }

  return "#9ca3af";
}

function normalizeSpecies(value?: string | null): PetSpeciesValue {
  if (value === "cat" || value === "dog") {
    return value;
  }

  return "other";
}

function renderStatus(status: AdminDeviceListItem["status"]) {
  return <Tag color={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Tag>;
}

function renderImageStatus(hasUploadedAvatar: boolean) {
  return hasUploadedAvatar ? <Tag color="green">已上传</Tag> : <Tag color="default">未上传</Tag>;
}

function renderBindingStatus(isBound: boolean) {
  return isBound ? <Tag color="green">已绑定</Tag> : <Tag color="default">未绑定</Tag>;
}

function renderPetAvatar(imageUrl: string | null | undefined, label: string) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={label}
        style={{
          width: 84,
          height: 84,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: 84,
        height: 84,
        borderRadius: "50%",
        background: "#dbe4f0",
        flexShrink: 0,
      }}
    />
  );
}

function buildDeviceQuery(params: {
  keyword: string;
}) {
  const query: Record<string, string> = {
    page: "1",
    pageSize: "100",
    sort: "createdAt",
    order: "desc",
  };

  if (params.keyword.trim()) {
    query.keyword = params.keyword.trim();
  }

  return query;
}

export default function DevicesPage() {
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [devices, setDevices] = useState<AdminDeviceListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [selectedDeviceRef, setSelectedDeviceRef] = useState<SelectedDeviceRef | null>(null);
  const [selectedDeviceDetail, setSelectedDeviceDetail] = useState<AdminDeviceDetail | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const deferredKeyword = useDeferredValue(keyword);

  useEffect(() => {
    let cancelled = false;

    async function loadDevices() {
      setLoading(true);

      try {
        const response = await api.getDevices(
          buildDeviceQuery({
            keyword: deferredKeyword,
          }),
        );

        if (cancelled) {
          return;
        }

        setDevices(response.items ?? []);
        setTotal(response.total ?? 0);
      } catch (error) {
        if (!cancelled) {
          message.error(error instanceof Error ? error.message : "设备数据加载失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    const timer = window.setTimeout(() => {
      void loadDevices();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [deferredKeyword, reloadToken]);

  useEffect(() => {
    if (!selectedDeviceRef) {
      setSelectedDeviceDetail(null);
      return;
    }

    const currentRef = selectedDeviceRef;
    let cancelled = false;

    async function loadDetail() {
      setDetailLoading(true);

      try {
        const detail = await api.getDeviceDetail(currentRef.type, currentRef.id);
        if (!cancelled) {
          setSelectedDeviceDetail(detail);
        }
      } catch (error) {
        if (!cancelled) {
          setSelectedDeviceDetail(null);
          message.error(error instanceof Error ? error.message : "设备详情加载失败");
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [reloadToken, selectedDeviceRef]);

  const boundDeviceCount = useMemo(
    () => devices.filter((device) => device.bindingCount > 0).length,
    [devices],
  );

  const handleShowAll = () => {
    setKeyword("");
    setReloadToken((value) => value + 1);
  };

  const handleRefresh = () => {
    setReloadToken((value) => value + 1);
  };

  const handleDeleteDevice = async (record: AdminDeviceListItem) => {
    const deleteKey = `${record.type}:${record.id}`;
    setDeletingKey(deleteKey);

    try {
      if (record.type === "collar") {
        await api.deleteCollar(record.id);
      } else {
        await api.deleteDesktop(record.id);
      }

      setDevices((prev) => prev.filter((item) => !(item.id === record.id && item.type === record.type)));
      setTotal((prev) => Math.max(0, prev - 1));

      if (selectedDeviceRef?.id === record.id && selectedDeviceRef.type === record.type) {
        setSelectedDeviceRef(null);
        setSelectedDeviceDetail(null);
      }

      message.success("设备已删除");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "设备删除失败");
    } finally {
      setDeletingKey(null);
    }
  };

  const columns: TableProps<AdminDeviceListItem>["columns"] = [
    {
      title: "设备ID",
      dataIndex: "id",
      key: "id",
      width: 220,
      render: (value: string, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{value}</Text>
          <Text type="secondary">{record.name || "-"}</Text>
        </Space>
      ),
    },
    {
      title: "Mac地址",
      dataIndex: "macAddress",
      key: "macAddress",
      width: 190,
      render: (value: string | null) => value || "-",
    },
    {
      title: "Chip ID",
      dataIndex: "chipId",
      key: "chipId",
      width: 190,
      render: (value: string | null) => value || "-",
    },
    {
      title: "设备型号",
      dataIndex: "type",
      key: "type",
      width: 150,
      render: (value: DeviceType) => DEVICE_MODEL_LABELS[value],
    },
    {
      title: "宠物头像",
      dataIndex: "hasUploadedAvatar",
      key: "hasUploadedAvatar",
      width: 120,
      render: (value: boolean) => renderImageStatus(value),
    },
    {
      title: "设备绑定",
      dataIndex: "bindingCount",
      key: "bindingCount",
      width: 120,
      render: (value: number) => renderBindingStatus(value > 0),
    },
    {
      title: "宠物类型",
      dataIndex: "petName",
      key: "petName",
      width: 180,
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Text>{record.petName || "-"}</Text>
          <Text type="secondary">{record.petName ? SPECIES_LABELS[normalizeSpecies(record.petSpecies)] : "-"}</Text>
        </Space>
      ),
    },
    {
      title: "设备状态",
      dataIndex: "status",
      key: "status",
      width: 130,
      render: (value: AdminDeviceListItem["status"]) => renderStatus(value),
    },
    {
      title: "用户信息",
      dataIndex: "userNickname",
      key: "userNickname",
      width: 140,
      render: (value: string | null) => value || "-",
    },
    {
      title: "注册时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      render: (value: string) => formatTime(value),
    },
    {
      title: "管理设备",
      key: "actions",
      width: 150,
      fixed: "right",
      render: (_value, record) => (
        <Space size={6}>
          <Button
            type="link"
            onClick={() =>
              setSelectedDeviceRef({
                id: record.id,
                type: record.type,
              })
            }
          >
            管理
          </Button>
          <Popconfirm
            title="确认删除设备？"
            description="删除后设备将从后台移除。"
            okText="删除"
            cancelText="取消"
            onConfirm={() => void handleDeleteDevice(record)}
          >
            <Button
              type="link"
              danger
              loading={deletingKey === `${record.type}:${record.id}`}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (selectedDeviceRef) {
    const detail = selectedDeviceDetail;
    const device = detail?.device ?? null;
    const pet = detail?.pet ?? null;
    const owner = detail?.owner ?? null;
    const bindingPets = detail?.bindingPets ?? [];
    const counterpart =
      detail?.relatedDevices.find((item) => item.type !== detail.device.type) ??
      detail?.relatedDevices[0] ??
      null;
    const batteryPercent = device?.battery ?? null;
    const signalLabel = getSignalLabel(device?.signal, device?.status ?? "offline");
    const signalColor = getSignalColor(signalLabel);
    const completedActions = detail?.avatarProgress.approved ?? 0;
    const totalActions = detail?.avatarProgress.total ?? 18;
    const avatarUploaded = (detail?.avatarProgress.uploaded ?? 0) > 0;
    const avatarApproved = (detail?.avatarProgress.approved ?? 0) > 0;
    const avatarProgressPercent = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0;
    const detailTitle = device?.name ? `${device.name}的设备详情` : "设备详情";
    const currentDeviceLabel = device ? DEVICE_MODEL_LABELS[device.type] : "-";
    const counterpartLabel = counterpart ? DEVICE_MODEL_LABELS[counterpart.type] : "-";

    return (
      <Space direction="vertical" size={20} style={{ display: "flex" }}>
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          style={{ padding: 0, width: "fit-content" }}
          onClick={() => setSelectedDeviceRef(null)}
        >
          返回列表
        </Button>

        <Card styles={{ body: { padding: 24 } }}>
          <Divider style={{ margin: "0 0 24px" }} />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
              marginBottom: 28,
            }}
          >
            <Title level={3} style={{ margin: 0 }}>
              {detailTitle}
            </Title>

            <Space size={16}>
              <Button
                type="primary"
                disabled
                style={{
                  background: "#69a7ff",
                  borderColor: "#69a7ff",
                  minWidth: 120,
                  height: 40,
                  borderRadius: 12,
                }}
              >
                管理员编辑
              </Button>
              <Button danger disabled style={{ minWidth: 120, height: 40, borderRadius: 12 }}>
                永久删除
              </Button>
            </Space>
          </div>

          <Spin spinning={detailLoading}>
            {detail && device ? (
              <>
                <Row gutter={[32, 20]} style={{ marginBottom: 28 }}>
                  <Col xs={24} md={12} xl={6}>
                    <Space direction="vertical" size={10}>
                      <div>
                        <Text type="secondary">设备名称</Text> <Text strong>{device.name || "-"}</Text>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Text type="secondary">电池状态</Text>
                        <Text strong>{batteryPercent == null ? "-" : `${batteryPercent}%`}</Text>
                        <Progress
                          percent={batteryPercent ?? 0}
                          showInfo={false}
                          strokeColor={batteryPercent == null ? "#cbd5e1" : "#22c55e"}
                          trailColor="#e5e7eb"
                          style={{ width: 90, marginInlineStart: 4 }}
                        />
                      </div>
                    </Space>
                  </Col>
                  <Col xs={24} md={12} xl={6}>
                    <Space direction="vertical" size={10}>
                      <div>
                        <Text type="secondary">设备型号</Text> <Text strong>{currentDeviceLabel}</Text>
                      </div>
                      <div>
                        <Text type="secondary">信号强度</Text>{" "}
                        <Text strong style={{ color: signalColor }}>
                          {signalLabel}
                        </Text>
                      </div>
                    </Space>
                  </Col>
                  <Col xs={24} md={12} xl={6}>
                    <Space direction="vertical" size={10}>
                      <div>
                        <Text type="secondary">MAC地址</Text> <Text strong>{device.macAddress || "-"}</Text>
                      </div>
                      <div>
                        <Text type="secondary">Chip ID</Text> <Text strong>{device.chipId || "-"}</Text>
                      </div>
                      <div>
                        <Text type="secondary">最后同步</Text> <Text strong>{formatRelativeTime(detail.lastSyncedAt)}</Text>
                      </div>
                    </Space>
                  </Col>
                  <Col xs={24} md={12} xl={6}>
                    <Space direction="vertical" size={10}>
                      <div>
                        <Text type="secondary">固件版本</Text> <Text strong>{device.firmwareVersion || "-"}</Text>
                      </div>
                      <div>
                        <Text type="secondary">激活时间</Text> <Text strong>{formatTime(detail.activatedAt)}</Text>
                      </div>
                    </Space>
                  </Col>
                </Row>

                <Card title={<Text strong style={{ fontSize: 16 }}>设备宠物</Text>} styles={{ body: { padding: 16 } }}>
                  <Row gutter={[16, 16]}>
                    <Col xs={24} xl={12}>
                      <Card bordered={false} style={{ background: "#f8fafc", borderRadius: 16, minHeight: 250 }} styles={{ body: { padding: 18 } }}>
                        <Space direction="vertical" size={12} style={{ width: "100%" }}>
                          <div>
                            <Text strong>设备宠物信息</Text>
                            <div style={{ marginTop: 4 }}>
                              {renderBindingStatus(!!pet || bindingPets.length > 0)}
                            </div>
                          </div>

                          {device.type === "desktop" && bindingPets.length > 0 ? (
                            <Space direction="vertical" size={12} style={{ width: "100%" }}>
                              {bindingPets.map((bindingPet) => (
                                <div
                                  key={bindingPet.id}
                                  style={{ display: "flex", gap: 16, alignItems: "center" }}
                                >
                                  {renderPetAvatar(bindingPet.avatarUrl, bindingPet.name)}
                                  <div style={{ minWidth: 0 }}>
                                    <Title level={4} style={{ margin: 0 }}>
                                      {bindingPet.name}
                                    </Title>
                                    <Text type="secondary">
                                      {bindingPet.speciesLabel ?? "暂未绑定"}
                                    </Text>
                                  </div>
                                </div>
                              ))}
                            </Space>
                          ) : (
                            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                              {renderPetAvatar(pet?.avatarUrl, pet?.name ?? "未绑定宠物")}

                              <div style={{ minWidth: 0 }}>
                                <Title level={4} style={{ margin: 0 }}>
                                  {pet?.name ?? "未绑定宠物"}
                                </Title>
                                <Text type="secondary">
                                  {pet ? `${pet.speciesLabel}` : "暂未绑定"}
                                </Text>
                              </div>
                            </div>
                          )}

                          <Row gutter={[12, 12]}>
                            <Col span={8}>
                              <Text type="secondary">主人</Text>
                              <div>
                                <Text strong>{owner?.nickname ?? "-"}</Text>
                              </div>
                            </Col>
                            <Col span={8}>
                              <Text type="secondary">
                                {device.type === "desktop" && bindingPets.length > 0 ? "绑定宠物数" : "陪伴时长"}
                              </Text>
                              <div>
                                <Text strong style={{ color: "#3b82f6" }}>
                                  {device.type === "desktop" && bindingPets.length > 0
                                    ? `${bindingPets.length}只`
                                    : pet
                                      ? `${pet.companionDays}天`
                                      : "-"}
                                </Text>
                              </div>
                            </Col>
                            <Col span={8}>
                              <Text type="secondary">
                                {device.type === "desktop" && bindingPets.length > 0 ? "首个宠物编号" : "宠物编号"}
                              </Text>
                              <div>
                                <Text strong>{bindingPets[0]?.id ?? pet?.id ?? "-"}</Text>
                              </div>
                            </Col>
                          </Row>
                        </Space>
                      </Card>
                    </Col>

                    <Col xs={24} xl={12}>
                      <Card bordered={false} style={{ background: "#effcf5", borderRadius: 16, minHeight: 250 }} styles={{ body: { padding: 18 } }}>
                        <Space direction="vertical" size={12} style={{ width: "100%" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                            <div>
                              <Text strong style={{ color: "#166534" }}>宠物图像定制</Text>
                              <div style={{ marginTop: 4 }}>
                                <Text type="secondary">
                                  {completedActions >= totalActions && totalActions > 0 ? "已完成" : avatarUploaded ? "定制中" : "待开始"}
                                </Text>
                              </div>
                            </div>
                            <Text strong style={{ color: "#166534", fontSize: 28 }}>
                              {`${completedActions}/${totalActions} 完成`}
                            </Text>
                          </div>

                          <Space direction="vertical" size={8}>
                            <Text style={{ color: avatarUploaded ? "#166534" : "#8c8c8c" }}>
                              {avatarUploaded ? "✓ 图像已上传" : "× 图像未上传"}
                            </Text>
                            <Text style={{ color: avatarApproved ? "#166534" : "#8c8c8c" }}>
                              {avatarApproved ? "✓ 图像已审核" : detail.avatarProgress.pending > 0 ? `审核中 ${detail.avatarProgress.pending}` : "× 等待图像审核"}
                            </Text>
                            <Text type="secondary">{`动态生成中 ${completedActions}/${totalActions}`}</Text>
                          </Space>

                          <Progress percent={avatarProgressPercent} showInfo={false} strokeColor="#22c55e" trailColor="#dbe4f0" />

                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <Text type="secondary">{`最后更新 ${formatTime(detail.lastSyncedAt ?? device.lastOnlineAt)}`}</Text>
                          </div>
                        </Space>
                      </Card>
                    </Col>

                    <Col xs={24} xl={12}>
                      <Card bordered={false} style={{ background: "#eef5ff", borderRadius: 16, minHeight: 220 }} styles={{ body: { padding: 18 } }}>
                        <Space direction="vertical" size={16} style={{ width: "100%" }}>
                          <div>
                            <Text strong style={{ color: "#1d4ed8" }}>
                              {device.type === "desktop" ? "桌面端与项圈绑定" : "项圈与桌面端绑定"}
                            </Text>
                            <div style={{ marginTop: 4 }}>{renderBindingStatus(!!counterpart)}</div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                            <Card bordered={false} style={{ background: "#dbeafe", width: "100%" }} styles={{ body: { padding: 16, textAlign: "center" } }}>
                              <Text type="secondary">{device.type === "desktop" ? "桌面端" : "项圈"}</Text>
                              <Title level={4} style={{ margin: "8px 0 0" }}>
                                {device.name || currentDeviceLabel}
                              </Title>
                            </Card>
                            <Text style={{ fontSize: 28, color: "#0f172a" }}>⟷</Text>
                            <Card bordered={false} style={{ background: "#dbeafe", width: "100%" }} styles={{ body: { padding: 16, textAlign: "center" } }}>
                              <Text type="secondary">{counterpart ? (counterpart.type === "desktop" ? "桌面端" : "项圈") : counterpartLabel}</Text>
                              <Title level={4} style={{ margin: "8px 0 0" }}>
                                {counterpart?.name ?? "暂无绑定设备"}
                              </Title>
                            </Card>
                          </div>

                          <div style={{ textAlign: "center" }}>
                            <Text type="secondary">{counterpart ? "已建立关联设备" : "待建立绑定关系"}</Text>
                          </div>
                        </Space>
                      </Card>
                    </Col>

                    <Col xs={24} xl={12}>
                      <Card bordered={false} style={{ background: "#fff7ed", borderRadius: 16, minHeight: 220 }} styles={{ body: { padding: 18 } }}>
                        <Space direction="vertical" size={16} style={{ width: "100%" }}>
                          <div>
                            <Text strong style={{ color: "#c2410c" }}>设备状态信息</Text>
                            <div style={{ marginTop: 4 }}>{renderStatus(device.status)}</div>
                          </div>

                          <Row gutter={[16, 16]}>
                            <Col span={12}>
                              <Text type="secondary">连接状态</Text>
                              <div>
                                <Text strong style={{ color: device.status === "online" ? "#16a34a" : "#c2410c" }}>
                                  {device.status === "online" ? "已连接" : STATUS_LABELS[device.status]}
                                </Text>
                              </div>
                            </Col>
                            <Col span={12}>
                              <Text type="secondary">设备型号</Text>
                              <div>
                                <Text strong>{currentDeviceLabel}</Text>
                              </div>
                            </Col>
                            <Col span={12}>
                              <Text type="secondary">最近活跃</Text>
                              <div>
                                <Text strong>{formatRelativeTime(device.lastOnlineAt)}</Text>
                              </div>
                            </Col>
                            <Col span={12}>
                              <Text type="secondary">激活时间</Text>
                              <div>
                                <Text strong>{formatShortDate(detail.activatedAt)}</Text>
                              </div>
                            </Col>
                            <Col span={12}>
                              <Text type="secondary">电池</Text>
                              <div>
                                <Text strong>{batteryPercent == null ? "-" : `${batteryPercent}%`}</Text>
                              </div>
                            </Col>
                            <Col span={12}>
                              <Text type="secondary">信号</Text>
                              <div>
                                <Text strong style={{ color: signalColor }}>
                                  {signalLabel}
                                </Text>
                              </div>
                            </Col>
                          </Row>
                        </Space>
                      </Card>
                    </Col>
                  </Row>
                </Card>
              </>
            ) : (
              <Card>
                <Text type="secondary">设备详情加载失败或数据为空。</Text>
              </Card>
            )}
          </Spin>
        </Card>
      </Space>
    );
  }

  return (
    <Space direction="vertical" size={16} style={{ display: "flex" }}>
      <div>
        <Title level={2} style={{ margin: 0 }}>
          设备管理
        </Title>
      </div>

      <Card>
        <Space wrap style={{ display: "flex", justifyContent: "space-between" }}>
          <Input
            allowClear
            value={keyword}
            prefix={<SearchOutlined />}
            placeholder="搜索设备ID、Chip ID、Mac、型号、用户..."
            onChange={(event) => setKeyword(event.target.value)}
            style={{ width: 360, maxWidth: "100%" }}
          />
          <Space wrap>
            <Button
              type="primary"
              onClick={handleShowAll}
              style={{
                background: "#4da3ff",
                borderColor: "#4da3ff",
                borderRadius: 10,
                minWidth: 72,
                height: 40,
              }}
            >
              全部
            </Button>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
              style={{
                background: "#22c55e",
                borderColor: "#22c55e",
                borderRadius: 10,
                minWidth: 88,
                height: 40,
              }}
            >
              刷新
            </Button>
          </Space>
        </Space>
      </Card>

      <Card
        title={
          <Space split={<Text type="secondary">|</Text>}>
            <Text strong>设备列表</Text>
            <Text type="secondary">共 {total} 台设备</Text>
            <Text type="secondary">{boundDeviceCount} 台设备已绑定</Text>
          </Space>
        }
      >
        <Spin spinning={loading}>
          <Table<AdminDeviceListItem>
            dataSource={devices}
            columns={columns}
            rowKey={(record) => `${record.type}-${record.id}`}
            scroll={{ x: 1580 }}
            pagination={{ pageSize: 10, showSizeChanger: false }}
          />
        </Spin>
      </Card>
    </Space>
  );
}
