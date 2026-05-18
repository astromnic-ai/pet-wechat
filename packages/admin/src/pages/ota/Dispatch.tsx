import { useEffect, useState } from "react";
import { Button, Card, Form, Input, Modal, Popconfirm, Space, Table, Tag, message } from "antd";
import type { TableProps } from "antd";
import { CloudUploadOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { api, type OtaDispatchJob } from "../../api/client";

const stages = ["received", "downloading", "verified", "failed", "rolled_back"] as const;
const stageLabels: Record<(typeof stages)[number], string> = {
  received: "已接收",
  downloading: "下载中",
  verified: "已验证",
  failed: "失败",
  rolled_back: "已回滚",
};

function formatTime(value?: string | null) {
  return value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-";
}

export default function OtaDispatchPage() {
  const [messageApi, contextHolder] = message.useMessage();
  const [items, setItems] = useState<OtaDispatchJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [form] = Form.useForm<{ version: string }>();

  const loadItems = async () => {
    setLoading(true);
    try {
      const response = await api.getOtaDispatchJobs({ limit: "100" });
      setItems(response.items ?? []);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "下发记录加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, []);

  const dispatchAll = async () => {
    try {
      setDispatching(true);
      const values = await form.validateFields();
      const response = await api.dispatchAllOta(values.version);
      messageApi.success(`已创建全量下发：${response.dispatched} 台`);
      setDispatchOpen(false);
      form.resetFields();
      void loadItems();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "全量下发失败");
    } finally {
      setDispatching(false);
    }
  };

  const columns: TableProps<OtaDispatchJob>["columns"] = [
    { title: "版本", dataIndex: "version", width: 140 },
    { title: "来源", dataIndex: "source", width: 120, render: (value) => <Tag>{value}</Tag> },
    { title: "总数", dataIndex: "totalCount", width: 90 },
    { title: "立即", dataIndex: "immediateCount", width: 90 },
    { title: "节流", dataIndex: "throttledCount", width: 90 },
    { title: "创建人", dataIndex: "createdBy", width: 150, render: (value) => value || "-" },
    { title: "下发时间", dataIndex: "dispatchedAt", width: 180, render: formatTime },
  ];

  return (
    <>
      {contextHolder}
      <Card
        title="下发记录"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadItems()}>
              刷新
            </Button>
            <Button type="primary" icon={<CloudUploadOutlined />} onClick={() => setDispatchOpen(true)}>
              全量下发
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={{ pageSize: 20 }}
          expandable={{
            expandedRowRender: (record) => (
              <Space wrap>
                {stages.map((stage) => (
                  <Tag key={stage} color={stage === "failed" || stage === "rolled_back" ? "red" : "blue"}>
                    {stageLabels[stage]}: {record.progress?.[stage] ?? 0}
                  </Tag>
                ))}
              </Space>
            ),
          }}
        />
      </Card>
      <Modal title="全量下发" open={dispatchOpen} footer={null} onCancel={() => setDispatchOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="version" label="版本号" rules={[{ required: true, message: "请输入版本号" }]}>
            <Input placeholder="v1.2.3" />
          </Form.Item>
          <Popconfirm title="确认向所有在线且可升级设备下发？" onConfirm={() => void dispatchAll()}>
            <Button type="primary" loading={dispatching}>
              确认下发
            </Button>
          </Popconfirm>
        </Form>
      </Modal>
    </>
  );
}
