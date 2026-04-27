import { Hono } from "hono";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { behaviorScheduleBlocks, behaviorSchedules } from "../../db/schema";
import { createId } from "../../utils/id";
import { ALL_ACTIONS, SCHEDULE_SPECIES } from "shared";

type ScheduleSpecies = (typeof SCHEDULE_SPECIES)[number];
type ScheduleEffectiveType = "everyday" | "weekday" | "friday";
type ScheduleBlockInput = {
  actionType: string;
  startMinutes: number;
  endMinutes: number;
  sortOrder?: number;
};
type ScheduleInput = {
  name?: string;
  species?: string;
  effectiveType?: string;
  blocks?: ScheduleBlockInput[];
};

const VALID_SPECIES = new Set<string>(SCHEDULE_SPECIES);
const VALID_ACTIONS = new Set<string>(ALL_ACTIONS);
const VALID_EFFECTIVE_TYPES = new Set<ScheduleEffectiveType>(["everyday", "weekday", "friday"]);

const schedulesRoute = new Hono();

function normalizeBlocks(blocks: ScheduleBlockInput[]) {
  return blocks.map((block, index) => ({
    actionType: block.actionType,
    startMinutes: block.startMinutes,
    endMinutes: block.endMinutes,
    sortOrder: Number.isInteger(block.sortOrder) ? block.sortOrder : index,
  }));
}

function validateScheduleInput(body: ScheduleInput) {
  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    return "日程名称不能为空";
  }

  if (typeof body.species !== "string" || !VALID_SPECIES.has(body.species)) {
    return "species 必须是 cat、dog 或 other";
  }

  if (
    typeof body.effectiveType !== "string" ||
    !VALID_EFFECTIVE_TYPES.has(body.effectiveType as ScheduleEffectiveType)
  ) {
    return "effectiveType 必须是 everyday、weekday 或 friday";
  }

  if (!Array.isArray(body.blocks)) {
    return "blocks 必须是数组";
  }

  const normalizedBlocks = normalizeBlocks(body.blocks);
  const sortedBlocks = [...normalizedBlocks].sort(
    (a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes,
  );

  for (const block of normalizedBlocks) {
    if (!VALID_ACTIONS.has(block.actionType)) {
      return `无效的 actionType: ${block.actionType}`;
    }

    if (
      !Number.isInteger(block.startMinutes) ||
      !Number.isInteger(block.endMinutes) ||
      !Number.isInteger(block.sortOrder)
    ) {
      return "blocks 的 startMinutes、endMinutes、sortOrder 必须是整数";
    }

    if (block.startMinutes < 0 || block.startMinutes > 1440) {
      return "startMinutes 必须在 0-1440 范围内";
    }

    if (block.endMinutes < 0 || block.endMinutes > 1440) {
      return "endMinutes 必须在 0-1440 范围内";
    }

    if (block.startMinutes >= block.endMinutes) {
      return "blocks 必须满足 startMinutes < endMinutes";
    }
  }

  for (let index = 1; index < sortedBlocks.length; index += 1) {
    if (sortedBlocks[index - 1]!.endMinutes > sortedBlocks[index]!.startMinutes) {
      return "blocks 之间不能重叠";
    }
  }

  return null;
}

function attachBlocks<
  T extends {
    id: string;
  },
>(
  schedules: T[],
  blocks: Array<typeof behaviorScheduleBlocks.$inferSelect>,
) {
  const blocksByScheduleId = new Map<string, Array<typeof behaviorScheduleBlocks.$inferSelect>>();

  for (const block of blocks) {
    const existing = blocksByScheduleId.get(block.scheduleId) ?? [];
    existing.push(block);
    blocksByScheduleId.set(block.scheduleId, existing);
  }

  return schedules.map((schedule) => ({
    ...schedule,
    blocks:
      blocksByScheduleId
        .get(schedule.id)
        ?.sort(
          (a, b) => a.sortOrder - b.sortOrder || a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes,
        ) ?? [],
  }));
}

schedulesRoute.get("/schedules", async (c) => {
  const schedules = await db
    .select()
    .from(behaviorSchedules)
    .orderBy(asc(behaviorSchedules.species), asc(behaviorSchedules.effectiveType), asc(behaviorSchedules.createdAt));

  if (schedules.length === 0) {
    return c.json({ schedules: [] });
  }

  const blocks = await db
    .select()
    .from(behaviorScheduleBlocks)
    .where(
      inArray(
        behaviorScheduleBlocks.scheduleId,
        schedules.map((schedule) => schedule.id),
      ),
    )
    .orderBy(
      asc(behaviorScheduleBlocks.scheduleId),
      asc(behaviorScheduleBlocks.sortOrder),
      asc(behaviorScheduleBlocks.startMinutes),
    );

  return c.json({ schedules: attachBlocks(schedules, blocks) });
});

schedulesRoute.post("/schedules", async (c) => {
  const body = await c.req.json<ScheduleInput>();
  const validationError = validateScheduleInput(body);

  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  const scheduleId = createId();
  const normalizedBlocks = normalizeBlocks(body.blocks ?? []);

  const schedule = await db.transaction(async (tx) => {
    const [createdSchedule] = await tx
      .insert(behaviorSchedules)
      .values({
        id: scheduleId,
        name: body.name!.trim(),
        species: body.species as ScheduleSpecies,
        effectiveType: body.effectiveType as ScheduleEffectiveType,
      })
      .returning();

    if (normalizedBlocks.length > 0) {
      await tx.insert(behaviorScheduleBlocks).values(
        normalizedBlocks.map((block) => ({
          id: createId(),
          scheduleId,
          actionType: block.actionType,
          startMinutes: block.startMinutes,
          endMinutes: block.endMinutes,
          sortOrder: block.sortOrder,
        })),
      );
    }

    return createdSchedule;
  });

  const blocks = await db
    .select()
    .from(behaviorScheduleBlocks)
    .where(eq(behaviorScheduleBlocks.scheduleId, scheduleId))
    .orderBy(asc(behaviorScheduleBlocks.sortOrder), asc(behaviorScheduleBlocks.startMinutes));

  return c.json({ schedule: { ...schedule, blocks } }, 201);
});

schedulesRoute.put("/schedules/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<ScheduleInput>();
  const validationError = validateScheduleInput(body);

  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  const normalizedBlocks = normalizeBlocks(body.blocks ?? []);

  const schedule = await db.transaction(async (tx) => {
    const [updatedSchedule] = await tx
      .update(behaviorSchedules)
      .set({
        name: body.name!.trim(),
        species: body.species as ScheduleSpecies,
        effectiveType: body.effectiveType as ScheduleEffectiveType,
        updatedAt: new Date(),
      })
      .where(eq(behaviorSchedules.id, id))
      .returning();

    if (!updatedSchedule) {
      return null;
    }

    await tx.delete(behaviorScheduleBlocks).where(eq(behaviorScheduleBlocks.scheduleId, id));

    if (normalizedBlocks.length > 0) {
      await tx.insert(behaviorScheduleBlocks).values(
        normalizedBlocks.map((block) => ({
          id: createId(),
          scheduleId: id,
          actionType: block.actionType,
          startMinutes: block.startMinutes,
          endMinutes: block.endMinutes,
          sortOrder: block.sortOrder,
        })),
      );
    }

    return updatedSchedule;
  });

  if (!schedule) {
    return c.json({ error: "Schedule not found" }, 404);
  }

  const blocks = await db
    .select()
    .from(behaviorScheduleBlocks)
    .where(eq(behaviorScheduleBlocks.scheduleId, id))
    .orderBy(asc(behaviorScheduleBlocks.sortOrder), asc(behaviorScheduleBlocks.startMinutes));

  return c.json({ schedule: { ...schedule, blocks } });
});

schedulesRoute.delete("/schedules/:id", async (c) => {
  const id = c.req.param("id");

  const deletedSchedule = await db.transaction(async (tx) => {
    await tx.delete(behaviorScheduleBlocks).where(eq(behaviorScheduleBlocks.scheduleId, id));
    const [schedule] = await tx.delete(behaviorSchedules).where(eq(behaviorSchedules.id, id)).returning();
    return schedule;
  });

  if (!deletedSchedule) {
    return c.json({ error: "Schedule not found" }, 404);
  }

  return c.json({ success: true });
});

schedulesRoute.post("/schedules/:id/activate", async (c) => {
  const id = c.req.param("id");

  const [schedule] = await db.select().from(behaviorSchedules).where(eq(behaviorSchedules.id, id));
  if (!schedule) {
    return c.json({ error: "Schedule not found" }, 404);
  }

  const [block] = await db
    .select({ id: behaviorScheduleBlocks.id })
    .from(behaviorScheduleBlocks)
    .where(eq(behaviorScheduleBlocks.scheduleId, id));

  if (!block) {
    return c.json({ error: "日程必须至少包含一个 block 才能激活" }, 400);
  }

  if (schedule.isActive) {
    const blocks = await db
      .select()
      .from(behaviorScheduleBlocks)
      .where(eq(behaviorScheduleBlocks.scheduleId, id))
      .orderBy(asc(behaviorScheduleBlocks.sortOrder), asc(behaviorScheduleBlocks.startMinutes));

    return c.json({ schedule: { ...schedule, blocks } });
  }

  const activatedSchedule = await db.transaction(async (tx) => {
    await tx
      .update(behaviorSchedules)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(behaviorSchedules.species, schedule.species),
          eq(behaviorSchedules.effectiveType, schedule.effectiveType),
          eq(behaviorSchedules.isActive, true),
        ),
      );

    const [updatedSchedule] = await tx
      .update(behaviorSchedules)
      .set({
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(behaviorSchedules.id, id))
      .returning();

    return updatedSchedule;
  });

  const blocks = await db
    .select()
    .from(behaviorScheduleBlocks)
    .where(eq(behaviorScheduleBlocks.scheduleId, id))
    .orderBy(asc(behaviorScheduleBlocks.sortOrder), asc(behaviorScheduleBlocks.startMinutes));

  return c.json({ schedule: { ...activatedSchedule, blocks } });
});

export default schedulesRoute;
