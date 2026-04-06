import { ThunderboltOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import { Button, Form, InputNumber, Modal, Select, Space, Table, message } from "antd";
import dayjs from "dayjs";
import { api, type DeviceInteraction } from "../api/client";

interface PetOption {
  id: string;
  name: string;
}

interface DesktopOption {
  id: string;
  name: string;
}

interface AutoGenerateFormValues {
  petId: string;
  desktopDeviceId: string;
  count?: number;
  intervalMinutes?: number;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "请求失败";
}

function getInteractionTypeLabel(type: DeviceInteraction["interactionType"]) {
  switch (type) {
    case "touch":
      return "触摸";
    case "shake":
      return "摇晃";
    case "gesture":
      return "手势";
    default:
      return type;
  }
}

export default function InteractionsPage() {
  const [data, setData] = useState<DeviceInteraction[]>([]);
  const [pets, setPets] = useState<PetOption[]>([]);
  const [desktops, setDesktops] = useState<DesktopOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<AutoGenerateFormValues>();

  const load = async () => {
    setLoading(true);

    try {
      const [interactionsResult, petsResult, desktopsResult] = await Promise.all([
        api.getInteractions(100),
        api.getPets(),
        api.getDesktops(),
      ]);

      setData(interactionsResult.interactions);
      setPets((petsResult.pets as PetOption[]) ?? []);
      setDesktops((desktopsResult.desktops as DesktopOption[]) ?? []);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleAutoGenerate = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const result = await api.autoGenerateInteractions(values);
      message.success(`成功生成 ${result.count} 条互动记录`);
      setModalOpen(false);
      form.resetFields();
      await load();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 200, ellipsis: true },
    { title: "宠物 ID", dataIndex: "petId", key: "petId", width: 180, ellipsis: true },
    { title: "桌面设备 ID", dataIndex: "desktopDeviceId", key: "desktopDeviceId", width: 180, ellipsis: true },
    {
      title: "互动类型",
      dataIndex: "interactionType",
      key: "interactionType",
      width: 120,
      render: (value: DeviceInteraction["interactionType"]) => getInteractionTypeLabel(value),
    },
    { title: "次数", dataIndex: "count", key: "count", width: 100 },
    {
      title: "时间",
      dataIndex: "timestamp",
      key: "timestamp",
      width: 180,
      render: (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm:ss"),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>互动记录</h2>
        </div>
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          onClick={() => {
            form.setFieldsValue({ count: 10, intervalMinutes: 30 });
            setModalOpen(true);
          }}
        >
          生成测试数据
        </Button>
      </div>

      <Table dataSource={data} columns={columns} rowKey="id" loading={loading} size="middle" />

      <Modal
        title="生成互动测试数据"
        open={modalOpen}
        confirmLoading={saving}
        onOk={() => void handleAutoGenerate()}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
      >
        <Form form={form} layout="vertical" initialValues={{ count: 10, intervalMinutes: 30 }}>
          <Form.Item name="petId" label="宠物" rules={[{ required: true, message: "请选择宠物" }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={pets.map((pet) => ({
                value: pet.id,
                label: `${pet.name} (${pet.id.slice(0, 8)}...)`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="desktopDeviceId"
            label="桌面设备"
            rules={[{ required: true, message: "请选择桌面设备" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={desktops.map((desktop) => ({
                value: desktop.id,
                label: `${desktop.name} (${desktop.id.slice(0, 8)}...)`,
              }))}
            />
          </Form.Item>
          <Form.Item name="count" label="生成数量">
            <InputNumber min={1} max={1000} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="intervalMinutes" label="时间间隔（分钟）">
            <InputNumber min={1} max={10080} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
