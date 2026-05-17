import { useEffect, useState } from "react";
import { Button, Card, Form, Input, Modal, Popconfirm, Space, Table, Typography, message } from "antd";
import type { TableProps } from "antd";
import { CopyOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { api, type OtaToken } from "../../api/client";

const { Text } = Typography;

function formatTime(value?: string | null) {
  return value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-";
}

export default function OtaTokensPage() {
  const [messageApi, contextHolder] = message.useMessage();
  const [items, setItems] = useState<OtaToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdToken, setCreatedToken] = useState("");
  const [form] = Form.useForm<{ name: string }>();

  const loadItems = async () => {
    setLoading(true);
    try {
      const response = await api.getOtaTokens();
      setItems(response.items ?? []);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "Token 列表加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, []);

  const createToken = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();
      const response = await api.createOtaToken(values.name);
      setCreatedToken(response.token);
      messageApi.success("Token 已创建");
      form.resetFields();
      void loadItems();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setSaving(false);
    }
  };

  const revokeToken = async (id: string) => {
    try {
      await api.revokeOtaToken(id);
      messageApi.success("已吊销");
      void loadItems();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "吊销失败");
    }
  };

  const columns: TableProps<OtaToken>["columns"] = [
    { title: "名称", dataIndex: "name" },
    { title: "前缀", dataIndex: "tokenPrefix", width: 140, render: (value) => <code>{value}</code> },
    { title: "创建人", dataIndex: "createdBy", width: 150 },
    { title: "创建时间", dataIndex: "createdAt", width: 180, render: formatTime },
    { title: "最近使用", dataIndex: "lastUsedAt", width: 180, render: formatTime },
    { title: "吊销时间", dataIndex: "revokedAt", width: 180, render: formatTime },
    {
      title: "操作",
      width: 100,
      render: (_, record) =>
        record.revokedAt ? (
          "-"
        ) : (
          <Popconfirm title="吊销该 OTA Token？" onConfirm={() => void revokeToken(record.id)}>
            <Button size="small" danger>
              吊销
            </Button>
          </Popconfirm>
        ),
    },
  ];

  return (
    <>
      {contextHolder}
      <Card
        title="OTA 上传 Token"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadItems()}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              新建 Token
            </Button>
          </Space>
        }
      >
        <Table rowKey="id" columns={columns} dataSource={items} loading={loading} pagination={{ pageSize: 20 }} />
      </Card>
      <Modal
        title="新建 OTA Token"
        open={modalOpen}
        okText="创建"
        confirmLoading={saving}
        onOk={() => void createToken()}
        onCancel={() => {
          setModalOpen(false);
          setCreatedToken("");
          form.resetFields();
        }}
      >
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Form form={form} layout="vertical">
            <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入名称" }]}>
              <Input placeholder="release.sh" />
            </Form.Item>
          </Form>
          {createdToken ? (
            <Space direction="vertical" style={{ width: "100%" }}>
              <Text type="warning">明文 Token 仅显示一次。</Text>
              <Input.TextArea value={createdToken} readOnly autoSize={{ minRows: 2 }} />
              <Button
                icon={<CopyOutlined />}
                onClick={() => {
                  void navigator.clipboard.writeText(createdToken);
                  messageApi.success("已复制");
                }}
              >
                复制
              </Button>
            </Space>
          ) : null}
        </Space>
      </Modal>
    </>
  );
}
