import { ACTION_LABELS, ALL_ACTIONS } from "shared";

const ACTION_ALIASES: Record<string, string> = {
  跑步: "base-run",
  奔跑: "base-run",
  走路: "base-walk",
  散步: "base-walk",
  睡眠: "base-sleep",
  睡觉: "base-sleep",
  进食: "base-eat",
  吃东西: "base-eat",
  休息: "base-lay",
  趴下: "base-lay",
  坐: "base-seat",
  蹲坐: "base-seat",
  站: "base-stand",
  跳跃: "base-jump",
};

const validActions = new Set<string>(ALL_ACTIONS);
const labelToAction = new Map<string, string>();

for (const action of ALL_ACTIONS) {
  const label = ACTION_LABELS[action];
  if (label && !labelToAction.has(label)) {
    labelToAction.set(label, action);
  }
}

export function normalizePetActionType(action: string) {
  const value = String(action || "").trim();
  if (!value) return "";
  if (validActions.has(value)) return value;

  return labelToAction.get(value) ?? ACTION_ALIASES[value] ?? value;
}
