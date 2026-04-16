import { View, Text, Picker, PickerView, PickerViewColumn, ScrollView } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useMemo, useState } from "react";
import PageBack from "../../components/PageBack";
import type { PetAvatarAction } from "@pet-wechat/shared";
import { request } from "../../utils/request";
import {
  getPetModeSchedule,
  getPetModeSlots,
  setPetActivityMode,
  setPetModeSchedule,
  setPetModeSlots,
  type PetModeRepeatType,
  type PetModeSchedule,
  type PetModeSlot,
  type PetModeWeekday,
} from "../../utils/storage";
import { getSystemPresetActionLabels, normalizePetActionLabel } from "../../utils/petActions";
import "./index.scss";

const MODE_CARDS = [
  { key: "free", label: "系统自由" },
  { key: "custom", label: "个性自定义" },
  { key: "real", label: "真实行为" },
];

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
  { key: "once", label: "单次" },
  { key: "weekly", label: "周期重复" },
];

type ScheduleEditorState = {
  visible: boolean;
  repeat: PetModeRepeatType;
  days: PetModeWeekday[];
};

type TimeEditorState = {
  visible: boolean;
  index: number;
  start: string;
  end: string;
  action: string;
  activeField: "start" | "end";
};

const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

function normalizeActionLabel(action: string) {
  return normalizePetActionLabel(action);
}

function toMinutes(value: string) {
  const [hour, minute] = String(value).split(":").map(Number);
  return hour * 60 + minute;
}

function sortSlots(slots: PetModeSlot[]) {
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

function getWeekdayLabel(day: PetModeWeekday) {
  return WEEKDAY_OPTIONS.find((item) => item.key === day)?.label || "周一";
}

function buildScheduleSummary(schedule: PetModeSchedule, selectedDay: PetModeWeekday) {
  if (schedule.repeat === "weekly") {
    const labels = orderDays(schedule.days).map((day) => getWeekdayLabel(day));
    return labels.length > 0 ? `周期重复 · ${labels.join(" / ")}` : "周期重复";
  }

  return "单次 · 仅今天生效";
}

export default function PetModeCustomPage() {
  const router = useRouter();
  const petId = router.params.petId || "";
  const [slots, setSlots] = useState<PetModeSlot[]>(() => getPetModeSlots(petId));
  const [schedule, setSchedule] = useState<PetModeSchedule>(() => getPetModeSchedule(petId));
  const [selectedDay] = useState<PetModeWeekday>(() => {
    const saved = getPetModeSchedule(petId);
    return saved.days[0] || getTodayWeekday();
  });
  const [systemActions, setSystemActions] = useState<string[]>(() => getSystemPresetActionLabels());
  const [customActions, setCustomActions] = useState<string[]>([]);
  const [scheduleEditor, setScheduleEditor] = useState<ScheduleEditorState>(() => ({
    visible: false,
    repeat: schedule.repeat,
    days: orderDays(schedule.days),
  }));
  const [timeEditor, setTimeEditor] = useState<TimeEditorState>({
    visible: false,
    index: -1,
    start: "08:00",
    end: "11:30",
    action: getSystemPresetActionLabels()[0],
    activeField: "start",
  });

  useDidShow(() => {
    if (!petId) return;

    void request<{ pet?: unknown; avatars?: unknown[]; actions: PetAvatarAction[] }>({
      url: `/api/pets/${petId}`,
    })
      .then((res) => {
        const normalized = [...(res.actions || [])]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((item) => normalizeActionLabel(item.actionType))
          .filter(Boolean);
        const presetActions = getSystemPresetActionLabels();
        const mergedSystemActions = Array.from(new Set([...presetActions, ...normalized]));
        setSystemActions(mergedSystemActions);
        // 当前后端还没有独立返回“用户自定义动作”数据，这里保持空态，
        // 避免把系统生成动作误切成自定义活动。
        setCustomActions([]);
      })
      .catch(() => {
        setSystemActions(getSystemPresetActionLabels());
        setCustomActions([]);
      });
  });

  const allActions = useMemo(
    () => Array.from(new Set([...systemActions, ...customActions].filter(Boolean))),
    [customActions, systemActions]
  );

  const selectedDaySlots = useMemo(() => sortSlots(slots), [slots]);

  const todayWeekday = getTodayWeekday();
  const displayDayLabel = selectedDay === todayWeekday ? "今天" : getWeekdayLabel(selectedDay);
  const scheduleSummary = useMemo(
    () => buildScheduleSummary(schedule, selectedDay),
    [schedule, selectedDay]
  );

  const openScheduleEditor = () => {
    setScheduleEditor({
      visible: true,
      repeat: schedule.repeat,
      days: orderDays(schedule.days.length > 0 ? schedule.days : [selectedDay]),
    });
  };

  const openTimeEditor = (index = -1) => {
    const target = index >= 0 ? selectedDaySlots[index] : null;
    setTimeEditor({
      visible: true,
      index: target ? slots.findIndex((item) => item.id === target.id) : -1,
      start: target?.start || "08:00",
      end: target?.end || "11:30",
      action: target?.action || allActions[0] || getSystemPresetActionLabels()[0],
      activeField: "start",
    });
  };

  const closeScheduleEditor = () => {
    setScheduleEditor((prev) => ({ ...prev, visible: false }));
  };

  const closeTimeEditor = () => {
    setTimeEditor((prev) => ({ ...prev, visible: false }));
  };

  const persistSlots = (nextSlots: PetModeSlot[]) => {
    const sortedSlots = sortSlots(nextSlots);
    setSlots(sortedSlots);
    setPetActivityMode(petId, "custom");
    setPetModeSlots(petId, sortedSlots);
  };

  const handleToggleScheduleDay = (day: PetModeWeekday) => {
    setScheduleEditor((prev) => {
      if (prev.repeat !== "weekly") {
        return { ...prev, days: [day] };
      }

      const exists = prev.days.includes(day);
      if (exists) {
        if (prev.days.length === 1) return prev;
        return { ...prev, days: prev.days.filter((item) => item !== day) };
      }

      return { ...prev, days: orderDays([...prev.days, day]) };
    });
  };

  const handleSaveSchedule = () => {
    const nextSchedule: PetModeSchedule =
      scheduleEditor.repeat === "weekly"
        ? {
            repeat: "weekly",
            days: orderDays(scheduleEditor.days),
            date: null,
          }
        : {
            repeat: "once",
            days: [getTodayWeekday()],
            date: new Date().toISOString().slice(0, 10),
          };

    if (nextSchedule.repeat === "weekly" && nextSchedule.days.length === 0) {
      Taro.showToast({ title: "请至少选择一个日期", icon: "none" });
      return;
    }

    setSchedule(nextSchedule);
    setScheduleEditor((prev) => ({ ...prev, visible: false }));
    setPetActivityMode(petId, "custom");
    setPetModeSchedule(petId, nextSchedule);

    Taro.showToast({ title: "日程已保存", icon: "success" });
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

    if (timeEditor.index >= 0) {
      const nextSlots = [...slots];
      const target = nextSlots[timeEditor.index];

      if (!target) {
        closeTimeEditor();
        return;
      }

      nextSlots[timeEditor.index] = {
        ...target,
        start: timeEditor.start,
        end: timeEditor.end,
        action: timeEditor.action,
      };

      if (hasOverlap(nextSlots)) {
        Taro.showToast({ title: "时间段不能重叠", icon: "none" });
        return;
      }

      persistSlots(nextSlots);
      closeTimeEditor();
      Taro.showToast({ title: "时间段已修改", icon: "success" });
      return;
    }

    const nextSlots = [...slots];
    const newSlot: PetModeSlot = {
      id: `slot-${Date.now()}`,
      day: getTodayWeekday(),
      repeat: schedule.repeat,
      start: timeEditor.start,
      end: timeEditor.end,
      action: timeEditor.action,
      date: schedule.repeat === "once" ? schedule.date || new Date().toISOString().slice(0, 10) : null,
    };

    if (hasOverlap([...nextSlots, newSlot])) {
      Taro.showToast({ title: "时间段不能重叠", icon: "none" });
      return;
    }

    nextSlots.push(newSlot);

    persistSlots(nextSlots);
    closeTimeEditor();
    Taro.showToast({ title: "时间段已添加", icon: "success" });
  };

  const handleDeleteTimeSlot = () => {
    if (timeEditor.index < 0) {
      closeTimeEditor();
      return;
    }

    const nextSlots = slots.filter((_, index) => index !== timeEditor.index);
    persistSlots(nextSlots);
    closeTimeEditor();
    Taro.showToast({ title: "时间段已删除", icon: "success" });
  };

  const handleCreateCustomAction = () => {
    Taro.navigateTo({ url: `/pages/custom-action/index?petId=${encodeURIComponent(petId)}` });
  };

  const activeTimeValue = timeEditor.activeField === "start" ? timeEditor.start : timeEditor.end;
  const [activeHour = "00", activeMinute = "00"] = activeTimeValue.split(":");
  const pickerValue = [
    Math.max(0, HOURS.indexOf(activeHour)),
    Math.max(0, MINUTES.indexOf(activeMinute)),
  ];

  return (
    <View className="pet-mode-custom-page">
      <View className="pet-mode-top-strip" />
      <View className="pet-mode-header">
        <PageBack inline fallbackUrl="/pages/index/index" />
        <Text className="pet-mode-title">宠物活动模式</Text>
      </View>

      <View className="pet-mode-shell">
        <View className="mode-switch-row">
          {MODE_CARDS.map((item) => (
            <View
              key={item.key}
              className={`mode-option-card ${item.key === "custom" ? "mode-option-card--active" : ""}`}
              onClick={() => {
                if (item.key === "custom") return;
                Taro.redirectTo({ url: `/pages/pet-mode/index?petId=${petId}&mode=${item.key}` });
              }}
            >
              <View className={`mode-option-icon ${item.key === "custom" ? "mode-option-icon--active" : ""}`} />
              <Text className="mode-option-name">{item.label}</Text>
            </View>
          ))}
        </View>

        <View className="custom-day-card" onClick={openScheduleEditor}>
          <View className="custom-day-left">
            <Text className="custom-day-emoji">📅</Text>
            <Text className="custom-day-text">{displayDayLabel}</Text>
          </View>
          <View className="custom-add-circle">
            <Text className="custom-add-circle-text">+</Text>
          </View>
        </View>

        <Text className="custom-system-tip">除自定义时间段外，其余时间按照系统原有动作时间表进行播放</Text>
        <Text className="custom-schedule-summary">{scheduleSummary}</Text>

        <View className="custom-slot-list">
          {selectedDaySlots.map((slot, index) => (
            <View key={slot.id} className="custom-slot-card" onClick={() => openTimeEditor(index)}>
              <View className="custom-slot-time-wrap">
                <View className="custom-slot-time">
                  <Text className="custom-slot-time-text">
                    {slot.start} --- {slot.end}
                  </Text>
                </View>
              </View>

              <View className="custom-slot-action">
                <Text className="custom-slot-action-text">{slot.action}</Text>
              </View>
            </View>
          ))}
        </View>

        {selectedDaySlots.length === 0 ? (
          <View className="custom-empty-card">
            <Text className="custom-empty-title">今天还没有添加活动时间段</Text>
            <Text className="custom-empty-desc">点击下方按钮，为今天添加开始时间、结束时间和活动内容</Text>
          </View>
        ) : null}

        <View className="custom-add-slot-btn" onClick={() => openTimeEditor()}>
          <Text className="custom-add-slot-text">+ 添加时间段</Text>
        </View>
      </View>

      {scheduleEditor.visible ? (
        <View className="custom-editor-mask" onClick={closeScheduleEditor}>
          <View className="custom-sheet custom-sheet--compact" onClick={(e) => e.stopPropagation()}>
            <View className="custom-sheet-header">
              <Text className="custom-sheet-title">选择日程</Text>
              <View className="custom-sheet-close" onClick={closeScheduleEditor}>
                <Text className="custom-sheet-close-text">×</Text>
              </View>
            </View>

            <View className="schedule-repeat-switch">
              {REPEAT_OPTIONS.map((item) => (
                <View
                  key={item.key}
                  className={`schedule-repeat-chip ${
                    scheduleEditor.repeat === item.key ? "schedule-repeat-chip--active" : ""
                  }`}
                  onClick={() =>
                    setScheduleEditor((prev) => ({
                      ...prev,
                      repeat: item.key,
                      days:
                        item.key === "weekly"
                          ? orderDays(prev.days)
                          : [prev.days[0] || selectedDay],
                    }))
                  }
                >
                  <Text
                    className={`schedule-repeat-chip-text ${
                      scheduleEditor.repeat === item.key ? "schedule-repeat-chip-text--active" : ""
                    }`}
                  >
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>

            {scheduleEditor.repeat === "weekly" ? (
              <View className="schedule-day-picker">
                <Text className="schedule-day-picker-title">选择日期</Text>
                <View className="schedule-day-picker-row">
                  {WEEKDAY_OPTIONS.map((item) => {
                    const active = scheduleEditor.days.includes(item.key);
                    return (
                      <View
                        key={item.key}
                        className={`schedule-day-picker-chip ${active ? "schedule-day-picker-chip--active" : ""}`}
                        onClick={() => handleToggleScheduleDay(item.key)}
                      >
                        <Text
                          className={`schedule-day-picker-chip-text ${
                            active ? "schedule-day-picker-chip-text--active" : ""
                          }`}
                        >
                          {item.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View className="custom-sheet-primary-btn" onClick={handleSaveSchedule}>
              <Text className="custom-sheet-primary-btn-text">保存设置</Text>
            </View>
          </View>
        </View>
      ) : null}

      {timeEditor.visible ? (
        <View className="custom-editor-mask" onClick={closeTimeEditor}>
          <View className="custom-sheet" onClick={(e) => e.stopPropagation()}>
            <View className="custom-sheet-header">
              <Text className="custom-sheet-title">
                {timeEditor.index >= 0 ? "编辑活动时间段" : "添加活动时间段"}
              </Text>
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

                <Text className="time-editor-tip">支持精确到分钟的时间设置</Text>
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
                        {systemActions.map((action) => (
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

                    <View className="activity-options-section">
                      <Text className="activity-options-section-title">自定义动作</Text>
                      {customActions.length > 0 ? (
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
                      ) : (
                        <View className="activity-empty-card">
                          <Text className="activity-empty-card-text">当前宠物还没有自定义活动</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </ScrollView>
              </View>
            </View>

            <View className="custom-action-empty-wrap custom-action-empty-wrap--sheet">
              <View className="custom-action-link-btn" onClick={handleCreateCustomAction}>
                <Text className="custom-action-link-btn-text">去添加自定义动作</Text>
              </View>
            </View>

            <View className="custom-editor-footer">
              <View
                className="custom-editor-delete-btn"
                onClick={timeEditor.index >= 0 ? handleDeleteTimeSlot : closeTimeEditor}
              >
                <Text className="custom-editor-delete-btn-text">{timeEditor.index >= 0 ? "删除" : "取消"}</Text>
              </View>
              <View className="custom-editor-save-btn" onClick={handleSaveTimeSlot}>
                <Text className="custom-editor-save-btn-text">{timeEditor.index >= 0 ? "确认修改" : "确认添加"}</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
