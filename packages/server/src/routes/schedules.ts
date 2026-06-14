import { Hono } from "hono";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { behaviorScheduleBlocks, behaviorSchedules } from "../db/schema";
import { SCHEDULE_SPECIES } from "shared";

type ScheduleSpecies = (typeof SCHEDULE_SPECIES)[number];

const VALID_SPECIES = new Set<string>(SCHEDULE_SPECIES);
const schedulesRoute = new Hono();

function isShanghaiWeekday(now = new Date()) {
  const shanghaiTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const day = shanghaiTime.getUTCDay();
  return day >= 1 && day <= 5;
}

schedulesRoute.get("/current", async (c) => {
  const species = c.req.query("species");

  if (!species || !VALID_SPECIES.has(species)) {
    return c.json({ error: "species 必须是 cat、dog 或 other" }, 400);
  }

  const isWeekday = isShanghaiWeekday();
  const effectiveTypes: Array<"weekday" | "weekend" | "everyday"> = isWeekday
    ? ["weekday", "everyday"]
    : ["weekend", "everyday"];

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
    const aPriority = a.effectiveType === "weekday" || a.effectiveType === "weekend" ? 0 : 1;
    const bPriority = b.effectiveType === "weekday" || b.effectiveType === "weekend" ? 0 : 1;
    return aPriority - bPriority;
  })[0];

  if (!schedule) {
    return c.json({ blocks: [] });
  }

  const blocks = await db
    .select()
    .from(behaviorScheduleBlocks)
    .where(eq(behaviorScheduleBlocks.scheduleId, schedule.id))
    .orderBy(asc(behaviorScheduleBlocks.sortOrder), asc(behaviorScheduleBlocks.startMinutes));

  return c.json({ blocks });
});

export default schedulesRoute;
