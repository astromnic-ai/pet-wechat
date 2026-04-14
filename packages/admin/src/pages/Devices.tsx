import { useEffect, useState } from "react";
import type { TableProps, TabsProps } from "antd";
import { Button, Col, Descriptions, Drawer, Row, Select, Space, Spin, Table, Tabs, Tag, message } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { api } from "../api/client";

type DeviceTabKey = "collar" | "desktop";
type OnlineStatusFilter = "all" | "online" | "offline";
type BoundStatusFilter = "all" | "bound" | "unbound";
type SpeciesFilter = "all" | "cat" | "dog";
type SortField = "createdAt" | "lastOnlineAt";
type SortOrder = "asc" | "desc";

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
}

interface DesktopDevice extends BaseDevice {}
interface DesktopDevice extends BaseDevice {
  bindingPetNames: string[];
  activeBindingCount: number;
}

interface CollarFilters {
  status: OnlineStatusFilter;
  bound: BoundStatusFilter;
  species: SpeciesFilter;
  sort: SortField;
  order: SortOrder;
}

interface DesktopFilters {
  status: OnlineStatusFilter;
  bound: BoundStatusFilter;
  sort: SortField;
  order: SortOrder;
}

type SelectedDevice =
  | { type: "collar"; record: CollarDevice }
  | { type: "desktop"; record: DesktopDevice };

const statusColors: Record<string, string> = {
  online: "green",
  offline: "default",
  pairing: "blue",
};

const statusLabels: Record<string, string> = {
  online: "在线",
  offline: "离线",
  pairing: "配对中",
};

const statusOptions = [
  { value: "all", label: "全部" },
  { value: "online", label: "在线" },
  { value: "offline", label: "离线" },
] satisfies { value: OnlineStatusFilter; label: string }[];

const boundOptions = [
  { value: "all", label: "全部" },
  { value: "bound", label: "已绑定" },
  { value: "unbound", label: "未绑定" },
] satisfies { value: BoundStatusFilter; label: string }[];

const speciesOptions = [
  { value: "all", label: "全部" },
  { value: "cat", label: "猫" },
  { value: "dog", label: "狗" },
] satisfies { value: SpeciesFilter; label: string }[];

const sortOptions = [
  { value: "createdAt", label: "注册时间" },
  { value: "lastOnlineAt", label: "最后在线时间" },
] satisfies { value: SortField; label: string }[];

const defaultCollarFilters: CollarFilters = {
  status: "all",
  bound: "all",
  species: "all",
  sort: "createdAt",
  order: "desc",
};

const defaultDesktopFilters: DesktopFilters = {
  status: "all",
  bound: "all",
  sort: "createdAt",
  order: "desc",
};

function formatTime(value: string | null | undefined) {
  return value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-";
}

function renderStatus(value: string) {
  return <Tag color={statusColors[value] ?? "default"}>{statusLabels[value] ?? value}</Tag>;
}

function renderBoundUser(value: string | null) {
  return value ?? <Tag color="orange">未绑定</Tag>;
}

function renderBindingPets(names?: string[]) {
  if (!names || names.length === 0) {
    return "-";
  }

  return names.join(" / ");
}

function buildCollarParams(filters: CollarFilters) {
  const params: Record<string, string> = {
    sort: filters.sort,
    order: filters.order,
  };

  if (filters.status !== "all") {
    params.status = filters.status;
  }

  if (filters.bound !== "all") {
    params.bound = filters.bound === "bound" ? "true" : "false";
  }

  if (filters.species !== "all") {
    params.species = filters.species;
  }

  return params;
}

function buildDesktopParams(filters: DesktopFilters) {
  const params: Record<string, string> = {
    sort: filters.sort,
    order: filters.order,
  };

  if (filters.status !== "all") {
    params.status = filters.status;
  }

  if (filters.bound !== "all") {
    params.bound = filters.bound === "bound" ? "true" : "false";
  }

  return params;
}

export default function DevicesPage() {
  const [activeTab, setActiveTab] = useState<DeviceTabKey>("collar");
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [collars, setCollars] = useState<CollarDevice[]>([]);
  const [desktops, setDesktops] = useState<DesktopDevice[]>([]);
  const [collarFilters, setCollarFilters] = useState<CollarFilters>(defaultCollarFilters);
  const [desktopFilters, setDesktopFilters] = useState<DesktopFilters>(defaultDesktopFilters);
  const [selectedDevice, setSelectedDevice] = useState<SelectedDevice | null>(null);

  const collarQueryKey = [
    collarFilters.status,
    collarFilters.bound,
    collarFilters.species,
    collarFilters.sort,
    collarFilters.order,
  ].join("|");

  const desktopQueryKey = [
    desktopFilters.status,
    desktopFilters.bound,
    desktopFilters.sort,
    desktopFilters.order,
  ].join("|");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      try {
        if (activeTab === "collar") {
          const result = await api.getFilteredCollars(buildCollarParams(collarFilters));
          if (!cancelled) {
            setCollars(result.collars as CollarDevice[]);
          }
        } else {
          const result = await api.getFilteredDesktops(buildDesktopParams(desktopFilters));
          if (!cancelled) {
            setDesktops(result.desktops as DesktopDevice[]);
          }
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

    void load();

    return () => {
      cancelled = true;
    };
  }, [activeTab, reloadToken, activeTab === "collar" ? collarQueryKey : desktopQueryKey]);

  const collarColumns: TableProps<CollarDevice>["columns"] = [
    {
      title: "设备名称",
      dataIndex: "name",
      key: "name",
      width: 180,
      render: (value: string | null) => value ?? "-",
    },
    {
      title: "MAC 地址",
      dataIndex: "macAddress",
      key: "macAddress",
      width: 180,
      render: (value: string | null) => value ?? "-",
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (value: string) => renderStatus(value),
    },
    {
      title: "电量",
      dataIndex: "battery",
      key: "battery",
      width: 90,
      render: (value: number | null) => (value == null ? "-" : `${value}%`),
    },
    {
      title: "信号",
      dataIndex: "signal",
      key: "signal",
      width: 100,
      render: (value: number | null) => (value == null ? "-" : `${value} dBm`),
    },
    {
      title: "绑定用户",
      dataIndex: "ownerNickname",
      key: "ownerNickname",
      width: 140,
      render: (value: string | null) => renderBoundUser(value),
    },
    {
      title: "绑定宠物",
      dataIndex: "petName",
      key: "petName",
      width: 140,
      render: (value: string | null) => value ?? "-",
    },
    {
      title: "最后在线时间",
      dataIndex: "lastOnlineAt",
      key: "lastOnlineAt",
      width: 180,
      render: (value: string | null) => formatTime(value),
    },
    {
      title: "注册时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      render: (value: string) => formatTime(value),
    },
  ];

  const desktopColumns: TableProps<DesktopDevice>["columns"] = [
    {
      title: "设备名称",
      dataIndex: "name",
      key: "name",
      width: 180,
      render: (value: string | null) => value ?? "-",
    },
    {
      title: "MAC 地址",
      dataIndex: "macAddress",
      key: "macAddress",
      width: 180,
      render: (value: string | null) => value ?? "-",
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (value: string) => renderStatus(value),
    },
    {
      title: "固件版本",
      dataIndex: "firmwareVersion",
      key: "firmwareVersion",
      width: 120,
      render: (value: string | null) => value ?? "-",
    },
    {
      title: "绑定用户",
      dataIndex: "ownerNickname",
      key: "ownerNickname",
      width: 140,
      render: (value: string | null) => renderBoundUser(value),
    },
    {
      title: "绑定宠物",
      dataIndex: "bindingPetNames",
      key: "bindingPetNames",
      width: 180,
      render: (value: string[] | undefined) => renderBindingPets(value),
    },
    {
      title: "最后在线时间",
      dataIndex: "lastOnlineAt",
      key: "lastOnlineAt",
      width: 180,
      render: (value: string | null) => formatTime(value),
    },
    {
      title: "注册时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      render: (value: string) => formatTime(value),
    },
  ];

  const activeFilters = activeTab === "collar" ? collarFilters : desktopFilters;

  const tabItems: TabsProps["items"] = [
    {
      key: "collar",
      label: "项圈",
      children: (
        <Table<CollarDevice>
          dataSource={collars}
          columns={collarColumns}
          rowKey="id"
          size="middle"
          scroll={{ x: 1400 }}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          onRow={(record) => ({
            onClick: () => setSelectedDevice({ type: "collar", record }),
            style: { cursor: "pointer" },
          })}
        />
      ),
    },
    {
      key: "desktop",
      label: "桌面端",
      children: (
        <Table<DesktopDevice>
          dataSource={desktops}
          columns={desktopColumns}
          rowKey="id"
          size="middle"
          scroll={{ x: 1200 }}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          onRow={(record) => ({
            onClick: () => setSelectedDevice({ type: "desktop", record }),
            style: { cursor: "pointer" },
          })}
        />
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>设备管理</h2>
      </div>

      <Row gutter={[12, 12]} align="middle" style={{ marginBottom: 16 }}>
        <Col flex="160px">
          <Select<OnlineStatusFilter>
            value={activeFilters.status}
            style={{ width: "100%" }}
            options={statusOptions}
            onChange={(value) => {
              if (activeTab === "collar") {
                setCollarFilters((prev) => ({ ...prev, status: value }));
              } else {
                setDesktopFilters((prev) => ({ ...prev, status: value }));
              }
            }}
          />
        </Col>
        <Col flex="160px">
          <Select<BoundStatusFilter>
            value={activeFilters.bound}
            style={{ width: "100%" }}
            options={boundOptions}
            onChange={(value) => {
              if (activeTab === "collar") {
                setCollarFilters((prev) => ({ ...prev, bound: value }));
              } else {
                setDesktopFilters((prev) => ({ ...prev, bound: value }));
              }
            }}
          />
        </Col>
        {activeTab === "collar" ? (
          <Col flex="160px">
            <Select<SpeciesFilter>
              value={collarFilters.species}
              style={{ width: "100%" }}
              options={speciesOptions}
              onChange={(value) => setCollarFilters((prev) => ({ ...prev, species: value }))}
            />
          </Col>
        ) : null}
        <Col flex="180px">
          <Select<SortField>
            value={activeFilters.sort}
            style={{ width: "100%" }}
            options={sortOptions}
            onChange={(value) => {
              if (activeTab === "collar") {
                setCollarFilters((prev) => ({ ...prev, sort: value }));
              } else {
                setDesktopFilters((prev) => ({ ...prev, sort: value }));
              }
            }}
          />
        </Col>
        <Col flex="120px">
          <Button
            block
            onClick={() => {
              if (activeTab === "collar") {
                setCollarFilters((prev) => ({ ...prev, order: prev.order === "asc" ? "desc" : "asc" }));
              } else {
                setDesktopFilters((prev) => ({ ...prev, order: prev.order === "asc" ? "desc" : "asc" }));
              }
            }}
          >
            {activeFilters.order === "asc" ? "升序" : "降序"}
          </Button>
        </Col>
        <Col flex="120px">
          <Button block icon={<ReloadOutlined />} onClick={() => setReloadToken((value) => value + 1)}>
            刷新
          </Button>
        </Col>
      </Row>

      <Spin spinning={loading}>
        <Tabs
          activeKey={activeTab}
          items={tabItems}
          onChange={(key) => {
            setActiveTab(key as DeviceTabKey);
            setSelectedDevice(null);
          }}
        />
      </Spin>

      <Drawer
        title={selectedDevice?.type === "collar" ? "项圈详情" : "桌面端详情"}
        width={480}
        open={!!selectedDevice}
        onClose={() => setSelectedDevice(null)}
        extra={
          <Button onClick={() => setSelectedDevice(null)}>
            关闭
          </Button>
        }
      >
        {selectedDevice ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Descriptions
              bordered
              column={1}
              size="small"
              items={
                selectedDevice.type === "collar"
                  ? [
                      { key: "name", label: "设备名称", children: selectedDevice.record.name ?? "-" },
                      { key: "id", label: "设备 ID", children: selectedDevice.record.id },
                      { key: "mac", label: "MAC 地址", children: selectedDevice.record.macAddress ?? "-" },
                      { key: "status", label: "在线状态", children: renderStatus(selectedDevice.record.status) },
                      {
                        key: "bound",
                        label: "绑定状态",
                        children: selectedDevice.record.userId ? "已绑定" : "未绑定",
                      },
                      { key: "owner", label: "绑定用户", children: selectedDevice.record.ownerNickname ?? "-" },
                      { key: "pet", label: "绑定宠物", children: selectedDevice.record.petName ?? "-" },
                      {
                        key: "battery",
                        label: "电量",
                        children: selectedDevice.record.battery == null ? "-" : `${selectedDevice.record.battery}%`,
                      },
                      {
                        key: "signal",
                        label: "信号",
                        children: selectedDevice.record.signal == null ? "-" : `${selectedDevice.record.signal} dBm`,
                      },
                      { key: "firmware", label: "固件版本", children: selectedDevice.record.firmwareVersion ?? "-" },
                      { key: "lastOnlineAt", label: "最后在线时间", children: formatTime(selectedDevice.record.lastOnlineAt) },
                      { key: "createdAt", label: "注册时间", children: formatTime(selectedDevice.record.createdAt) },
                      { key: "updatedAt", label: "更新时间", children: formatTime(selectedDevice.record.updatedAt) },
                    ]
                  : [
                      { key: "name", label: "设备名称", children: selectedDevice.record.name ?? "-" },
                      { key: "id", label: "设备 ID", children: selectedDevice.record.id },
                      { key: "mac", label: "MAC 地址", children: selectedDevice.record.macAddress ?? "-" },
                      { key: "status", label: "在线状态", children: renderStatus(selectedDevice.record.status) },
                      {
                        key: "bound",
                        label: "绑定状态",
                        children: selectedDevice.record.activeBindingCount > 0 ? "已绑定" : "未绑定",
                      },
                      { key: "owner", label: "绑定用户", children: selectedDevice.record.ownerNickname ?? "-" },
                      {
                        key: "pets",
                        label: "绑定宠物",
                        children: renderBindingPets(selectedDevice.record.bindingPetNames),
                      },
                      { key: "firmware", label: "固件版本", children: selectedDevice.record.firmwareVersion ?? "-" },
                      { key: "lastOnlineAt", label: "最后在线时间", children: formatTime(selectedDevice.record.lastOnlineAt) },
                      { key: "createdAt", label: "注册时间", children: formatTime(selectedDevice.record.createdAt) },
                      { key: "updatedAt", label: "更新时间", children: formatTime(selectedDevice.record.updatedAt) },
                    ]
              }
            />

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button onClick={() => setSelectedDevice(null)}>关闭</Button>
            </div>
          </Space>
        ) : null}
      </Drawer>
    </>
  );
}
