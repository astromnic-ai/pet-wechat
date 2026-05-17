import { useEffect, useState } from "react";
import { Button, Card, Form, Input, Modal, Popconfirm, Space, Table, message } from "antd";
import type { TableProps } from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { api, type OtaInternalDevice } from "../../api/client";

function formatTime(value?: string | null) {
  return value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-";
}

export default function OtaInternalPage() {
  const [messageApi, contextHolder] = message.useMessage();
  const [items, setItems] = useState<OtaInternalDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<{ chipId: string; note?: string }>();

  const loadItems = async () => {
    setLoading(true);
    try {
      const response = await api.getOtaInternalDevices();
      setItems(response.items ?? []);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "内测设备加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, []);

  const saveItem = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();
      await api.createOtaInternalDevice(values);
      messageApi.success("已保存");
      setModalOpen(false);
      form.resetFields();
      void loadItems();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (chipId: string) => {
    try {
      await api.deleteOtaInternalDevice(chipId);
      messageApi.success("已删除");
      void loadItems();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  const columns: TableProps<OtaInternalDevice>["columns"] = [
    { title: "Chip ID", dataIndex: "chipId" },
    { title: "备注", dataIndex: "note", render: (value) => value || "-" },
    { title: "添加人", dataIndex: "addedBy", width: 160 },
    { title: "添加时间", dataIndex: "addedAt", width: 180, render: formatTime },
    {
      title: "操作",
      width: 100,
      render: (_, record) => (
        <Popconfirm title="删除内测设备" onConfirm={() => void deleteItem(record.chipId)}>
          <Button size="small" danger>
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <>
      {contextHolder}
      <Card
        title="内测白名单"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadItems()}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              添加设备
            </Button>
          </Space>
        }
      >
        <Table rowKey="chipId" columns={columns} dataSource={items} loading={loading} pagination={{ pageSize: 20 }} />
      </Card>
      <Modal title="添加内测设备" open={modalOpen} confirmLoading={saving} onOk={() => void saveItem()} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="chipId" label="Chip ID" rules={[{ required: true, message: "请输入 chipId" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
