import { useEffect, useState } from "react";
import {
  Alert,
  Card,
  Col,
  Progress,
  Row,
  Spin,
  Tag,
  Typography,
} from "antd";
import {
  ApiOutlined,
  DatabaseOutlined,
  HddOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { api } from "../api/client";

const { Text, Title } = Typography;

type DeviceSummary = {
  total: number;
  online: number;
  offline: number;
  todayAdded: number;
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
    todayAdded: number;
    withDevice: number;
    withCustomization: number;
    withCollar: number;
  };
  devices: {
    collars: DeviceSummary;
    desktops: DeviceSummary;
  };
  activeDevices: {
    total: number;
    onlineCount: number;
    onlineRate: number;
  };
  interactions: {
    todayTotal: number;
    yesterdayTotal: number;
    changePercent: number;
  };
  deviceActivity: {
    high: number;
    medium: number;
    low: number;
  };
  avatars: AvatarSummary;
  realtimeDynamics: {
    newDeviceOnline: RealtimeItem;
    newImageReview: RealtimeItem;
    batteryWarnings: RealtimeItem;
    longOfflineDevices: RealtimeItem;
    newCustomization: RealtimeItem;
  };
  systemHealth: {
    server: HealthItem;
    api: HealthItem;
    database: HealthItem;
    storage: HealthItem;
  };
};

type HealthItem = {
  label: string;
  value: string;
  detail: string;
  status: "healthy" | "warning";
};

type RealtimeItem = {
  value: number;
  latestUpdatedAt: string | null;
};

const emptyStats: EnhancedStats = {
  users: {
    total: 0,
    todayAdded: 0,
    withDevice: 0,
    withCustomization: 0,
    withCollar: 0,
  },
  devices: {
    collars: {
      total: 0,
      online: 0,
      offline: 0,
      todayAdded: 0,
    },
    desktops: {
      total: 0,
      online: 0,
      offline: 0,
      todayAdded: 0,
    },
  },
  activeDevices: {
    total: 0,
    onlineCount: 0,
    onlineRate: 0,
  },
  interactions: {
    todayTotal: 0,
    yesterdayTotal: 0,
    changePercent: 0,
  },
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
  realtimeDynamics: {
    newDeviceOnline: {
      value: 0,
      latestUpdatedAt: null,
    },
    newImageReview: {
      value: 0,
      latestUpdatedAt: null,
    },
    batteryWarnings: {
      value: 0,
      latestUpdatedAt: null,
    },
    longOfflineDevices: {
      value: 0,
      latestUpdatedAt: null,
    },
    newCustomization: {
      value: 0,
      latestUpdatedAt: null,
    },
  },
  systemHealth: {
    server: {
      label: "服务器状态",
      value: "运行中",
      detail: "-",
      status: "healthy",
    },
    api: {
      label: "API 响应",
      value: "正常",
      detail: "-",
      status: "healthy",
    },
    database: {
      label: "数据库",
      value: "正常",
      detail: "-",
      status: "healthy",
    },
    storage: {
      label: "存储空间",
      value: "可用",
      detail: "-",
      status: "healthy",
    },
  },
};

function formatSignedNumber(value: number, suffix = "") {
  if (value > 0) {
    return `+${value}${suffix}`;
  }

  if (value < 0) {
    return `${value}${suffix}`;
  }

  return `0${suffix}`;
}

function formatSignedPercent(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "" : ""}${value}%`;
}

function formatRelativeUpdate(value?: string | null) {
  if (!value) {
    return "暂无";
  }

  const target = dayjs(value);
  if (!target.isValid()) {
    return "暂无";
  }

  const diffMinutes = Math.max(0, dayjs().diff(target, "minute"));
  if (diffMinutes < 1) {
    return "刚刚";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}分钟前`;
  }

  const diffHours = dayjs().diff(target, "hour");
  if (diffHours < 24) {
    return `${diffHours}小时前`;
  }

  return target.format("MM-DD HH:mm");
}

function HeroStatCard(props: {
  title: string;
  value: number;
  meta: string;
  background: string;
}) {
  return (
    <Card
      bordered={false}
      styles={{
        body: {
          minHeight: 120,
          padding: 18,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: props.background,
          borderRadius: 18,
        },
      }}
    >
      <Text style={{ color: "rgba(255,255,255,0.92)", fontSize: 13, fontWeight: 700 }}>
        {props.title}
      </Text>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ color: "#fff", fontSize: 40, fontWeight: 800, lineHeight: 1 }}>
          {props.value}
        </span>
        <span style={{ color: "rgba(255,255,255,0.88)", fontSize: 14, fontWeight: 700 }}>
          {props.meta}
        </span>
      </div>
    </Card>
  );
}

function SectionCard(props: { title: string; children: React.ReactNode }) {
  return (
    <Card
      bordered={false}
      style={{
        borderRadius: 16,
        boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
      }}
      styles={{
        body: {
          padding: 16,
        },
      }}
      title={
        <span style={{ fontSize: 16, fontWeight: 700, color: "#1f1f1f" }}>
          {props.title}
        </span>
      }
    >
      {props.children}
    </Card>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<EnhancedStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
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
            activeDevices: {
              ...emptyStats.activeDevices,
              ...data?.activeDevices,
            },
            interactions: {
              ...emptyStats.interactions,
              ...data?.interactions,
            },
            deviceActivity: {
              ...emptyStats.deviceActivity,
              ...data?.deviceActivity,
            },
            avatars: {
              ...emptyStats.avatars,
              ...data?.avatars,
            },
            realtimeDynamics: {
              ...emptyStats.realtimeDynamics,
              ...data?.realtimeDynamics,
            },
            systemHealth: {
              ...emptyStats.systemHealth,
              ...data?.systemHealth,
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
    }

    void loadStats();

    return () => {
      cancelled = true;
    };
  }, []);

  const deviceActivityTotal =
    stats.deviceActivity.high + stats.deviceActivity.medium + stats.deviceActivity.low;

  const realtimeItems = [
    {
      key: "newDeviceOnline",
      title: "新设备上线",
      description: "一小时内新增上线设备",
      item: stats.realtimeDynamics.newDeviceOnline,
      color: "#1677ff",
    },
    {
      key: "newImageReview",
      title: "新增图像审核",
      description: "一小时内新增图像审核",
      item: stats.realtimeDynamics.newImageReview,
      color: "#19be6b",
    },
    {
      key: "batteryWarnings",
      title: "电量预警",
      description: "当前低电量设备预警数",
      item: stats.realtimeDynamics.batteryWarnings,
      color: "#fa8c16",
    },
    {
      key: "longOfflineDevices",
      title: "长时间未上线设备",
      description: "超过 7 天未上线设备",
      item: stats.realtimeDynamics.longOfflineDevices,
      color: "#8da4d4",
    },
    {
      key: "newCustomization",
      title: "新增个性化定制",
      description: "今日新增个性化定制任务",
      item: stats.realtimeDynamics.newCustomization,
      color: "#7c7af7",
    },
  ];

  const realtimeColumns = [realtimeItems.slice(0, 3), realtimeItems.slice(3)];

  const healthItems = [
    { key: "server", icon: <ThunderboltOutlined />, ...stats.systemHealth.server },
    { key: "api", icon: <ApiOutlined />, ...stats.systemHealth.api },
    { key: "database", icon: <DatabaseOutlined />, ...stats.systemHealth.database },
    { key: "storage", icon: <HddOutlined />, ...stats.systemHealth.storage },
  ];

  return (
    <Spin spinning={loading} size="large">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error ? <Alert type="error" showIcon message="系统概览加载失败" description={error} /> : null}

        <Row gutter={[12, 12]}>
          <Col xs={24} lg={8}>
            <HeroStatCard
              title="总用户数"
              value={stats.users.total}
              meta={`${formatSignedNumber(stats.users.todayAdded)} 今日`}
              background="linear-gradient(135deg, #667eea 0%, #7388f0 100%)"
            />
          </Col>
          <Col xs={24} lg={8}>
            <HeroStatCard
              title="活跃设备"
              value={stats.activeDevices.total}
              meta={`在线率 ${stats.activeDevices.onlineRate}%`}
              background="linear-gradient(135deg, #18c28f 0%, #1abc9c 100%)"
            />
          </Col>
          <Col xs={24} lg={8}>
            <HeroStatCard
              title="今日互动"
              value={stats.interactions.todayTotal}
              meta={`${formatSignedPercent(stats.interactions.changePercent)} 较昨日`}
              background="linear-gradient(135deg, #e38de9 0%, #d07af0 100%)"
            />
          </Col>
        </Row>

        <Title level={5} style={{ margin: 0 }}>
          设备活跃度总览
        </Title>

        <Row gutter={[12, 12]}>
          <Col xs={24} xl={12}>
            <SectionCard title="设备类型分布">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: "linear-gradient(180deg, #f8fbff 0%, #eef6ff 100%)",
                  }}
                >
                  <div>
                    <Text style={{ display: "block", color: "#595959", marginBottom: 4, fontSize: 12 }}>桌面端设备</Text>
                    <Text style={{ fontSize: 26, fontWeight: 800, color: "#1677ff", lineHeight: 1.1 }}>
                      {stats.devices.desktops.total}
                    </Text>
                  </div>
                  <Tag color="blue" style={{ marginInlineEnd: 0, padding: "4px 8px", borderRadius: 999, fontSize: 12 }}>
                    较昨日 {formatSignedNumber(stats.devices.desktops.todayAdded)}
                  </Tag>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: "linear-gradient(180deg, #f6fffb 0%, #ebfff6 100%)",
                  }}
                >
                  <div>
                    <Text style={{ display: "block", color: "#595959", marginBottom: 4, fontSize: 12 }}>项圈设备</Text>
                    <Text style={{ fontSize: 26, fontWeight: 800, color: "#13a87d", lineHeight: 1.1 }}>
                      {stats.devices.collars.total}
                    </Text>
                  </div>
                  <Tag color="green" style={{ marginInlineEnd: 0, padding: "4px 8px", borderRadius: 999, fontSize: 12 }}>
                    较昨日 {formatSignedNumber(stats.devices.collars.todayAdded)}
                  </Tag>
                </div>
              </div>
            </SectionCard>
          </Col>

          <Col xs={24} xl={12}>
            <SectionCard title="活跃度分布">
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { label: "高活跃", value: stats.deviceActivity.high, color: "#ff4d4f" },
                  { label: "中活跃", value: stats.deviceActivity.medium, color: "#faad14" },
                  { label: "低活跃", value: stats.deviceActivity.low, color: "#8c8c8c" },
                ].map((item) => (
                  <div key={item.label}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 4,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ fontWeight: 600, fontSize: 13 }}>{item.label}</Text>
                      <Text style={{ fontWeight: 700, color: item.color, fontSize: 13 }}>{item.value}</Text>
                    </div>
                    <Progress
                      percent={
                        deviceActivityTotal > 0
                          ? Number(((item.value / deviceActivityTotal) * 100).toFixed(1))
                          : 0
                      }
                      strokeColor={item.color}
                      trailColor="#f0f0f0"
                      size="small"
                    />
                  </div>
                ))}
              </div>
            </SectionCard>
          </Col>
        </Row>

        <SectionCard title="实时动态">
          <Row gutter={[12, 12]}>
            {realtimeColumns.map((column, columnIndex) => (
              <Col xs={24} xl={12} key={`realtime-column-${columnIndex}`}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {column.map((item) => (
                    <div
                      key={item.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "12px 14px",
                        borderRadius: 14,
                        background: "#fafbff",
                        boxShadow: "inset 0 0 0 1px #eef0f6",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            background: item.color,
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#1f1f1f", marginBottom: 2 }}>
                            {item.title}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "#8c8c8c",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.description}
                          </div>
                        </div>
                      </div>

                      <div style={{ minWidth: 88, textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 11, color: "#b0b7c3", marginBottom: 2 }}>
                          {formatRelativeUpdate(item.item.latestUpdatedAt)}
                        </div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: item.color, lineHeight: 1 }}>
                          {String(item.item.value).padStart(2, "0")}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Col>
            ))}
          </Row>
        </SectionCard>

        <SectionCard title="系统健康状态">
          <Row gutter={[12, 12]}>
            {healthItems.map((item) => (
              <Col xs={24} md={12} xl={6} key={item.key}>
                <Card
                  bordered={false}
                  style={{
                    borderRadius: 14,
                    background:
                      item.status === "healthy"
                        ? "linear-gradient(180deg, #fff8db 0%, #fff1a8 100%)"
                        : "linear-gradient(180deg, #fff1f0 0%, #ffd8bf 100%)",
                  }}
                  styles={{ body: { padding: 14 } }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ color: "#8c6b00", fontSize: 16 }}>{item.icon}</span>
                    <Text style={{ fontWeight: 700, color: "#614700", fontSize: 13 }}>{item.label}</Text>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#3f2f00", marginBottom: 4, lineHeight: 1.1 }}>
                    {item.value}
                  </div>
                  <Text style={{ color: "#614700", fontSize: 12 }}>{item.detail}</Text>
                </Card>
              </Col>
            ))}
          </Row>
        </SectionCard>
      </div>
    </Spin>
  );
}
