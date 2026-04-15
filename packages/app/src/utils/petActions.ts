export const SYSTEM_PRESET_ACTION_KEYS = [
  "sit",
  "lie",
  "eat",
  "sleep",
  "run",
  "walk",
  "lick_paw",
  "play_ball",
  "watch_tv",
  "chase_tail",
] as const;

export const PET_ACTION_LABELS: Record<string, string> = {
  sit: "蹲坐",
  eat: "吃饭",
  sleep: "睡觉",
  lie: "趴卧",
  run: "跑酷",
  walk: "散步",
  play_ball: "玩耍",
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

export function normalizePetActionLabel(action: string) {
  const trimmed = String(action || "").trim();
  if (!trimmed) return "";
  return PET_ACTION_LABELS[trimmed] || trimmed;
}

export function getSystemPresetActionLabels() {
  return SYSTEM_PRESET_ACTION_KEYS.map((item) => normalizePetActionLabel(item));
}
