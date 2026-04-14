import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { petBehaviors, pets } from "../../db/schema";

const analyticsRoute = new Hono();
const ADMIN_TIME_ZONE = "Asia/Shanghai";

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

analyticsRoute.get("/analytics", async (c) => {
  const today = formatDateInTimeZone(new Date(), ADMIN_TIME_ZONE);
  const dateBuckets = getLastNDateBuckets(today, 7);

  const [[onlineDevicesRow], [todayStatsRow], weeklyRankingRows, dailyTrendRows] =
    await Promise.all([
      db.execute<{ count: number }>(sql`
        SELECT COUNT(DISTINCT ${petBehaviors.collarDeviceId})::int AS count
        FROM ${petBehaviors}
        WHERE ${petBehaviors.timestamp} > NOW() - INTERVAL '1 hour'
      `),
      db.execute<{ behaviors: number; users: number }>(sql`
        SELECT
          COUNT(*)::int AS behaviors,
          COUNT(DISTINCT ${pets.userId})::int AS users
        FROM ${petBehaviors}
        INNER JOIN ${pets} ON ${petBehaviors.petId} = ${pets.id}
        WHERE (${petBehaviors.timestamp} AT TIME ZONE ${ADMIN_TIME_ZONE})::date = ${today}::date
      `),
      db.execute<{ petId: string; petName: string; count: number }>(sql`
        SELECT
          ${petBehaviors.petId} AS "petId",
          COALESCE(${pets.name}, '') AS "petName",
          COUNT(*)::int AS count
        FROM ${petBehaviors}
        LEFT JOIN ${pets} ON ${petBehaviors.petId} = ${pets.id}
        WHERE ${petBehaviors.timestamp} > NOW() - INTERVAL '7 days'
        GROUP BY ${petBehaviors.petId}, ${pets.name}
        ORDER BY count DESC, ${petBehaviors.petId} ASC
        LIMIT 10
      `),
      db.execute<{ date: string; count: number }>(sql`
        SELECT
          TO_CHAR((${petBehaviors.timestamp} AT TIME ZONE ${ADMIN_TIME_ZONE})::date, 'YYYY-MM-DD') AS date,
          COUNT(*)::int AS count
        FROM ${petBehaviors}
        WHERE (${petBehaviors.timestamp} AT TIME ZONE ${ADMIN_TIME_ZONE})::date
          BETWEEN ${today}::date - 6
          AND ${today}::date
        GROUP BY (${petBehaviors.timestamp} AT TIME ZONE ${ADMIN_TIME_ZONE})::date
        ORDER BY (${petBehaviors.timestamp} AT TIME ZONE ${ADMIN_TIME_ZONE})::date ASC
      `),
    ]);

  const todayBehaviors = Number(todayStatsRow?.behaviors ?? 0);
  const todayOnlineUsers = Number(todayStatsRow?.users ?? 0);
  const dailyTrendMap = new Map(
    dailyTrendRows.map((row) => [row.date, Number(row.count)]),
  );

  return c.json({
    onlineDevices: Number(onlineDevicesRow?.count ?? 0),
    avgInteractions:
      todayOnlineUsers === 0 ? 0 : Number((todayBehaviors / todayOnlineUsers).toFixed(2)),
    weeklyRanking: weeklyRankingRows.map((row) => ({
      petId: row.petId,
      petName: row.petName,
      count: Number(row.count),
    })),
    dailyTrend: dateBuckets.map((date) => ({
      date,
      count: dailyTrendMap.get(date) ?? 0,
    })),
  });
});

export default analyticsRoute;
