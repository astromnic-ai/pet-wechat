import { useEffect, useMemo, useState } from "react";
import type { TableProps } from "antd";
import {
  Divider,
  Button,
  Card,
  Col,
  Input,
  Progress,
  Row,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { ArrowLeftOutlined, CaretDownFilled, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { api } from "../api/client";

const { Text, Title } = Typography;

type DeviceType = "collar" | "desktop";
type DeviceModelFilter = "all" | DeviceType;
type DeviceStatusFilter = "all" | "online" | "offline" | "pairing";
type DeviceBoundFilter = "all" | "bound" | "unbound";
type DeviceImageFilter = "all" | "uploaded" | "not_uploaded";
type PetSpeciesValue = "cat" | "dog" | "other";
type SpeciesFilter = "all" | PetSpeciesValue;
type CreatedSortOrder = "desc" | "asc";

interface BaseDevice {
  id: string;
  userId: string | null;
  name: string | null;
  macAddress: string | null;
  status: string;
  firmwareVersion: string | null;
  lastOnlineAt: string | null;
  createdAt: string;
  updatedAt: string;
  ownerNickname: string | null;
}

interface CollarDevice extends BaseDevice {
  petId: string | null;
  battery: number | null;
  signal: number | null;
  petName: string | null;
  petSpecies: string | null;
  hasUploadedImage: boolean;
}

interface DesktopDevice extends BaseDevice {
  bindingPetNames: string[];
  bindingPetSpeciesList: string[];
  activeBindingCount: number;
  hasUploadedImage: boolean;
}

type SelectedDevice =
  | { type: "collar"; record: CollarDevice }
  | { type: "desktop"; record: DesktopDevice };

type DeviceListRecord = {
  id: string;
  type: DeviceType;
  modelLabel: string;
  ownerNickname: string | null;
  deviceName: string | null;
  searchableText: string;
  petImageStatus: DeviceImageFilter;
  isBound: boolean;
  bindingStatusLabel: string;
  petBindingText: string;
  petSpecies: PetSpeciesValue;
  petSpeciesLabel: string;
  status: string;
  createdAt: string;
  raw: CollarDevice | DesktopDevice;
};

type SelectedDeviceSummary = {
  modelLabel: string;
  petImageStatus: "uploaded" | "not_uploaded";
  isBound: boolean;
  petSpecies: PetSpeciesValue;
  petBindingText: string;
};

const deviceModelLabels: Record<DeviceType, string> = {
  desktop: "桌面宠物1.0",
  collar: "宠物项圈1.0",
};

const statusColors: Record<string, string> = {
  online: "green",
  offline: "default",
  pairing: "orange",
};

const statusLabels: Record<string, string> = {
  online: "在线",
  offline: "离线",
  pairing: "连接中断",
};

const speciesLabels: Record<PetSpeciesValue, string> = {
  cat: "猫",
  dog: "狗",
  other: "其他",
};

const modelOptions = [
  { value: "all", label: "全部型号" },
  { value: "desktop", label: "桌面宠物1.0" },
  { value: "collar", label: "宠物项圈1.0" },
] satisfies { value: DeviceModelFilter; label: string }[];

const imageOptions = [
  { value: "all", label: "全部图像状态" },
  { value: "uploaded", label: "已上传" },
  { value: "not_uploaded", label: "未上传" },
] satisfies { value: DeviceImageFilter; label: string }[];

const boundOptions = [
  { value: "all", label: "全部绑定状态" },
  { value: "bound", label: "已绑定宠物" },
  { value: "unbound", label: "未绑定宠物" },
] satisfies { value: DeviceBoundFilter; label: string }[];

const speciesOptions = [
  { value: "all", label: "全部宠物类型" },
  { value: "cat", label: "猫" },
  { value: "dog", label: "狗" },
  { value: "other", label: "其他" },
] satisfies { value: SpeciesFilter; label: string }[];

const statusOptions = [
  { value: "all", label: "全部设备状态" },
  { value: "pairing", label: "连接中断" },
  { value: "online", label: "在线" },
  { value: "offline", label: "离线" },
] satisfies { value: DeviceStatusFilter; label: string }[];

const sortOptions = [
  { value: "desc", label: "注册时间：倒序" },
  { value: "asc", label: "注册时间：顺序" },
] satisfies { value: CreatedSortOrder; label: string }[];

function formatTime(value: string | null | undefined) {
  return value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-";
}

function renderStatus(value: string) {
  return <Tag color={statusColors[value] ?? "default"}>{statusLabels[value] ?? value}</Tag>;
}

function renderImageStatus(value: DeviceImageFilter) {
  if (value === "uploaded") {
    return <Tag color="green">已上传</Tag>;
  }

  return <Tag color="default">未上传</Tag>;
}

function renderBindingStatus(isBound: boolean) {
  return isBound ? <Tag color="green">已绑定</Tag> : <Tag color="default">未绑定</Tag>;
}

function renderSpeciesTag(value: PetSpeciesValue) {
  const color = value === "cat" ? "purple" : value === "dog" ? "cyan" : "default";
  return <Tag color={color}>{speciesLabels[value]}</Tag>;
}

function normalizeSpecies(value?: string | null): PetSpeciesValue {
  if (value === "cat" || value === "dog") {
    return value;
  }

  return "other";
}

function getDesktopSpecies(speciesList: string[] | undefined): PetSpeciesValue {
  const uniqueSpecies = new Set((speciesList ?? []).map((item) => normalizeSpecies(item)));

  if (uniqueSpecies.size === 1) {
    return Array.from(uniqueSpecies)[0];
  }

  return "other";
}

function renderFilterTitle(label: string) {
  return (
    <Space size={4}>
      <span>{label}</span>
      <CaretDownFilled style={{ fontSize: 10, color: "#8c8c8c" }} />
    </Space>
  );
}

function pickSingleFilter<T extends string>(value: unknown, fallback: T): T {
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0] as T;
  }

  if (typeof value === "string") {
    return value as T;
  }

  return fallback;
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

function buildDeviceRows(collars: CollarDevice[], desktops: DesktopDevice[]): DeviceListRecord[] {
  const collarRows: DeviceListRecord[] = collars.map((record) => {
    const petSpecies = normalizeSpecies(record.petSpecies);
    const isBound = !!record.petId;
    const petBindingText = record.petName ?? "-";

    return {
      id: record.id,
      type: "collar",
      modelLabel: deviceModelLabels.collar,
      ownerNickname: record.ownerNickname,
      deviceName: record.name,
      searchableText: [
        record.id,
        record.name,
        record.ownerNickname,
        record.petName,
        deviceModelLabels.collar,
        record.macAddress,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      petImageStatus: isBound && record.hasUploadedImage ? "uploaded" : "not_uploaded",
      isBound,
      bindingStatusLabel: isBound ? "已绑定宠物" : "未绑定宠物",
      petBindingText,
      petSpecies: isBound ? petSpecies : "other",
      petSpeciesLabel: speciesLabels[isBound ? petSpecies : "other"],
      status: record.status,
      createdAt: record.createdAt,
      raw: record,
    };
  });

  const desktopRows: DeviceListRecord[] = desktops.map((record) => {
    const petSpecies = record.activeBindingCount > 0 ? getDesktopSpecies(record.bindingPetSpeciesList) : "other";
    const isBound = record.activeBindingCount > 0;
    const petBindingText = isBound ? record.bindingPetNames.join(" / ") : "-";

    return {
      id: record.id,
      type: "desktop",
      modelLabel: deviceModelLabels.desktop,
      ownerNickname: record.ownerNickname,
      deviceName: record.name,
      searchableText: [
        record.id,
        record.name,
        record.ownerNickname,
        record.bindingPetNames.join(" "),
        deviceModelLabels.desktop,
        record.macAddress,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      petImageStatus: isBound && record.hasUploadedImage ? "uploaded" : "not_uploaded",
      isBound,
      bindingStatusLabel: isBound ? "已绑定宠物" : "未绑定宠物",
      petBindingText,
      petSpecies,
      petSpeciesLabel: speciesLabels[petSpecies],
      status: record.status,
      createdAt: record.createdAt,
      raw: record,
    };
  });

  return [...collarRows, ...desktopRows];
}

export default function DevicesPage() {
  const [loading, setLoading] = useState(true);
  const [collars, setCollars] = useState<CollarDevice[]>([]);
  const [desktops, setDesktops] = useState<DesktopDevice[]>([]);
  const [keyword, setKeyword] = useState("");
  const [modelFilter, setModelFilter] = useState<DeviceModelFilter>("all");
  const [imageFilter, setImageFilter] = useState<DeviceImageFilter>("all");
  const [boundFilter, setBoundFilter] = useState<DeviceBoundFilter>("all");
  const [speciesFilter, setSpeciesFilter] = useState<SpeciesFilter>("all");
  const [statusFilter, setStatusFilter] = useState<DeviceStatusFilter>("all");
  const [sortOrder, setSortOrder] = useState<CreatedSortOrder>("desc");
  const [selectedDevice, setSelectedDevice] = useState<SelectedDevice | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDevices() {
      setLoading(true);

      try {
        const [collarResult, desktopResult] = await Promise.all([
          api.getFilteredCollars({ sort: "createdAt", order: "desc" }),
          api.getFilteredDesktops({ sort: "createdAt", order: "desc" }),
        ]);

        if (!cancelled) {
          setCollars((collarResult.collars as CollarDevice[]) ?? []);
          setDesktops((desktopResult.desktops as DesktopDevice[]) ?? []);
        }
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

    void loadDevices();

    return () => {
      cancelled = true;
    };
  }, []);

  const deviceRows = useMemo(() => buildDeviceRows(collars, desktops), [collars, desktops]);

  const filteredDevices = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return deviceRows
      .filter((device) => {
        if (normalizedKeyword && !device.searchableText.includes(normalizedKeyword)) {
          return false;
        }

        if (modelFilter !== "all" && device.type !== modelFilter) {
          return false;
        }

        if (imageFilter !== "all" && device.petImageStatus !== imageFilter) {
          return false;
        }

        if (boundFilter === "bound" && !device.isBound) {
          return false;
        }

        if (boundFilter === "unbound" && device.isBound) {
          return false;
        }

        if (speciesFilter !== "all" && device.petSpecies !== speciesFilter) {
          return false;
        }

        if (statusFilter !== "all" && device.status !== statusFilter) {
          return false;
        }

        return true;
      })
      .sort((left, right) => {
        const leftTime = dayjs(left.createdAt).valueOf();
        const rightTime = dayjs(right.createdAt).valueOf();
        return sortOrder === "asc" ? leftTime - rightTime : rightTime - leftTime;
      });
  }, [boundFilter, deviceRows, imageFilter, keyword, modelFilter, sortOrder, speciesFilter, statusFilter]);

  const boundDeviceCount = useMemo(
    () => filteredDevices.filter((device) => device.isBound).length,
    [filteredDevices],
  );

  const columns: TableProps<DeviceListRecord>["columns"] = [
    {
      title: "设备ID",
      dataIndex: "id",
      key: "id",
      width: 220,
      render: (value: string, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{value}</Text>
          <Text type="secondary">{record.deviceName ?? "-"}</Text>
        </Space>
      ),
    },
    {
      title: "Mac地址",
      dataIndex: "raw",
      key: "macAddress",
      width: 180,
      render: (_value, record) => (record.raw.macAddress ?? "-"),
    },
    {
      title: "设备型号",
      dataIndex: "modelLabel",
      key: "modelLabel",
      width: 150,
      filters: modelOptions.filter((option) => option.value !== "all").map((option) => ({ text: option.label, value: option.value })),
      filteredValue: modelFilter === "all" ? null : [modelFilter],
      onFilter: (value, record) => record.type === value,
      render: (value: string) => value,
    },
    {
      title: renderFilterTitle("宠物头像"),
      dataIndex: "petImageStatus",
      key: "petImageStatus",
      width: 120,
      filters: imageOptions.filter((option) => option.value !== "all").map((option) => ({ text: option.label, value: option.value })),
      filteredValue: imageFilter === "all" ? null : [imageFilter],
      onFilter: (value, record) => record.petImageStatus === value,
      render: (value: DeviceImageFilter) => renderImageStatus(value),
    },
    {
      title: renderFilterTitle("设备绑定"),
      dataIndex: "isBound",
      key: "isBound",
      width: 120,
      filters: [
        { text: "已绑定", value: "bound" },
        { text: "未绑定", value: "unbound" },
      ],
      filteredValue: boundFilter === "all" ? null : [boundFilter],
      onFilter: (value, record) => (value === "bound" ? record.isBound : !record.isBound),
      render: (value: boolean) => renderBindingStatus(value),
    },
    {
      title: renderFilterTitle("宠物类型"),
      dataIndex: "petSpecies",
      key: "petSpecies",
      width: 180,
      filters: speciesOptions.filter((option) => option.value !== "all").map((option) => ({ text: option.label, value: option.value })),
      filteredValue: speciesFilter === "all" ? null : [speciesFilter],
      onFilter: (value, record) => record.petSpecies === value,
      render: (value: PetSpeciesValue, record) => (
        <Space direction="vertical" size={2}>
          <Text>{record.petBindingText}</Text>
          <Text type="secondary">{speciesLabels[value]}</Text>
        </Space>
      ),
    },
    {
      title: renderFilterTitle("设备状态"),
      dataIndex: "status",
      key: "status",
      width: 120,
      filters: statusOptions.filter((option) => option.value !== "all").map((option) => ({ text: option.label, value: option.value })),
      filteredValue: statusFilter === "all" ? null : [statusFilter],
      onFilter: (value, record) => record.status === value,
      render: (value: string) => renderStatus(value),
    },
    {
      title: "用户信息",
      dataIndex: "ownerNickname",
      key: "ownerNickname",
      width: 140,
      render: (value: string | null) => value ?? "-",
    },
    {
      title: renderFilterTitle("注册时间"),
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      filters: [
        { text: "倒序", value: "desc" },
        { text: "顺序", value: "asc" },
      ],
      filteredValue: [sortOrder],
      onFilter: () => true,
      render: (value: string) => formatTime(value),
    },
    {
      title: "管理设备",
      key: "actions",
      width: 100,
      fixed: "right",
      render: (_value, record) => (
        <Space size={4}>
          <Button
            type="link"
            onClick={() =>
              setSelectedDevice(
                record.type === "collar"
                  ? { type: "collar", record: record.raw as CollarDevice }
                  : { type: "desktop", record: record.raw as DesktopDevice },
              )
            }
          >
            管理
          </Button>
        </Space>
      ),
    },
  ];

  const selectedDeviceSummary = useMemo<SelectedDeviceSummary | null>(() => {
    if (!selectedDevice) {
      return null;
    }

    if (selectedDevice.type === "collar") {
      const petSpecies = selectedDevice.record.petId ? normalizeSpecies(selectedDevice.record.petSpecies) : "other";
      return {
        modelLabel: deviceModelLabels.collar,
        petImageStatus: selectedDevice.record.petId && selectedDevice.record.hasUploadedImage ? "uploaded" : "not_uploaded",
        isBound: !!selectedDevice.record.petId,
        petSpecies,
        petBindingText: selectedDevice.record.petName ?? "-",
      };
    }

    const petSpecies = selectedDevice.record.activeBindingCount > 0 ? getDesktopSpecies(selectedDevice.record.bindingPetSpeciesList) : "other";
    return {
      modelLabel: deviceModelLabels.desktop,
      petImageStatus: selectedDevice.record.activeBindingCount > 0 && selectedDevice.record.hasUploadedImage ? "uploaded" : "not_uploaded",
      isBound: selectedDevice.record.activeBindingCount > 0,
      petSpecies,
      petBindingText: selectedDevice.record.activeBindingCount > 0 ? selectedDevice.record.bindingPetNames.join(" / ") : "-",
    };
  }, [selectedDevice]);

  const selectedDeviceTitle = useMemo(() => {
    if (!selectedDevice || !selectedDeviceSummary) {
      return "设备详情";
    }

    return `${selectedDevice.record.name ?? selectedDeviceSummary.modelLabel}设备详情`;
  }, [selectedDevice, selectedDeviceSummary]);

  const selectedDeviceDetail = useMemo(() => {
    if (!selectedDevice || !selectedDeviceSummary) {
      return null;
    }

    const counterpart =
      selectedDevice.type === "collar"
        ? desktops.find((desktop) => desktop.userId && desktop.userId === selectedDevice.record.userId) ?? null
        : collars.find((collar) => collar.userId && collar.userId === selectedDevice.record.userId) ?? null;

    const isCollar = selectedDevice.type === "collar";
    const batteryPercent = isCollar ? selectedDevice.record.battery ?? 85 : 85;
    const signalLabel = isCollar
      ? getSignalLabel(selectedDevice.record.signal, selectedDevice.record.status)
      : getSignalLabel(null, selectedDevice.record.status);
    const signalColor = signalLabel === "强" ? "#16a34a" : signalLabel === "中" ? "#d97706" : "#9ca3af";
    const customizationCompleted = selectedDeviceSummary.petImageStatus === "uploaded" ? 3 : 0;
    const customizationTotal = 18;
    const bindingDurationDays = Math.max(1, dayjs().diff(dayjs(selectedDevice.record.createdAt), "day"));

    return {
      batteryPercent,
      signalLabel,
      signalColor,
      lastSyncLabel: formatRelativeTime(selectedDevice.record.lastOnlineAt ?? selectedDevice.record.updatedAt),
      activeAtLabel: formatTime(selectedDevice.record.createdAt),
      counterpart,
      customizationCompleted,
      customizationTotal,
      customizationPercent: Math.round((customizationCompleted / customizationTotal) * 100),
      bindingDurationDays,
    };
  }, [collars, desktops, selectedDevice, selectedDeviceSummary]);

  if (selectedDevice && selectedDeviceSummary && selectedDeviceDetail) {
    return (
      <Space direction="vertical" size={20} style={{ display: "flex" }}>
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          style={{ padding: 0, width: "fit-content" }}
          onClick={() => setSelectedDevice(null)}
        >
          返回列表
        </Button>

        <Card styles={{ body: { padding: 24 } }}>
          <Divider style={{ margin: "0 0 24px" }} />

          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 28 }}>
            <Title level={3} style={{ margin: 0 }}>
              {selectedDeviceTitle}
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
              <Button
                danger
                disabled
                style={{
                  minWidth: 120,
                  height: 40,
                  borderRadius: 12,
                }}
              >
                永久删除
              </Button>
            </Space>
          </div>

          <Row gutter={[32, 20]} style={{ marginBottom: 28 }}>
            <Col xs={24} md={12} xl={6}>
              <Space direction="vertical" size={10}>
                <div><Text type="secondary">设备名称</Text> <Text strong>{selectedDevice.record.name ?? "-"}</Text></div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Text type="secondary">电池状态</Text>
                  <Text strong>{`${selectedDeviceDetail.batteryPercent}%`}</Text>
                  <Progress
                    percent={selectedDeviceDetail.batteryPercent}
                    showInfo={false}
                    strokeColor="#22c55e"
                    trailColor="#e5e7eb"
                    style={{ width: 90, marginInlineStart: 4 }}
                  />
                </div>
              </Space>
            </Col>
            <Col xs={24} md={12} xl={6}>
              <Space direction="vertical" size={10}>
                <div><Text type="secondary">设备型号</Text> <Text strong>{selectedDeviceSummary.modelLabel}</Text></div>
                <div><Text type="secondary">信号强度</Text> <Text strong style={{ color: selectedDeviceDetail.signalColor }}>{selectedDeviceDetail.signalLabel}</Text></div>
              </Space>
            </Col>
            <Col xs={24} md={12} xl={6}>
              <Space direction="vertical" size={10}>
                <div><Text type="secondary">MAC地址</Text> <Text strong>{selectedDevice.record.macAddress ?? "-"}</Text></div>
                <div><Text type="secondary">最后同步</Text> <Text strong>{selectedDeviceDetail.lastSyncLabel}</Text></div>
              </Space>
            </Col>
            <Col xs={24} md={12} xl={6}>
              <Space direction="vertical" size={10}>
                <div><Text type="secondary">固件版本</Text> <Text strong>{selectedDevice.record.firmwareVersion ?? "v2.4.1"}</Text></div>
                <div><Text type="secondary">激活时间</Text> <Text strong>{selectedDeviceDetail.activeAtLabel}</Text></div>
              </Space>
            </Col>
          </Row>

          <Card title={<Text strong style={{ fontSize: 16 }}>设备宠物</Text>} styles={{ body: { padding: 16 } }}>
            <Row gutter={[16, 16]}>
              <Col xs={24} xl={12}>
                <Card
                  bordered={false}
                  style={{ background: "#f8fafc", borderRadius: 16, minHeight: 250 }}
                  styles={{ body: { padding: 18 } }}
                >
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <div>
                      <Text strong>设备宠物信息</Text>
                      <div style={{ marginTop: 4 }}>{renderBindingStatus(selectedDeviceSummary.isBound)}</div>
                    </div>

                    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                      <div
                        style={{
                          width: 84,
                          height: 84,
                          borderRadius: "50%",
                          background: "#dbe4f0",
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <Title level={4} style={{ margin: 0 }}>
                          {selectedDeviceSummary.petBindingText}
                        </Title>
                        <Text type="secondary">
                          {`${speciesLabels[selectedDeviceSummary.petSpecies]} | ${selectedDevice.record.id.slice(0, 4).toUpperCase()}`}
                        </Text>
                      </div>
                    </div>

                    <Row gutter={[12, 12]}>
                      <Col span={8}>
                        <Text type="secondary">主人</Text>
                        <div><Text strong>{selectedDevice.record.ownerNickname ?? "-"}</Text></div>
                      </Col>
                      <Col span={8}>
                        <Text type="secondary">陪伴时长</Text>
                        <div><Text strong style={{ color: "#3b82f6" }}>{`${selectedDeviceDetail.bindingDurationDays}天`}</Text></div>
                      </Col>
                      <Col span={8}>
                        <Text type="secondary">宠物编号</Text>
                        <div><Text strong>{selectedDeviceSummary.isBound ? `PET${selectedDevice.record.id.slice(-3).toUpperCase()}` : "-"}</Text></div>
                      </Col>
                    </Row>
                  </Space>
                </Card>
              </Col>

              <Col xs={24} xl={12}>
                <Card
                  bordered={false}
                  style={{ background: "#effcf5", borderRadius: 16, minHeight: 250 }}
                  styles={{ body: { padding: 18 } }}
                >
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                      <div>
                        <Text strong style={{ color: "#166534" }}>宠物图像定制</Text>
                        <div style={{ marginTop: 4 }}><Text type="secondary">定制中</Text></div>
                      </div>
                      <Text strong style={{ color: "#166534", fontSize: 28 }}>
                        {`${selectedDeviceDetail.customizationCompleted}/${selectedDeviceDetail.customizationTotal} 完成`}
                      </Text>
                    </div>

                    <Space direction="vertical" size={8}>
                      <Text style={{ color: "#166534" }}>{selectedDeviceSummary.petImageStatus === "uploaded" ? "✓ 图像已上传" : "× 图像未上传"}</Text>
                      <Text style={{ color: "#166534" }}>{selectedDeviceSummary.petImageStatus === "uploaded" ? "✓ 图像已审核" : "× 等待图像审核"}</Text>
                      <Text type="secondary">{`× 动态生成中 ${selectedDeviceDetail.customizationCompleted}/${selectedDeviceDetail.customizationTotal}`}</Text>
                    </Space>

                    <Progress
                      percent={selectedDeviceDetail.customizationPercent}
                      showInfo={false}
                      strokeColor="#22c55e"
                      trailColor="#dbe4f0"
                    />

                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <Text type="secondary">{`最后更新 ${formatTime(selectedDevice.record.updatedAt)}`}</Text>
                    </div>
                  </Space>
                </Card>
              </Col>

              <Col xs={24} xl={12}>
                <Card
                  bordered={false}
                  style={{ background: "#eef5ff", borderRadius: 16, minHeight: 220 }}
                  styles={{ body: { padding: 18 } }}
                >
                  <Space direction="vertical" size={16} style={{ width: "100%" }}>
                    <div>
                      <Text strong style={{ color: "#1d4ed8" }}>
                        {selectedDevice.type === "desktop" ? "桌面端与项圈绑定" : "项圈与桌面端绑定"}
                      </Text>
                      <div style={{ marginTop: 4 }}>{renderBindingStatus(!!selectedDeviceDetail.counterpart)}</div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <Card bordered={false} style={{ background: "#dbeafe", width: "100%" }} styles={{ body: { padding: 16, textAlign: "center" } }}>
                        <Text type="secondary">{selectedDevice.type === "desktop" ? "桌面端" : "项圈"}</Text>
                        <Title level={4} style={{ margin: "8px 0 0" }}>{selectedDevice.record.name ?? selectedDeviceSummary.modelLabel}</Title>
                      </Card>
                      <Text style={{ fontSize: 28, color: "#0f172a" }}>⟷</Text>
                      <Card bordered={false} style={{ background: "#dbeafe", width: "100%" }} styles={{ body: { padding: 16, textAlign: "center" } }}>
                        <Text type="secondary">{selectedDevice.type === "desktop" ? "项圈" : "桌面端"}</Text>
                        <Title level={4} style={{ margin: "8px 0 0" }}>
                          {selectedDeviceDetail.counterpart?.name ?? "暂无绑定设备"}
                        </Title>
                      </Card>
                    </div>

                    <div style={{ textAlign: "center" }}>
                      <Text type="secondary">{selectedDeviceDetail.counterpart ? `绑定${selectedDeviceDetail.bindingDurationDays}天` : "待建立绑定关系"}</Text>
                    </div>
                  </Space>
                </Card>
              </Col>

              <Col xs={24} xl={12}>
                <Card
                  bordered={false}
                  style={{ background: "#fff7ed", borderRadius: 16, minHeight: 220 }}
                  styles={{ body: { padding: 18 } }}
                >
                  <Space direction="vertical" size={16} style={{ width: "100%" }}>
                    <div>
                      <Text strong style={{ color: "#c2410c" }}>项圈状态信息</Text>
                      <div style={{ marginTop: 4 }}>{renderStatus(selectedDevice.record.status)}</div>
                    </div>

                    <Row gutter={[16, 16]}>
                      <Col span={12}>
                        <Text type="secondary">连接状态</Text>
                        <div><Text strong style={{ color: "#16a34a" }}>{selectedDevice.record.status === "online" ? "已连接" : statusLabels[selectedDevice.record.status] ?? "-"}</Text></div>
                      </Col>
                      <Col span={12}>
                        <Text type="secondary">设备型号</Text>
                        <div><Text strong>{selectedDeviceSummary.modelLabel}</Text></div>
                      </Col>
                      <Col span={12}>
                        <Text type="secondary">最近活跃</Text>
                        <div><Text strong>{selectedDeviceDetail.lastSyncLabel}</Text></div>
                      </Col>
                      <Col span={12}>
                        <Text type="secondary">激活时间</Text>
                        <div><Text strong>{dayjs(selectedDevice.record.createdAt).format("YYYY-MM-DD")}</Text></div>
                      </Col>
                      <Col span={12}>
                        <Text type="secondary">电池</Text>
                        <div><Text strong>{`${selectedDeviceDetail.batteryPercent}%`}</Text></div>
                      </Col>
                      <Col span={12}>
                        <Text type="secondary">信号</Text>
                        <div><Text strong style={{ color: selectedDeviceDetail.signalColor }}>{selectedDeviceDetail.signalLabel}</Text></div>
                      </Col>
                    </Row>
                  </Space>
                </Card>
              </Col>
            </Row>
          </Card>
        </Card>
      </Space>
    );
  }

  return (
    <>
      <Space direction="vertical" size={16} style={{ display: "flex" }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>
            设备管理
          </Title>
        </div>

        <Card>
          <Input
            allowClear
            value={keyword}
            prefix={<SearchOutlined />}
            placeholder="搜索ID设备、型号、用户..."
            onChange={(event) => setKeyword(event.target.value)}
          />
        </Card>

        <Card
          title={
            <Space split={<Text type="secondary">|</Text>}>
              <Text strong>设备列表</Text>
              <Text type="secondary">共 {filteredDevices.length} 台设备</Text>
              <Text type="secondary">{boundDeviceCount} 台设备已绑定</Text>
            </Space>
          }
        >
          <Spin spinning={loading}>
            <Table<DeviceListRecord>
              dataSource={filteredDevices}
              columns={columns}
              rowKey={(record) => `${record.type}-${record.id}`}
              scroll={{ x: 1380 }}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              onChange={(_pagination, filters) => {
                setModelFilter(pickSingleFilter<DeviceModelFilter>(filters.modelLabel, "all"));
                setImageFilter(pickSingleFilter<DeviceImageFilter>(filters.petImageStatus, "all"));
                setBoundFilter(pickSingleFilter<DeviceBoundFilter>(filters.isBound, "all"));
                setSpeciesFilter(pickSingleFilter<SpeciesFilter>(filters.petSpecies, "all"));
                setStatusFilter(pickSingleFilter<DeviceStatusFilter>(filters.status, "all"));
                setSortOrder(pickSingleFilter<CreatedSortOrder>(filters.createdAt, "desc"));
              }}
            />
          </Spin>
        </Card>
      </Space>
    </>
  );
}
