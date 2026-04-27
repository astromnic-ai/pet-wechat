import { useEffect, useMemo, useState } from "react";
import type { TableProps } from "antd";
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { ArrowLeftOutlined, CheckSquareFilled, PlusOutlined } from "@ant-design/icons";
import { DEFAULT_FREE_BENEFITS, type Membership, type MembershipBenefit } from "shared";
import { api } from "../api/client";
import dayjs from "dayjs";

const { Text, Title } = Typography;

interface UserRecord {
  id: string;
  nickname: string;
  phone: string | null;
  email: string | null;
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

function formatTime(value: string | null | undefined) {
  return value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-";
}

function buildDisplayEmail(user: Pick<UserRecord, "email" | "phone" | "nickname" | "id">) {
  if (user.email) {
    return user.email;
  }

  if (user.phone) {
    return `${user.phone}@yehey.pet`;
  }

  const slug = user.nickname.replace(/\s+/g, "").toLowerCase() || user.id.slice(0, 6);
  return `${slug}@example.com`;
}

function buildDisplayUserCode(user: Pick<UserRecord, "id" | "nickname">) {
  return `${user.id.slice(0, 8)}(${user.nickname})`;
}

function getMembershipColor(level: Membership["level"]) {
  if (level === "premium") {
    return "#f59e0b";
  }

  if (level === "pro") {
    return "#2563eb";
  }

  if (level === "basic") {
    return "#64748b";
  }

  return "#64748b";
}

function getMembershipStatusTag(status: Membership["status"]) {
  if (status === "active") {
    return { color: "success" as const, label: "账号正常" };
  }

  if (status === "expired") {
    return { color: "warning" as const, label: "会员过期" };
  }

  return { color: "error" as const, label: "账号暂停" };
}

export default function UsersPage() {
  const [data, setData] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [savingQuota, setSavingQuota] = useState(false);
  const [quotaValue, setQuotaValue] = useState<number>(0);
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
    if (!detailUserId) {
      return;
    }

    const userId = detailUserId;
    let cancelled = false;

    async function loadUserDetail() {
      setDetailLoading(true);

      try {
        const [result, membershipResult] = await Promise.all([
          api.getUserDetail(userId),
          api.getMembership(userId),
        ]);
        if (!cancelled) {
          const nextDetail = result as UserDetail;
          setDetail(nextDetail);
          setMembership(membershipResult);
          setQuotaValue(membershipResult.avatarQuotaTotal);
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
  }, [detailUserId]);

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
      if (currentEditingId && detailUserId === currentEditingId) {
        const [result, membershipResult] = await Promise.all([
          api.getUserDetail(currentEditingId),
          api.getMembership(currentEditingId),
        ]);
        const nextDetail = result as UserDetail;
        setDetail(nextDetail);
        setMembership(membershipResult);
        setQuotaValue(membershipResult.avatarQuotaTotal);
      }
    } catch (e: any) {
      if (e.message) {
        message.error(e.message);
      }
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
      if (detailUserId === id) {
        setDetailUserId(null);
        setDetail(null);
        setMembership(null);
      }
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleOpenDetail = (record: UserRecord) => {
    setDetailUserId(record.id);
  };

  const handleSaveQuota = async () => {
    if (!detail || !membership) {
      return;
    }

    setSavingQuota(true);

    try {
      const nextMembership = await api.updateMembership(detail.user.id, {
        level: membership.level,
        status: membership.status,
        expireAt: membership.expireAt,
        benefits:
          membership.benefits.length > 0
            ? membership.benefits
            : DEFAULT_FREE_BENEFITS.map((benefit) => ({ ...benefit })),
        avatarQuotaTotal: quotaValue,
      });
      message.success("配额已保存");
      setMembership(nextMembership);
      const nextDetail = {
        ...detail,
        user: {
          ...detail.user,
          avatarQuota: quotaValue,
        },
      };
      setDetail(nextDetail);
      setData((prev) =>
        prev.map((item) => (item.id === detail.user.id ? { ...item, avatarQuota: quotaValue } : item)),
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : "配额保存失败");
    } finally {
      setSavingQuota(false);
    }
  };

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
                background: "#3b82f6",
              }}
            />
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

  const detailUser = detail?.user ?? data.find((item) => item.id === detailUserId) ?? null;
  const listSelectedUser = data.find((item) => item.id === detailUserId) ?? null;

  const membershipLevel = useMemo(
    () => membership?.levelLabel ?? "免费版",
    [membership],
  );

  const membershipExpireAt = useMemo(
    () => (membership?.expireAt ? dayjs(membership.expireAt).format("YYYY-MM-DD") : "-"),
    [membership],
  );

  const boundDevices = useMemo(
    () => (detail ? detail.devices.collars.length + detail.devices.desktops.length : listSelectedUser?.deviceCount ?? 0),
    [detail, listSelectedUser],
  );

  const displayEmail = useMemo(
    () => (detailUser ? buildDisplayEmail(detailUser) : "-"),
    [detailUser],
  );

  const displayCode = useMemo(
    () => (detailUser ? buildDisplayUserCode(detailUser) : "-"),
    [detailUser],
  );
  const membershipStatusMeta = membership ? getMembershipStatusTag(membership.status) : getMembershipStatusTag("active");
  const membershipBenefits = useMemo(
    () =>
      membership?.benefits && membership.benefits.length > 0
        ? membership.benefits
        : DEFAULT_FREE_BENEFITS.map((benefit) => ({ ...benefit })),
    [membership],
  );
  const remainingQuota = Math.max(0, quotaValue - (membership?.avatarQuotaUsed ?? 0));

  if (detailUserId && detailUser) {
    return (
      <>
        <Space direction="vertical" size={16} style={{ display: "flex" }}>
          <Button
            type="link"
            icon={<ArrowLeftOutlined />}
            style={{ padding: 0, width: "fit-content" }}
            onClick={() => {
              setDetailUserId(null);
              setDetail(null);
            }}
          >
            返回列表
          </Button>

          <Spin spinning={detailLoading}>
            <Space direction="vertical" size={16} style={{ display: "flex" }}>
              <Card title={<Text strong style={{ fontSize: 15 }}>用户基本信息</Text>} styles={{ body: { padding: 18 } }}>
                <div
                  style={{
                    padding: 18,
                    borderRadius: 14,
                    background: "#f8fafc",
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                      {detailUser.avatarUrl ? (
                        <img
                          src={detailUser.avatarUrl}
                          alt={detailUser.nickname}
                          style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 64,
                            height: 64,
                            borderRadius: "50%",
                            background: "#3b82f6",
                          }}
                        />
                      )}

                      <div>
                        <Title level={4} style={{ margin: 0, fontSize: 18, lineHeight: 1.3 }}>
                          {displayCode}
                        </Title>
                        <Text type="secondary" style={{ fontSize: 14 }}>
                          {displayEmail}
                        </Text>
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <Tag color={membershipStatusMeta.color} style={{ marginInlineEnd: 0, paddingInline: 12, lineHeight: "24px", borderRadius: 999, fontSize: 12 }}>
                        {`● ${membershipStatusMeta.label}`}
                      </Tag>
                      <div style={{ marginTop: 12 }}>
                        <Text type="secondary" style={{ fontSize: 13 }}>{`注册时间: ${dayjs(detailUser.createdAt).format("YYYY-MM-DD")}`}</Text>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: 12,
                    }}
                  >
                    <div style={{ padding: 14, borderRadius: 12, background: "#fff" }}>
                      <Text type="secondary" style={{ fontSize: 13 }}>会员等级</Text>
                      <div style={{ marginTop: 8 }}>
                        <Text strong style={{ fontSize: 16, color: getMembershipColor(membership?.level ?? "free") }}>
                          {membershipLevel}
                        </Text>
                      </div>
                    </div>
                    <div style={{ padding: 14, borderRadius: 12, background: "#fff" }}>
                      <Text type="secondary" style={{ fontSize: 13 }}>到期时间</Text>
                      <div style={{ marginTop: 8 }}>
                        <Text strong style={{ fontSize: 16 }}>{membershipExpireAt}</Text>
                      </div>
                    </div>
                    <div style={{ padding: 14, borderRadius: 12, background: "#fff" }}>
                      <Text type="secondary" style={{ fontSize: 13 }}>绑定设备</Text>
                      <div style={{ marginTop: 8 }}>
                        <Text strong style={{ fontSize: 16 }}>{`${boundDevices} 台`}</Text>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              <Card title={<Text strong style={{ fontSize: 15 }}>权益包配置</Text>} styles={{ body: { padding: 18 } }}>
                <Space direction="vertical" size={14} style={{ display: "flex" }}>
                  <div
                    style={{
                      padding: 16,
                      borderRadius: 14,
                      background: "#f8fafc",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <Title level={5} style={{ margin: 0, fontSize: 16 }}>
                        定制额度
                      </Title>
                      <div style={{ marginTop: 6 }}>
                        <Text type="secondary" style={{ fontSize: 13 }}>{`剩余免费次数: ${remainingQuota} 次 / 共 ${quotaValue} 次`}</Text>
                      </div>
                    </div>

                    <Space size={10}>
                      <InputNumber
                        min={0}
                        value={quotaValue}
                        onChange={(value) => setQuotaValue(Number(value ?? 0))}
                        style={{ width: 88 }}
                      />
                      <Button type="primary" loading={savingQuota} onClick={() => void handleSaveQuota()}>
                        保存
                      </Button>
                    </Space>
                  </div>

                  <div>
                    <Text strong style={{ display: "block", marginBottom: 10, fontSize: 14 }}>
                      会员等级权益（可勾选）
                    </Text>

                    <Space direction="vertical" size={10} style={{ display: "flex" }}>
                      {membershipBenefits.map((perk: MembershipBenefit) => (
                        <div
                          key={perk.key}
                          style={{
                            padding: "12px 14px",
                            borderRadius: 12,
                            background: "#f8fafc",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <CheckSquareFilled style={{ color: perk.enabled ? "#10b981" : "#cbd5e1", fontSize: 18 }} />
                          <Text style={{ fontSize: 14 }}>{perk.value ? `${perk.label} · ${perk.value}` : perk.label}</Text>
                        </div>
                      ))}
                    </Space>
                  </div>
                </Space>
              </Card>
            </Space>
          </Spin>
        </Space>

        <Modal
          title={editingId ? "编辑用户" : "新建用户"}
          open={modalOpen}
          onOk={handleSubmit}
          onCancel={() => {
            setModalOpen(false);
            setEditingId(null);
            form.resetFields();
          }}
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
      </>
    );
  }

  return (
    <>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>用户会员</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditingId(null);
            form.resetFields();
            setModalOpen(true);
          }}
        >
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
        onCancel={() => {
          setModalOpen(false);
          setEditingId(null);
          form.resetFields();
        }}
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
    </>
  );
}
