import { View, Text, Picker, ScrollView } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useMemo, useState } from "react";
import PageBack from "../../components/PageBack";
import type { PetAvatarAction } from "@pet-wechat/shared";
import { request } from "../../utils/request";
import { getPetModeSlots, setPetActivityMode, setPetModeSlots, type PetModeSlot } from "../../utils/storage";
import "./index.scss";

const MODE_CARDS = [
  { key: "free", label: "系统自由" },
  { key: "custom", label: "个性自定义" },
  { key: "real", label: "真实行为" },
];

const DEFAULT_SYSTEM_ACTION_KEYS = ["sit", "eat", "sleep", "lie", "run", "walk", "lick_paw", "play_ball"] as const;
const ACTION_LABELS: Record<string, string> = {
  sit: "蹲坐",
  eat: "吃饭",
  sleep: "睡觉",
  lie: "趴卧",
  run: "跑",
  walk: "走",
  play_ball: "玩球",
  poop: "噗噗",
  watch_tv: "看电视",
  chase_tail: "追尾巴",
  scratch_air: "挠空气",
  dream: "做美梦",
  lick_paw: "舔爪子",
  spin: "转圈",
  walking: "走路",
  running: "奔跑",
  sleeping: "睡眠",
  eating: "进食",
  playing: "玩耍",
  resting: "休息",
  jumping: "跳跃",
};

type EditorState = {
  visible: boolean;
  index: number;
  start: string;
  end: string;
  action: string;
};

function normalizeActionLabel(action: string) {
  const trimmed = String(action || "").trim();
  if (!trimmed) return "";
  return ACTION_LABELS[trimmed] || trimmed;
}

function toMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
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

export default function PetModeCustomPage() {
  const router = useRouter();
  const petId = router.params.petId || "";
  const [slots, setSlots] = useState<PetModeSlot[]>(() => getPetModeSlots(petId));
  const [systemActions, setSystemActions] = useState<string[]>(
    DEFAULT_SYSTEM_ACTION_KEYS.map((item) => normalizeActionLabel(item))
  );
  const [customActions, setCustomActions] = useState<string[]>([]);
  const [editor, setEditor] = useState<EditorState>({
    visible: false,
    index: -1,
    start: "14:00",
    end: "16:00",
    action: normalizeActionLabel(DEFAULT_SYSTEM_ACTION_KEYS[0]),
  });

  useDidShow(() => {
    if (!petId) return;

    void request<{ actions: PetAvatarAction[] }>({ url: `/api/pets/${petId}` })
      .then((res) => {
        const sorted = [...res.actions].sort((a, b) => a.sortOrder - b.sortOrder);
        const normalized = sorted.map((item) => normalizeActionLabel(item.actionType)).filter(Boolean);

        const nextSystemActions = normalized.slice(0, 8);
        const nextCustomActions = normalized.slice(8);

        setSystemActions(
          nextSystemActions.length > 0
            ? Array.from(new Set(nextSystemActions))
            : DEFAULT_SYSTEM_ACTION_KEYS.map((item) => normalizeActionLabel(item))
        );
        setCustomActions(Array.from(new Set(nextCustomActions)));
      })
      .catch(() => {
        setSystemActions(DEFAULT_SYSTEM_ACTION_KEYS.map((item) => normalizeActionLabel(item)));
        setCustomActions([]);
      });
  });

  const allActions = useMemo(
    () => Array.from(new Set([...systemActions, ...customActions].filter(Boolean))),
    [customActions, systemActions]
  );

  const openEditor = (index = -1) => {
    const target = index >= 0 ? slots[index] : null;
    setEditor({
      visible: true,
      index,
      start: target?.start || "14:00",
      end: target?.end || "16:00",
      action: target?.action || allActions[0] || normalizeActionLabel(DEFAULT_SYSTEM_ACTION_KEYS[0]),
    });
  };

  const closeEditor = () => {
    setEditor((prev) => ({ ...prev, visible: false }));
  };

  const persistSlots = (nextSlots: PetModeSlot[]) => {
    const sortedSlots = sortSlots(nextSlots);
    setSlots(sortedSlots);
    setPetActivityMode(petId, "custom");
    setPetModeSlots(petId, sortedSlots);
  };

  const handleSaveSlot = () => {
    if (!editor.action) {
      Taro.showToast({ title: "请选择动作", icon: "none" });
      return;
    }

    if (toMinutes(editor.end) <= toMinutes(editor.start)) {
      Taro.showToast({ title: "结束时间需晚于开始时间", icon: "none" });
      return;
    }

    const nextSlot: PetModeSlot = {
      start: editor.start,
      end: editor.end,
      action: editor.action,
    };

    const nextSlots = [...slots];
    if (editor.index >= 0) {
      nextSlots[editor.index] = nextSlot;
    } else {
      nextSlots.push(nextSlot);
    }

    if (hasOverlap(nextSlots)) {
      Taro.showToast({ title: "时间段不能重叠", icon: "none" });
      return;
    }

    persistSlots(nextSlots);
    closeEditor();
    Taro.showToast({ title: "时间段已保存", icon: "success" });
  };

  const handleDeleteSlot = () => {
    if (editor.index < 0) {
      closeEditor();
      return;
    }

    const nextSlots = slots.filter((_, index) => index !== editor.index);
    persistSlots(nextSlots);
    closeEditor();
    Taro.showToast({ title: "时间段已删除", icon: "success" });
  };

  const handleCreateCustomAction = () => {
    Taro.navigateTo({ url: `/pages/custom-action/index?petId=${encodeURIComponent(petId)}` });
  };

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

        <View className="custom-day-card">
          <View className="custom-day-left">
            <Text className="custom-day-emoji">📅</Text>
            <Text className="custom-day-text">今天</Text>
          </View>
          <View className="custom-add-circle" onClick={() => openEditor()}>
            <Text className="custom-add-circle-text">+</Text>
          </View>
        </View>

        <View className="custom-slot-list">
          {slots.map((slot, index) => (
            <View
              key={`${slot.start}-${slot.end}-${slot.action}-${index}`}
              className="custom-slot-card"
              onClick={() => openEditor(index)}
            >
              <View className="custom-slot-time">
                <Text className="custom-slot-time-text">{slot.start} - {slot.end}</Text>
              </View>
              <View className="custom-slot-action">
                <Text className="custom-slot-action-text">{slot.action}</Text>
              </View>
            </View>
          ))}
        </View>

        <View className="custom-add-slot-btn" onClick={() => openEditor()}>
          <Text className="custom-add-slot-text">+ 添加时间段</Text>
        </View>
      </View>

      {editor.visible ? (
        <View className="custom-editor-mask" onClick={closeEditor}>
          <View className="custom-editor-sheet" onClick={(e) => e.stopPropagation()}>
            <Text className="custom-editor-title">{editor.index >= 0 ? "编辑时间段" : "添加时间段"}</Text>

            <View className="custom-editor-block">
              <Text className="custom-editor-label">时间段设置</Text>
              <View className="custom-editor-time-row">
                <Picker
                  mode="time"
                  value={editor.start}
                  onChange={(e) => setEditor((prev) => ({ ...prev, start: e.detail.value }))}
                >
                  <View className="custom-editor-time-picker">
                    <Text className="custom-editor-time-picker-text">{editor.start}</Text>
                  </View>
                </Picker>

                <Text className="custom-editor-time-separator">-</Text>

                <Picker
                  mode="time"
                  value={editor.end}
                  onChange={(e) => setEditor((prev) => ({ ...prev, end: e.detail.value }))}
                >
                  <View className="custom-editor-time-picker">
                    <Text className="custom-editor-time-picker-text">{editor.end}</Text>
                  </View>
                </Picker>
              </View>
            </View>

            <View className="custom-editor-block">
              <Text className="custom-editor-label">动作选择</Text>

              <ScrollView className="custom-action-scroll" scrollY>
                <View className="custom-action-section">
                  <Text className="custom-action-section-title">系统动作</Text>
                  <View className="custom-action-grid">
                    {systemActions.map((action) => (
                      <View
                        key={`system-${action}`}
                        className={`custom-action-chip ${editor.action === action ? "custom-action-chip--active" : ""}`}
                        onClick={() => setEditor((prev) => ({ ...prev, action }))}
                      >
                        <Text className={`custom-action-chip-text ${editor.action === action ? "custom-action-chip-text--active" : ""}`}>
                          {action}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>

                <View className="custom-action-section">
                  <Text className="custom-action-section-title">自定义动作</Text>
                  {customActions.length > 0 ? (
                    <View className="custom-action-grid">
                      {customActions.map((action) => (
                        <View
                          key={`custom-${action}`}
                          className={`custom-action-chip ${editor.action === action ? "custom-action-chip--active" : ""}`}
                          onClick={() => setEditor((prev) => ({ ...prev, action }))}
                        >
                          <Text className={`custom-action-chip-text ${editor.action === action ? "custom-action-chip-text--active" : ""}`}>
                            {action}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View className="custom-action-empty-wrap">
                      <Text className="custom-action-empty">当前宠物还没有自定义动作</Text>
                      <View className="custom-action-link-btn" onClick={handleCreateCustomAction}>
                        <Text className="custom-action-link-btn-text">去添加自定义动作</Text>
                      </View>
                    </View>
                  )}
                </View>
              </ScrollView>
            </View>

            <View className="custom-editor-footer">
              {editor.index >= 0 ? (
                <View className="custom-editor-delete-btn" onClick={handleDeleteSlot}>
                  <Text className="custom-editor-delete-btn-text">删除</Text>
                </View>
              ) : null}
              <View className="custom-editor-save-btn" onClick={handleSaveSlot}>
                <Text className="custom-editor-save-btn-text">保存设置</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
