import { CloseCircleOutlined, UploadOutlined } from "@ant-design/icons";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Button, Form, Input, Modal, Select, Space, Table, Tag, Typography, message } from "antd";
import dayjs from "dayjs";
import { api, type CustomAction, type CustomActionStatus } from "../api/client";

type StatusFilter = "all" | CustomActionStatus;

const statusOptions: Array<{ label: string; value: StatusFilter }> = [
  { label: "全部状态", value: "all" },
  { label: "待处理", value: "pending" },
  { label: "处理中", value: "processing" },
  { label: "已完成", value: "done" },
  { label: "失败", value: "failed" },
];

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "请求失败";
}

function getStatusLabel(status: CustomActionStatus) {
  switch (status) {
    case "pending":
      return "待处理";
    case "processing":
      return "处理中";
    case "done":
      return "已完成";
    case "failed":
      return "失败";
    default:
      return status;
  }
}

function getStatusColor(status: CustomActionStatus) {
  switch (status) {
    case "pending":
      return "default";
    case "processing":
      return "processing";
    case "done":
      return "success";
    case "failed":
      return "error";
    default:
      return "default";
  }
}

export default function CustomActionsPage() {
  const [data, setData] = useState<CustomAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeAction, setActiveAction] = useState<CustomAction | null>(null);
  const [form] = Form.useForm<{ resultImageUrl: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);

    try {
      const result = await api.getCustomActions(statusFilter === "all" ? undefined : statusFilter);
      setData(result.customActions);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [statusFilter]);

  const handleStartProcessing = async (record: CustomAction) => {
    try {
      await api.updateCustomAction(record.id, { status: "processing" });
      message.success("已开始处理");
      await load();
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const handleMarkFailed = async (record: CustomAction) => {
    try {
      await api.updateCustomAction(record.id, { status: "failed" });
      message.success("已标记为失败");
      await load();
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const openDoneModal = (record: CustomAction) => {
    setActiveAction(record);
    form.setFieldsValue({ resultImageUrl: record.resultImageUrl ?? "" });
    setModalOpen(true);
  };

  const handleDone = async () => {
    if (!activeAction) {
      return;
    }

    try {
      const values = await form.validateFields();
      setSaving(true);
      await api.updateCustomAction(activeAction.id, {
        status: "done",
        resultImageUrl: values.resultImageUrl,
      });
      message.success("处理结果已上传");
      setModalOpen(false);
      setActiveAction(null);
      form.resetFields();
      await load();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleUploadResultFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      setUploading(true);
      const result = await api.uploadAdminFile(file);
      form.setFieldValue("resultImageUrl", result.url);
      message.success("结果文件上传成功");
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  const columns = [
    { title: "名称", dataIndex: "name", key: "name", width: 180 },
    { title: "宠物 ID", dataIndex: "petId", key: "petId", width: 180, ellipsis: true },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (status: CustomActionStatus) => (
        <Tag color={getStatusColor(status)}>{getStatusLabel(status)}</Tag>
      ),
    },
    {
      title: "视频 URL",
      dataIndex: "videoUrl",
      key: "videoUrl",
      ellipsis: true,
      render: (value: string) => (
        <Typography.Link href={value} target="_blank" rel="noreferrer">
          {value}
        </Typography.Link>
      ),
    },
    {
      title: "结果 URL",
      dataIndex: "resultImageUrl",
      key: "resultImageUrl",
      ellipsis: true,
      render: (value: string | null) =>
        value ? (
          <Typography.Link href={value} target="_blank" rel="noreferrer">
            {value}
          </Typography.Link>
        ) : (
          "-"
        ),
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      render: (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm:ss"),
    },
    {
      title: "操作",
      key: "action",
      width: 220,
      render: (_: unknown, record: CustomAction) => {
        if (record.status === "pending") {
          return (
            <Button size="small" onClick={() => void handleStartProcessing(record)}>
              开始处理
            </Button>
          );
        }

        if (record.status === "processing") {
          return (
            <Space size={8}>
              <Button size="small" type="primary" onClick={() => openDoneModal(record)}>
                上传结果
              </Button>
              <Button
                size="small"
                danger
                icon={<CloseCircleOutlined />}
                onClick={() => void handleMarkFailed(record)}
              >
                标记失败
              </Button>
            </Space>
          );
        }

        return <Typography.Text type="secondary">只读</Typography.Text>;
      },
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>自定义动作</h2>
        </div>
        <Space>
          <Select
            value={statusFilter}
            style={{ width: 180 }}
            options={statusOptions}
            onChange={(value) => setStatusFilter(value)}
          />
        </Space>
      </div>

      <Table dataSource={data} columns={columns} rowKey="id" loading={loading} size="middle" />

      <Modal
        title="上传处理结果"
        open={modalOpen}
        confirmLoading={saving}
        onOk={() => void handleDone()}
        onCancel={() => {
          setModalOpen(false);
          setActiveAction(null);
          form.resetFields();
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="上传结果文件">
            <Space>
              <Button
                icon={<UploadOutlined />}
                loading={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                上传图片或 GIF
              </Button>
              <Typography.Text type="secondary">
                支持 JPG / PNG / WEBP / GIF
              </Typography.Text>
            </Space>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: "none" }}
              onChange={(event) => void handleUploadResultFile(event)}
            />
          </Form.Item>
          <Form.Item
            name="resultImageUrl"
            label="结果图片 URL"
            rules={[{ required: true, message: "请输入结果图片 URL" }]}
          >
            <Input placeholder="https://example.com/result.gif" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
