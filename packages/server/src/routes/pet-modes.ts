import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  collarDevices,
  deviceAuthorizations,
  petModeSchedules,
  petModes,
  pets,
} from "../db/schema";

const petModesRoute = new Hono();

const TIME_PATTERN = /^\d{2}:\d{2}$/;

type PetActivityMode = "free" | "custom" | "real";
type ScheduleSource = "system" | "custom";
type ScheduleInput = {
  startTime: string;
  endTime: string;
  actionType: string;
};

function isPetActivityMode(value: unknown): value is PetActivityMode {
  return value === "free" || value === "custom" || value === "real";
}

function validateScheduleTimes(startTime: string, endTime: string) {
  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
    return "时间格式错误";
  }

  if (startTime === endTime || startTime > endTime) {
    return "开始时间必须早于结束时间";
  }

  return null;
}

function validateScheduleInput(
  input: Partial<ScheduleInput>,
  options: { partial?: boolean } = {},
) {
  const partial = options.partial ?? false;

  if (!partial || input.startTime !== undefined) {
    if (typeof input.startTime !== "string") {
      return "startTime 必填";
    }
  }

  if (!partial || input.endTime !== undefined) {
    if (typeof input.endTime !== "string") {
      return "endTime 必填";
    }
  }

  if (!partial || input.actionType !== undefined) {
    if (typeof input.actionType !== "string" || !input.actionType.trim()) {
      return "actionType 必填";
    }
  }

  if (input.startTime !== undefined && input.endTime !== undefined) {
    return validateScheduleTimes(input.startTime, input.endTime);
  }

  return null;
}

function hasOverlap(
  target: Pick<ScheduleInput, "startTime" | "endTime">,
  schedules: Array<typeof petModeSchedules.$inferSelect>,
  excludeId?: string,
) {
  return schedules.some((schedule) => {
    if (excludeId && schedule.id === excludeId) {
      return false;
    }

    return target.startTime < schedule.endTime && target.endTime > schedule.startTime;
  });
}

async function ensurePetAccess(userId: string, petId: string) {
  const [ownPet] = await db
    .select({ id: pets.id })
    .from(pets)
    .where(and(eq(pets.id, petId), eq(pets.userId, userId)))
    .limit(1);

  if (ownPet) {
    return ownPet;
  }

  const [authorizedPet] = await db
    .select({ petId: deviceAuthorizations.petId })
    .from(deviceAuthorizations)
    .where(
      and(
        eq(deviceAuthorizations.petId, petId),
        eq(deviceAuthorizations.toUserId, userId),
        eq(deviceAuthorizations.status, "accepted"),
      ),
    )
    .limit(1);

  return authorizedPet ?? null;
}

async function getOrCreatePetMode(petId: string) {
  const [existingMode] = await db
    .select()
    .from(petModes)
    .where(eq(petModes.petId, petId))
    .limit(1);

  if (existingMode) {
    return existingMode;
  }

  const [createdMode] = await db
    .insert(petModes)
    .values({
      petId,
      mode: "free",
    })
    .returning();

  return createdMode;
}

async function getSchedulesBySource(petId: string, source: ScheduleSource) {
  return db
    .select()
    .from(petModeSchedules)
    .where(and(eq(petModeSchedules.petId, petId), eq(petModeSchedules.source, source)))
    .orderBy(asc(petModeSchedules.sortOrder), asc(petModeSchedules.startTime));
}

async function getSchedulesForMode(petId: string, mode: PetActivityMode) {
  if (mode === "real") {
    return [];
  }

  const source: ScheduleSource = mode === "free" ? "system" : "custom";
  return getSchedulesBySource(petId, source);
}

async function getCustomSchedules(petId: string) {
  return getSchedulesBySource(petId, "custom");
}

petModesRoute.get("/:id/mode", async (c) => {
  const userId = c.get("userId" as never) as string;
  const petId = c.req.param("id");
  const pet = await ensurePetAccess(userId, petId);

  if (!pet) {
    return c.json({ error: "Pet not found" }, 404);
  }

  const modeRecord = await getOrCreatePetMode(petId);
  const schedules = await getSchedulesForMode(petId, modeRecord.mode);

  return c.json({ mode: modeRecord.mode, schedules });
});

petModesRoute.put("/:id/mode", async (c) => {
  const userId = c.get("userId" as never) as string;
  const petId = c.req.param("id");
  const pet = await ensurePetAccess(userId, petId);

  if (!pet) {
    return c.json({ error: "Pet not found" }, 404);
  }

  const body = await c.req.json<{ mode?: PetActivityMode }>();
  if (!isPetActivityMode(body.mode)) {
    return c.json({ error: "无效的活动模式" }, 400);
  }

  if (body.mode === "real") {
    const [collar] = await db
      .select({ id: collarDevices.id })
      .from(collarDevices)
      .where(eq(collarDevices.petId, petId))
      .limit(1);

    if (!collar) {
      return c.json({ error: "请先绑定项圈设备" }, 400);
    }
  }

  const [modeRecord] = await db
    .insert(petModes)
    .values({
      petId,
      mode: body.mode,
    })
    .onConflictDoUpdate({
      target: petModes.petId,
      set: {
        mode: body.mode,
        updatedAt: new Date(),
      },
    })
    .returning();

  return c.json({ mode: modeRecord });
});

petModesRoute.get("/:id/mode/schedules", async (c) => {
  const userId = c.get("userId" as never) as string;
  const petId = c.req.param("id");
  const pet = await ensurePetAccess(userId, petId);

  if (!pet) {
    return c.json({ error: "Pet not found" }, 404);
  }

  const modeRecord = await getOrCreatePetMode(petId);
  const schedules = await getSchedulesForMode(petId, modeRecord.mode);

  return c.json({ schedules });
});

petModesRoute.post("/:id/mode/schedules", async (c) => {
  const userId = c.get("userId" as never) as string;
  const petId = c.req.param("id");
  const pet = await ensurePetAccess(userId, petId);

  if (!pet) {
    return c.json({ error: "Pet not found" }, 404);
  }

  const body = await c.req.json<ScheduleInput>();
  const validationError = validateScheduleInput(body);
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  const customSchedules = await getCustomSchedules(petId);
  if (customSchedules.length >= 20) {
    return c.json({ error: "自定义时间表最多 20 条" }, 400);
  }

  if (hasOverlap(body, customSchedules)) {
    return c.json({ error: "时间段与现有配置重叠" }, 400);
  }

  const nextSortOrder = customSchedules.reduce(
    (maxSortOrder, schedule) => Math.max(maxSortOrder, schedule.sortOrder),
    -1,
  ) + 1;

  const [schedule] = await db
    .insert(petModeSchedules)
    .values({
      petId,
      source: "custom",
      startTime: body.startTime,
      endTime: body.endTime,
      actionType: body.actionType.trim(),
      sortOrder: nextSortOrder,
    })
    .returning();

  return c.json({ schedule }, 201);
});

petModesRoute.put("/:id/mode/schedules/:scheduleId", async (c) => {
  const userId = c.get("userId" as never) as string;
  const petId = c.req.param("id");
  const scheduleId = c.req.param("scheduleId");
  const pet = await ensurePetAccess(userId, petId);

  if (!pet) {
    return c.json({ error: "Pet not found" }, 404);
  }

  const [existingSchedule] = await db
    .select()
    .from(petModeSchedules)
    .where(and(eq(petModeSchedules.id, scheduleId), eq(petModeSchedules.petId, petId)))
    .limit(1);

  if (!existingSchedule) {
    return c.json({ error: "Schedule not found" }, 404);
  }

  if (existingSchedule.source !== "custom") {
    return c.json({ error: "不能修改系统时间表" }, 403);
  }

  const body = await c.req.json<Partial<ScheduleInput>>();
  const validationError = validateScheduleInput(body, { partial: true });
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  const nextSchedule = {
    startTime: body.startTime ?? existingSchedule.startTime,
    endTime: body.endTime ?? existingSchedule.endTime,
    actionType: body.actionType?.trim() ?? existingSchedule.actionType,
  };

  const timeError = validateScheduleTimes(nextSchedule.startTime, nextSchedule.endTime);
  if (timeError) {
    return c.json({ error: timeError }, 400);
  }

  const customSchedules = await getCustomSchedules(petId);
  if (hasOverlap(nextSchedule, customSchedules, scheduleId)) {
    return c.json({ error: "时间段与现有配置重叠" }, 400);
  }

  const [schedule] = await db
    .update(petModeSchedules)
    .set({
      startTime: nextSchedule.startTime,
      endTime: nextSchedule.endTime,
      actionType: nextSchedule.actionType,
    })
    .where(eq(petModeSchedules.id, scheduleId))
    .returning();

  return c.json({ schedule });
});

petModesRoute.delete("/:id/mode/schedules/:scheduleId", async (c) => {
  const userId = c.get("userId" as never) as string;
  const petId = c.req.param("id");
  const scheduleId = c.req.param("scheduleId");
  const pet = await ensurePetAccess(userId, petId);

  if (!pet) {
    return c.json({ error: "Pet not found" }, 404);
  }

  const [existingSchedule] = await db
    .select()
    .from(petModeSchedules)
    .where(and(eq(petModeSchedules.id, scheduleId), eq(petModeSchedules.petId, petId)))
    .limit(1);

  if (!existingSchedule) {
    return c.json({ error: "Schedule not found" }, 404);
  }

  if (existingSchedule.source !== "custom") {
    return c.json({ error: "不能删除系统时间表" }, 403);
  }

  await db.delete(petModeSchedules).where(eq(petModeSchedules.id, scheduleId));

  return c.json({ success: true });
});

export default petModesRoute;
