export const BASIC_ACTIONS = [
  "sit",
  "eat",
  "sleep",
  "lie",
  "run",
  "walk",
] as const;

export const FUN_ACTIONS = [
  "play_ball",
  "poop",
  "watch_tv",
  "chase_tail",
  "scratch_air",
  "dream",
  "lick_paw",
  "spin",
] as const;

export const ALL_ACTIONS = [...BASIC_ACTIONS, ...FUN_ACTIONS] as const;

export type ActionType = (typeof ALL_ACTIONS)[number];

export const ACTION_LABELS: Record<string, string> = {
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

export const SCHEDULE_SPECIES = ["cat", "dog", "other"] as const;
