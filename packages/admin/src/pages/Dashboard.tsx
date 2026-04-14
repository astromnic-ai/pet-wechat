import { useEffect, useState } from "react";
import { Alert, Card, Col, Progress, Row, Spin, Statistic, Tag } from "antd";
import {
  HeartOutlined,
  LinkOutlined,
  ScissorOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { api } from "../api/client";

type DeviceSummary = {
  total: number;
  online: number;
  offline: number;
};

type AvatarSummary = {
  pending: number;
  approved: number;
  processing: number;
  done: number;
  rejected: number;
  failed: number;
};

type EnhancedStats = {
  users: {
    total: number;
    withDevice: number;
    withCustomization: number;
  };
  pets?: {
    total: number;
  };
  devices: {
    collars: DeviceSummary;
    desktops: DeviceSummary;
  };
  weeklyActiveDevices: number;
  todayInteractions: number;
  deviceActivity: {
    high: number;
    medium: number;
    low: number;
  };
  avatars: AvatarSummary;
  todayNewAvatars?: number;
};

const emptyStats: EnhancedStats = {
  users: {
    total: 0,
    withDevice: 0,
    withCustomization: 0,
  },
  pets: {
    total: 0,
  },
  devices: {
    collars: {
      total: 0,
      online: 0,
      offline: 0,
    },
    desktops: {
      total: 0,
      online: 0,
      offline: 0,
    },
  },
  weeklyActiveDevices: 0,
  todayInteractions: 0,
  deviceActivity: {
    high: 0,
    medium: 0,
    low: 0,
  },
  avatars: {
    pending: 0,
    approved: 0,
    processing: 0,
    done: 0,
    rejected: 0,
    failed: 0,
  },
  todayNewAvatars: 0,
};

function percent(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

export default function Dashboard() {
  const [stats, setStats] = useState<EnhancedStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await api.getEnhancedStats();

        if (!cancelled) {
          setStats({
            ...emptyStats,
            ...data,
            users: {
              ...emptyStats.users,
              ...data?.users,
            },
            pets: {
              total:
                typeof data?.pets === "number"
                  ? data.pets
                  : Number(data?.pets?.total ?? emptyStats.pets?.total ?? 0),
            },
            devices: {
              collars: {
                ...emptyStats.devices.collars,
                ...data?.devices?.collars,
              },
              desktops: {
                ...emptyStats.devices.desktops,
                ...data?.devices?.desktops,
              },
            },
            deviceActivity: {
              ...emptyStats.deviceActivity,
              ...data?.deviceActivity,
            },
            avatars: {
              ...emptyStats.avatars,
              ...data?.avatars,
            },
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "系统概览加载失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadStats();

    return () => {
      cancelled = true;
    };
  }, []);

  const petTotal = Number(stats.pets?.total ?? 0);
  const deviceTotal = stats.devices.desktops.total + stats.devices.collars.total;
  const desktopPercent = percent(stats.devices.desktops.total, deviceTotal);
  const collarPercent = percent(stats.devices.collars.total, deviceTotal);
  const activityTotal = stats.deviceActivity.high + stats.deviceActivity.medium + stats.deviceActivity.low;

  const kpis = [
    {
      title: "注册用户总数",
      value: stats.users.total,
      icon: <UserOutlined />,
      color: "#1677ff",
    },
    {
      title: "已绑定设备用户数",
      value: stats.users.withDevice,
      icon: <LinkOutlined />,
      color: "#52c41a",
    },
    {
      title: "已定制用户数",
      value: stats.users.withCustomization,
      icon: <ScissorOutlined />,
      color: "#722ed1",
    },
    {
      title: "宠物总数",
      value: petTotal,
      icon: <HeartOutlined />,
      color: "#eb2f96",
    },
  ];

  const avatarTags: Array<{ key: keyof AvatarSummary; label: string; color: string }> = [
    { key: "pending", label: "待审核", color: "gold" },
    { key: "approved", label: "已通过", color: "green" },
    { key: "processing", label: "定制中", color: "processing" },
    { key: "done", label: "已完成", color: "blue" },
    { key: "rejected", label: "已拒绝", color: "red" },
    { key: "failed", label: "失败", color: "default" },
  ];

  return (
    <Spin spinning={loading} size="large">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {error ? <Alert type="error" message="系统概览加载失败" description={error} showIcon /> : null}

        <Row gutter={[16, 16]}>
          {kpis.map((item) => (
            <Col xs={24} sm={12} xl={6} key={item.title}>
              <Card>
                <Statistic
                  title={item.title}
                  value={item.value}
                  prefix={item.icon}
                  valueStyle={{ color: item.color }}
                />
              </Card>
            </Col>
          ))}
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card>
              <Statistic
                title="近一周活跃设备数"
                value={stats.weeklyActiveDevices}
                prefix={<LinkOutlined />}
                valueStyle={{ color: "#13c2c2" }}
              />
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card>
              <Statistic
                title="今日互动总数"
                value={stats.todayInteractions}
                prefix={<ThunderboltOutlined />}
                valueStyle={{ color: "#fa8c16" }}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card title="设备分布">
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span>桌面端</span>
                    <span>
                      <Tag color="blue">{stats.devices.desktops.total}</Tag>
                      {desktopPercent}%
                    </span>
                  </div>
                  <Progress percent={desktopPercent} strokeColor="#1677ff" showInfo={false} />
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span>项圈</span>
                    <span>
                      <Tag color="green">{stats.devices.collars.total}</Tag>
                      {collarPercent}%
                    </span>
                  </div>
                  <Progress percent={collarPercent} strokeColor="#52c41a" showInfo={false} />
                </div>
                <Alert
                  type="info"
                  showIcon
                  message={`设备总数：${deviceTotal}`}
                  description={`桌面端在线 ${stats.devices.desktops.online}，项圈在线 ${stats.devices.collars.online}`}
                />
              </div>
            </Card>
          </Col>

          <Col xs={24} lg={12}>
            <Card title="设备活跃度分布">
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span>高活跃</span>
                    <Tag color="red">{stats.deviceActivity.high}</Tag>
                  </div>
                  <Progress
                    percent={percent(stats.deviceActivity.high, activityTotal)}
                    strokeColor="#ff4d4f"
                  />
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span>中活跃</span>
                    <Tag color="gold">{stats.deviceActivity.medium}</Tag>
                  </div>
                  <Progress
                    percent={percent(stats.deviceActivity.medium, activityTotal)}
                    strokeColor="#faad14"
                  />
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span>低活跃</span>
                    <Tag color="default">{stats.deviceActivity.low}</Tag>
                  </div>
                  <Progress
                    percent={percent(stats.deviceActivity.low, activityTotal)}
                    strokeColor="#bfbfbf"
                  />
                </div>
              </div>
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={16}>
            <Card title="Avatar 审核概览">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {avatarTags.map((item) => (
                  <Tag key={item.key} color={item.color} style={{ marginInlineEnd: 0, padding: "6px 10px" }}>
                    {item.label} {stats.avatars[item.key]}
                  </Tag>
                ))}
                <Tag color="cyan" style={{ marginInlineEnd: 0, padding: "6px 10px" }}>
                  今日新增 {stats.todayNewAvatars ?? 0}
                </Tag>
              </div>
            </Card>
          </Col>

          <Col xs={24} lg={8}>
            <Card title="系统健康状态">
              <Alert type="warning" showIcon message="功能开发中" />
            </Card>
          </Col>
        </Row>
      </div>
    </Spin>
  );
}
