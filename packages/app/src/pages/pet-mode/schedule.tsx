import { View, Text, Picker, PickerView, PickerViewColumn, ScrollView } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import PageBack from "../../components/PageBack";
import {
  addPetCustomActionLabel,
  getCurrentWeekDateByDay,
  getPetCustomActionLabels,
  getPetModePlans,
  setPetActivityMode,
  setPetModePlans,
  type PetModePlan,
  type PetModeRepeatType,
  type PetModeSlot,
  type PetModeWeekday,
} from "../../utils/storage";
import { getSystemPresetActionLabels } from "../../utils/petActions";
import "./index.scss";

const WEEKDAY_OPTIONS: Array<{ key: PetModeWeekday; label: string }> = [
  { key: "mon", label: "周一" },
  { key: "tue", label: "周二" },
  { key: "wed", label: "周三" },
  { key: "thu", label: "周四" },
  { key: "fri", label: "周五" },
  { key: "sat", label: "周六" },
  { key: "sun", label: "周日" },
];

const REPEAT_OPTIONS: Array<{ key: PetModeRepeatType; label: string }> = [
  { key: "once", label: "本周单次" },
  { key: "weekly", label: "周期重复" },
];

const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
const DEFAULT_SYSTEM_ACTIONS = getSystemPresetActionLabels().slice(0, 8);

type TimeEditorState = {
  visible: boolean;
  editIndex: number;
  start: string;
  end: string;
  action: string;
  activeField: "start" | "end";
};

type SlotActionDialogState = {
  visible: boolean;
  slotIndex: number;
};

function getTodayWeekday(): PetModeWeekday {
  const day = new Date().getDay();
  if (day === 0) return "sun";
  if (day === 1) return "mon";
  if (day === 2) return "tue";
  if (day === 3) return "wed";
  if (day === 4) return "thu";
  if (day === 5) return "fri";
  return "sat";
}

function orderDays(days: PetModeWeekday[]) {
  const order = WEEKDAY_OPTIONS.map((item) => item.key);
  return [...new Set(days)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

function toMinutes(value: string) {
  const [hour, minute] = String(value).split(":").map(Number);
  return hour * 60 + minute;
}

function sortSlots<T extends PetModeSlot>(slots: T[]) {
  return [...slots].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}

function hasOverlap(slots: PetModeSlot[]) {
  const sorted = sortSlots(slots);
  for (let i = 1; i < sorted.length; i += 1) {
    if (toMinutes(sorted[i].start) < toMinutes(sorted[i - 1].end)) {
      return true;
    }
  }
  return false;
}

function toTimeValue(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.min(totalMinutes, 23 * 60 + 59));
  const hour = Math.floor(safeMinutes / 60);
  const minute = safeMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getNextTimeSuggestion(slots: PetModeSlot[]) {
  if (slots.length === 0) {
    return { start: "07:00", end: "09:00" };
  }

  const sorted = sortSlots(slots);
  const lastSlot = sorted[sorted.length - 1];
  const startMinutes = toMinutes(lastSlot.end);
  const endMinutes = Math.min(startMinutes + 120, 23 * 60 + 59);

  if (endMinutes <= startMinutes) {
    return {
      start: toTimeValue(Math.max(0, startMinutes - 120)),
      end: toTimeValue(startMinutes),
    };
  }

  return {
    start: toTimeValue(startMinutes),
    end: toTimeValue(endMinutes),
  };
}

export default function PetModeSchedulePage() {
  const router = useRouter();
  const petId = router.params.petId || "";
  const scheduleId = router.params.scheduleId || "";
  const isCreating = router.params.create === "1" || !scheduleId;
  const plans = useMemo(() => getPetModePlans(petId), [petId]);
  const existingPlan = useMemo(
    () => (isCreating ? null : plans.find((item) => item.id === scheduleId) ?? null),
    [isCreating, plans, scheduleId]
  );

  const existingOrderedDays = existingPlan?.days?.length ? orderDays(existingPlan.days) : [];
  const [repeat, setRepeat] = useState<PetModeRepeatType>(existingPlan?.repeat || "once");
  const [selectedDays, setSelectedDays] = useState<PetModeWeekday[]>(existingOrderedDays);
  const [activeDay, setActiveDay] = useState<PetModeWeekday>(existingOrderedDays[0] || "mon");
  const [selectedDate, setSelectedDate] = useState<string>(existingPlan?.date || "");
  const [slots, setSlots] = useState<PetModeSlot[]>(() => sortSlots(existingPlan?.slots || []));
  const [customActions, setCustomActions] = useState<string[]>([]);
  const [timeEditor, setTimeEditor] = useState<TimeEditorState>({
    visible: false,
    editIndex: -1,
    start: "07:00",
    end: "09:00",
    action: DEFAULT_SYSTEM_ACTIONS[0] || "蹲坐",
    activeField: "start",
  });
  const [slotActionDialog, setSlotActionDialog] = useState<SlotActionDialogState>({
    visible: false,
    slotIndex: -1,
  });

  useEffect(() => {
    if (existingPlan) {
      const nextDays = existingPlan.days?.length ? orderDays(existingPlan.days) : [];
      setRepeat(existingPlan.repeat);
      setSelectedDays(nextDays);
      setActiveDay(nextDays[0] || "mon");
      setSelectedDate(existingPlan.date || (nextDays[0] ? getCurrentWeekDateByDay(nextDays[0]) : ""));
      setSlots(sortSlots(existingPlan.slots || []));
      return;
    }

    setRepeat("once");
    setSelectedDays(["mon"]);
    setActiveDay("mon");
    setSelectedDate(getCurrentWeekDateByDay("mon"));
    setSlots([]);
  }, [existingPlan]);

  useDidShow(() => {
    setCustomActions(getPetCustomActionLabels(petId));
  });

  const allActions = useMemo(
    () => Array.from(new Set([...DEFAULT_SYSTEM_ACTIONS, ...customActions].filter(Boolean))),
    [customActions]
  );

  const visibleSlots = useMemo(
    () =>
      sortSlots(
        slots
          .map((slot, index) => ({ ...slot, originalIndex: index }))
          .filter((slot) => slot.day === activeDay)
      ),
    [activeDay, slots]
  );
  const selectedDaySlots = useMemo(
    () => slots.filter((slot) => selectedDays.includes(slot.day || activeDay)),
    [activeDay, selectedDays, slots]
  );
  const canSaveSchedule = selectedDaySlots.length > 0 && selectedDays.length > 0;
  const canDeleteSchedule = slots.length > 0;

  const handleToggleDay = (day: PetModeWeekday) => {
    setSelectedDays((prev) => {
      const exists = prev.includes(day);
      if (exists && activeDay !== day) {
        setActiveDay(day);
        setSelectedDate(getCurrentWeekDateByDay(day));
        return prev;
      }

      if (exists) {
        if (prev.length === 1) return prev;
        const nextDays = prev.filter((item) => item !== day);
        const nextActiveDay = nextDays[0] || "mon";
        setActiveDay(nextActiveDay);
        setSelectedDate(getCurrentWeekDateByDay(nextActiveDay));
        return nextDays;
      }

      setActiveDay(day);
      setSelectedDate(getCurrentWeekDateByDay(day));
      return orderDays([...prev, day]);
    });
  };

  const openTimeEditor = (slotIndex = -1) => {
    const target = slotIndex >= 0 ? slots[slotIndex] : null;
    const nextSuggestion = getNextTimeSuggestion(visibleSlots);
    setTimeEditor({
      visible: true,
      editIndex: slotIndex,
      start: target?.start || nextSuggestion.start,
      end: target?.end || nextSuggestion.end,
      action: target?.action || allActions[0] || DEFAULT_SYSTEM_ACTIONS[0] || "蹲坐",
      activeField: "start",
    });
  };

  const closeTimeEditor = () => {
    setTimeEditor((prev) => ({ ...prev, visible: false }));
  };

  const handleSaveTimeSlot = () => {
    if (!timeEditor.action) {
      Taro.showToast({ title: "请选择活动", icon: "none" });
      return;
    }

    if (toMinutes(timeEditor.end) <= toMinutes(timeEditor.start)) {
      Taro.showToast({ title: "结束时间需晚于开始时间", icon: "none" });
      return;
    }

    const nextSlots = [...slots];
    const nextSlot: PetModeSlot = {
      id: timeEditor.editIndex >= 0 ? nextSlots[timeEditor.editIndex]?.id || `slot-${Date.now()}` : `slot-${Date.now()}`,
      start: timeEditor.start,
      end: timeEditor.end,
      action: timeEditor.action,
      day: activeDay,
      repeat,
      date: repeat === "once" ? getCurrentWeekDateByDay(activeDay) : null,
    };

    if (timeEditor.editIndex >= 0) {
      nextSlots[timeEditor.editIndex] = nextSlot;
    } else {
      nextSlots.push(nextSlot);
    }

    const nextVisibleSlots = nextSlots.filter((slot) => slot.day === activeDay);
    if (hasOverlap(nextVisibleSlots)) {
      Taro.showToast({ title: "时间段不能重叠", icon: "none" });
      return;
    }

    setSlots(sortSlots(nextSlots));
    closeTimeEditor();
    Taro.showToast({ title: timeEditor.editIndex >= 0 ? "时间段已修改" : "时间段已添加", icon: "success" });
  };

  const handleDeleteSlot = (slotIndex: number) => {
    const nextSlots = slots.filter((_, index) => index !== slotIndex);
    setSlots(sortSlots(nextSlots));
    setSlotActionDialog({ visible: false, slotIndex: -1 });
    Taro.showToast({ title: "时间段已删除", icon: "success" });
  };

  const handleSaveSchedule = () => {
    if (!canSaveSchedule) return;

    const normalizedDays = orderDays(selectedDays);
    if (normalizedDays.length === 0) {
      Taro.showToast({ title: "请选择日期", icon: "none" });
      return;
    }

    const nextPlan: PetModePlan = {
      id: existingPlan?.id || `plan-${Date.now()}`,
      repeat,
      days: normalizedDays,
      date: null,
      slots: sortSlots(
        selectedDaySlots
          .filter((slot) => normalizedDays.includes(slot.day || activeDay))
          .map((slot) => ({
            ...slot,
            repeat,
            date: repeat === "once" && slot.day ? getCurrentWeekDateByDay(slot.day) : null,
          }))
      ),
    };

    const currentPlans = getPetModePlans(petId);
    const nextPlans = existingPlan
      ? currentPlans.map((item) => (item.id === existingPlan.id ? nextPlan : item))
      : [...currentPlans, nextPlan];

    setPetModePlans(petId, nextPlans);
    setPetActivityMode(petId, "custom");
    Taro.showToast({ title: "日程已保存", icon: "success" });
    setTimeout(() => {
      Taro.navigateBack();
    }, 300);
  };

  const handleDeleteSchedule = () => {
    if (!canDeleteSchedule) return;

    if (existingPlan) {
      const nextPlans = getPetModePlans(petId).filter((item) => item.id !== existingPlan.id);
      setPetModePlans(petId, nextPlans);
      Taro.showToast({ title: "日程已删除", icon: "success" });
      setTimeout(() => {
        Taro.navigateBack();
      }, 300);
      return;
    }

    setSlots([]);
    Taro.showToast({ title: "日程已清空", icon: "success" });
  };

  const activeTimeValue = timeEditor.activeField === "start" ? timeEditor.start : timeEditor.end;
  const [activeHour = "00", activeMinute = "00"] = activeTimeValue.split(":");
  const pickerValue = [
    Math.max(0, HOURS.indexOf(activeHour)),
    Math.max(0, MINUTES.indexOf(activeMinute)),
  ];

  return (
    <View className="custom-schedule-page">
      <View className="pet-mode-top-strip" />
      <View className="pet-mode-header">
        <PageBack inline fallbackUrl={`/pages/pet-mode/custom?petId=${petId}`} />
        <Text className="pet-mode-title">编辑日程</Text>
      </View>

      <ScrollView className="custom-schedule-scroll" scrollY>
        <View className="custom-schedule-shell">
          <View className="custom-schedule-head">
            <Text className="custom-schedule-head-label">选择日期</Text>
            <View className="custom-schedule-repeat-switch">
              {REPEAT_OPTIONS.map((item) => (
                <View
                  key={item.key}
                  className={`custom-schedule-repeat-chip ${
                    repeat === item.key ? "custom-schedule-repeat-chip--active" : ""
                  }`}
                  onClick={() => {
                    setRepeat(item.key);
                    setSelectedDate(getCurrentWeekDateByDay(activeDay));
                  }}
                >
                  <Text
                    className={`custom-schedule-repeat-chip-text ${
                      repeat === item.key ? "custom-schedule-repeat-chip-text--active" : ""
                    }`}
                  >
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <View className="custom-schedule-week-row">
            {WEEKDAY_OPTIONS.map((item) => {
              const active = selectedDays.includes(item.key);
              return (
                <View
                  key={item.key}
                  className={`custom-schedule-week-chip ${active ? "custom-schedule-week-chip--active" : ""}`}
                  onClick={() => handleToggleDay(item.key)}
                >
                  <Text
                    className={`custom-schedule-week-chip-text ${
                      active ? "custom-schedule-week-chip-text--active" : ""
                    }`}
                  >
                    {item.label}
                  </Text>
                </View>
              );
            })}
          </View>

          <View className="custom-schedule-slot-list">
            {visibleSlots.map((slot) => (
              <View
                key={slot.id}
                className="custom-schedule-slot-card"
                onClick={() => setSlotActionDialog({ visible: true, slotIndex: slot.originalIndex })}
              >
                <View className="custom-schedule-slot-time">
                  <Text className="custom-schedule-slot-time-text">
                    {slot.start} - {slot.end}
                  </Text>
                </View>
                <View className="custom-schedule-slot-action">
                  <Text className="custom-schedule-slot-action-text">{slot.action}</Text>
                </View>
              </View>
            ))}
          </View>

          <View className="custom-schedule-add-btn" onClick={() => openTimeEditor()}>
            <Text className="custom-schedule-add-btn-text">+ 添加活动时间段</Text>
          </View>

          <View
            className={`custom-schedule-primary-btn ${!canSaveSchedule ? "custom-schedule-primary-btn--disabled" : ""}`}
            onClick={handleSaveSchedule}
          >
            <Text className="custom-schedule-primary-btn-text">保存日程</Text>
          </View>

          <View
            className={`custom-schedule-secondary-btn ${!canDeleteSchedule ? "custom-schedule-secondary-btn--disabled" : ""}`}
            onClick={handleDeleteSchedule}
          >
            <Text className="custom-schedule-secondary-btn-text">删除日程</Text>
          </View>
        </View>
      </ScrollView>

      {timeEditor.visible ? (
        <View className="custom-editor-mask" onClick={closeTimeEditor}>
          <View className="custom-sheet custom-sheet--tall" onClick={(e) => e.stopPropagation()}>
            <View className="custom-sheet-header">
              <Text className="custom-sheet-title">添加活动时间段</Text>
              <View className="custom-sheet-close" onClick={closeTimeEditor}>
                <Text className="custom-sheet-close-text">×</Text>
              </View>
            </View>

            <View className="time-editor-body">
              <View className="time-editor-column">
                <Text className="time-editor-label">选择时间</Text>
                <View className="time-range-summary">
                  <Text className="time-range-summary-text">
                    {timeEditor.start} --- {timeEditor.end}
                  </Text>
                </View>

                <View className="time-picker-pair">
                  <View
                    className={`time-picker-card ${
                      timeEditor.activeField === "start" ? "time-picker-card--active" : ""
                    }`}
                    onClick={() => setTimeEditor((prev) => ({ ...prev, activeField: "start" }))}
                  >
                    <View className="time-picker-card-inner">
                      <Text className="time-picker-label">开始时间</Text>
                      <Text className="time-picker-value">{timeEditor.start}</Text>
                    </View>
                  </View>

                  <View
                    className={`time-picker-card ${
                      timeEditor.activeField === "end" ? "time-picker-card--active" : ""
                    }`}
                    onClick={() => setTimeEditor((prev) => ({ ...prev, activeField: "end" }))}
                  >
                    <View className="time-picker-card-inner">
                      <Text className="time-picker-label">结束时间</Text>
                      <Text className="time-picker-value">{timeEditor.end}</Text>
                    </View>
                  </View>
                </View>

                <View className="time-picker-wheel-wrap">
                  <View className="time-picker-wheel-header">
                    <Text className="time-picker-wheel-header-text">小时</Text>
                    <Text className="time-picker-wheel-header-text">分钟</Text>
                  </View>

                  <PickerView
                    className="time-picker-wheel"
                    indicatorStyle="height: 72rpx;"
                    value={pickerValue}
                    onChange={(e) => {
                      const [hourIndex, minuteIndex] = e.detail.value;
                      const nextValue = `${HOURS[hourIndex] || "00"}:${MINUTES[minuteIndex] || "00"}`;
                      setTimeEditor((prev) =>
                        prev.activeField === "start"
                          ? { ...prev, start: nextValue }
                          : { ...prev, end: nextValue }
                      );
                    }}
                  >
                    <PickerViewColumn>
                      {HOURS.map((hour) => (
                        <View key={hour} className="time-picker-wheel-item">
                          <Text className="time-picker-wheel-item-text">{hour}</Text>
                        </View>
                      ))}
                    </PickerViewColumn>
                    <PickerViewColumn>
                      {MINUTES.map((minute) => (
                        <View key={minute} className="time-picker-wheel-item">
                          <Text className="time-picker-wheel-item-text">{minute}</Text>
                        </View>
                      ))}
                    </PickerViewColumn>
                  </PickerView>
                </View>
              </View>

              <View className="time-editor-column">
                <Text className="time-editor-label">选择活动</Text>
                <Picker
                  mode="selector"
                  range={allActions}
                  value={Math.max(0, allActions.findIndex((item) => item === timeEditor.action))}
                  onChange={(e) => {
                    const nextAction = allActions[Number(e.detail.value)] || "";
                    setTimeEditor((prev) => ({ ...prev, action: nextAction }));
                  }}
                >
                  <View className="activity-picker-card">
                    <Text className="activity-picker-card-text">{timeEditor.action || "选择活动"}</Text>
                    <Text className="activity-picker-card-arrow">⌄</Text>
                  </View>
                </Picker>

                <ScrollView className="activity-options-scroll" scrollY enhanced showScrollbar={false}>
                  <View className="activity-options-list">
                    <View className="activity-options-section">
                      <Text className="activity-options-section-title">系统动作</Text>
                      <View className="activity-options-grid">
                        {DEFAULT_SYSTEM_ACTIONS.map((action) => (
                          <View
                            key={`system-${action}`}
                            className={`activity-option-item ${
                              timeEditor.action === action ? "activity-option-item--active" : ""
                            }`}
                            onClick={() => setTimeEditor((prev) => ({ ...prev, action }))}
                          >
                            <Text
                              className={`activity-option-item-text ${
                                timeEditor.action === action ? "activity-option-item-text--active" : ""
                              }`}
                            >
                              {action}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>

                    {customActions.length > 0 ? (
                      <View className="activity-options-section">
                        <Text className="activity-options-section-title">自定义动作</Text>
                        <View className="activity-options-grid">
                          {customActions.map((action) => (
                            <View
                              key={`custom-${action}`}
                              className={`activity-option-item ${
                                timeEditor.action === action ? "activity-option-item--active" : ""
                              }`}
                              onClick={() => setTimeEditor((prev) => ({ ...prev, action }))}
                            >
                              <Text
                                className={`activity-option-item-text ${
                                  timeEditor.action === action ? "activity-option-item-text--active" : ""
                                }`}
                              >
                                {action}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    ) : null}
                  </View>
                </ScrollView>
              </View>
            </View>

            <View className="custom-editor-footer">
              <View className="custom-editor-cancel-btn" onClick={closeTimeEditor}>
                <Text className="custom-editor-cancel-btn-text">取消</Text>
              </View>
              <View className="custom-editor-save-btn" onClick={handleSaveTimeSlot}>
                <Text className="custom-editor-save-btn-text">
                  {timeEditor.editIndex >= 0 ? "确认修改" : "确认添加"}
                </Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {slotActionDialog.visible ? (
        <View
          className="custom-editor-mask"
          onClick={() => setSlotActionDialog({ visible: false, slotIndex: -1 })}
        >
          <View className="custom-slot-action-dialog" onClick={(e) => e.stopPropagation()}>
            <Text className="custom-slot-action-dialog-title">编辑这个时间段？</Text>
            <Text className="custom-slot-action-dialog-desc">你可以删除该时段，或继续修改时间和对应活动。</Text>
            <View className="custom-slot-action-dialog-footer">
              <View
                className="custom-editor-delete-btn"
                onClick={() => handleDeleteSlot(slotActionDialog.slotIndex)}
              >
                <Text className="custom-editor-delete-btn-text">删除</Text>
              </View>
              <View
                className="custom-editor-save-btn"
                onClick={() => {
                  const nextIndex = slotActionDialog.slotIndex;
                  setSlotActionDialog({ visible: false, slotIndex: -1 });
                  openTimeEditor(nextIndex);
                }}
              >
                <Text className="custom-editor-save-btn-text">确认修改</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
