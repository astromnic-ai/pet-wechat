import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { deviceAuthorizations, petBehaviors, pets } from "../db/schema";

const statsRoute = new Hono();

function normalizeTimeZone(input?: string): string {
  const timeZone = input?.trim();
  if (!timeZone) return "UTC";

  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

function formatDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

function getLastNDateBuckets(today: string, n: number) {
  const [year, month, day] = today.split("-").map(Number);
  const base = Date.UTC(year, month - 1, day);

  return Array.from({ length: n }, (_, index) =>
    new Date(base - (n - 1 - index) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
}

async function canAccessPet(userId: string, petId: string) {
  const [ownPet] = await db
    .select({ id: pets.id })
    .from(pets)
    .where(and(eq(pets.id, petId), eq(pets.userId, userId)));

  if (ownPet) return true;

  const [authorizedPet] = await db
    .select({ petId: deviceAuthorizations.petId })
    .from(deviceAuthorizations)
    .where(
      and(
        eq(deviceAuthorizations.petId, petId),
        eq(deviceAuthorizations.toUserId, userId),
        eq(deviceAuthorizations.status, "accepted"),
      ),
    );

  return Boolean(authorizedPet);
}

statsRoute.get("/:petId", async (c) => {
  const userId = c.get("userId" as never) as string;
  const petId = c.req.param("petId");
  const timeZone = normalizeTimeZone(c.req.query("tz"));
  const today = formatDateInTimeZone(new Date(), timeZone);

  try {
    const hasAccess = await canAccessPet(userId, petId);
    if (!hasAccess) return c.json({ error: "Pet not found" }, 404);

    const weekDateBuckets = getLastNDateBuckets(today, 7);
    const monthDateBuckets = getLastNDateBuckets(today, 30);

    const [weekRows, monthRows, dayRows, pieRows, monthPieRows, dayActionRows] =
      await Promise.all([
        db.execute<{ day: string; count: number }>(sql`
          SELECT
            TO_CHAR((${petBehaviors.timestamp} AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS day,
            COUNT(*)::int AS count
          FROM ${petBehaviors}
          WHERE ${petBehaviors.petId} = ${petId}
            AND (${petBehaviors.timestamp} AT TIME ZONE ${timeZone})::date
              BETWEEN ${today}::date - 6
              AND ${today}::date
          GROUP BY (${petBehaviors.timestamp} AT TIME ZONE ${timeZone})::date
          ORDER BY (${petBehaviors.timestamp} AT TIME ZONE ${timeZone})::date ASC
        `),
        db.execute<{ day: string; count: number }>(sql`
          SELECT
            TO_CHAR((${petBehaviors.timestamp} AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS day,
            COUNT(*)::int AS count
          FROM ${petBehaviors}
          WHERE ${petBehaviors.petId} = ${petId}
            AND (${petBehaviors.timestamp} AT TIME ZONE ${timeZone})::date
              BETWEEN ${today}::date - 29
              AND ${today}::date
          GROUP BY (${petBehaviors.timestamp} AT TIME ZONE ${timeZone})::date
          ORDER BY (${petBehaviors.timestamp} AT TIME ZONE ${timeZone})::date ASC
        `),
        db.execute<{ hour: number; count: number }>(sql`
          SELECT
            EXTRACT(HOUR FROM ${petBehaviors.timestamp} AT TIME ZONE ${timeZone})::int AS hour,
            COUNT(*)::int AS count
          FROM ${petBehaviors}
          WHERE ${petBehaviors.petId} = ${petId}
            AND (${petBehaviors.timestamp} AT TIME ZONE ${timeZone})::date = ${today}::date
          GROUP BY EXTRACT(HOUR FROM ${petBehaviors.timestamp} AT TIME ZONE ${timeZone})
          ORDER BY hour ASC
        `),
        db.execute<{ type: string; count: number }>(sql`
          SELECT
            ${petBehaviors.actionType} AS type,
            COUNT(*)::int AS count
          FROM ${petBehaviors}
          WHERE ${petBehaviors.petId} = ${petId}
            AND (${petBehaviors.timestamp} AT TIME ZONE ${timeZone})::date
              BETWEEN ${today}::date - 6
              AND ${today}::date
          GROUP BY ${petBehaviors.actionType}
          ORDER BY count DESC, type ASC
        `),
        db.execute<{ type: string; count: number }>(sql`
          SELECT
            ${petBehaviors.actionType} AS type,
            COUNT(*)::int AS count
          FROM ${petBehaviors}
          WHERE ${petBehaviors.petId} = ${petId}
            AND (${petBehaviors.timestamp} AT TIME ZONE ${timeZone})::date
              BETWEEN ${today}::date - 29
              AND ${today}::date
          GROUP BY ${petBehaviors.actionType}
          ORDER BY count DESC, type ASC
        `),
        db.execute<{ type: string; count: number }>(sql`
          SELECT
            ${petBehaviors.actionType} AS type,
            COUNT(*)::int AS count
          FROM ${petBehaviors}
          WHERE ${petBehaviors.petId} = ${petId}
            AND (${petBehaviors.timestamp} AT TIME ZONE ${timeZone})::date = ${today}::date
          GROUP BY ${petBehaviors.actionType}
          ORDER BY count DESC, type ASC
        `),
      ]);

    const weekCountMap = new Map(
      weekRows.map((row) => [row.day, Number(row.count)]),
    );
    const monthCountMap = new Map(
      monthRows.map((row) => [row.day, Number(row.count)]),
    );
    const dayCountMap = new Map(
      dayRows.map((row) => [Number(row.hour), Number(row.count)]),
    );

    const weekBars = weekDateBuckets.map((day) => ({
      day,
      count: weekCountMap.get(day) ?? 0,
    }));

    const monthBars = monthDateBuckets.map((day) => ({
      day,
      count: monthCountMap.get(day) ?? 0,
    }));

    const dayBars = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: dayCountMap.get(hour) ?? 0,
    }));

    const pieTotal = pieRows.reduce((sum, row) => sum + Number(row.count), 0);
    const pieItems =
      pieTotal === 0
        ? []
        : pieRows.map((row) => {
            const count = Number(row.count);
            return {
              type: row.type,
              count,
              percentage: Number(((count / pieTotal) * 100).toFixed(2)),
            };
          });

    const monthPieTotal = monthPieRows.reduce((sum, row) => sum + Number(row.count), 0);
    const monthPieItems =
      monthPieTotal === 0
        ? []
        : monthPieRows.map((row) => {
            const count = Number(row.count);
            return {
              type: row.type,
              count,
              percentage: Number(((count / monthPieTotal) * 100).toFixed(2)),
            };
          });

    const actionCounts = Object.fromEntries(
      dayActionRows.map((row) => [row.type, Number(row.count)]),
    );
    const totalCount = dayActionRows.reduce((sum, row) => sum + Number(row.count), 0);

    return c.json({
      weekBars,
      monthBars,
      dayBars,
      pieItems,
      monthPieItems,
      daySummary: {
        date: today,
        totalCount,
        dominantAction: dayActionRows[0]?.type ?? null,
        actionCounts,
      },
    });
  } catch (e) {
    console.error("Stats query failed:", e);
    return c.json({ error: "统计数据加载失败" }, 500);
  }
});

export default statsRoute;
