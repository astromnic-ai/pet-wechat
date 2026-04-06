import { PlusOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Divider,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Typography,
  message,
} from "antd";
import { useEffect, useState } from "react";
import {
  api,
  batchUpdateSchedules,
  fetchPetModeSchedules,
  updatePetModeSchedules,
  type PetModeSchedule,
  type PetModeScheduleInput,
} from "../api/client";

const TIME_PATTERN = /^\d{2}:\d{2}$/;

interface PetOption {
  id: string;
  name: string;
  ownerNickname?: string | null;
}

interface ScheduleFormValues {
  schedules?: PetModeScheduleInput[];
}

interface BatchFormValues extends ScheduleFormValues {
  petIds?: string[];
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "请求失败";
}

function getDefaultSchedule(): PetModeScheduleInput {
  return {
    startTime: "09:00",
    endTime: "10:00",
    actionType: "playing",
  };
}

function normalizeSchedules(schedules?: PetModeScheduleInput[]) {
  return (schedules ?? []).map((schedule) => ({
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    actionType: schedule.actionType.trim(),
  }));
}

function validateSchedules(schedules: PetModeScheduleInput[]) {
  if (schedules.length > 20) {
    return "时间表最多 20 条";
  }

  const sortedSchedules = [...schedules].sort((left, right) =>
    left.startTime === right.startTime
      ? left.endTime.localeCompare(right.endTime)
      : left.startTime.localeCompare(right.startTime),
  );

  for (const schedule of schedules) {
    if (!TIME_PATTERN.test(schedule.startTime) || !TIME_PATTERN.test(schedule.endTime)) {
      return "时间格式必须为 HH:MM";
    }

    if (schedule.startTime >= schedule.endTime) {
      return "开始时间必须早于结束时间";
    }
  }

  for (let index = 1; index < sortedSchedules.length; index += 1) {
    if (sortedSchedules[index].startTime < sortedSchedules[index - 1].endTime) {
      return "时间段不能重叠";
    }
  }

  return null;
}

function ScheduleFields() {
  return (
    <Form.List name="schedules">
      {(fields, { add, remove }) => (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          {fields.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无时间段，点击下方按钮添加"
            />
          ) : null}

          {fields.map((field, index) => (
            <Card
              key={field.key}
              size="small"
              title={`时间段 ${index + 1}`}
              extra={
                <Button danger type="link" onClick={() => remove(field.name)}>
                  删除
                </Button>
              }
            >
              <Space align="start" style={{ display: "flex", width: "100%" }} wrap>
                <Form.Item
                  label="开始时间"
                  name={[field.name, "startTime"]}
                  rules={[
                    { required: true, message: "请输入开始时间" },
                    { pattern: TIME_PATTERN, message: "格式需为 HH:MM" },
                  ]}
                  style={{ minWidth: 140, flex: 1 }}
                >
                  <Input placeholder="09:00" />
                </Form.Item>
                <Form.Item
                  label="结束时间"
                  name={[field.name, "endTime"]}
                  rules={[
                    { required: true, message: "请输入结束时间" },
                    { pattern: TIME_PATTERN, message: "格式需为 HH:MM" },
                  ]}
                  style={{ minWidth: 140, flex: 1 }}
                >
                  <Input placeholder="10:00" />
                </Form.Item>
                <Form.Item
                  label="动作类型"
                  name={[field.name, "actionType"]}
                  rules={[{ required: true, message: "请输入动作类型" }]}
                  style={{ minWidth: 220, flex: 2 }}
                >
                  <Input placeholder="playing" />
                </Form.Item>
              </Space>
            </Card>
          ))}

          <Button type="dashed" icon={<PlusOutlined />} onClick={() => add(getDefaultSchedule())}>
            添加时间段
          </Button>
        </Space>
      )}
    </Form.List>
  );
}

export default function PetModesPage() {
  const [pets, setPets] = useState<PetOption[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string>();
  const [schedules, setSchedules] = useState<PetModeSchedule[]>([]);
  const [petsLoading, setPetsLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [batchSaving, setBatchSaving] = useState(false);
  const [editForm] = Form.useForm<ScheduleFormValues>();
  const [batchForm] = Form.useForm<BatchFormValues>();

  const selectedPet = pets.find((pet) => pet.id === selectedPetId);

  const loadPets = async () => {
    setPetsLoading(true);

    try {
      const result = await api.getPets();
      const nextPets = result.pets as PetOption[];
      setPets(nextPets);
      setSelectedPetId((currentPetId) => currentPetId ?? nextPets[0]?.id);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setPetsLoading(false);
    }
  };

  const loadSchedules = async (petId: string) => {
    setScheduleLoading(true);

    try {
      const result = await fetchPetModeSchedules(petId);
      setSchedules(result.schedules);
    } catch (error) {
      message.error(getErrorMessage(error));
      setSchedules([]);
    } finally {
      setScheduleLoading(false);
    }
  };

  useEffect(() => {
    void loadPets();
  }, []);

  useEffect(() => {
    if (!selectedPetId) {
      setSchedules([]);
      return;
    }

    void loadSchedules(selectedPetId);
  }, [selectedPetId]);

  const openEditModal = () => {
    editForm.setFieldsValue({
      schedules: schedules.map((schedule) => ({
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        actionType: schedule.actionType,
      })),
    });
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!selectedPetId) {
      return;
    }

    try {
      const values = await editForm.validateFields();
      const nextSchedules = normalizeSchedules(values.schedules);
      const validationError = validateSchedules(nextSchedules);
      if (validationError) {
        message.error(validationError);
        return;
      }

      setSaving(true);
      const result = await updatePetModeSchedules(selectedPetId, nextSchedules);
      setSchedules(result.schedules);
      setEditOpen(false);
      message.success("时间表保存成功");
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const openBatchModal = () => {
    batchForm.setFieldsValue({
      petIds: selectedPetId ? [selectedPetId] : [],
      schedules: schedules.map((schedule) => ({
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        actionType: schedule.actionType,
      })),
    });
    setBatchOpen(true);
  };

  const handleBatchSave = async () => {
    try {
      const values = await batchForm.validateFields();
      const petIds = values.petIds ?? [];
      const nextSchedules = normalizeSchedules(values.schedules);
      const validationError = validateSchedules(nextSchedules);

      if (petIds.length === 0) {
        message.error("请至少选择一个宠物");
        return;
      }

      if (validationError) {
        message.error(validationError);
        return;
      }

      setBatchSaving(true);
      const result = await batchUpdateSchedules(petIds, nextSchedules);
      message.success(`已更新 ${result.updatedCount} 只宠物`);
      setBatchOpen(false);

      if (selectedPetId && petIds.includes(selectedPetId)) {
        await loadSchedules(selectedPetId);
      }
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setBatchSaving(false);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card>
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <Typography.Title level={2} style={{ margin: 0 }}>
                活动模式
              </Typography.Title>
              <Typography.Text type="secondary">
                配置宠物在系统自由模式下的时间表
              </Typography.Text>
            </div>
            <Button type="primary" onClick={openEditModal} disabled={!selectedPetId}>
              编辑时间表
            </Button>
          </div>

          <div style={{ maxWidth: 420 }}>
            <Typography.Text strong>选择宠物</Typography.Text>
            <Select
              showSearch
              optionFilterProp="label"
              value={selectedPetId}
              placeholder="请选择宠物"
              style={{ width: "100%", marginTop: 8 }}
              loading={petsLoading}
              options={pets.map((pet) => ({
                value: pet.id,
                label: pet.ownerNickname ? `${pet.name} / ${pet.ownerNickname}` : pet.name,
              }))}
              onChange={setSelectedPetId}
            />
          </div>

          {selectedPet ? (
            <Typography.Text type="secondary">
              当前宠物：{selectedPet.name}
              {selectedPet.ownerNickname ? ` / ${selectedPet.ownerNickname}` : ""}
            </Typography.Text>
          ) : null}

          <Table<PetModeSchedule>
            rowKey="id"
            loading={scheduleLoading}
            pagination={false}
            locale={{
              emptyText: selectedPetId ? "当前没有系统时间表" : "请先选择宠物",
            }}
            dataSource={schedules}
            columns={[
              { title: "开始时间", dataIndex: "startTime", key: "startTime" },
              { title: "结束时间", dataIndex: "endTime", key: "endTime" },
              { title: "动作类型", dataIndex: "actionType", key: "actionType" },
              { title: "排序", dataIndex: "sortOrder", key: "sortOrder", width: 100 },
            ]}
          />
        </Space>
      </Card>

      <Card>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          批量配置
        </Typography.Title>
        <Typography.Text type="secondary">
          为多只宠物一次性应用同一套系统自由模式时间表
        </Typography.Text>
        <Divider />
        <Button onClick={openBatchModal}>批量配置</Button>
      </Card>

      <Modal
        title="编辑系统自由模式时间表"
        open={editOpen}
        onOk={() => void handleEditSave()}
        onCancel={() => setEditOpen(false)}
        confirmLoading={saving}
        width={840}
      >
        <Form form={editForm} layout="vertical" initialValues={{ schedules: [] }}>
          <ScheduleFields />
        </Form>
      </Modal>

      <Modal
        title="批量配置系统自由模式时间表"
        open={batchOpen}
        onOk={() => void handleBatchSave()}
        onCancel={() => setBatchOpen(false)}
        confirmLoading={batchSaving}
        width={840}
      >
        <Form form={batchForm} layout="vertical" initialValues={{ petIds: [], schedules: [] }}>
          <Form.Item
            label="选择宠物"
            name="petIds"
            rules={[{ required: true, message: "请选择至少一个宠物" }]}
          >
            <Select
              mode="multiple"
              showSearch
              optionFilterProp="label"
              placeholder="请选择宠物"
              options={pets.map((pet) => ({
                value: pet.id,
                label: pet.ownerNickname ? `${pet.name} / ${pet.ownerNickname}` : pet.name,
              }))}
            />
          </Form.Item>

          <Divider />
          <ScheduleFields />
        </Form>
      </Modal>
    </Space>
  );
}
