import { useEffect, useState } from "react";
import { Alert, Button, Card, Form, Input, Modal, Popconfirm, Space, Table, Tag, Upload, message } from "antd";
import type { TableProps, UploadProps } from "antd";
import { ReloadOutlined, UploadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { FirmwareState } from "shared";
import { api, type OtaFirmwareVersion, type OtaReleaseReadiness } from "../../api/client";

const stateMeta: Record<FirmwareState, { label: string; color: string }> = {
  draft: { label: "草稿", color: "default" },
  internal: { label: "内测", color: "blue" },
  released: { label: "全量", color: "green" },
  quarantine: { label: "隔离", color: "red" },
};

function formatTime(value?: string | null) {
  return value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-";
}

function nextStates(state: FirmwareState): FirmwareState[] {
  if (state === "draft") return ["internal", "quarantine"];
  if (state === "internal") return ["quarantine"];
  if (state === "quarantine") return ["released"];
  return ["quarantine"];
}

export default function OtaFirmwarePage() {
  const [messageApi, contextHolder] = message.useMessage();
  const [items, setItems] = useState<OtaFirmwareVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [readinessVersion, setReadinessVersion] = useState<OtaFirmwareVersion | null>(null);
  const [readiness, setReadiness] = useState<OtaReleaseReadiness | null>(null);
  const [form] = Form.useForm<{ version: string; releaseNote?: string }>();

  const loadItems = async () => {
    setLoading(true);
    try {
      const response = await api.getOtaFirmwareVersions();
      setItems(response.items ?? []);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "固件版本加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, []);

  const uploadFirmware: NonNullable<UploadProps["customRequest"]> = async (options) => {
    const file = options.file instanceof File ? options.file : null;
    if (!file) {
      options.onError?.(new Error("请选择固件文件"));
      return;
    }

    try {
      setUploading(true);
      const values = await form.validateFields();
      await api.uploadOtaFirmware({
        version: values.version,
        releaseNote: values.releaseNote,
        firmware: file,
      });
      options.onSuccess?.({}, file);
      messageApi.success("固件上传成功");
      setUploadOpen(false);
      form.resetFields();
      void loadItems();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "固件上传失败";
      options.onError?.(error instanceof Error ? error : new Error(messageText));
      messageApi.error(messageText);
    } finally {
      setUploading(false);
    }
  };

  const updateState = async (record: OtaFirmwareVersion, state: FirmwareState) => {
    try {
      await api.updateOtaFirmwareState(record.id, state);
      messageApi.success("状态已更新");
      void loadItems();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "状态切换失败");
    }
  };

  const loadReadiness = async (record: OtaFirmwareVersion) => {
    setReadinessVersion(record);
    setReadinessOpen(true);
    setReadinessLoading(true);
    try {
      setReadiness(await api.getOtaReleaseReadiness(record.version));
    } catch (error) {
      setReadiness(null);
      messageApi.error(error instanceof Error ? error.message : "发布检查失败");
    } finally {
      setReadinessLoading(false);
    }
  };

  const releaseFirmware = async () => {
    if (!readinessVersion || !readiness?.ok) return;
    setReleasing(true);
    try {
      await api.updateOtaFirmwareState(readinessVersion.id, "released");
      messageApi.success(`${readinessVersion.version} 已转为全量版本`);
      setReadinessOpen(false);
      setReadiness(null);
      void loadItems();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "全量发布失败");
      void loadReadiness(readinessVersion);
    } finally {
      setReleasing(false);
    }
  };

  const columns: TableProps<OtaFirmwareVersion>["columns"] = [
    { title: "版本", dataIndex: "version", width: 140 },
    {
      title: "状态",
      dataIndex: "state",
      width: 100,
      render: (state: FirmwareState) => <Tag color={stateMeta[state].color}>{stateMeta[state].label}</Tag>,
    },
    {
      title: "大小",
      dataIndex: "size",
      width: 120,
      render: (size: number) => `${(size / 1024 / 1024).toFixed(2)} MB`,
    },
    {
      title: "SHA256",
      dataIndex: "sha256",
      ellipsis: true,
      render: (value: string) => <code>{value.slice(0, 16)}...</code>,
    },
    { title: "上传时间", dataIndex: "uploadedAt", width: 170, render: formatTime },
    { title: "隔离原因", dataIndex: "quarantinedReason", ellipsis: true, render: (value) => value || "-" },
    {
      title: "操作",
      key: "actions",
      width: 260,
      render: (_, record) => (
        <Space wrap>
          {record.state === "internal" ? (
            <Button size="small" type="primary" onClick={() => void loadReadiness(record)}>
              发布检查
            </Button>
          ) : null}
          {nextStates(record.state).map((state) => (
            <Popconfirm
              key={state}
              title={`切换为${stateMeta[state].label}`}
              onConfirm={() => void updateState(record, state)}
            >
              <Button size="small" danger={state === "quarantine"}>
                {stateMeta[state].label}
              </Button>
            </Popconfirm>
          ))}
        </Space>
      ),
    },
  ];

  return (
    <>
      {contextHolder}
      <Card
        title="固件版本"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void loadItems()} loading={loading}>
              刷新
            </Button>
            <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadOpen(true)}>
              上传固件
            </Button>
          </Space>
        }
      >
        <Table rowKey="id" columns={columns} dataSource={items} loading={loading} pagination={{ pageSize: 20 }} />
      </Card>

      <Modal
        title="上传固件"
        open={uploadOpen}
        footer={null}
        onCancel={() => {
          setUploadOpen(false);
          form.resetFields();
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="version" label="版本号" rules={[{ required: true, message: "请输入版本号" }]}>
            <Input placeholder="v1.2.3" />
          </Form.Item>
          <Form.Item name="releaseNote" label="发布说明">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Upload maxCount={1} customRequest={uploadFirmware} showUploadList>
            <Button icon={<UploadOutlined />} loading={uploading}>
              选择并上传 .bin
            </Button>
          </Upload>
        </Form>
      </Modal>

      <Modal
        title={`${readinessVersion?.version ?? ""} 发布检查`}
        open={readinessOpen}
        width={760}
        confirmLoading={releasing}
        okText="确认转为全量"
        okButtonProps={{ disabled: !readiness?.ok || readinessLoading }}
        onOk={() => void releaseFirmware()}
        onCancel={() => setReadinessOpen(false)}
      >
        {readinessLoading ? (
          <Alert type="info" showIcon message="正在检查内测设备状态…" />
        ) : readiness ? (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Alert
              type={readiness.ok ? "success" : "warning"}
              showIcon
              message={readiness.ok ? "已满足全量发布条件" : "暂不满足全量发布条件"}
              description={
                readiness.ok
                  ? `共 ${readiness.checkedChipIds.length} 台内测设备已验证通过。`
                  : `未验证 ${readiness.missingVerified?.length ?? 0} 台，近期失败或回滚 ${readiness.recentFailures?.length ?? 0} 台。`
              }
            />
            <Table
              rowKey="chipId"
              size="small"
              pagination={false}
              dataSource={readiness.devices}
              columns={[
                { title: "Chip ID", dataIndex: "chipId" },
                {
                  title: "最新终态",
                  dataIndex: "latestStage",
                  width: 130,
                  render: (stage: string | null) => (
                    <Tag color={stage === "verified" ? "green" : stage ? "red" : "default"}>{stage || "未上报"}</Tag>
                  ),
                },
                { title: "错误码", dataIndex: "code", width: 120, render: (value: string | null) => value || "-" },
                { title: "原因", dataIndex: "reason", render: (value: string | null) => value || "-" },
                { title: "上报时间", dataIndex: "receivedAt", width: 170, render: formatTime },
              ]}
            />
            <Button onClick={() => readinessVersion && void loadReadiness(readinessVersion)} loading={readinessLoading}>
              刷新检查
            </Button>
          </Space>
        ) : (
          <Alert type="error" showIcon message="未能获取发布检查结果" />
        )}
      </Modal>
    </>
  );
}
