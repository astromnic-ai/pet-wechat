import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import {
  users,
  pets,
  collarDevices,
  desktopDevices,
  petBehaviors,
  petAvatars,
} from "../../db/schema";

const statsRoute = new Hono();
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

statsRoute.get("/stats", async (c) => {
  const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [petCount] = await db.select({ count: sql<number>`count(*)` }).from(pets);
  const [collarCount] = await db.select({ count: sql<number>`count(*)` }).from(collarDevices);
  const [desktopCount] = await db.select({ count: sql<number>`count(*)` }).from(desktopDevices);
  const [behaviorCount] = await db.select({ count: sql<number>`count(*)` }).from(petBehaviors);

  return c.json({
    users: Number(userCount.count),
    pets: Number(petCount.count),
    collars: Number(collarCount.count),
    desktops: Number(desktopCount.count),
    behaviors: Number(behaviorCount.count),
  });
});

statsRoute.get("/stats/enhanced", async (c) => {
  const today = formatDateInTimeZone(new Date(), ADMIN_TIME_ZONE);

  const [
    [userTotals],
    [petTotals],
    [withDeviceRow],
    [withCustomizationRow],
    [collarStats],
    [desktopStats],
    [weeklyActiveDevicesRow],
    [todayInteractionsRow],
    [deviceActivityRow],
    avatarStatusRows,
    [todayNewAvatarsRow],
  ] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(users),
    db.select({ total: sql<number>`count(*)` }).from(pets),
    db.execute<{ count: number }>(sql`
      SELECT COUNT(DISTINCT user_id)::int AS count
      FROM (
        SELECT ${collarDevices.userId} AS user_id
        FROM ${collarDevices}
        WHERE ${collarDevices.userId} IS NOT NULL
        UNION
        SELECT ${desktopDevices.userId} AS user_id
        FROM ${desktopDevices}
        WHERE ${desktopDevices.userId} IS NOT NULL
      ) bound_users
    `),
    db.execute<{ count: number }>(sql`
      SELECT COUNT(DISTINCT ${pets.userId})::int AS count
      FROM ${petAvatars}
      INNER JOIN ${pets} ON ${petAvatars.petId} = ${pets.id}
      WHERE ${petAvatars.status} = 'done'
    `),
    db.execute<{ total: number; online: number; offline: number }>(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ${collarDevices.status} = 'online')::int AS online,
        COUNT(*) FILTER (WHERE ${collarDevices.status} = 'offline')::int AS offline
      FROM ${collarDevices}
    `),
    db.execute<{ total: number; online: number; offline: number }>(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ${desktopDevices.status} = 'online')::int AS online,
        COUNT(*) FILTER (WHERE ${desktopDevices.status} = 'offline')::int AS offline
      FROM ${desktopDevices}
    `),
    db.execute<{ count: number }>(sql`
      SELECT COUNT(DISTINCT ${petBehaviors.collarDeviceId})::int AS count
      FROM ${petBehaviors}
      WHERE ${petBehaviors.timestamp} > NOW() - INTERVAL '7 days'
    `),
    db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM ${petBehaviors}
      WHERE (${petBehaviors.timestamp} AT TIME ZONE ${ADMIN_TIME_ZONE})::date = ${today}::date
    `),
    db.execute<{ high: number; medium: number; low: number }>(sql`
      WITH last_behavior AS (
        SELECT
          ${petBehaviors.collarDeviceId} AS collar_device_id,
          MAX(${petBehaviors.timestamp}) AS last_seen
        FROM ${petBehaviors}
        GROUP BY ${petBehaviors.collarDeviceId}
      )
      SELECT
        COUNT(*) FILTER (WHERE last_behavior.last_seen > NOW() - INTERVAL '3 days')::int AS high,
        COUNT(*) FILTER (
          WHERE last_behavior.last_seen <= NOW() - INTERVAL '3 days'
            AND last_behavior.last_seen > NOW() - INTERVAL '7 days'
        )::int AS medium,
        COUNT(*) FILTER (
          WHERE last_behavior.last_seen <= NOW() - INTERVAL '7 days'
            OR last_behavior.last_seen IS NULL
        )::int AS low
      FROM ${collarDevices}
      LEFT JOIN last_behavior ON last_behavior.collar_device_id = ${collarDevices.id}
    `),
    db.execute<{ status: string; count: number }>(sql`
      SELECT
        ${petAvatars.status} AS status,
        COUNT(*)::int AS count
      FROM ${petAvatars}
      GROUP BY ${petAvatars.status}
    `),
    db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM ${petAvatars}
      WHERE (${petAvatars.createdAt} AT TIME ZONE ${ADMIN_TIME_ZONE})::date = ${today}::date
    `),
  ]);

  const avatarCounts = {
    pending: 0,
    approved: 0,
    processing: 0,
    done: 0,
    rejected: 0,
    failed: 0,
  };

  for (const row of avatarStatusRows) {
    if (row.status in avatarCounts) {
      avatarCounts[row.status as keyof typeof avatarCounts] = Number(row.count);
    }
  }

  return c.json({
    users: {
      total: Number(userTotals.total),
      withDevice: Number(withDeviceRow?.count ?? 0),
      withCustomization: Number(withCustomizationRow?.count ?? 0),
    },
    pets: {
      total: Number(petTotals.total),
    },
    devices: {
      collars: {
        total: Number(collarStats?.total ?? 0),
        online: Number(collarStats?.online ?? 0),
        offline: Number(collarStats?.offline ?? 0),
      },
      desktops: {
        total: Number(desktopStats?.total ?? 0),
        online: Number(desktopStats?.online ?? 0),
        offline: Number(desktopStats?.offline ?? 0),
      },
    },
    weeklyActiveDevices: Number(weeklyActiveDevicesRow?.count ?? 0),
    todayInteractions: Number(todayInteractionsRow?.count ?? 0),
    deviceActivity: {
      high: Number(deviceActivityRow?.high ?? 0),
      medium: Number(deviceActivityRow?.medium ?? 0),
      low: Number(deviceActivityRow?.low ?? 0),
    },
    avatars: avatarCounts,
    todayNewAvatars: Number(todayNewAvatarsRow?.count ?? 0),
  });
});

export default statsRoute;
