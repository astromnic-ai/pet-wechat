import { useEffect, useState } from "react";
import type { TableProps } from "antd";
import { Alert, Card, Col, Empty, Progress, Row, Spin, Table, Typography } from "antd";
import { api } from "../api/client";

const { Text, Title } = Typography;

type ModeKey = "free" | "custom" | "real";

interface OverviewData {
  onlineDevices: number;
  onlineUsers: number;
  avgInteractions: number;
  todayInteractions: number;
  avgActivity: number;
  activeCollarUsers: number;
  onlineDevicesDelta: number;
  avgInteractionsDelta: number;
  avgActivityDelta: number;
}

interface RankingItem {
  userId: string;
  userName: string;
  count: number;
  petCount: number;
}

interface ModeDistributionItem {
  key: ModeKey;
  count: number;
  ratio: number;
}

interface AnalyticsData {
  overview: OverviewData;
  weeklyRanking: RankingItem[];
  modeDistribution: ModeDistributionItem[];
  modeDistributionBase: number;
  modeDistributionInferred: boolean;
}

const emptyAnalytics: AnalyticsData = {
  overview: {
    onlineDevices: 0,
    onlineUsers: 0,
    avgInteractions: 0,
    todayInteractions: 0,
    avgActivity: 0,
    activeCollarUsers: 0,
    onlineDevicesDelta: 0,
    avgInteractionsDelta: 0,
    avgActivityDelta: 0,
  },
  weeklyRanking: [],
  modeDistribution: [
    { key: "free", count: 0, ratio: 0 },
    { key: "custom", count: 0, ratio: 0 },
    { key: "real", count: 0, ratio: 0 },
  ],
  modeDistributionBase: 0,
  modeDistributionInferred: true,
};

const modeMeta: Record<
  ModeKey,
  { label: string; description: string; color: string; track: string }
> = {
  free: {
    label: "系统自由模式",
    description: "默认展示策略",
    color: "#5B8FF9",
    track: "rgba(91, 143, 249, 0.18)",
  },
  custom: {
    label: "日程定制模式",
    description: "按后台行为日程推断",
    color: "#36CFC9",
    track: "rgba(54, 207, 201, 0.18)",
  },
  real: {
    label: "真实行为模式",
    description: "项圈实时行为驱动",
    color: "#F6BD16",
    track: "rgba(246, 189, 22, 0.18)",
  },
};

function MetricCard(props: {
  title: string;
  value: number;
  accent: string;
  valueSuffix?: string;
  footer: string;
}) {
  return (
    <Card
      bordered={false}
      styles={{
        body: {
          padding: 20,
          borderRadius: 20,
          background: `linear-gradient(180deg, ${props.accent}14 0%, #ffffff 100%)`,
          border: `1px solid ${props.accent}26`,
        },
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: 700, color: "#1F2937" }}>{props.title}</Text>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: props.accent,
              boxShadow: `0 0 0 8px ${props.accent}1A`,
            }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 34, lineHeight: 1, fontWeight: 800, color: "#111827" }}>
            {props.value}
          </span>
          {props.valueSuffix ? (
            <span style={{ fontSize: 14, fontWeight: 700, color: "#6B7280" }}>{props.valueSuffix}</span>
          ) : null}
        </div>
        <Text style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.6, fontWeight: 600 }}>
          {props.footer}
        </Text>
      </div>
    </Card>
  );
}

function formatDeltaText(value: number, suffix = "") {
  const absolute = Math.abs(value);
  const normalized = Number.isInteger(absolute) ? absolute : Number(absolute.toFixed(2));

  if (value > 0) {
    return `较昨日增加 ${normalized}${suffix}`;
  }

  if (value < 0) {
    return `较昨日减少 ${normalized}${suffix}`;
  }

  return `较昨日持平`;
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData>(emptyAnalytics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAnalytics() {
      setLoading(true);
      setError(null);

      try {
        const result = await api.getAnalytics();

        if (!cancelled) {
          setAnalytics({
            overview: {
              onlineDevices: Number(result?.overview?.onlineDevices ?? 0),
              onlineUsers: Number(result?.overview?.onlineUsers ?? 0),
              avgInteractions: Number(result?.overview?.avgInteractions ?? 0),
              todayInteractions: Number(result?.overview?.todayInteractions ?? 0),
              avgActivity: Number(result?.overview?.avgActivity ?? 0),
              activeCollarUsers: Number(result?.overview?.activeCollarUsers ?? 0),
              onlineDevicesDelta: Number(result?.overview?.onlineDevicesDelta ?? 0),
              avgInteractionsDelta: Number(result?.overview?.avgInteractionsDelta ?? 0),
              avgActivityDelta: Number(result?.overview?.avgActivityDelta ?? 0),
            },
            weeklyRanking: Array.isArray(result?.weeklyRanking)
              ? result.weeklyRanking.map((item: RankingItem) => ({
                  userId: item.userId,
                  userName: item.userName,
                  count: Number(item.count ?? 0),
                  petCount: Number(item.petCount ?? 0),
                }))
              : [],
            modeDistribution: Array.isArray(result?.modeDistribution)
              ? result.modeDistribution.map((item: ModeDistributionItem) => ({
                  key: item.key,
                  count: Number(item.count ?? 0),
                  ratio: Number(item.ratio ?? 0),
                }))
              : emptyAnalytics.modeDistribution,
            modeDistributionBase: Number(result?.modeDistributionBase ?? 0),
            modeDistributionInferred: Boolean(result?.modeDistributionInferred ?? true),
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "数据看板加载失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadAnalytics();

    return () => {
      cancelled = true;
    };
  }, []);

  const rankingColumns: TableProps<RankingItem>["columns"] = [
    {
      title: "排名",
      key: "rank",
      width: 72,
      render: (_value: unknown, _record: RankingItem, index: number) => (
        <span style={{ fontWeight: 700, color: index < 3 ? "#1677FF" : "#64748B" }}>{index + 1}</span>
      ),
    },
    {
      title: "用户",
      dataIndex: "userName",
      key: "userName",
      render: (value: string, record: RankingItem) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Text style={{ fontWeight: 700, color: "#0F172A" }}>{value || `用户 ${record.userId.slice(0, 6)}`}</Text>
          <Text style={{ fontSize: 12, color: "#94A3B8" }}>关联宠物 {record.petCount} 只</Text>
        </div>
      ),
    },
    {
      title: "累计互动数",
      dataIndex: "count",
      key: "count",
      width: 120,
      align: "right",
      render: (value: number) => <Text style={{ fontWeight: 700 }}>{value}</Text>,
    },
  ];

  return (
    <Spin spinning={loading} size="large">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Title level={2} style={{ margin: 0 }}>
            数据看板
          </Title>
          <Text style={{ color: "#64748B" }}>
            主要展示设备互动活跃度，以及项圈真实模式下的宠物活跃值。
          </Text>
        </div>

        {error ? <Alert type="error" message="数据看板加载失败" description={error} showIcon /> : null}

        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <MetricCard
              title="实时在线设备"
              value={analytics.overview.onlineDevices}
              footer={formatDeltaText(analytics.overview.onlineDevicesDelta, " 台")}
              accent="#1677FF"
            />
          </Col>
          <Col xs={24} md={8}>
            <MetricCard
              title="平均互动数值"
              value={analytics.overview.avgInteractions}
              valueSuffix="次/人"
              footer={formatDeltaText(analytics.overview.avgInteractionsDelta, " 次/人")}
              accent="#13C2C2"
            />
          </Col>
          <Col xs={24} md={8}>
            <MetricCard
              title="平均活跃数值"
              value={analytics.overview.avgActivity}
              valueSuffix="分"
              footer={formatDeltaText(analytics.overview.avgActivityDelta, " 分")}
              accent="#FA8C16"
            />
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} xl={14}>
            <Card
              title="用户累计活跃排行"
              extra={<Text style={{ color: "#94A3B8" }}>近 7 天累计互动数值排行</Text>}
              styles={{ body: { paddingTop: 8 } }}
            >
              <Table
                dataSource={analytics.weeklyRanking}
                columns={rankingColumns}
                rowKey="userId"
                pagination={false}
                size="middle"
                locale={{
                  emptyText: <Empty description="近 7 天暂无互动排行数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
                }}
              />
            </Card>
          </Col>

          <Col xs={24} xl={10}>
            <Card
              title="互动模式分布"
              extra={<Text style={{ color: "#94A3B8" }}>今日在线宠物显示模式</Text>}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {analytics.modeDistribution.map((item) => {
                  const meta = modeMeta[item.key];

                  return (
                    <div
                      key={item.key}
                      style={{
                        padding: 14,
                        borderRadius: 18,
                        background: "#F8FAFC",
                        border: "1px solid #EEF2F7",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          marginBottom: 10,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 999,
                              background: meta.color,
                              flexShrink: 0,
                            }}
                          />
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <Text style={{ fontWeight: 700, color: "#111827" }}>{meta.label}</Text>
                            <Text style={{ fontSize: 12, color: "#94A3B8" }}>{meta.description}</Text>
                          </div>
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <Text style={{ display: "block", fontSize: 22, fontWeight: 800, color: meta.color }}>
                            {item.count}
                          </Text>
                          <Text style={{ fontSize: 12, color: "#94A3B8" }}>{item.ratio}%</Text>
                        </div>
                      </div>

                      <Progress
                        percent={Math.min(100, item.ratio)}
                        showInfo={false}
                        strokeColor={meta.color}
                        trailColor={meta.track}
                        size={["100%", 8]}
                      />
                    </div>
                  );
                })}

                <Alert
                  type="info"
                  showIcon
                  message={`当前在线样本 ${analytics.modeDistributionBase} 个`}
                  description={
                    analytics.modeDistributionInferred
                      ? "模式分布当前按今日在线宠物、项圈行为记录和生效中的行为日程进行推断。"
                      : "模式分布为真实记录结果。"
                  }
                />
              </div>
            </Card>
          </Col>
        </Row>
      </div>
    </Spin>
  );
}
