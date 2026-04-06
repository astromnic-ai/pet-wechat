import { useEffect, useState } from "react";
import { Table, Button, Modal, Form, Input, InputNumber, Select, Space, message } from "antd";
import { PlusOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { api, type AdminMessageType, type CreateAdminMessageInput } from "../api/client";
import dayjs from "dayjs";

function getFilteredCollars(petId: string | undefined, collars: any[]) {
  if (!petId) return [];
  return collars.filter((collar) => collar.petId === petId);
}

function getCollarOptionLabel(collar: any) {
  const lastOnlineAt = collar.lastOnlineAt ? dayjs(collar.lastOnlineAt).format("YYYY-MM-DD HH:mm:ss") : "从未上线";
  const createdAt = dayjs(collar.createdAt).format("YYYY-MM-DD HH:mm:ss");
  return `${collar.name} (${collar.macAddress}) | 上次在线: ${lastOnlineAt} | 创建: ${createdAt}`;
}

function syncCollarField(form: any, petId: string | undefined, collars: any[]) {
  const currentCollarId = form.getFieldValue("collarDeviceId");
  if (!petId) {
    if (currentCollarId !== undefined) {
      form.setFieldValue("collarDeviceId", undefined);
    }
    return;
  }
  if (collars.length === 1) {
    if (currentCollarId !== collars[0].id) {
      form.setFieldValue("collarDeviceId", collars[0].id);
    }
    return;
  }
  if (!collars.some((collar) => collar.id === currentCollarId)) {
    form.setFieldValue("collarDeviceId", undefined);
  }
}

const messageTypeOptions: Array<{ value: AdminMessageType; label: string }> = [
  { value: "system", label: "系统消息" },
  { value: "authorization", label: "授权消息" },
  { value: "activity", label: "活动提醒" },
  { value: "health", label: "健康报告" },
  { value: "device", label: "设备提醒" },
  { value: "community", label: "社区互动" },
];

export default function EventsPage() {
  const [data, setData] = useState<any[]>([]);
  const [pets, setPets] = useState<any[]>([]);
  const [collars, setCollars] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageSaving, setMessageSaving] = useState(false);
  const [manualForm] = Form.useForm();
  const [autoForm] = Form.useForm();
  const [messageForm] = Form.useForm<CreateAdminMessageInput>();
  const manualPetId = Form.useWatch("petId", manualForm);
  const autoPetId = Form.useWatch("petId", autoForm);

  const load = () => {
    setLoading(true);
    Promise.all([api.getBehaviors(100), api.getPets(), api.getCollars(), api.getUsers()]).then(([b, p, c, u]) => {
      setData(b.behaviors);
      setPets(p.pets);
      setCollars(c.collars);
      setUsers(u.users);
    }).catch((e) => message.error(e.message)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(() => {
    syncCollarField(manualForm, manualPetId, getFilteredCollars(manualPetId, collars));
  }, [collars, manualForm, manualPetId]);

  useEffect(() => {
    syncCollarField(autoForm, autoPetId, getFilteredCollars(autoPetId, collars));
  }, [autoForm, autoPetId, collars]);

  const handleManual = async () => {
    try {
      const values = await manualForm.validateFields();
      await api.createBehavior(values);
      message.success("事件创建成功");
      setManualOpen(false);
      manualForm.resetFields();
      load();
    } catch (e: any) {
      if (e.message) message.error(e.message);
    }
  };

  const handleAuto = async () => {
    try {
      const values = await autoForm.validateFields();
      const result = await api.autoBehaviors(values);
      message.success(`成功生成 ${result.count} 条事件`);
      setAutoOpen(false);
      autoForm.resetFields();
      load();
    } catch (e: any) {
      if (e.message) message.error(e.message);
    }
  };

  const handleCreateMessage = async () => {
    try {
      const values = await messageForm.validateFields();
      setMessageSaving(true);
      await api.createMessage(values);
      message.success("消息创建成功");
      setMessageOpen(false);
      messageForm.resetFields();
    } catch (e: any) {
      if (e.message) message.error(e.message);
    } finally {
      setMessageSaving(false);
    }
  };

  const actionTypes = [
    { value: "walking", label: "散步" },
    { value: "running", label: "奔跑" },
    { value: "sleeping", label: "睡觉" },
    { value: "eating", label: "吃东西" },
    { value: "playing", label: "玩耍" },
    { value: "resting", label: "休息" },
    { value: "jumping", label: "跳跃" },
  ];

  const manualFilteredCollars = getFilteredCollars(manualPetId, collars);
  const autoFilteredCollars = getFilteredCollars(autoPetId, collars);
  const manualCollarOptions = manualFilteredCollars.map((collar) => ({
    value: collar.id,
    label: getCollarOptionLabel(collar),
  }));
  const autoCollarOptions = autoFilteredCollars.map((collar) => ({
    value: collar.id,
    label: getCollarOptionLabel(collar),
  }));
  const manualNoCollars = Boolean(manualPetId) && manualFilteredCollars.length === 0;
  const autoNoCollars = Boolean(autoPetId) && autoFilteredCollars.length === 0;

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 200, ellipsis: true },
    { title: "宠物", dataIndex: "petName", key: "petName", render: (v: string | null) => v ?? "-" },
    { title: "项圈", dataIndex: "collarName", key: "collarName", render: (v: string | null) => v ?? "-" },
    { title: "行为类型", dataIndex: "actionType", key: "actionType" },
    {
      title: "时间",
      dataIndex: "timestamp",
      key: "timestamp",
      width: 180,
      render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm:ss"),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>模拟事件</h2>
        <Space>
          <Button
            onClick={() => {
              messageForm.setFieldsValue({ type: "system", isRead: false });
              setMessageOpen(true);
            }}
          >
            发送消息
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { manualForm.resetFields(); setManualOpen(true); }}>
            手动创建
          </Button>
          <Button icon={<ThunderboltOutlined />} onClick={() => { autoForm.resetFields(); setAutoOpen(true); }}>
            批量生成
          </Button>
        </Space>
      </div>

      <Table dataSource={data} columns={columns} rowKey="id" loading={loading} size="middle" />

      <Modal
        title="创建消息"
        open={messageOpen}
        confirmLoading={messageSaving}
        onOk={() => void handleCreateMessage()}
        onCancel={() => {
          setMessageOpen(false);
          messageForm.resetFields();
        }}
      >
        <Form form={messageForm} layout="vertical" initialValues={{ type: "system", isRead: false }}>
          <Form.Item name="userId" label="接收用户" rules={[{ required: true, message: "请选择接收用户" }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={users.map((user) => ({
                value: user.id,
                label: `${user.nickname} (${user.id.slice(0, 8)}...)`,
              }))}
            />
          </Form.Item>
          <Form.Item name="type" label="消息类型" rules={[{ required: true, message: "请选择消息类型" }]}>
            <Select options={messageTypeOptions} />
          </Form.Item>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true, message: "请输入内容" }]}>
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 手动创建弹窗 */}
      <Modal
        title="手动创建事件"
        open={manualOpen}
        onOk={handleManual}
        onCancel={() => setManualOpen(false)}
        okButtonProps={{ disabled: manualNoCollars }}
      >
        <Form form={manualForm} layout="vertical">
          <Form.Item name="petId" label="宠物" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={pets.map((p) => ({ value: p.id, label: `${p.name} (${p.id.slice(0, 8)}...)` }))}
            />
          </Form.Item>
          <Form.Item
            name="collarDeviceId"
            label="项圈"
            rules={[{ required: true }]}
            validateStatus={manualNoCollars ? "warning" : undefined}
            help={manualNoCollars ? "该宠物未绑定项圈，请先绑定" : undefined}
          >
            <Select
              showSearch
              optionFilterProp="label"
              disabled={!manualPetId || manualNoCollars}
              options={manualCollarOptions}
              notFoundContent={manualPetId ? "该宠物未绑定项圈，请先绑定" : "请先选择宠物"}
            />
          </Form.Item>
          <Form.Item name="actionType" label="行为类型" rules={[{ required: true }]}>
            <Select options={actionTypes} />
          </Form.Item>
          <Form.Item name="timestamp" label="时间">
            <Input placeholder="留空为当前时间，格式: YYYY-MM-DDTHH:mm:ss" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量生成弹窗 */}
      <Modal
        title="批量生成随机事件"
        open={autoOpen}
        onOk={handleAuto}
        onCancel={() => setAutoOpen(false)}
        okButtonProps={{ disabled: autoNoCollars }}
      >
        <Form form={autoForm} layout="vertical">
          <Form.Item name="petId" label="宠物" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={pets.map((p) => ({ value: p.id, label: `${p.name} (${p.id.slice(0, 8)}...)` }))}
            />
          </Form.Item>
          <Form.Item
            name="collarDeviceId"
            label="项圈"
            rules={[{ required: true }]}
            validateStatus={autoNoCollars ? "warning" : undefined}
            help={autoNoCollars ? "该宠物未绑定项圈，请先绑定" : undefined}
          >
            <Select
              showSearch
              optionFilterProp="label"
              disabled={!autoPetId || autoNoCollars}
              options={autoCollarOptions}
              notFoundContent={autoPetId ? "该宠物未绑定项圈，请先绑定" : "请先选择宠物"}
            />
          </Form.Item>
          <Form.Item name="count" label="生成数量" initialValue={10}>
            <InputNumber min={1} max={100} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="intervalMinutes" label="事件间隔 (分钟)" initialValue={30}>
            <InputNumber min={1} max={1440} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
