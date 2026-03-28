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

function getLastSevenDateBuckets(today: string) {
  const [year, month, day] = today.split("-").map(Number);
  const base = Date.UTC(year, month - 1, day);

  return Array.from({ length: 7 }, (_, index) =>
    new Date(base - (6 - index) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
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

  const hasAccess = await canAccessPet(userId, petId);
  if (!hasAccess) return c.json({ error: "Pet not found" }, 404);

  const today = formatDateInTimeZone(new Date(), timeZone);
  const weekDateBuckets = getLastSevenDateBuckets(today);

  const weekRows = await db.execute<{ day: string; count: number }>(sql`
    SELECT
      TO_CHAR((${petBehaviors.timestamp} AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS day,
      COUNT(*)::int AS count
    FROM ${petBehaviors}
    WHERE ${petBehaviors.petId} = ${petId}
      AND (${petBehaviors.timestamp} AT TIME ZONE ${timeZone})::date
        BETWEEN (NOW() AT TIME ZONE ${timeZone})::date - 6
        AND (NOW() AT TIME ZONE ${timeZone})::date
    GROUP BY (${petBehaviors.timestamp} AT TIME ZONE ${timeZone})::date
    ORDER BY (${petBehaviors.timestamp} AT TIME ZONE ${timeZone})::date ASC
  `);

  const dayRows = await db.execute<{ hour: number; count: number }>(sql`
    SELECT
      EXTRACT(HOUR FROM ${petBehaviors.timestamp} AT TIME ZONE ${timeZone})::int AS hour,
      COUNT(*)::int AS count
    FROM ${petBehaviors}
    WHERE ${petBehaviors.petId} = ${petId}
      AND (${petBehaviors.timestamp} AT TIME ZONE ${timeZone})::date = (NOW() AT TIME ZONE ${timeZone})::date
    GROUP BY EXTRACT(HOUR FROM ${petBehaviors.timestamp} AT TIME ZONE ${timeZone})
    ORDER BY hour ASC
  `);

  const pieRows = await db.execute<{ type: string; count: number }>(sql`
    SELECT
      ${petBehaviors.actionType} AS type,
      COUNT(*)::int AS count
    FROM ${petBehaviors}
    WHERE ${petBehaviors.petId} = ${petId}
      AND (${petBehaviors.timestamp} AT TIME ZONE ${timeZone})::date
        BETWEEN (NOW() AT TIME ZONE ${timeZone})::date - 6
        AND (NOW() AT TIME ZONE ${timeZone})::date
    GROUP BY ${petBehaviors.actionType}
    ORDER BY count DESC, type ASC
  `);

  const dayActionRows = await db.execute<{ type: string; count: number }>(sql`
    SELECT
      ${petBehaviors.actionType} AS type,
      COUNT(*)::int AS count
    FROM ${petBehaviors}
    WHERE ${petBehaviors.petId} = ${petId}
      AND (${petBehaviors.timestamp} AT TIME ZONE ${timeZone})::date = (NOW() AT TIME ZONE ${timeZone})::date
    GROUP BY ${petBehaviors.actionType}
    ORDER BY count DESC, type ASC
  `);

  const weekCountMap = new Map(
    weekRows.map((row) => [row.day, Number(row.count)]),
  );
  const dayCountMap = new Map(
    dayRows.map((row) => [Number(row.hour), Number(row.count)]),
  );

  const weekBars = weekDateBuckets.map((day) => ({
    day,
    count: weekCountMap.get(day) ?? 0,
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

  const actionCounts = Object.fromEntries(
    dayActionRows.map((row) => [row.type, Number(row.count)]),
  );
  const totalCount = dayActionRows.reduce((sum, row) => sum + Number(row.count), 0);

  return c.json({
    weekBars,
    dayBars,
    pieItems,
    daySummary: {
      date: today,
      totalCount,
      dominantAction: dayActionRows[0]?.type ?? null,
      actionCounts,
    },
  });
});

export default statsRoute;
