import { useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, InputNumber, Select, Space, Popconfirm, Tag, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { api } from "../api/client";
import dayjs from "dayjs";

const statusColors: Record<string, string> = { online: "green", offline: "default", pairing: "blue" };
const statusLabels: Record<string, string> = { online: "在线", offline: "离线", pairing: "配对中" };

export default function CollarsPage() {
  const [data, setData] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [pets, setPets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    Promise.all([api.getCollars(), api.getUsers(), api.getPets()]).then(([c, u, p]) => {
      setData(c.collars);
      setUsers(u.users);
      setPets(p.pets);
    }).catch((e) => message.error(e.message)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingId) {
        await api.updateCollar(editingId, values);
        message.success("更新成功");
      } else {
        await api.createCollar(values);
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
      await api.deleteCollar(id);
      message.success("删除成功");
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 200, ellipsis: true },
    { title: "名称", dataIndex: "name", key: "name" },
    { title: "MAC 地址", dataIndex: "macAddress", key: "macAddress", width: 180 },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 90,
      render: (v: string) => <Tag color={statusColors[v]}>{statusLabels[v]}</Tag>,
    },
    { title: "电量", dataIndex: "battery", key: "battery", width: 70, render: (v: number | null) => v != null ? `${v}%` : "-" },
    { title: "信号", dataIndex: "signal", key: "signal", width: 70, render: (v: number | null) => v != null ? `${v}dBm` : "-" },
    { title: "主人", dataIndex: "ownerNickname", key: "ownerNickname", render: (v: string | null) => v ?? <Tag color="orange">无主</Tag> },
    { title: "绑定宠物", dataIndex: "petName", key: "petName", render: (v: string | null) => v ?? "-" },
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
        <h2 style={{ margin: 0 }}>项圈管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); setModalOpen(true); }}>
          新建项圈
        </Button>
      </div>
      <Table dataSource={data} columns={columns} rowKey="id" loading={loading} size="middle" scroll={{ x: 1200 }} />
      <Modal
        title={editingId ? "编辑项圈" : "新建项圈"}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => { setModalOpen(false); setEditingId(null); form.resetFields(); }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="userId" label="所属用户（留空 = 无主设备）">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="留空创建无主设备"
              options={users.map((u) => ({ value: u.id, label: `${u.nickname} (${u.id.slice(0, 8)}...)` }))}
            />
          </Form.Item>
          <Form.Item name="name" label="设备名称">
            <Input placeholder="项圈" />
          </Form.Item>
          <Form.Item name="macAddress" label="MAC 地址">
            <Input placeholder="留空自动生成" />
          </Form.Item>
          <Form.Item name="petId" label="绑定宠物">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={pets.map((p) => ({ value: p.id, label: `${p.name} (${p.id.slice(0, 8)}...)` }))}
            />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select options={[
              { value: "online", label: "在线" },
              { value: "offline", label: "离线" },
              { value: "pairing", label: "配对中" },
            ]} />
          </Form.Item>
          <Form.Item name="battery" label="电量 (%)">
            <InputNumber min={0} max={100} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="signal" label="信号 (dBm)">
            <InputNumber min={-100} max={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="firmwareVersion" label="固件版本">
            <Input placeholder="1.0.0" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
