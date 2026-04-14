import { useEffect, useState, type CSSProperties, type MouseEvent } from "react";
import { Badge, Button, Card, Input, InputNumber, Modal, Select, Space, Tabs, Tag, message } from "antd";
import {
  ACTION_LABELS,
  ALL_ACTIONS,
  SCHEDULE_SPECIES,
  type ActionType,
  type BehaviorSchedule,
  type BehaviorScheduleBlock,
} from "shared";
import { api } from "../api/client";

type ScheduleSpecies = (typeof SCHEDULE_SPECIES)[number];
type ScheduleEffectiveType = "everyday" | "weekday";
type BlockModalMode = "create" | "edit";
type BlockFormState = {
  actionType: ActionType;
  startHour: number | null;
  startMinute: number | null;
  endHour: number | null;
  endMinute: number | null;
};

const speciesLabels: Record<ScheduleSpecies, string> = {
  cat: "猫",
  dog: "狗",
  other: "其他",
};

const effectiveTypeLabels: Record<ScheduleEffectiveType, string> = {
  everyday: "每天",
  weekday: "仅工作日",
};

const timelineHours = Array.from({ length: 25 }, (_, index) => index);

const timelineStyles: Record<string, CSSProperties> = {
  page: {
    display: "flex",
    gap: 16,
    minHeight: "calc(100vh - 140px)",
  },
  sidebar: {
    width: 300,
    minWidth: 300,
    display: "flex",
    flexDirection: "column",
    background: "#fff",
    border: "1px solid #f0f0f0",
    borderRadius: 12,
    padding: 16,
  },
  sidebarBody: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
  cardList: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    paddingRight: 4,
  },
  scheduleCard: {
    cursor: "pointer",
    marginBottom: 12,
    borderRadius: 10,
  },
  main: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  editorHeader: {
    background: "#fff",
    border: "1px solid #f0f0f0",
    borderRadius: 12,
    padding: 16,
  },
  timelineCard: {
    background: "#fff",
    border: "1px solid #f0f0f0",
    borderRadius: 12,
    padding: 16,
  },
  timelineScale: {
    position: "relative",
    height: 28,
    marginBottom: 12,
    borderBottom: "1px solid #f0f0f0",
  },
  timelineLane: {
    position: "relative",
    height: 88,
    borderRadius: 10,
    background:
      "linear-gradient(180deg, rgba(250,250,250,1) 0%, rgba(245,245,245,1) 100%)",
    border: "1px solid #f0f0f0",
    overflow: "hidden",
  },
  emptyState: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#fff",
    border: "1px dashed #d9d9d9",
    borderRadius: 12,
    color: "#8c8c8c",
    textAlign: "center",
    padding: 24,
  },
};

function cloneSchedule(schedule: BehaviorSchedule): BehaviorSchedule {
  return {
    ...schedule,
    blocks: normalizeBlocks(schedule.blocks ?? []),
  };
}

function normalizeBlocks(blocks: BehaviorScheduleBlock[]): BehaviorScheduleBlock[] {
  return [...blocks]
    .sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes || a.sortOrder - b.sortOrder)
    .map((block, index) => ({
      ...block,
      sortOrder: index,
    }));
}

function createDraftSchedule(species: ScheduleSpecies): BehaviorSchedule {
  const timestamp = new Date().toISOString();
  return {
    id: `draft-${Date.now()}`,
    name: `${speciesLabels[species]}咪新日程`,
    species,
    effectiveType: "everyday",
    isActive: false,
    blocks: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function getSchedulesForSpecies(
  schedules: BehaviorSchedule[],
  draftSchedule: BehaviorSchedule | null,
  species: ScheduleSpecies,
) {
  const list = schedules.filter((schedule) => schedule.species === species);
  if (draftSchedule && draftSchedule.species === species) {
    return [draftSchedule, ...list];
  }
  return list;
}

function pickSelection(
  schedules: BehaviorSchedule[],
  draftSchedule: BehaviorSchedule | null,
  species: ScheduleSpecies,
  preferredId: string | null,
) {
  const allSchedules = draftSchedule ? [draftSchedule, ...schedules] : schedules;
  const preferred = preferredId ? allSchedules.find((schedule) => schedule.id === preferredId) : null;
  if (preferred && preferred.species === species) {
    return preferred.id;
  }
  return getSchedulesForSpecies(schedules, draftSchedule, species)[0]?.id ?? null;
}

function formatTime(minutes: number) {
  const clamped = Math.max(0, Math.min(1440, minutes));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function splitMinutes(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.min(1440, totalMinutes));
  return {
    hour: Math.floor(safeMinutes / 60),
    minute: safeMinutes % 60,
  };
}

function toMinutes(hour: number | null, minute: number | null) {
  return (hour ?? 0) * 60 + (minute ?? 0);
}

function buildBlockForm(startMinutes: number, endMinutes: number, actionType: ActionType = ALL_ACTIONS[0]): BlockFormState {
  const start = splitMinutes(startMinutes);
  const end = splitMinutes(endMinutes);
  return {
    actionType,
    startHour: start.hour,
    startMinute: start.minute,
    endHour: end.hour,
    endMinute: end.minute,
  };
}

function getDefaultBlockRange(clickedMinutes: number) {
  const rounded = Math.floor(Math.max(0, Math.min(1439, clickedMinutes)) / 15) * 15;
  const startMinutes = Math.min(1380, rounded);
  const endMinutes = Math.min(1440, startMinutes + 60);
  return { startMinutes, endMinutes };
}

function actionColor(actionType: string) {
  const hash = actionType.split("").reduce((value, char) => value + char.charCodeAt(0), 0);
  return `hsl(${hash % 360}deg 72% 62%)`;
}

function isDraftSchedule(scheduleId: string) {
  return scheduleId.startsWith("draft-");
}

function hasBlockOverlap(
  blocks: BehaviorScheduleBlock[],
  candidate: Pick<BehaviorScheduleBlock, "id" | "startMinutes" | "endMinutes">,
) {
  return blocks.some((block) => {
    if (block.id === candidate.id) {
      return false;
    }
    return candidate.startMinutes < block.endMinutes && candidate.endMinutes > block.startMinutes;
  });
}

export default function Schedules() {
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activeSpecies, setActiveSpecies] = useState<ScheduleSpecies>("cat");
  const [schedules, setSchedules] = useState<BehaviorSchedule[]>([]);
  const [draftSchedule, setDraftSchedule] = useState<BehaviorSchedule | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [editorSchedule, setEditorSchedule] = useState<BehaviorSchedule | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockModalMode, setBlockModalMode] = useState<BlockModalMode>("create");
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [blockForm, setBlockForm] = useState<BlockFormState>(() => buildBlockForm(0, 60));

  const schedulesForActiveSpecies = getSchedulesForSpecies(schedules, draftSchedule, activeSpecies);
  const selectedBlock = editorSchedule?.blocks?.find((block) => block.id === selectedBlockId) ?? null;

  const refreshSchedules = async (
    preferredId: string | null = selectedScheduleId,
    nextDraftSchedule: BehaviorSchedule | null = draftSchedule,
    nextSpecies: ScheduleSpecies = activeSpecies,
  ) => {
    setLoading(true);
    try {
      const response = await api.getSchedules();
      const nextSchedules = (response.schedules as BehaviorSchedule[]).map((schedule) => ({
        ...schedule,
        blocks: normalizeBlocks(schedule.blocks ?? []),
      }));
      setSchedules(nextSchedules);
      setDraftSchedule(nextDraftSchedule);
      setSelectedScheduleId(pickSelection(nextSchedules, nextDraftSchedule, nextSpecies, preferredId));
    } catch (error) {
      const text = error instanceof Error ? error.message : "获取日程失败";
      messageApi.error(text);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshSchedules(null, null, "cat");
  }, []);

  useEffect(() => {
    const source =
      schedules.find((schedule) => schedule.id === selectedScheduleId) ??
      (draftSchedule?.id === selectedScheduleId ? draftSchedule : null);
    setEditorSchedule(source ? cloneSchedule(source) : null);
    setSelectedBlockId(null);
  }, [draftSchedule, schedules, selectedScheduleId]);

  const updateEditorSchedule = (updater: (current: BehaviorSchedule) => BehaviorSchedule) => {
    setEditorSchedule((current) => {
      if (!current) {
        return current;
      }
      const nextSchedule = updater(current);
      return {
        ...nextSchedule,
        blocks: normalizeBlocks(nextSchedule.blocks ?? []),
      };
    });
  };

  const handleSpeciesChange = (key: string) => {
    const nextSpecies = key as ScheduleSpecies;
    setActiveSpecies(nextSpecies);
    setSelectedScheduleId(pickSelection(schedules, draftSchedule, nextSpecies, selectedScheduleId));
    setSelectedBlockId(null);
  };

  const handleCreateSchedule = () => {
    const nextDraftSchedule = createDraftSchedule(activeSpecies);
    setDraftSchedule(nextDraftSchedule);
    setSelectedScheduleId(nextDraftSchedule.id);
    setSelectedBlockId(null);
  };

  const openCreateBlockModal = (clickedMinutes: number) => {
    const { startMinutes, endMinutes } = getDefaultBlockRange(clickedMinutes);
    setBlockModalMode("create");
    setEditingBlockId(null);
    setBlockForm(buildBlockForm(startMinutes, endMinutes));
    setBlockModalOpen(true);
  };

  const openEditBlockModal = () => {
    if (!selectedBlock) {
      return;
    }
    setBlockModalMode("edit");
    setEditingBlockId(selectedBlock.id);
    setBlockForm(buildBlockForm(selectedBlock.startMinutes, selectedBlock.endMinutes, selectedBlock.actionType));
    setBlockModalOpen(true);
  };

  const handleTimelineClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!editorSchedule) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const clickedMinutes = Math.round((relativeX / Math.max(rect.width, 1)) * 1440);
    openCreateBlockModal(clickedMinutes);
  };

  const closeBlockModal = () => {
    setBlockModalOpen(false);
    setEditingBlockId(null);
  };

  const handleSubmitBlock = () => {
    if (!editorSchedule) {
      return;
    }

    const startMinutes = toMinutes(blockForm.startHour, blockForm.startMinute);
    const endMinutes = toMinutes(blockForm.endHour, blockForm.endMinute);

    if (!Number.isInteger(blockForm.startHour) || !Number.isInteger(blockForm.endHour)) {
      messageApi.error("请输入有效的小时");
      return;
    }

    if (!Number.isInteger(blockForm.startMinute) || !Number.isInteger(blockForm.endMinute)) {
      messageApi.error("请输入有效的分钟");
      return;
    }

    if ((blockForm.startHour ?? 0) < 0 || (blockForm.startHour ?? 0) > 23) {
      messageApi.error("起始小时必须在 0-23 之间");
      return;
    }

    if ((blockForm.endHour ?? 0) < 0 || (blockForm.endHour ?? 0) > 24) {
      messageApi.error("结束小时必须在 0-24 之间");
      return;
    }

    if ((blockForm.endHour ?? 0) === 24 && (blockForm.endMinute ?? 0) !== 0) {
      messageApi.error("24 点只能搭配 00 分");
      return;
    }

    if ((blockForm.startMinute ?? 0) < 0 || (blockForm.startMinute ?? 0) > 59) {
      messageApi.error("起始分钟必须在 0-59 之间");
      return;
    }

    if ((blockForm.endMinute ?? 0) < 0 || (blockForm.endMinute ?? 0) > 59) {
      messageApi.error("结束分钟必须在 0-59 之间");
      return;
    }

    if (startMinutes < 0 || startMinutes > 1439 || endMinutes < 1 || endMinutes > 1440) {
      messageApi.error("时间范围超出 24 小时");
      return;
    }

    if (startMinutes >= endMinutes) {
      messageApi.error("结束时间必须晚于开始时间");
      return;
    }

    const nextBlock: BehaviorScheduleBlock = {
      id: editingBlockId ?? `block-${Date.now()}`,
      scheduleId: editorSchedule.id,
      actionType: blockForm.actionType,
      startMinutes,
      endMinutes,
      sortOrder: 0,
    };

    if (hasBlockOverlap(editorSchedule.blocks ?? [], nextBlock)) {
      messageApi.error("时间块之间不能重叠");
      return;
    }

    updateEditorSchedule((current) => {
      const otherBlocks = (current.blocks ?? []).filter((block) => block.id !== nextBlock.id);
      return {
        ...current,
        blocks: [...otherBlocks, nextBlock],
      };
    });
    setSelectedBlockId(nextBlock.id);
    closeBlockModal();
  };

  const handleDeleteSelectedBlock = () => {
    if (!selectedBlockId) {
      return;
    }
    updateEditorSchedule((current) => ({
      ...current,
      blocks: (current.blocks ?? []).filter((block) => block.id !== selectedBlockId),
    }));
    setSelectedBlockId(null);
  };

  const handleSaveSchedule = async () => {
    if (!editorSchedule) {
      return;
    }

    const name = editorSchedule.name.trim();
    if (!name) {
      messageApi.error("请输入日程名称");
      return;
    }

    const payload = {
      name,
      species: editorSchedule.species,
      effectiveType: editorSchedule.effectiveType,
      blocks: normalizeBlocks(editorSchedule.blocks ?? []).map((block) => ({
        actionType: block.actionType,
        startMinutes: block.startMinutes,
        endMinutes: block.endMinutes,
        sortOrder: block.sortOrder,
      })),
    };

    setSaving(true);
    try {
      if (isDraftSchedule(editorSchedule.id)) {
        const response = await api.createSchedule(payload);
        await refreshSchedules(response.schedule.id, null, editorSchedule.species);
      } else {
        const response = await api.updateSchedule(editorSchedule.id, payload);
        await refreshSchedules(response.schedule.id, draftSchedule, editorSchedule.species);
      }
      messageApi.success("日程已保存");
    } catch (error) {
      const text = error instanceof Error ? error.message : "保存失败";
      messageApi.error(text);
    } finally {
      setSaving(false);
    }
  };

  const handleActivateSchedule = async () => {
    if (!editorSchedule || isDraftSchedule(editorSchedule.id)) {
      messageApi.error("请先保存日程后再激活");
      return;
    }

    setActivating(true);
    try {
      const response = await api.activateSchedule(editorSchedule.id);
      await refreshSchedules(response.schedule.id, draftSchedule, editorSchedule.species);
      messageApi.success("当前日程已激活");
    } catch (error) {
      const text = error instanceof Error ? error.message : "激活失败";
      messageApi.error(text);
    } finally {
      setActivating(false);
    }
  };

  return (
    <>
      {contextHolder}
      <div style={timelineStyles.page}>
        <div style={timelineStyles.sidebar}>
          <div style={{ marginBottom: 12, fontSize: 16, fontWeight: 600 }}>行为日程</div>
          <div style={timelineStyles.sidebarBody}>
            <Tabs
              activeKey={activeSpecies}
              onChange={handleSpeciesChange}
              items={SCHEDULE_SPECIES.map((species) => ({
                key: species,
                label: speciesLabels[species],
                children: (
                  <div style={timelineStyles.cardList}>
                    {schedulesForActiveSpecies.length === 0 ? (
                      <div
                        style={{
                          padding: "40px 12px",
                          textAlign: "center",
                          color: "#8c8c8c",
                        }}
                      >
                        {loading ? "正在加载日程..." : "当前类型暂无日程"}
                      </div>
                    ) : null}

                    {schedulesForActiveSpecies.map((schedule) => {
                      const selected = schedule.id === selectedScheduleId;
                      return (
                        <Card
                          key={schedule.id}
                          size="small"
                          hoverable
                          onClick={() => {
                            setSelectedScheduleId(schedule.id);
                            setSelectedBlockId(null);
                          }}
                          style={{
                            ...timelineStyles.scheduleCard,
                            border: selected ? "1px solid #1677ff" : "1px solid #f0f0f0",
                            boxShadow: selected ? "0 0 0 2px rgba(22,119,255,0.12)" : "none",
                          }}
                        >
                          <Space direction="vertical" size={8} style={{ width: "100%" }}>
                            <div style={{ fontWeight: 600, color: "#262626" }}>{schedule.name}</div>
                            <Space size={8} wrap>
                              <Tag color="blue">
                                {effectiveTypeLabels[schedule.effectiveType as ScheduleEffectiveType] ?? schedule.effectiveType}
                              </Tag>
                              {schedule.isActive ? <Badge status="success" text="已激活" /> : null}
                              {isDraftSchedule(schedule.id) ? <Tag>未保存</Tag> : null}
                            </Space>
                          </Space>
                        </Card>
                      );
                    })}
                  </div>
                ),
              }))}
            />

            <Button type="primary" block style={{ marginTop: 12 }} onClick={handleCreateSchedule}>
              新建日程
            </Button>
          </div>
        </div>

        <div style={timelineStyles.main}>
          {!editorSchedule ? (
            <div style={timelineStyles.emptyState}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>未选中日程</div>
                <div>请在左侧选择一个日程，或新建日程后开始编辑。</div>
              </div>
            </div>
          ) : (
            <>
              <div style={timelineStyles.editorHeader}>
                <Space size={16} align="start" wrap style={{ width: "100%" }}>
                  <div style={{ minWidth: 280, flex: 1 }}>
                    <div style={{ marginBottom: 8, color: "#595959" }}>日程名称</div>
                    <Input
                      value={editorSchedule.name}
                      onChange={(event) =>
                        updateEditorSchedule((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="请输入日程名称"
                    />
                  </div>
                  <div style={{ width: 220 }}>
                    <div style={{ marginBottom: 8, color: "#595959" }}>生效策略</div>
                    <Select
                      value={editorSchedule.effectiveType}
                      style={{ width: "100%" }}
                      onChange={(value: ScheduleEffectiveType) =>
                        updateEditorSchedule((current) => ({
                          ...current,
                          effectiveType: value,
                        }))
                      }
                      options={[
                        { label: "每天", value: "everyday" },
                        { label: "仅工作日", value: "weekday" },
                        { label: "仅节假日（待支持）", value: "holiday", disabled: true },
                      ]}
                    />
                  </div>
                </Space>
              </div>

              <div style={timelineStyles.timelineCard}>
                <Space direction="vertical" size={16} style={{ width: "100%" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>24 小时时间轴</div>
                      <div style={{ color: "#8c8c8c" }}>
                        点击空白区域新增时间块，点击时间块后可编辑或删除。
                      </div>
                    </div>
                    <Space wrap>
                      <Button disabled={!selectedBlock} onClick={openEditBlockModal}>
                        编辑选中时间块
                      </Button>
                      <Button danger disabled={!selectedBlock} onClick={handleDeleteSelectedBlock}>
                        删除选中时间块
                      </Button>
                    </Space>
                  </div>

                  <div style={timelineStyles.timelineScale}>
                    {timelineHours.map((hour) => (
                      <div
                        key={hour}
                        style={{
                          position: "absolute",
                          left: `${(hour / 24) * 100}%`,
                          transform: "translateX(-50%)",
                          top: 0,
                          fontSize: 12,
                          color: "#8c8c8c",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {hour}:00
                      </div>
                    ))}
                  </div>

                  <div style={timelineStyles.timelineLane} onClick={handleTimelineClick}>
                    {timelineHours.map((hour) => (
                      <div
                        key={`grid-${hour}`}
                        style={{
                          position: "absolute",
                          left: `${(hour / 24) * 100}%`,
                          top: 0,
                          bottom: 0,
                          width: 1,
                          background: hour === 0 || hour === 24 ? "#d9d9d9" : "#f0f0f0",
                          pointerEvents: "none",
                        }}
                      />
                    ))}

                    {(editorSchedule.blocks ?? []).map((block) => {
                      const left = (block.startMinutes / 1440) * 100;
                      const width = ((block.endMinutes - block.startMinutes) / 1440) * 100;
                      const isSelected = selectedBlockId === block.id;
                      return (
                        <div
                          key={block.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedBlockId(block.id);
                          }}
                          style={{
                            position: "absolute",
                            left: `${left}%`,
                            width: `${width}%`,
                            top: 24,
                            height: 40,
                            borderRadius: 8,
                            background: actionColor(block.actionType),
                            border: isSelected ? "2px solid #262626" : "1px solid rgba(0,0,0,0.08)",
                            boxSizing: "border-box",
                            color: "#fff",
                            fontSize: 12,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "0 10px",
                            overflow: "hidden",
                            cursor: "pointer",
                            boxShadow: isSelected ? "0 8px 18px rgba(0,0,0,0.18)" : "0 4px 10px rgba(0,0,0,0.1)",
                          }}
                        >
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              fontWeight: 600,
                            }}
                          >
                            {ACTION_LABELS[block.actionType] ?? block.actionType}
                          </span>
                          <span
                            style={{
                              marginLeft: 8,
                              opacity: 0.92,
                              whiteSpace: "nowrap",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {formatTime(block.startMinutes)} - {formatTime(block.endMinutes)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </Space>
              </div>

              <div
                style={{
                  background: "#fff",
                  border: "1px solid #f0f0f0",
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <Space wrap>
                  <Button type="primary" loading={saving} onClick={() => void handleSaveSchedule()}>
                    保存
                  </Button>
                  <Button loading={activating} onClick={() => void handleActivateSchedule()}>
                    激活
                  </Button>
                  {editorSchedule.isActive ? <Badge status="success" text="当前日程已激活" /> : null}
                </Space>
              </div>
            </>
          )}
        </div>
      </div>

      <Modal
        title={blockModalMode === "create" ? "新建时间块" : "编辑时间块"}
        open={blockModalOpen}
        onOk={handleSubmitBlock}
        onCancel={closeBlockModal}
        destroyOnHidden
      >
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <div>
            <div style={{ marginBottom: 8, color: "#595959" }}>动作类型</div>
            <Select<ActionType>
              value={blockForm.actionType}
              style={{ width: "100%" }}
              options={ALL_ACTIONS.map((actionType) => ({
                label: ACTION_LABELS[actionType] ?? actionType,
                value: actionType,
              }))}
              onChange={(value) =>
                setBlockForm((current) => ({
                  ...current,
                  actionType: value as ActionType,
                }))
              }
            />
          </div>

          <div>
            <div style={{ marginBottom: 8, color: "#595959" }}>起始时间</div>
            <Space.Compact block>
              <InputNumber
                min={0}
                max={23}
                precision={0}
                style={{ width: "50%" }}
                value={blockForm.startHour}
                onChange={(value) =>
                  setBlockForm((current) => ({
                    ...current,
                    startHour: value,
                  }))
                }
                addonAfter="时"
              />
              <InputNumber
                min={0}
                max={59}
                precision={0}
                style={{ width: "50%" }}
                value={blockForm.startMinute}
                onChange={(value) =>
                  setBlockForm((current) => ({
                    ...current,
                    startMinute: value,
                  }))
                }
                addonAfter="分"
              />
            </Space.Compact>
          </div>

          <div>
            <div style={{ marginBottom: 8, color: "#595959" }}>结束时间</div>
            <Space.Compact block>
              <InputNumber
                min={0}
                max={24}
                precision={0}
                style={{ width: "50%" }}
                value={blockForm.endHour}
                onChange={(value) =>
                  setBlockForm((current) => ({
                    ...current,
                    endHour: value,
                  }))
                }
                addonAfter="时"
              />
              <InputNumber
                min={0}
                max={59}
                precision={0}
                style={{ width: "50%" }}
                value={blockForm.endMinute}
                onChange={(value) =>
                  setBlockForm((current) => ({
                    ...current,
                    endMinute: value,
                  }))
                }
                addonAfter="分"
              />
            </Space.Compact>
          </div>
        </Space>
      </Modal>
    </>
  );
}
