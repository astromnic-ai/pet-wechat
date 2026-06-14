import { Hono } from "hono";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { behaviorScheduleBlocks, behaviorSchedules } from "../db/schema";
import { SCHEDULE_SPECIES } from "shared";
import { getBeijingEffectiveTypes, PET_SCHEDULE_TIME_ZONE } from "../utils/beijing-time";

type ScheduleSpecies = (typeof SCHEDULE_SPECIES)[number];

const VALID_SPECIES = new Set<string>(SCHEDULE_SPECIES);
const schedulesRoute = new Hono();

schedulesRoute.get("/current", async (c) => {
  const species = c.req.query("species");

  if (!species || !VALID_SPECIES.has(species)) {
    return c.json({ error: "species 必须是 cat、dog 或 other" }, 400);
  }

  const effectiveTypes = getBeijingEffectiveTypes(new Date());

  const schedules = await db
    .select()
    .from(behaviorSchedules)
    .where(
      and(
        eq(behaviorSchedules.species, species as ScheduleSpecies),
        eq(behaviorSchedules.isActive, true),
        inArray(behaviorSchedules.effectiveType, effectiveTypes),
      ),
    )
    .orderBy(asc(behaviorSchedules.createdAt));

  const schedule = schedules.sort((a, b) => {
    const aPriority = effectiveTypes.indexOf(a.effectiveType);
    const bPriority = effectiveTypes.indexOf(b.effectiveType);
    return aPriority - bPriority;
  })[0];

  if (!schedule) {
    return c.json({ timeZone: PET_SCHEDULE_TIME_ZONE, blocks: [] });
  }

  const blocks = await db
    .select()
    .from(behaviorScheduleBlocks)
    .where(eq(behaviorScheduleBlocks.scheduleId, schedule.id))
    .orderBy(asc(behaviorScheduleBlocks.sortOrder), asc(behaviorScheduleBlocks.startMinutes));

  return c.json({ timeZone: PET_SCHEDULE_TIME_ZONE, schedule, blocks });
});

export default schedulesRoute;
