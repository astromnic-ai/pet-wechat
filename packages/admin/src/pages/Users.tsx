import { useEffect, useState } from "react";
import type { TableProps } from "antd";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tag,
  message,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { api } from "../api/client";
import dayjs from "dayjs";

interface UserRecord {
  id: string;
  nickname: string;
  phone: string | null;
  wechatOpenid: string | null;
  avatarUrl: string | null;
  avatarQuota: number;
  createdAt: string;
  updatedAt: string;
  petCount: number;
  deviceCount: number;
}

interface PetRecord {
  id: string;
  name: string;
  species: string;
  gender: string;
  breed: string | null;
  birthday: string | null;
  weight: number | null;
  createdAt: string;
}

interface CollarDeviceRecord {
  id: string;
  userId: string | null;
  petId: string | null;
  name: string;
  macAddress: string;
  status: string;
  battery: number | null;
  signal: number | null;
  firmwareVersion: string | null;
  lastOnlineAt: string | null;
  createdAt: string;
}

interface DesktopDeviceRecord {
  id: string;
  userId: string | null;
  name: string;
  macAddress: string;
  status: string;
  firmwareVersion: string | null;
  lastOnlineAt: string | null;
  createdAt: string;
}

interface UserDetail {
  user: Omit<UserRecord, "petCount" | "deviceCount">;
  pets: PetRecord[];
  devices: {
    collars: CollarDeviceRecord[];
    desktops: DesktopDeviceRecord[];
  };
}

const statusColors: Record<string, string> = {
  online: "green",
  offline: "default",
  pairing: "blue",
};

const statusLabels: Record<string, string> = {
  online: "在线",
  offline: "离线",
  pairing: "配对中",
};

const speciesLabels: Record<string, string> = {
  cat: "猫",
  dog: "狗",
};

const genderLabels: Record<string, string> = {
  male: "公",
  female: "母",
  unknown: "未知",
};

function formatTime(value: string | null | undefined) {
  return value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-";
}

export default function UsersPage() {
  const [data, setData] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    api.getEnhancedUsers()
      .then((r) => setData(r.users as UserRecord[]))
      .catch((e) => message.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(() => {
    if (!detailOpen || !detailUserId) {
      return;
    }

    const userId = detailUserId;
    let cancelled = false;

    async function loadUserDetail() {
      setDetailLoading(true);

      try {
        const result = await api.getUserDetail(userId);

        if (!cancelled) {
          setDetail(result as UserDetail);
        }
      } catch (e) {
        if (!cancelled) {
          message.error(e instanceof Error ? e.message : "用户详情加载失败");
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    void loadUserDetail();

    return () => {
      cancelled = true;
    };
  }, [detailOpen, detailUserId]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const currentEditingId = editingId;
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
      if (currentEditingId && detailOpen && detailUserId === currentEditingId) {
        setDetailLoading(true);
        const result = await api.getUserDetail(currentEditingId);
        setDetail(result as UserDetail);
        setDetailLoading(false);
      }
    } catch (e: any) {
      if (e.message) message.error(e.message);
    }
  };

  const handleEdit = (record: UserRecord) => {
    setEditingId(record.id);
    form.setFieldsValue(record);
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

  const handleOpenDetail = (record: UserRecord) => {
    setDetailUserId(record.id);
    setDetailOpen(true);
  };

  const petNameMap = new Map(detail?.pets.map((pet) => [pet.id, pet.name]) ?? []);

  const columns: TableProps<UserRecord>["columns"] = [
    { title: "ID", dataIndex: "id", key: "id", width: 200, ellipsis: true },
    {
      title: "微信信息",
      dataIndex: "nickname",
      key: "nickname",
      width: 180,
      render: (_value: string, record: UserRecord) => (
        <Space size={12}>
          {record.avatarUrl ? (
            <img
              src={record.avatarUrl}
              alt={record.nickname}
              style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "#f0f0f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#8c8c8c",
                fontSize: 12,
              }}
            >
              无图
            </div>
          )}
          <span>{record.nickname}</span>
        </Space>
      ),
    },
    { title: "手机", dataIndex: "phone", key: "phone" },
    { title: "微信 OpenID", dataIndex: "wechatOpenid", key: "wechatOpenid", ellipsis: true },
    { title: "宠物数", dataIndex: "petCount", key: "petCount", width: 90 },
    { title: "绑定设备数", dataIndex: "deviceCount", key: "deviceCount", width: 110 },
    { title: "形象配额", dataIndex: "avatarQuota", key: "avatarQuota", width: 100 },
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
      render: (_value: unknown, record: UserRecord) => (
        <Space>
          <Button
            size="small"
            onClick={(event) => {
              event.stopPropagation();
              handleEdit(record);
            }}
          >
            编辑
          </Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
            <Button
              size="small"
              danger
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>用户管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); setModalOpen(true); }}>
          新建用户
        </Button>
      </div>
      <Table
        dataSource={data}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1280 }}
        onRow={(record) => ({
          onClick: () => handleOpenDetail(record),
          style: { cursor: "pointer" },
        })}
      />
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
        </Form>
      </Modal>
      <Drawer
        title="用户详情"
        width={760}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        destroyOnClose={false}
      >
        <Spin spinning={detailLoading}>
          {detail ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Card title="基本信息">
                <Descriptions bordered column={2} size="small">
                  <Descriptions.Item label="用户 ID" span={2}>
                    {detail.user.id}
                  </Descriptions.Item>
                  <Descriptions.Item label="昵称">{detail.user.nickname}</Descriptions.Item>
                  <Descriptions.Item label="头像配额">{detail.user.avatarQuota}</Descriptions.Item>
                  <Descriptions.Item label="手机号">{detail.user.phone || "-"}</Descriptions.Item>
                  <Descriptions.Item label="微信 OpenID">{detail.user.wechatOpenid || "-"}</Descriptions.Item>
                  <Descriptions.Item label="宠物数">{detail.pets.length}</Descriptions.Item>
                  <Descriptions.Item label="绑定设备数">
                    {detail.devices.collars.length + detail.devices.desktops.length}
                  </Descriptions.Item>
                  <Descriptions.Item label="注册时间">{formatTime(detail.user.createdAt)}</Descriptions.Item>
                  <Descriptions.Item label="更新时间">{formatTime(detail.user.updatedAt)}</Descriptions.Item>
                </Descriptions>
              </Card>

              <Card
                title="宠物列表"
                extra={<Tag color="blue">{detail.pets.length}</Tag>}
              >
                <Table<PetRecord>
                  dataSource={detail.pets}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  scroll={{ x: 720 }}
                  columns={[
                    { title: "名字", dataIndex: "name", key: "name", width: 120 },
                    {
                      title: "物种",
                      dataIndex: "species",
                      key: "species",
                      width: 90,
                      render: (value: string) => speciesLabels[value] ?? value,
                    },
                    {
                      title: "性别",
                      dataIndex: "gender",
                      key: "gender",
                      width: 90,
                      render: (value: string) => genderLabels[value] ?? value,
                    },
                    {
                      title: "品种",
                      dataIndex: "breed",
                      key: "breed",
                      render: (value: string | null) => value || "-",
                    },
                    {
                      title: "生日",
                      dataIndex: "birthday",
                      key: "birthday",
                      width: 120,
                      render: (value: string | null) => value || "-",
                    },
                    {
                      title: "创建时间",
                      dataIndex: "createdAt",
                      key: "createdAt",
                      width: 160,
                      render: (value: string) => formatTime(value),
                    },
                  ]}
                />
              </Card>

              <Card
                title="项圈设备"
                extra={<Tag color="geekblue">{detail.devices.collars.length}</Tag>}
              >
                <Table<CollarDeviceRecord>
                  dataSource={detail.devices.collars}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  scroll={{ x: 760 }}
                  columns={[
                    { title: "名称", dataIndex: "name", key: "name", width: 140 },
                    { title: "MAC 地址", dataIndex: "macAddress", key: "macAddress", width: 180 },
                    {
                      title: "状态",
                      dataIndex: "status",
                      key: "status",
                      width: 90,
                      render: (value: string) => (
                        <Tag color={statusColors[value] ?? "default"}>
                          {statusLabels[value] ?? value}
                        </Tag>
                      ),
                    },
                    {
                      title: "绑定宠物",
                      dataIndex: "petId",
                      key: "petId",
                      width: 140,
                      render: (value: string | null) => (value ? petNameMap.get(value) ?? value : "-"),
                    },
                    {
                      title: "电量",
                      dataIndex: "battery",
                      key: "battery",
                      width: 90,
                      render: (value: number | null) => (value == null ? "-" : `${value}%`),
                    },
                    {
                      title: "最后在线",
                      dataIndex: "lastOnlineAt",
                      key: "lastOnlineAt",
                      width: 160,
                      render: (value: string | null) => formatTime(value),
                    },
                  ]}
                />
              </Card>

              <Card
                title="桌面端设备"
                extra={<Tag color="purple">{detail.devices.desktops.length}</Tag>}
              >
                <Table<DesktopDeviceRecord>
                  dataSource={detail.devices.desktops}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  scroll={{ x: 720 }}
                  columns={[
                    { title: "名称", dataIndex: "name", key: "name", width: 140 },
                    { title: "MAC 地址", dataIndex: "macAddress", key: "macAddress", width: 180 },
                    {
                      title: "状态",
                      dataIndex: "status",
                      key: "status",
                      width: 90,
                      render: (value: string) => (
                        <Tag color={statusColors[value] ?? "default"}>
                          {statusLabels[value] ?? value}
                        </Tag>
                      ),
                    },
                    {
                      title: "固件版本",
                      dataIndex: "firmwareVersion",
                      key: "firmwareVersion",
                      width: 120,
                      render: (value: string | null) => value || "-",
                    },
                    {
                      title: "最后在线",
                      dataIndex: "lastOnlineAt",
                      key: "lastOnlineAt",
                      width: 160,
                      render: (value: string | null) => formatTime(value),
                    },
                  ]}
                />
              </Card>

              <Alert type="info" message="会员功能开发中" showIcon />
            </div>
          ) : (
            <Alert type="info" message="请选择用户查看详情" showIcon />
          )}
        </Spin>
      </Drawer>
    </>
  );
}
