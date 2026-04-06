export const MAX_SCHEDULES_PER_SOURCE = 20;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type ScheduleInput = {
  startTime: string;
  endTime: string;
  actionType: string;
};

type PartialScheduleInput = Partial<ScheduleInput>;

type ScheduleRange = {
  id?: string;
  startTime: string;
  endTime: string;
};

function normalizeScheduleValue(value: unknown) {
  return typeof value === "string" ? value.trim() : value;
}

export function normalizeScheduleInput<T extends PartialScheduleInput>(input: T): T {
  return {
    ...input,
    startTime: normalizeScheduleValue(input.startTime),
    endTime: normalizeScheduleValue(input.endTime),
    actionType: normalizeScheduleValue(input.actionType),
  } as T;
}

export function validateScheduleTimes(startTime: string, endTime: string) {
  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
    return "时间格式错误";
  }

  if (startTime === endTime || startTime > endTime) {
    return "开始时间必须早于结束时间";
  }

  return null;
}

export function validateScheduleInput(
  input: PartialScheduleInput,
  options: { partial?: boolean } = {},
) {
  const partial = options.partial ?? false;
  const normalizedInput = normalizeScheduleInput(input);

  if (!partial || normalizedInput.startTime !== undefined) {
    if (typeof normalizedInput.startTime !== "string" || !normalizedInput.startTime) {
      return "startTime 必填";
    }
  }

  if (!partial || normalizedInput.endTime !== undefined) {
    if (typeof normalizedInput.endTime !== "string" || !normalizedInput.endTime) {
      return "endTime 必填";
    }
  }

  if (!partial || normalizedInput.actionType !== undefined) {
    if (typeof normalizedInput.actionType !== "string" || !normalizedInput.actionType) {
      return "actionType 必填";
    }
  }

  if (
    normalizedInput.startTime !== undefined &&
    normalizedInput.endTime !== undefined
  ) {
    return validateScheduleTimes(normalizedInput.startTime, normalizedInput.endTime);
  }

  return null;
}

export function hasScheduleOverlap(
  target: Pick<ScheduleInput, "startTime" | "endTime">,
  schedules: ScheduleRange[],
  excludeId?: string,
) {
  return schedules.some((schedule) => {
    if (excludeId && schedule.id === excludeId) {
      return false;
    }

    return (
      target.startTime < schedule.endTime && target.endTime > schedule.startTime
    );
  });
}

export function validateSchedulesInput(schedules: unknown) {
  if (!Array.isArray(schedules)) {
    return "schedules 必须是数组";
  }

  if (schedules.length > MAX_SCHEDULES_PER_SOURCE) {
    return `时间表最多 ${MAX_SCHEDULES_PER_SOURCE} 条`;
  }

  const normalizedSchedules = schedules.map((schedule) =>
    normalizeScheduleInput((schedule ?? {}) as PartialScheduleInput),
  );

  for (const schedule of normalizedSchedules) {
    if (!schedule || typeof schedule !== "object") {
      return "时间表数据不完整";
    }

    const validationError = validateScheduleInput(schedule);
    if (validationError) {
      return validationError;
    }
  }

  const sortedSchedules = normalizedSchedules
    .map((schedule) => schedule as ScheduleInput)
    .sort((left, right) =>
      left.startTime === right.startTime
        ? left.endTime.localeCompare(right.endTime)
        : left.startTime.localeCompare(right.startTime),
    );

  for (let index = 1; index < sortedSchedules.length; index += 1) {
    if (sortedSchedules[index].startTime < sortedSchedules[index - 1].endTime) {
      return "时间段与现有配置重叠";
    }
  }

  return null;
}
