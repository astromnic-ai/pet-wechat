import { useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, InputNumber, Select, Space, Popconfirm, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { api } from "../api/client";
import dayjs from "dayjs";

export default function PetsPage() {
  const [data, setData] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    Promise.all([api.getPets(), api.getUsers()]).then(([p, u]) => {
      setData(p.pets);
      setUsers(u.users);
    }).catch((e) => message.error(e.message)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingId) {
        await api.updatePet(editingId, values);
        message.success("更新成功");
      } else {
        await api.createPet(values);
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

  const handleDelete = async (id: string) => {
    try {
      await api.deletePet(id);
      message.success("删除成功");
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 200, ellipsis: true },
    { title: "名字", dataIndex: "name", key: "name" },
    {
      title: "物种",
      dataIndex: "species",
      key: "species",
      width: 80,
      render: (v: string) => ({ cat: "猫", dog: "狗", other: "其他" }[v] ?? v),
    },
    {
      title: "性别",
      dataIndex: "gender",
      key: "gender",
      width: 80,
      render: (v: string) => ({ male: "公", female: "母", unknown: "未知" }[v]),
    },
    { title: "品种", dataIndex: "breed", key: "breed" },
    { title: "描述", dataIndex: "description", key: "description" },
    { title: "毛色", dataIndex: "color", key: "color", width: 120 },
    { title: "主人", dataIndex: "ownerNickname", key: "ownerNickname" },
    { title: "活跃分", dataIndex: "activityScore", key: "activityScore", width: 80 },
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
        <h2 style={{ margin: 0 }}>宠物管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); setModalOpen(true); }}>
          新建宠物
        </Button>
      </div>
      <Table dataSource={data} columns={columns} rowKey="id" loading={loading} size="middle" />
      <Modal
        title={editingId ? "编辑宠物" : "新建宠物"}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => { setModalOpen(false); setEditingId(null); form.resetFields(); }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="userId" label="所属用户" rules={[{ required: !editingId }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={users.map((u) => ({ value: u.id, label: `${u.nickname} (${u.id.slice(0, 8)}...)` }))}
            />
          </Form.Item>
          <Form.Item name="name" label="名字" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="species" label="物种" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "cat", label: "猫" },
                { value: "dog", label: "狗" },
                { value: "other", label: "其他" },
              ]}
            />
          </Form.Item>
          <Form.Item name="gender" label="性别">
            <Select options={[{ value: "male", label: "公" }, { value: "female", label: "母" }, { value: "unknown", label: "未知" }]} />
          </Form.Item>
          <Form.Item name="breed" label="品种">
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="color" label="毛色">
            <Input />
          </Form.Item>
          <Form.Item name="birthday" label="生日">
            <Input placeholder="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="weight" label="体重 (kg)">
            <InputNumber min={0} step={0.1} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
