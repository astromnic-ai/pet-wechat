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

export const MEMBERSHIP_LEVEL_LABELS = {
  free: "免费版",
  basic: "基础版",
  pro: "专业版",
  premium: "旗舰版",
} as const;

export const DEFAULT_FREE_BENEFITS = [
  {
    key: "avatar_generation",
    label: "AI 形象生成",
    value: "2 次",
    enabled: true,
  },
  {
    key: "basic_actions",
    label: "基础动作库",
    value: `${BASIC_ACTIONS.length} 项`,
    enabled: true,
  },
  {
    key: "personalized_actions",
    label: "个性化动作库",
    value: `${FUN_ACTIONS.length} 项`,
    enabled: false,
  },
  {
    key: "priority_review",
    label: "优先审核",
    value: "标准队列",
    enabled: false,
  },
] as const;
