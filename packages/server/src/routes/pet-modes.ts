import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  deviceAuthorizations,
  petModeSchedules,
  petModes,
  pets,
} from "../db/schema";
import {
  MAX_SCHEDULES_PER_SOURCE,
  hasScheduleOverlap,
  normalizeScheduleInput,
  type ScheduleInput,
  validateScheduleInput,
  validateScheduleTimes,
} from "../utils/pet-mode-schedules";

const petModesRoute = new Hono();

type PetActivityMode = "free" | "custom" | "real";
type ScheduleSource = "system" | "custom";

function isPetActivityMode(value: unknown): value is PetActivityMode {
  return value === "free" || value === "custom" || value === "real";
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

async function ensureCustomModeEditable(petId: string) {
  const modeRecord = await getOrCreatePetMode(petId);

  if (modeRecord.mode !== "custom") {
    return null;
  }

  return modeRecord;
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
  const normalizedBody = normalizeScheduleInput(body);
  const validationError = validateScheduleInput(normalizedBody);
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  if (!(await ensureCustomModeEditable(petId))) {
    return c.json({ error: "当前仅支持在 custom 模式下编辑自定义时间表" }, 400);
  }

  const customSchedules = await getCustomSchedules(petId);
  if (customSchedules.length >= MAX_SCHEDULES_PER_SOURCE) {
    return c.json(
      { error: `自定义时间表最多 ${MAX_SCHEDULES_PER_SOURCE} 条` },
      400,
    );
  }

  if (hasScheduleOverlap(normalizedBody, customSchedules)) {
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
      startTime: normalizedBody.startTime,
      endTime: normalizedBody.endTime,
      actionType: normalizedBody.actionType,
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
  const normalizedBody = normalizeScheduleInput(body);
  const validationError = validateScheduleInput(normalizedBody, { partial: true });
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  if (!(await ensureCustomModeEditable(petId))) {
    return c.json({ error: "当前仅支持在 custom 模式下编辑自定义时间表" }, 400);
  }

  const nextSchedule = {
    startTime: normalizedBody.startTime ?? existingSchedule.startTime,
    endTime: normalizedBody.endTime ?? existingSchedule.endTime,
    actionType: normalizedBody.actionType ?? existingSchedule.actionType,
  };

  const timeError = validateScheduleTimes(nextSchedule.startTime, nextSchedule.endTime);
  if (timeError) {
    return c.json({ error: timeError }, 400);
  }

  const customSchedules = await getCustomSchedules(petId);
  if (hasScheduleOverlap(nextSchedule, customSchedules, scheduleId)) {
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

  if (!(await ensureCustomModeEditable(petId))) {
    return c.json({ error: "当前仅支持在 custom 模式下编辑自定义时间表" }, 400);
  }

  await db.delete(petModeSchedules).where(eq(petModeSchedules.id, scheduleId));

  return c.json({ success: true });
});

export default petModesRoute;
