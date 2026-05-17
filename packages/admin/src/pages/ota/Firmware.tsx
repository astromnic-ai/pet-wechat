import { useEffect, useState } from "react";
import { Button, Card, Form, Input, Modal, Popconfirm, Space, Table, Tag, Upload, message } from "antd";
import type { TableProps, UploadProps } from "antd";
import { ReloadOutlined, UploadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { FirmwareState } from "shared";
import { api, type OtaFirmwareVersion } from "../../api/client";

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
  if (state === "internal") return ["released", "quarantine"];
  if (state === "quarantine") return ["released"];
  return ["quarantine"];
}

export default function OtaFirmwarePage() {
  const [messageApi, contextHolder] = message.useMessage();
  const [items, setItems] = useState<OtaFirmwareVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
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
    </>
  );
}
