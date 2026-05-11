import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { CloseOutlined } from "@ant-design/icons";
import {
  Badge,
  Button,
  Card,
  Divider,
  InputNumber,
  Modal,
  Select,
  Space,
  Tag,
  message,
} from "antd";
import {
  ACTION_LABELS,
  ALL_ACTIONS,
  BASIC_ACTIONS,
  FUN_ACTIONS,
  INTERACTIVE_ACTIONS,
  SCHEDULE_SPECIES,
  type ActionType,
  type BehaviorSchedule,
  type BehaviorScheduleBlock,
} from "shared";
import { api } from "../api/client";

type ScheduleSpecies = (typeof SCHEDULE_SPECIES)[number];
type ScheduleEffectiveType = "everyday" | "weekday" | "friday";
type BlockModalMode = "create" | "edit";
type BlockFormState = {
  actionType: ActionType;
  startHour: number | null;
  startMinute: number | null;
  endHour: number | null;
  endMinute: number | null;
};

type DragState = {
  blockId: string;
  pointerOffsetMinutes: number;
  durationMinutes: number;
};

type PendingBlockPointerState = {
  blockId: string;
  startClientY: number;
  pointerOffsetMinutes: number;
  durationMinutes: number;
};

const speciesLabels: Record<ScheduleSpecies, string> = {
  cat: "猫",
  dog: "狗",
  other: "其他",
};

const speciesEnglishLabels: Record<ScheduleSpecies, string> = {
  cat: "Cat",
  dog: "Dog",
  other: "Other",
};

const effectiveTypeLabels: Record<ScheduleEffectiveType, string> = {
  everyday: "每天",
  weekday: "仅工作日",
  friday: "仅美好的周五",
};

const effectiveTypeEnglishLabels: Record<ScheduleEffectiveType, string> = {
  everyday: "Daily",
  weekday: "Weekdays Only",
  friday: "Beauty Friday Only",
};

const actionEnglishLabels: Record<ActionType, string> = {
  sit: "Sitting",
  eat: "Eating",
  sleep: "Sleeping",
  lie: "Resting",
  run: "Running",
  walk: "Walking",
  stand: "Standing",
  jump: "Jumping",
  play_ball: "Playing",
  poop: "Pooping",
  drink_water: "Drinking",
  chase_tail: "Chasing",
  butterfly: "Catching",
  dream: "Dreaming",
  lick_paw: "Licking",
  spin: "Spinning",
  dizzy: "Dizzy",
  get_closer: "Approaching",
  run_fast: "Sprinting",
  woken_up: "Responding",
  eat_shrimp: "Eating Treat",
  well_behaved: "Behaving",
  confused: "Confused",
  walk_left: "Walking Side",
};

const MINUTES_PER_DAY = 24 * 60;
const TIMELINE_SEGMENT_MINUTES = 60;
const TIMELINE_SEGMENT_HEIGHT = 72;
const verticalTimelineHours = Array.from({ length: 24 }, (_, index) => index);
const TIMELINE_CANVAS_HEIGHT = verticalTimelineHours.length * TIMELINE_SEGMENT_HEIGHT;
const DRAG_SNAP_MINUTES = 15;
const DRAG_START_THRESHOLD_PX = 6;

const timelineStyles: Record<string, CSSProperties> = {
  page: {
    display: "grid",
    gridTemplateColumns: "220px minmax(0, 1fr) 300px",
    gap: 16,
    minHeight: "calc(100vh - 140px)",
    alignItems: "stretch",
  },
  sidebar: {
    minWidth: 0,
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
    gap: 12,
  },
  speciesItem: {
    cursor: "pointer",
    borderRadius: 10,
    padding: 14,
    border: "1px solid #f0f0f0",
    background: "#fff",
  },
  main: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  editorHeader: {
    background: "#fff",
    border: "1px solid #f0f0f0",
    borderRadius: 12,
    padding: 14,
  },
  timelineCard: {
    background: "#fff",
    border: "1px solid #f0f0f0",
    borderRadius: 12,
    padding: 16,
  },
  actionLibraryCard: {
    background: "#fff",
    border: "1px solid #f0f0f0",
    borderRadius: 12,
    padding: 16,
  },
  attributePanel: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 16,
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
  scheduleBoard: {
    display: "grid",
    gridTemplateColumns: "72px minmax(0, 1fr)",
    gap: 16,
    alignItems: "start",
  },
  timeRail: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
    position: "relative",
  },
  timeRailItem: {
    height: TIMELINE_SEGMENT_HEIGHT,
    position: "relative",
    color: "#98a2b3",
    fontSize: 12,
    fontWeight: 600,
    paddingLeft: 6,
    borderLeft: "1px solid #e8edf5",
  },
  scheduleColumn: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  scheduleCanvas: {
    position: "relative",
    height: TIMELINE_CANVAS_HEIGHT,
    borderRadius: 16,
    background: "#fff",
    overflow: "hidden",
    userSelect: "none",
  },
  scheduleGridLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    background: "#eef2f7",
    pointerEvents: "none",
  },
  scheduleGridBand: {
    position: "absolute",
    left: 0,
    right: 0,
    borderRadius: 8,
    background: "#fafcff",
    border: "1px dashed #e7edf6",
    pointerEvents: "none",
  },
  addBehaviorButton: {
    width: "100%",
    height: 62,
    borderRadius: 14,
    border: "1px solid #d7e3f5",
    background: "#f9fbff",
    color: "#9aa9bf",
    fontWeight: 600,
  },
};

const actionGroupMeta = [
  {
    key: "basic",
    title: "基础动作",
    description: "八种基础动作，用于日常主行为配置。",
    color: "#1677ff",
    actions: BASIC_ACTIONS,
  },
  {
    key: "fun",
    title: "趣味动作",
    description: "八种趣味动作，用于穿插在主行为之间。",
    color: "#722ed1",
    actions: FUN_ACTIONS,
  },
  {
    key: "interactive",
    title: "交互动作",
    description: "八种交互动作，用于响应用户主动互动。",
    color: "#13c2c2",
    actions: INTERACTIVE_ACTIONS,
  },
] as const;

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

function snapMinutes(minutes: number) {
  return Math.round(minutes / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES;
}

function minutesToTimelineOffset(minutes: number) {
  return (Math.max(0, Math.min(MINUTES_PER_DAY, minutes)) / TIMELINE_SEGMENT_MINUTES) * TIMELINE_SEGMENT_HEIGHT;
}

function timelineOffsetToMinutes(offset: number, canvasHeight: number) {
  return Math.round((Math.max(0, Math.min(canvasHeight, offset)) / Math.max(canvasHeight, 1)) * MINUTES_PER_DAY);
}

function getNextSequentialBlockRange(blocks: BehaviorScheduleBlock[]) {
  const normalizedBlocks = normalizeBlocks(blocks);
  const latestBlock = normalizedBlocks[normalizedBlocks.length - 1];
  if (!latestBlock) {
    return null;
  }

  const startMinutes = latestBlock.endMinutes;
  if (startMinutes >= 1440) {
    return null;
  }

  const endMinutes = Math.min(1440, startMinutes + 60);
  return { startMinutes, endMinutes };
}

function actionColor(actionType: string) {
  const hash = actionType.split("").reduce((value, char) => value + char.charCodeAt(0), 0);
  return `hsl(${hash % 360}deg 72% 62%)`;
}

function getActionVisual(actionType: ActionType) {
  const defaults = {
    dot: "#7c8aa5",
    border: "#d7e0ef",
    background: "#f8fbff",
    text: "#2f3f57",
  };

  const map: Partial<Record<ActionType, typeof defaults>> = {
    sleep: {
      dot: "#5b5ce9",
      border: "#2f3952",
      background: "#253247",
      text: "#f4f6fb",
    },
    lie: {
      dot: "#6f71f4",
      border: "#7d83ff",
      background: "#eef0ff",
      text: "#4c57cb",
    },
    eat: {
      dot: "#22c55e",
      border: "#2ed573",
      background: "#eafbf0",
      text: "#26b45b",
    },
    play_ball: {
      dot: "#f59e0b",
      border: "#ffa31a",
      background: "#fff5d6",
      text: "#cc7a00",
    },
    run: {
      dot: "#f59e0b",
      border: "#ffa31a",
      background: "#fff5d6",
      text: "#cc7a00",
    },
    walk: {
      dot: "#3b82f6",
      border: "#6ea8ff",
      background: "#edf5ff",
      text: "#2c71dd",
    },
  };

  return map[actionType] ?? {
    ...defaults,
    dot: actionColor(actionType),
    border: `${actionColor(actionType)}55`,
    background: `${actionColor(actionType)}12`,
    text: "#334155",
  };
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

function pickDefaultSchedule(
  schedules: BehaviorSchedule[],
  draftSchedule: BehaviorSchedule | null,
  species: ScheduleSpecies,
) {
  const speciesSchedules = getSchedulesForSpecies(schedules, draftSchedule, species);
  return speciesSchedules.find((schedule) => schedule.isActive) ?? speciesSchedules[0] ?? null;
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
  const [dragState, setDragState] = useState<DragState | null>(null);
  const scheduleCanvasRef = useRef<HTMLDivElement | null>(null);
  const pendingBlockPointerRef = useRef<PendingBlockPointerState | null>(null);
  const activeDraggedBlockIdRef = useRef<string | null>(null);
  const selectedBlock = editorSchedule?.blocks?.find((block) => block.id === selectedBlockId) ?? null;
  const sortedBlocks = normalizeBlocks(editorSchedule?.blocks ?? []);

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

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const handlePointerMove = (event: globalThis.MouseEvent) => {
      if (!editorSchedule || !scheduleCanvasRef.current) {
        return;
      }

      let currentDragState = dragState;
      if (!dragState && pendingBlockPointerRef.current) {
        const pendingState = pendingBlockPointerRef.current;
        if (Math.abs(event.clientY - pendingState.startClientY) >= DRAG_START_THRESHOLD_PX) {
          activeDraggedBlockIdRef.current = pendingState.blockId;
          currentDragState = {
            blockId: pendingState.blockId,
            pointerOffsetMinutes: pendingState.pointerOffsetMinutes,
            durationMinutes: pendingState.durationMinutes,
          };
          setDragState({
            blockId: pendingState.blockId,
            pointerOffsetMinutes: pendingState.pointerOffsetMinutes,
            durationMinutes: pendingState.durationMinutes,
          });
          pendingBlockPointerRef.current = null;
        } else {
          return;
        }
      }

      if (!currentDragState && !activeDraggedBlockIdRef.current) {
        return;
      }

      if (!currentDragState) {
        return;
      }

      const rect = scheduleCanvasRef.current.getBoundingClientRect();
      const rawMinutes = timelineOffsetToMinutes(event.clientY - rect.top, rect.height);
      const snappedStart = snapMinutes(rawMinutes - currentDragState.pointerOffsetMinutes);
      const startMinutes = Math.max(0, Math.min(MINUTES_PER_DAY - currentDragState.durationMinutes, snappedStart));
      const endMinutes = startMinutes + currentDragState.durationMinutes;

      const editorBlocks = editorSchedule.blocks ?? [];
      const movingBlock = editorBlocks.find((block) => block.id === currentDragState.blockId);
      if (!movingBlock) {
        return;
      }

      const nextBlock = {
        ...movingBlock,
        startMinutes,
        endMinutes,
      };

      if (hasBlockOverlap(editorBlocks, nextBlock)) {
        return;
      }

      updateEditorSchedule((current) => ({
        ...current,
        blocks: (current.blocks ?? []).map((block) => (block.id === currentDragState.blockId ? nextBlock : block)),
      }));
      setSelectedBlockId(currentDragState.blockId);
    };

    const handlePointerUp = () => {
      if (pendingBlockPointerRef.current) {
        const { blockId } = pendingBlockPointerRef.current;
        pendingBlockPointerRef.current = null;
        activeDraggedBlockIdRef.current = null;
        setSelectedBlockId(blockId);
        setEditingBlockId(blockId);
        const block = (editorSchedule?.blocks ?? []).find((item) => item.id === blockId);
        if (block) {
          setBlockModalMode("edit");
          setBlockForm(buildBlockForm(block.startMinutes, block.endMinutes, block.actionType));
          setBlockModalOpen(true);
        }
        return;
      }

      activeDraggedBlockIdRef.current = null;
      setDragState(null);
    };

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);

    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
    };
  }, [dragState, editorSchedule]);

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

  const handleAddBehavior = () => {
    const nextRange = getNextSequentialBlockRange(sortedBlocks);
    if (nextRange) {
      openCreateBlockModal(nextRange.startMinutes, nextRange.endMinutes);
      return;
    }
    openCreateBlockModal(9 * 60);
  };

  const openCreateBlockModal = (clickedMinutes: number, defaultEndMinutes?: number) => {
    const { startMinutes, endMinutes } =
      typeof defaultEndMinutes === "number"
        ? { startMinutes: clickedMinutes, endMinutes: defaultEndMinutes }
        : getDefaultBlockRange(clickedMinutes);
    setBlockModalMode("create");
    setEditingBlockId(null);
    setBlockForm(buildBlockForm(startMinutes, endMinutes));
    setBlockModalOpen(true);
  };

  const openEditBlockModal = (block: BehaviorScheduleBlock | null = selectedBlock) => {
    if (!block) {
      return;
    }
    setBlockModalMode("edit");
    setEditingBlockId(block.id);
    setBlockForm(buildBlockForm(block.startMinutes, block.endMinutes, block.actionType));
    setBlockModalOpen(true);
  };

  const handleBlockMouseDown = (event: MouseEvent<HTMLDivElement>, block: BehaviorScheduleBlock) => {
    event.stopPropagation();
    if (!scheduleCanvasRef.current || !editorSchedule) {
      return;
    }

    const rect = scheduleCanvasRef.current.getBoundingClientRect();
    const startClientY = event.clientY;
    const pointerMinutes = timelineOffsetToMinutes(event.clientY - rect.top, rect.height);
    const pointerOffsetMinutes = Math.max(0, pointerMinutes - block.startMinutes);
    const durationMinutes = block.endMinutes - block.startMinutes;
    let dragging = false;

    setSelectedBlockId(block.id);

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      if (!scheduleCanvasRef.current) {
        return;
      }

      if (!dragging && Math.abs(moveEvent.clientY - startClientY) < DRAG_START_THRESHOLD_PX) {
        return;
      }

      dragging = true;
      activeDraggedBlockIdRef.current = block.id;

      const currentRect = scheduleCanvasRef.current.getBoundingClientRect();
      const rawMinutes = timelineOffsetToMinutes(moveEvent.clientY - currentRect.top, currentRect.height);
      const snappedStart = snapMinutes(rawMinutes - pointerOffsetMinutes);
      const startMinutes = Math.max(0, Math.min(MINUTES_PER_DAY - durationMinutes, snappedStart));
      const endMinutes = startMinutes + durationMinutes;
      const nextBlock = {
        ...block,
        startMinutes,
        endMinutes,
      };

      if (hasBlockOverlap(editorSchedule.blocks ?? [], nextBlock)) {
        return;
      }

      updateEditorSchedule((current) => ({
        ...current,
        blocks: (current.blocks ?? []).map((item) => (item.id === block.id ? nextBlock : item)),
      }));
      setSelectedBlockId(block.id);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      activeDraggedBlockIdRef.current = null;

      if (!dragging) {
        setSelectedBlockId(block.id);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const deleteBlockById = (blockId: string | null) => {
    if (!blockId) {
      return;
    }

    updateEditorSchedule((current) => ({
      ...current,
      blocks: (current.blocks ?? []).filter((block) => block.id !== blockId),
    }));
    setSelectedBlockId((current) => (current === blockId ? null : current));
    if (editingBlockId === blockId) {
      closeBlockModal();
    }
  };

  const handleTimelineClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!editorSchedule) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    const clickedMinutes = Math.round((relativeY / Math.max(rect.height, 1)) * MINUTES_PER_DAY);
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

  const persistSchedule = async () => {
    if (!editorSchedule) {
      return null;
    }

    const name = editorSchedule.name.trim();
    if (!name) {
      messageApi.error("请输入日程名称");
      return null;
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
        return response.schedule.id as string;
      } else {
        const response = await api.updateSchedule(editorSchedule.id, payload);
        await refreshSchedules(response.schedule.id, draftSchedule, editorSchedule.species);
        return response.schedule.id as string;
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "保存失败";
      messageApi.error(text);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSchedule = async () => {
    const scheduleId = await persistSchedule();
    if (scheduleId) {
      messageApi.success("日程已保存");
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
            <div style={{ color: "#8c8c8c", fontSize: 13 }}>宠物类型</div>
            {SCHEDULE_SPECIES.map((species) => {
              const schedule = pickDefaultSchedule(schedules, draftSchedule, species);
              const selected = species === activeSpecies;

              return (
                <div
                  key={species}
                  onClick={() => handleSpeciesChange(species)}
                  style={{
                    ...timelineStyles.speciesItem,
                    border: selected ? "1px solid #1677ff" : "1px solid #f0f0f0",
                    boxShadow: selected ? "0 0 0 2px rgba(22,119,255,0.12)" : "none",
                    background: selected ? "#f7fbff" : "#fff",
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{speciesLabels[species]}</div>
                  <div style={{ fontSize: 12, color: "#8c8c8c", marginBottom: 8 }}>
                    {schedule ? schedule.name : loading ? "加载中..." : "暂无配置"}
                  </div>
                  <Space size={6} wrap>
                    {schedule ? (
                      <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                        {effectiveTypeLabels[schedule.effectiveType as ScheduleEffectiveType] ?? schedule.effectiveType}
                      </Tag>
                    ) : null}
                    {schedule?.isActive ? <Badge status="success" text="已应用" /> : null}
                  </Space>
                </div>
              );
            })}

            <Button type="primary" block onClick={handleCreateSchedule}>
              新建当前类型配置
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
              <div style={timelineStyles.timelineCard}>
                <Space direction="vertical" size={16} style={{ width: "100%" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>日程名称与时间区间</div>
                      <div style={{ color: "#8c8c8c" }}>
                        点击空白日历区域选择时间段，下方按钮可快速添加行为。
                      </div>
                    </div>
                    <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                      {editorSchedule.name}
                    </Tag>
                  </div>

                  <div style={timelineStyles.scheduleBoard}>
                    <div style={timelineStyles.timeRail}>
                      {verticalTimelineHours.map((hour) => (
                        <div key={hour} style={timelineStyles.timeRailItem}>
                          <div style={{ position: "absolute", top: 0, left: -22 }}>{String(hour).padStart(2, "0")}:00</div>
                          <div
                            style={{
                              position: "absolute",
                              top: 8,
                              left: -1,
                              width: 1,
                              height: 44,
                              background: hour === 12 ? "#3b82f6" : "#dfe6f2",
                            }}
                          />
                        </div>
                      ))}
                    </div>

                    <div style={timelineStyles.scheduleColumn}>
                      <div
                        ref={scheduleCanvasRef}
                        style={{
                          ...timelineStyles.scheduleCanvas,
                          cursor: dragState ? "grabbing" : "default",
                        }}
                        onClick={handleTimelineClick}
                      >
                        {verticalTimelineHours.map((hour, index) => {
                          const top = index * TIMELINE_SEGMENT_HEIGHT;
                          return (
                            <div key={hour}>
                              <div style={{ ...timelineStyles.scheduleGridLine, top }} />
                              <div
                                style={{
                                  ...timelineStyles.scheduleGridBand,
                                  top: top + 10,
                                  height: TIMELINE_SEGMENT_HEIGHT - 20,
                                }}
                              />
                            </div>
                          );
                        })}

                        {sortedBlocks.length > 0 ? (
                          sortedBlocks.map((block) => {
                            const isSelected = selectedBlockId === block.id;
                            const visual = getActionVisual(block.actionType);
                            const top = minutesToTimelineOffset(block.startMinutes);
                            const blockHeight = Math.max(
                              28,
                              minutesToTimelineOffset(block.endMinutes) - minutesToTimelineOffset(block.startMinutes),
                            );
                            const compact = blockHeight < 52;

                            return (
                              <div
                                key={block.id}
                                onMouseDown={(event) => handleBlockMouseDown(event, block)}
                                onDoubleClick={(event) => {
                                  event.stopPropagation();
                                  openEditBlockModal(block);
                                }}
                                style={{
                                  position: "absolute",
                                  top,
                                  left: 12,
                                  right: 12,
                                  height: blockHeight,
                                  borderRadius: 6,
                                  border: `2px solid ${isSelected ? visual.dot : visual.border}`,
                                  background: visual.background,
                                  padding: compact ? "5px 36px 5px 14px" : "14px 42px 14px 16px",
                                  display: "flex",
                                  alignItems: "flex-start",
                                  cursor: dragState?.blockId === block.id ? "grabbing" : "grab",
                                  boxShadow: isSelected ? `0 0 0 2px ${visual.border}` : "none",
                                  overflow: "hidden",
                                }}
                              >
                                <div style={{ minWidth: 0, width: "100%" }}>
                                  <div
                                    style={{
                                      fontSize: compact ? 13 : 14,
                                      fontWeight: 700,
                                      color: visual.text,
                                      lineHeight: 1.3,
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                    }}
                                  >
                                    {ACTION_LABELS[block.actionType]} {actionEnglishLabels[block.actionType]}
                                    {compact ? ` · ${formatTime(block.startMinutes)}-${formatTime(block.endMinutes)}` : ""}
                                  </div>
                                  {compact ? null : (
                                    <div
                                      style={{
                                        marginTop: 4,
                                        fontSize: 13,
                                        color: "rgba(31, 41, 55, 0.68)",
                                        lineHeight: 1.35,
                                      }}
                                    >
                                      {formatTime(block.startMinutes)} - {formatTime(block.endMinutes)}
                                    </div>
                                  )}
                                </div>
                                <Button
                                  type="text"
                                  danger
                                  size="small"
                                  aria-label={`删除${ACTION_LABELS[block.actionType]}时间段`}
                                  icon={<CloseOutlined />}
                                  onMouseDown={(event) => {
                                    event.stopPropagation();
                                  }}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    deleteBlockById(block.id);
                                  }}
                                  style={{
                                    position: "absolute",
                                    top: compact ? 0 : 6,
                                    right: 8,
                                    color: "#98a2b3",
                                  }}
                                />
                              </div>
                            );
                          })
                        ) : (
                          <div
                            style={{
                              position: "absolute",
                              top: 12,
                              left: 12,
                              right: 12,
                              borderRadius: 14,
                              border: "1px dashed #d7e3f5",
                              background: "#fafcff",
                              padding: 32,
                              textAlign: "center",
                              color: "#98a2b3",
                            }}
                          >
                            当前还没有行为，请点击空白区域或下方按钮添加。
                          </div>
                        )}
                      </div>

                      <Button style={timelineStyles.addBehaviorButton} onClick={handleAddBehavior}>
                        + 点击添加宠物行为
                      </Button>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ color: "#8c8c8c", fontSize: 12 }}>
                      已添加 {(editorSchedule.blocks ?? []).length} 个行为时间段
                    </div>
                  </div>
                </Space>
              </div>
            </>
          )}
        </div>

        <div style={timelineStyles.attributePanel}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>行为属性</div>
            <div style={{ color: "#8c8c8c", fontSize: 13 }}>
              配置循环规则后，先保存配置，再应用当前配置。
            </div>
          </div>

          <div>
            <div style={{ marginBottom: 8, color: "#595959", fontSize: 13 }}>循环规则</div>
            <Space direction="vertical" size={10} style={{ width: "100%" }}>
              {(["everyday", "weekday", "friday"] as ScheduleEffectiveType[]).map((rule) => {
                const selected = editorSchedule?.effectiveType === rule;
                return (
                  <div
                    key={rule}
                    onClick={() =>
                      updateEditorSchedule((current) => ({
                        ...current,
                        effectiveType: rule,
                      }))
                    }
                    style={{
                      borderRadius: 12,
                      border: selected ? "1px solid #6aa0ff" : "1px solid #e5e7eb",
                      background: selected ? "#eef5ff" : "#fff",
                      padding: "14px 16px",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: selected ? "#3b82f6" : "#e2e8f0",
                        boxShadow: selected ? "inset 0 0 0 4px #eef5ff" : "none",
                        flexShrink: 0,
                      }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, color: "#1f2937" }}>
                        {effectiveTypeLabels[rule]} {effectiveTypeEnglishLabels[rule]}
                      </div>
                    </div>
                  </div>
                );
              })}
            </Space>
          </div>

          <div style={timelineStyles.actionLibraryCard}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>动作参考</div>
                    <Space direction="vertical" size={12} style={{ width: "100%" }}>
                      {actionGroupMeta.map((group) => (
                        <div key={group.key}>
                          <div style={{ color: group.color, fontWeight: 700, marginBottom: 6 }}>{group.title}</div>
                          <div style={{ color: "#8c8c8c", fontSize: 12, marginBottom: 6 }}>{group.description}</div>
                          <Space size={[6, 6]} wrap>
                            {group.actions.map((action) => (
                              <Tag
                                key={action}
                                color={group.key === "basic" ? "blue" : group.key === "fun" ? "purple" : "cyan"}
                                style={{ marginInlineEnd: 0, borderRadius: 999 }}
                              >
                                {ACTION_LABELS[action]}
                              </Tag>
                    ))}
                  </Space>
                </div>
              ))}
            </Space>
          </div>

          <div
            style={{
              marginTop: "auto",
              background: "#fafafa",
              border: "1px solid #f0f0f0",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Space direction="vertical" size={10} style={{ width: "100%" }}>
              <Button block loading={saving} disabled={!editorSchedule} onClick={() => void handleSaveSchedule()}>
                保存配置
              </Button>
              <Button
                type="primary"
                block
                loading={activating}
                disabled={!editorSchedule || isDraftSchedule(editorSchedule.id)}
                onClick={() => void handleActivateSchedule()}
              >
                应用当前配置
              </Button>
              {editorSchedule?.isActive ? <Badge status="success" text="当前配置已应用" /> : null}
            </Space>
          </div>
        </div>
      </div>

      <Modal
        title={blockModalMode === "create" ? "新建时间块" : "编辑时间块"}
        open={blockModalOpen}
        onOk={handleSubmitBlock}
        onCancel={closeBlockModal}
        footer={(_, { OkBtn, CancelBtn }) => (
          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <Button
              danger
              disabled={blockModalMode !== "edit" || !editingBlockId}
              onClick={() => deleteBlockById(editingBlockId)}
            >
              删除时间块
            </Button>
            <Space>
              <CancelBtn />
              <OkBtn />
            </Space>
          </Space>
        )}
        destroyOnHidden
      >
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <div>
            <div style={{ marginBottom: 8, color: "#595959" }}>动作类型</div>
            <Select<ActionType>
              value={blockForm.actionType}
              style={{ width: "100%" }}
              options={actionGroupMeta.map((group) => ({
                label: group.title,
                options: group.actions.map((actionType) => ({
                  label: ACTION_LABELS[actionType] ?? actionType,
                  value: actionType,
                })),
              }))}
              onChange={(value) =>
                setBlockForm((current) => ({
                  ...current,
                  actionType: value as ActionType,
                }))
              }
            />
            <Divider style={{ margin: "12px 0" }} />
            <Space size={[8, 8]} wrap>
              {ALL_ACTIONS.map((action) => (
                <Tag
                  key={action}
                  color={blockForm.actionType === action ? "processing" : "default"}
                  onClick={() =>
                    setBlockForm((current) => ({
                      ...current,
                      actionType: action,
                    }))
                  }
                  style={{
                    marginInlineEnd: 0,
                    cursor: "pointer",
                    borderRadius: 999,
                    paddingInline: 10,
                    userSelect: "none",
                  }}
                >
                  {ACTION_LABELS[action]}
                </Tag>
              ))}
            </Space>
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
