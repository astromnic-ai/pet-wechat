import { useEffect, useState } from "react";
import { Button, Card, Form, Modal, Popconfirm, Select, Space, Table, Tag, message } from "antd";
import type { TableProps } from "antd";
import { CloudUploadOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { api, type OtaDispatchJob, type OtaFirmwareVersion, type OtaInternalDevice } from "../../api/client";

const stages = ["received", "downloading", "verified", "failed", "rolled_back"] as const;
const stageLabels: Record<(typeof stages)[number], string> = {
  received: "已接收",
  downloading: "下载中",
  verified: "已验证",
  failed: "失败",
  rolled_back: "已回滚",
};

function formatTime(value?: string | null) {
  return value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-";
}

export default function OtaDispatchPage() {
  const [messageApi, contextHolder] = message.useMessage();
  const [items, setItems] = useState<OtaDispatchJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [internalDispatchOpen, setInternalDispatchOpen] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [firmwareVersions, setFirmwareVersions] = useState<OtaFirmwareVersion[]>([]);
  const [internalDevices, setInternalDevices] = useState<OtaInternalDevice[]>([]);
  const [form] = Form.useForm<{ version: string }>();
  const [internalForm] = Form.useForm<{ version: string; chipIds: string[] }>();

  const loadItems = async () => {
    setLoading(true);
    try {
      const response = await api.getOtaDispatchJobs({ limit: "100" });
      setItems(response.items ?? []);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "下发记录加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
    void Promise.all([api.getOtaFirmwareVersions(), api.getOtaInternalDevices()])
      .then(([versions, devices]) => {
        setFirmwareVersions(versions.items ?? []);
        setInternalDevices(devices.items ?? []);
      })
      .catch((error) => messageApi.error(error instanceof Error ? error.message : "内测下发数据加载失败"));
  }, []);

  const dispatchInternal = async () => {
    try {
      setDispatching(true);
      const values = await internalForm.validateFields();
      const response = await api.dispatchInternalOta(values.version, values.chipIds);
      messageApi.success(`已创建内测下发：${response.dispatched} 台`);
      if (response.skipped.length > 0) {
        messageApi.warning(`${response.skipped.length} 台设备不在白名单，已跳过`);
      }
      setInternalDispatchOpen(false);
      internalForm.resetFields();
      void loadItems();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "内测下发失败");
    } finally {
      setDispatching(false);
    }
  };

  const dispatchAll = async () => {
    try {
      setDispatching(true);
      const values = await form.validateFields();
      const response = await api.dispatchAllOta(values.version);
      messageApi.success(`已创建全量下发：${response.dispatched} 台`);
      setDispatchOpen(false);
      form.resetFields();
      void loadItems();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "全量下发失败");
    } finally {
      setDispatching(false);
    }
  };

  const columns: TableProps<OtaDispatchJob>["columns"] = [
    { title: "版本", dataIndex: "version", width: 140 },
    { title: "来源", dataIndex: "source", width: 120, render: (value) => <Tag>{value}</Tag> },
    { title: "总数", dataIndex: "totalCount", width: 90 },
    { title: "立即", dataIndex: "immediateCount", width: 90 },
    { title: "节流", dataIndex: "throttledCount", width: 90 },
    { title: "创建人", dataIndex: "createdBy", width: 150, render: (value) => value || "-" },
    { title: "下发时间", dataIndex: "dispatchedAt", width: 180, render: formatTime },
  ];

  return (
    <>
      {contextHolder}
      <Card
        title="下发记录"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadItems()}>
              刷新
            </Button>
            <Button onClick={() => setInternalDispatchOpen(true)}>
              内测下发
            </Button>
            <Button type="primary" icon={<CloudUploadOutlined />} onClick={() => setDispatchOpen(true)}>
              全量下发
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={{ pageSize: 20 }}
          expandable={{
            expandedRowRender: (record) => (
              <Space wrap>
                {stages.map((stage) => (
                  <Tag key={stage} color={stage === "failed" || stage === "rolled_back" ? "red" : "blue"}>
                    {stageLabels[stage]}: {record.progress?.[stage] ?? 0}
                  </Tag>
                ))}
              </Space>
            ),
          }}
        />
      </Card>
      <Modal title="全量下发" open={dispatchOpen} footer={null} onCancel={() => setDispatchOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="version" label="版本号" rules={[{ required: true, message: "请输入版本号" }]}>
            <Select
              placeholder="选择已转为全量的版本"
              options={firmwareVersions
                .filter((item) => item.state === "released")
                .map((item) => ({ label: item.version, value: item.version }))}
            />
          </Form.Item>
          <Popconfirm
            title="确认向所有已登记且可升级设备下发？离线设备将在重新上线后接收。"
            onConfirm={() => void dispatchAll()}
          >
            <Button type="primary" loading={dispatching}>
              确认下发
            </Button>
          </Popconfirm>
        </Form>
      </Modal>
      <Modal title="内测下发" open={internalDispatchOpen} footer={null} onCancel={() => setInternalDispatchOpen(false)}>
        <Form form={internalForm} layout="vertical">
          <Form.Item name="version" label="内测版本" rules={[{ required: true, message: "请选择内测版本" }]}>
            <Select
              placeholder="选择 internal 版本"
              options={firmwareVersions
                .filter((item) => item.state === "internal")
                .map((item) => ({ label: item.version, value: item.version }))}
            />
          </Form.Item>
          <Form.Item name="chipIds" label="内测设备" rules={[{ required: true, message: "请选择至少一台白名单设备" }]}>
            <Select
              mode="multiple"
              placeholder="从内测白名单选择设备"
              options={internalDevices.map((item) => ({
                label: item.note ? `${item.chipId} · ${item.note}` : item.chipId,
                value: item.chipId,
              }))}
            />
          </Form.Item>
          <Popconfirm title="确认向所选白名单设备下发该内测版本？" onConfirm={() => void dispatchInternal()}>
            <Button type="primary" loading={dispatching}>
              确认内测下发
            </Button>
          </Popconfirm>
        </Form>
      </Modal>
    </>
  );
}
