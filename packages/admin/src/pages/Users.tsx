import { useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, InputNumber, Space, Popconfirm, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { api } from "../api/client";
import dayjs from "dayjs";

export default function UsersPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    api.getUsers().then((r) => setData(r.users)).catch((e) => message.error(e.message)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingId) {
        await api.updateUser(editingId, values);
        message.success("更新成功");
      } else {
        await api.createUser(values);
        message.success("创建成功");
      }
      setModalOpen(false);
      form.resetFields();
      setEditingId(null);
      load();
    } catch (e: any) {
      if (e.message) message.error(e.message);
    }
  };

  const handleEdit = (record: any) => {
    setEditingId(record.id);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ deviceBindingQuota: 3 });
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteUser(id);
      message.success("删除成功");
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 200, ellipsis: true },
    { title: "昵称", dataIndex: "nickname", key: "nickname" },
    { title: "手机", dataIndex: "phone", key: "phone" },
    { title: "微信 OpenID", dataIndex: "wechatOpenid", key: "wechatOpenid", ellipsis: true },
    { title: "形象配额", dataIndex: "avatarQuota", key: "avatarQuota", width: 100 },
    { title: "设备绑定额度", dataIndex: "deviceBindingQuota", key: "deviceBindingQuota", width: 120 },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm"),
    },
    {
      title: "操作",
      key: "action",
      width: 160,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>用户管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          新建用户
        </Button>
      </div>
      <Table dataSource={data} columns={columns} rowKey="id" loading={loading} size="middle" />
      <Modal
        title={editingId ? "编辑用户" : "新建用户"}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => { setModalOpen(false); setEditingId(null); form.resetFields(); }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="nickname" label="昵称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input />
          </Form.Item>
          <Form.Item name="wechatOpenid" label="微信 OpenID">
            <Input />
          </Form.Item>
          <Form.Item name="avatarQuota" label="形象配额">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="deviceBindingQuota" label="设备绑定额度" initialValue={3}>
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
