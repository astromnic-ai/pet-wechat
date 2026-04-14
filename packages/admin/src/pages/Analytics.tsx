import { useEffect, useState } from "react";
import type { TableProps } from "antd";
import { Alert, Card, Col, Row, Spin, Statistic, Table } from "antd";
import dayjs from "dayjs";
import { api } from "../api/client";

interface RankingItem {
  petId: string;
  petName: string;
  count: number;
}

interface TrendItem {
  date: string;
  count: number;
}

interface AnalyticsData {
  onlineDevices: number;
  avgInteractions: number;
  weeklyRanking: RankingItem[];
  dailyTrend: TrendItem[];
}

const emptyAnalytics: AnalyticsData = {
  onlineDevices: 0,
  avgInteractions: 0,
  weeklyRanking: [],
  dailyTrend: [],
};

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
            onlineDevices: Number(result?.onlineDevices ?? 0),
            avgInteractions: Number(result?.avgInteractions ?? 0),
            weeklyRanking: Array.isArray(result?.weeklyRanking)
              ? result.weeklyRanking.map((item: RankingItem) => ({
                  petId: item.petId,
                  petName: item.petName,
                  count: Number(item.count ?? 0),
                }))
              : [],
            dailyTrend: Array.isArray(result?.dailyTrend)
              ? result.dailyTrend.map((item: TrendItem) => ({
                  date: item.date,
                  count: Number(item.count ?? 0),
                }))
              : [],
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

  const maxTrendCount = Math.max(...analytics.dailyTrend.map((item) => item.count), 1);

  const rankingColumns: TableProps<RankingItem>["columns"] = [
    {
      title: "排名",
      key: "rank",
      width: 72,
      render: (_value: unknown, _record: RankingItem, index: number) => index + 1,
    },
    {
      title: "宠物名",
      dataIndex: "petName",
      key: "petName",
      render: (value: string, record: RankingItem) => value || `宠物 ${record.petId.slice(0, 8)}`,
    },
    {
      title: "互动数",
      dataIndex: "count",
      key: "count",
      width: 96,
    },
  ];

  return (
    <Spin spinning={loading} size="large">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>数据看板</h2>
        </div>

        {error ? <Alert type="error" message="数据看板加载失败" description={error} showIcon /> : null}

        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Card>
              <Statistic title="实时在线设备数" value={analytics.onlineDevices} />
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card>
              <Statistic
                title="平均互动数"
                value={analytics.avgInteractions}
                precision={Number.isInteger(analytics.avgInteractions) ? 0 : 2}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={16}>
            <Card title="7 天每日互动趋势">
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 12,
                  minHeight: 280,
                  overflowX: "auto",
                  paddingTop: 8,
                }}
              >
                {analytics.dailyTrend.map((item) => {
                  const barHeight = Math.round((item.count / maxTrendCount) * 200);

                  return (
                    <div
                      key={item.date}
                      style={{
                        flex: 1,
                        minWidth: 72,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <div style={{ fontSize: 12, color: "#595959", fontWeight: 500 }}>{item.count}</div>
                      <div
                        style={{
                          width: "100%",
                          height: 220,
                          padding: "0 12px 12px",
                          display: "flex",
                          alignItems: "flex-end",
                          justifyContent: "center",
                          background: "linear-gradient(180deg, #fafafa 0%, #f5f5f5 100%)",
                          borderRadius: 12,
                        }}
                      >
                        <div
                          style={{
                            width: "100%",
                            maxWidth: 40,
                            height: `${barHeight}px`,
                            minHeight: item.count > 0 ? 24 : 8,
                            background: "linear-gradient(180deg, #69b1ff 0%, #1677ff 100%)",
                            borderRadius: "10px 10px 6px 6px",
                            boxShadow: "0 6px 16px rgba(22, 119, 255, 0.18)",
                          }}
                        />
                      </div>
                      <div style={{ fontSize: 12, color: "#8c8c8c" }}>{dayjs(item.date).format("MM-DD")}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card title="一周互动排行 Top 10">
              <Table
                dataSource={analytics.weeklyRanking}
                columns={rankingColumns}
                rowKey="petId"
                pagination={false}
                size="small"
              />
            </Card>
          </Col>
        </Row>

        <Alert type="info" message="更多数据分析功能开发中" showIcon />
      </div>
    </Spin>
  );
}
