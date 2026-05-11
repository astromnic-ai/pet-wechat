export const SYSTEM_PRESET_ACTION_KEYS = [
  "base-seat",
  "base-eat",
  "base-sleep",
  "base-lay",
  "base-run",
  "base-walk",
  "base-stand",
  "base-jump",
] as const;

export const PET_ACTION_LABELS: Record<string, string> = {
  "base-seat": "蹲坐",
  "base-eat": "吃饭",
  "base-sleep": "睡觉",
  "base-lay": "趴卧",
  "base-run": "跑",
  "base-walk": "走",
  "base-stand": "站立",
  "base-jump": "跳",
  "funny-playball": "玩球",
  "funny-toilet": "蹲厕/噗噗",
  "funny-drinkwater": "喝杯子水",
  "funny-chasing-the-tail": "追尾巴",
  "funny-butterfly": "捉蝴蝶",
  "funny-dream": "做美梦",
  "funny-lick-paw": "舔爪子/wink",
  "funny-spin-around": "转圈",
  "touch-dizzy": "眩晕",
  "touch-get-closer": "走近靠近",
  "touch-run-fast-6s": "跑酷",
  "touch-woken-up-6s": "困但睁眼回应",
  "touch-shrimp-6s": "吃虾/吃骨头",
  "touch-well-behaved-miaomiao-6s": "蹲坐乖巧/喵喵",
  "touch-confused-6s": "站在原地困惑",
  "touch-walk-left-6s": "走向左边",
  "touch-walk-right-6s": "走向右边",
  sit: "蹲坐",
  eat: "吃饭",
  sleep: "睡觉",
  lie: "趴卧",
  run: "跑",
  walk: "走",
  play_ball: "玩球",
  poop: "蹲厕/噗噗",
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

export function normalizePetActionLabel(action: string) {
  const trimmed = String(action || "").trim();
  if (!trimmed) return "";
  return PET_ACTION_LABELS[trimmed] || trimmed;
}

export function getSystemPresetActionLabels() {
  return SYSTEM_PRESET_ACTION_KEYS.map((item) => normalizePetActionLabel(item));
}
