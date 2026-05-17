import { useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Select, Space, Table, Tag, message } from "antd";
import type { TableProps } from "antd";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { api, type OtaRegistryDevice } from "../../api/client";

function formatTime(value?: string | null) {
  return value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-";
}

export default function OtaRegistryPage() {
  const [messageApi, contextHolder] = message.useMessage();
  const [items, setItems] = useState<OtaRegistryDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState<string | undefined>(undefined);
  const [version, setVersion] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const params = useMemo(() => {
    const query: Record<string, string> = { limit: "200" };
    if (online) query.online = online;
    if (version.trim()) query.version = version.trim();
    return query;
  }, [online, version]);

  useEffect(() => {
    let cancelled = false;

    async function loadItems() {
      setLoading(true);
      try {
        const response = await api.getOtaRegistry(params);
        if (!cancelled) {
          setItems(response.items ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          messageApi.error(error instanceof Error ? error.message : "设备清册加载失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    const timer = window.setTimeout(() => void loadItems(), 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [messageApi, params, reloadToken]);

  const columns: TableProps<OtaRegistryDevice>["columns"] = [
    { title: "Chip ID", dataIndex: "chipId" },
    {
      title: "在线",
      dataIndex: "online",
      width: 90,
      render: (value: boolean) => <Tag color={value ? "green" : "default"}>{value ? "在线" : "离线"}</Tag>,
    },
    { title: "固件", dataIndex: "fw", width: 120, render: (value) => value || "-" },
    { title: "IP", dataIndex: "ip", width: 150, render: (value) => value || "-" },
    { title: "RSSI", dataIndex: "rssi", width: 90, render: (value) => value ?? "-" },
    {
      title: "可用内存",
      dataIndex: "freeHeap",
      width: 120,
      render: (value: number | null) => (value == null ? "-" : `${Math.round(value / 1024)} KB`),
    },
    { title: "MAC", dataIndex: "mac", width: 150, render: (value) => value || "-" },
    { title: "最近在线", dataIndex: "lastSeenAt", width: 180, render: formatTime },
  ];

  return (
    <>
      {contextHolder}
      <Card
        title="设备清册"
        extra={
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => setReloadToken((value) => value + 1)}>
            刷新
          </Button>
        }
      >
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            allowClear
            placeholder="在线状态"
            style={{ width: 140 }}
            value={online}
            onChange={setOnline}
            options={[
              { label: "在线", value: "true" },
              { label: "离线", value: "false" },
            ]}
          />
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="目标版本筛选"
            style={{ width: 220 }}
            value={version}
            onChange={(event) => setVersion(event.target.value)}
          />
        </Space>
        <Table rowKey="chipId" columns={columns} dataSource={items} loading={loading} pagination={{ pageSize: 20 }} />
      </Card>
    </>
  );
}
