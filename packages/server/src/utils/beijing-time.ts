const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

export const PET_SCHEDULE_TIME_ZONE = "Asia/Shanghai";

export type BeijingDateParts = {
  year: number;
  month: number;
  day: number;
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  hour: number;
  minute: number;
};

export function getBeijingDateParts(date: Date): BeijingDateParts {
  const shifted = new Date(date.getTime() + BEIJING_OFFSET_MS);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay() as BeijingDateParts["weekday"],
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

export function getBeijingDateKey(date: Date) {
  const parts = getBeijingDateParts(date);
  return [
    parts.year,
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

export function getBeijingMinutes(date: Date) {
  const parts = getBeijingDateParts(date);
  return parts.hour * 60 + parts.minute;
}

export function getBeijingTimeValue(date: Date) {
  const parts = getBeijingDateParts(date);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function getBeijingEffectiveTypes(date: Date): Array<"weekend" | "weekday" | "everyday"> {
  const { weekday } = getBeijingDateParts(date);
  const types: Array<"weekend" | "weekday" | "everyday"> = ["everyday"];

  if (weekday >= 1 && weekday <= 5) {
    types.unshift("weekday");
  }
  if (weekday === 0 || weekday === 6) {
    types.unshift("weekend");
  }

  return types;
}
