import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import {
  collarDevices,
  desktopDevices,
  desktopPetBindings,
  interactionEvents,
  petBehaviors,
  pets,
  users,
} from "../../db/schema";

const analyticsRoute = new Hono();
const ADMIN_TIME_ZONE = "Asia/Shanghai";
const MODE_ORDER = ["free", "custom", "real"] as const;

type ModeKey = (typeof MODE_ORDER)[number];

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

function getPreviousDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() - 1);
  return base.toISOString().slice(0, 10);
}

function toNumber(value: number | string | null | undefined, digits = 2) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Number(numeric.toFixed(digits));
}

analyticsRoute.get("/analytics", async (c) => {
  const today = formatDateInTimeZone(new Date(), ADMIN_TIME_ZONE);
  const yesterday = getPreviousDate(today);

  const [
    [onlineDevicesRow],
    [yesterdayOnlineDevicesRow],
    [onlineUsersRow],
    [yesterdayOnlineUsersRow],
    [todayInteractionsRow],
    [yesterdayInteractionsRow],
    [avgActivityRow],
    [yesterdayAvgActivityRow],
    weeklyRankingRows,
    modeDistributionRows,
  ] = await Promise.all([
    db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT ${collarDevices.id} AS device_id
        FROM ${collarDevices}
        WHERE ${collarDevices.lastOnlineAt} > NOW() - INTERVAL '1 hour'

        UNION ALL

        SELECT ${desktopDevices.id} AS device_id
        FROM ${desktopDevices}
        WHERE ${desktopDevices.lastOnlineAt} > NOW() - INTERVAL '1 hour'
      ) AS online_devices
    `),
    db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT ${collarDevices.id} AS device_id
        FROM ${collarDevices}
        WHERE ${collarDevices.lastOnlineAt} > NOW() - INTERVAL '25 hours'
          AND ${collarDevices.lastOnlineAt} <= NOW() - INTERVAL '24 hours'

        UNION ALL

        SELECT ${desktopDevices.id} AS device_id
        FROM ${desktopDevices}
        WHERE ${desktopDevices.lastOnlineAt} > NOW() - INTERVAL '25 hours'
          AND ${desktopDevices.lastOnlineAt} <= NOW() - INTERVAL '24 hours'
      ) AS yesterday_online_devices
    `),
    db.execute<{ count: number }>(sql`
      SELECT COUNT(DISTINCT online_users.user_id)::int AS count
      FROM (
        SELECT ${collarDevices.userId} AS user_id
        FROM ${collarDevices}
        WHERE ${collarDevices.userId} IS NOT NULL
          AND ${collarDevices.lastOnlineAt} > NOW() - INTERVAL '1 hour'

        UNION

        SELECT ${desktopDevices.userId} AS user_id
        FROM ${desktopDevices}
        WHERE ${desktopDevices.userId} IS NOT NULL
          AND ${desktopDevices.lastOnlineAt} > NOW() - INTERVAL '1 hour'
      ) AS online_users
    `),
    db.execute<{ count: number }>(sql`
      SELECT COUNT(DISTINCT online_users.user_id)::int AS count
      FROM (
        SELECT ${collarDevices.userId} AS user_id
        FROM ${collarDevices}
        WHERE ${collarDevices.userId} IS NOT NULL
          AND ${collarDevices.lastOnlineAt} > NOW() - INTERVAL '25 hours'
          AND ${collarDevices.lastOnlineAt} <= NOW() - INTERVAL '24 hours'

        UNION

        SELECT ${desktopDevices.userId} AS user_id
        FROM ${desktopDevices}
        WHERE ${desktopDevices.userId} IS NOT NULL
          AND ${desktopDevices.lastOnlineAt} > NOW() - INTERVAL '25 hours'
          AND ${desktopDevices.lastOnlineAt} <= NOW() - INTERVAL '24 hours'
      ) AS online_users
    `),
    db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM ${interactionEvents}
      WHERE (${interactionEvents.occurredAt} AT TIME ZONE ${ADMIN_TIME_ZONE})::date = ${today}::date
    `),
    db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM ${interactionEvents}
      WHERE (${interactionEvents.occurredAt} AT TIME ZONE ${ADMIN_TIME_ZONE})::date = ${yesterday}::date
    `),
    db.execute<{ value: number | string | null; userCount: number }>(sql`
      SELECT
        COALESCE(AVG(user_scores.score), 0)::numeric(10, 2) AS value,
        COUNT(*)::int AS "userCount"
      FROM (
        SELECT
          ${collarDevices.userId} AS user_id,
          LEAST(COUNT(${petBehaviors.id}) * 10, 100)::numeric AS score
        FROM ${petBehaviors}
        INNER JOIN ${collarDevices}
          ON ${petBehaviors.collarDeviceId} = ${collarDevices.id}
        WHERE ${collarDevices.userId} IS NOT NULL
          AND ${collarDevices.lastOnlineAt} IS NOT NULL
          AND (${collarDevices.lastOnlineAt} AT TIME ZONE ${ADMIN_TIME_ZONE})::date = ${today}::date
          AND (${petBehaviors.timestamp} AT TIME ZONE ${ADMIN_TIME_ZONE})::date = ${today}::date
        GROUP BY ${collarDevices.userId}
      ) AS user_scores
    `),
    db.execute<{ value: number | string | null; userCount: number }>(sql`
      SELECT
        COALESCE(AVG(user_scores.score), 0)::numeric(10, 2) AS value,
        COUNT(*)::int AS "userCount"
      FROM (
        SELECT
          ${collarDevices.userId} AS user_id,
          LEAST(COUNT(${petBehaviors.id}) * 10, 100)::numeric AS score
        FROM ${petBehaviors}
        INNER JOIN ${collarDevices}
          ON ${petBehaviors.collarDeviceId} = ${collarDevices.id}
        WHERE ${collarDevices.userId} IS NOT NULL
          AND ${collarDevices.lastOnlineAt} IS NOT NULL
          AND (${collarDevices.lastOnlineAt} AT TIME ZONE ${ADMIN_TIME_ZONE})::date = ${yesterday}::date
          AND (${petBehaviors.timestamp} AT TIME ZONE ${ADMIN_TIME_ZONE})::date = ${yesterday}::date
        GROUP BY ${collarDevices.userId}
      ) AS user_scores
    `),
    db.execute<{
      userId: string;
      userName: string;
      count: number;
      petCount: number;
    }>(sql`
      SELECT
        ${interactionEvents.userId} AS "userId",
        COALESCE(${users.nickname}, '未命名用户') AS "userName",
        COUNT(*)::int AS count,
        COUNT(DISTINCT ${interactionEvents.petId})::int AS "petCount"
      FROM ${interactionEvents}
      LEFT JOIN ${users} ON ${interactionEvents.userId} = ${users.id}
      WHERE ${interactionEvents.occurredAt} > NOW() - INTERVAL '7 days'
      GROUP BY ${interactionEvents.userId}, ${users.nickname}
      ORDER BY count DESC, ${interactionEvents.userId} ASC
      LIMIT 10
    `),
    db.execute<{ key: ModeKey; count: number }>(sql`
      WITH online_pets AS (
        SELECT DISTINCT
          ${collarDevices.petId} AS pet_id,
          ${pets.species}::text AS species
        FROM ${collarDevices}
        INNER JOIN ${pets} ON ${collarDevices.petId} = ${pets.id}
        WHERE ${collarDevices.petId} IS NOT NULL
          AND ${collarDevices.lastOnlineAt} IS NOT NULL
          AND (${collarDevices.lastOnlineAt} AT TIME ZONE ${ADMIN_TIME_ZONE})::date = ${today}::date

        UNION

        SELECT DISTINCT
          ${desktopPetBindings.petId} AS pet_id,
          ${pets.species}::text AS species
        FROM ${desktopPetBindings}
        INNER JOIN ${desktopDevices}
          ON ${desktopPetBindings.desktopDeviceId} = ${desktopDevices.id}
        INNER JOIN ${pets}
          ON ${desktopPetBindings.petId} = ${pets.id}
        WHERE ${desktopPetBindings.unboundAt} IS NULL
          AND ${desktopDevices.lastOnlineAt} IS NOT NULL
          AND (${desktopDevices.lastOnlineAt} AT TIME ZONE ${ADMIN_TIME_ZONE})::date = ${today}::date
      ),
      pet_mode_map AS (
        SELECT
          online_pets.pet_id,
          COALESCE(${pets.activityMode}::text, 'free') AS key
        FROM online_pets
        INNER JOIN ${pets} ON ${pets.id} = online_pets.pet_id
      )
      SELECT key, COUNT(*)::int AS count
      FROM pet_mode_map
      GROUP BY key
    `),
  ]);

  const onlineDevices = Number(onlineDevicesRow?.count ?? 0);
  const yesterdayOnlineDevices = Number(yesterdayOnlineDevicesRow?.count ?? 0);
  const onlineUsers = Number(onlineUsersRow?.count ?? 0);
  const yesterdayOnlineUsers = Number(yesterdayOnlineUsersRow?.count ?? 0);
  const todayInteractions = Number(todayInteractionsRow?.count ?? 0);
  const yesterdayInteractions = Number(yesterdayInteractionsRow?.count ?? 0);
  const avgInteractions =
    onlineUsers === 0 ? 0 : toNumber(todayInteractions / onlineUsers);
  const yesterdayAvgInteractions =
    yesterdayOnlineUsers === 0
      ? 0
      : toNumber(yesterdayInteractions / yesterdayOnlineUsers);
  const avgActivity = toNumber(avgActivityRow?.value ?? 0);
  const activeCollarUsers = Number(avgActivityRow?.userCount ?? 0);
  const yesterdayAvgActivity = toNumber(yesterdayAvgActivityRow?.value ?? 0);

  const modeCountMap = new Map<ModeKey, number>(
    modeDistributionRows.map((row) => [row.key, Number(row.count ?? 0)]),
  );
  const onlineModeBase = MODE_ORDER.reduce(
    (sum, key) => sum + (modeCountMap.get(key) ?? 0),
    0,
  );

  return c.json({
    overview: {
      onlineDevices,
      onlineUsers,
      avgInteractions,
      todayInteractions,
      avgActivity,
      activeCollarUsers,
      onlineDevicesDelta: onlineDevices - yesterdayOnlineDevices,
      avgInteractionsDelta: toNumber(avgInteractions - yesterdayAvgInteractions),
      avgActivityDelta: toNumber(avgActivity - yesterdayAvgActivity),
    },
    weeklyRanking: weeklyRankingRows.map((row) => ({
      userId: row.userId,
      userName: row.userName,
      count: Number(row.count ?? 0),
      petCount: Number(row.petCount ?? 0),
    })),
    modeDistribution: MODE_ORDER.map((key) => {
      const count = modeCountMap.get(key) ?? 0;

      return {
        key,
        count,
        ratio: onlineModeBase === 0 ? 0 : toNumber((count / onlineModeBase) * 100, 1),
      };
    }),
    modeDistributionBase: onlineModeBase,
    modeDistributionInferred: false,
  });
});

export default analyticsRoute;
