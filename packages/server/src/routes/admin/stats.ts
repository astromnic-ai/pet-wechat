import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import {
  collarDevices,
  desktopDevices,
  interactionEvents,
  petAvatars,
  petBehaviors,
  pets,
  users,
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

function formatNumber(value: number, digits = 1) {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function calcPercentChange(today: number, yesterday: number) {
  if (today === 0 && yesterday === 0) {
    return 0;
  }

  if (yesterday === 0) {
    return 100;
  }

  return Number((((today - yesterday) / yesterday) * 100).toFixed(1));
}

async function getDirectorySizeBytes(dirPath: string): Promise<number> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const sizes = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          return getDirectorySizeBytes(fullPath);
        }

        if (!entry.isFile()) {
          return 0;
        }

        const fileStat = await stat(fullPath);
        return fileStat.size;
      }),
    );

    return sizes.reduce((sum, size) => sum + size, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return 0;
    }

    throw error;
  }
}

function formatBytes(bytes: number) {
  if (bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${formatNumber(value)} ${units[exponent]}`;
}

function maxDateString(values: Array<string | Date | null | undefined>) {
  const timestamps = values
    .map((value) => {
      if (!value) {
        return null;
      }

      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.getTime();
    })
    .filter((value): value is number => value != null);

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function sanitizeTimestamp(value?: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp) || timestamp <= 0) {
    return null;
  }

  return new Date(timestamp).toISOString();
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
  const yesterday = formatDateInTimeZone(
    new Date(Date.now() - 24 * 60 * 60 * 1000),
    ADMIN_TIME_ZONE,
  );
  const localStoragePath = path.resolve(process.cwd(), "storage");

  const [
    [userTotalsRow],
    [todayUsersRow],
    [withDeviceRow],
    [withCustomizationRow],
    [withCollarRow],
    [petTotalsRow],
    [collarTotalsRow],
    [desktopTotalsRow],
    [todayCollarsRow],
    [todayDesktopsRow],
    [weeklyActiveDevicesRow],
    [onlineDevicesRow],
    [todayInteractionsRow],
    [yesterdayInteractionsRow],
    [deviceActivityRow],
    avatarStatusRows,
    [todayNewAvatarsRow],
    [newImageReviewRow],
    [newImageReviewUpdatedRow],
    [newDeviceOnlineRow],
    [newDeviceOnlineUpdatedRow],
    [longOfflineDevicesRow],
    [batteryWarningUpdatedRow],
    [batteryWarningRow],
    [newCustomizationRow],
    [newCustomizationUpdatedRow],
    [dbHeartbeatRow],
    [apiHeartbeatRow],
  ] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(users),
    db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM ${users}
      WHERE (${users.createdAt} AT TIME ZONE ${ADMIN_TIME_ZONE})::date = ${today}::date
    `),
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
    db.execute<{ count: number }>(sql`
      SELECT COUNT(DISTINCT ${collarDevices.userId})::int AS count
      FROM ${collarDevices}
      WHERE ${collarDevices.userId} IS NOT NULL
    `),
    db.select({ total: sql<number>`count(*)` }).from(pets),
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
      SELECT COUNT(*)::int AS count
      FROM ${collarDevices}
      WHERE (${collarDevices.createdAt} AT TIME ZONE ${ADMIN_TIME_ZONE})::date = ${today}::date
    `),
    db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM ${desktopDevices}
      WHERE (${desktopDevices.createdAt} AT TIME ZONE ${ADMIN_TIME_ZONE})::date = ${today}::date
    `),
    db.execute<{ count: number }>(sql`
      WITH active_devices AS (
        SELECT CONCAT('collar:', ${collarDevices.id}) AS device_key
        FROM ${collarDevices}
        WHERE (
          ${collarDevices.lastOnlineAt} > NOW() - INTERVAL '7 days'
          OR ${collarDevices.status} = 'online'
        )
        UNION
        SELECT CONCAT('collar:', ${petBehaviors.collarDeviceId}) AS device_key
        FROM ${petBehaviors}
        WHERE ${petBehaviors.timestamp} > NOW() - INTERVAL '7 days'
        UNION
        SELECT CONCAT('desktop:', ${desktopDevices.id}) AS device_key
        FROM ${desktopDevices}
        WHERE (
          ${desktopDevices.lastOnlineAt} > NOW() - INTERVAL '7 days'
          OR ${desktopDevices.status} = 'online'
        )
      )
      SELECT COUNT(DISTINCT device_key)::int AS count
      FROM active_devices
    `),
    db.execute<{ count: number }>(sql`
      SELECT
        (
          (
            SELECT COUNT(*)::int
            FROM ${collarDevices}
            WHERE ${collarDevices.status} = 'online'
          ) + (
            SELECT COUNT(*)::int
            FROM ${desktopDevices}
            WHERE ${desktopDevices.status} = 'online'
          )
        )::int AS count
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
    db.execute<{ high: number; medium: number; low: number }>(sql`
      WITH all_devices AS (
        SELECT CONCAT('collar:', ${collarDevices.id}) AS device_key
        FROM ${collarDevices}
        UNION
        SELECT CONCAT('desktop:', ${desktopDevices.id}) AS device_key
        FROM ${desktopDevices}
      ),
      interaction_counts AS (
        SELECT
          ${interactionEvents.deviceId} AS device_key,
          COUNT(*)::int AS count
        FROM ${interactionEvents}
        WHERE ${interactionEvents.deviceId} IS NOT NULL
          AND ${interactionEvents.occurredAt} > NOW() - INTERVAL '3 days'
        GROUP BY ${interactionEvents.deviceId}
      ),
      collar_behavior_counts AS (
        SELECT
          CONCAT('collar:', ${petBehaviors.collarDeviceId}) AS device_key,
          COUNT(*)::int AS count
        FROM ${petBehaviors}
        WHERE ${petBehaviors.timestamp} > NOW() - INTERVAL '3 days'
        GROUP BY ${petBehaviors.collarDeviceId}
      ),
      merged_counts AS (
        SELECT
          all_devices.device_key,
          COALESCE(interaction_counts.count, 0) + COALESCE(collar_behavior_counts.count, 0) AS usage_count
        FROM all_devices
        LEFT JOIN interaction_counts ON interaction_counts.device_key = all_devices.device_key
        LEFT JOIN collar_behavior_counts ON collar_behavior_counts.device_key = all_devices.device_key
      )
      SELECT
        COUNT(*) FILTER (WHERE usage_count > 90)::int AS high,
        COUNT(*) FILTER (WHERE usage_count >= 18 AND usage_count <= 90)::int AS medium,
        COUNT(*) FILTER (WHERE usage_count < 18)::int AS low
      FROM merged_counts
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
    db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM ${petAvatars}
      WHERE ${petAvatars.status} = 'pending'
        AND ${petAvatars.createdAt} > NOW() - INTERVAL '1 hour'
    `),
    db.execute<{ latestUpdatedAt: string | null }>(sql`
      SELECT MAX(${petAvatars.createdAt})::text AS "latestUpdatedAt"
      FROM ${petAvatars}
      WHERE ${petAvatars.status} = 'pending'
        AND ${petAvatars.createdAt} > NOW() - INTERVAL '1 hour'
    `),
    db.execute<{ count: number }>(sql`
      SELECT
        (
          (
            SELECT COUNT(*)::int
            FROM ${collarDevices}
            WHERE ${collarDevices.lastOnlineAt} > NOW() - INTERVAL '1 hour'
          ) + (
            SELECT COUNT(*)::int
            FROM ${desktopDevices}
            WHERE ${desktopDevices.lastOnlineAt} > NOW() - INTERVAL '1 hour'
          )
        )::int AS count
    `),
    db.execute<{ latestUpdatedAt: string | null }>(sql`
      SELECT GREATEST(
        COALESCE((SELECT MAX(${collarDevices.lastOnlineAt}) FROM ${collarDevices} WHERE ${collarDevices.lastOnlineAt} > NOW() - INTERVAL '1 hour'), to_timestamp(0)),
        COALESCE((SELECT MAX(${desktopDevices.lastOnlineAt}) FROM ${desktopDevices} WHERE ${desktopDevices.lastOnlineAt} > NOW() - INTERVAL '1 hour'), to_timestamp(0))
      )::text AS "latestUpdatedAt"
    `),
    db.execute<{ count: number }>(sql`
      SELECT
        (
          (
            SELECT COUNT(*)::int
            FROM ${collarDevices}
            WHERE ${collarDevices.status} = 'offline'
              AND (
                ${collarDevices.lastOnlineAt} IS NULL
                OR ${collarDevices.lastOnlineAt} <= NOW() - INTERVAL '7 days'
              )
          ) + (
            SELECT COUNT(*)::int
            FROM ${desktopDevices}
            WHERE ${desktopDevices.status} = 'offline'
              AND (
                ${desktopDevices.lastOnlineAt} IS NULL
                OR ${desktopDevices.lastOnlineAt} <= NOW() - INTERVAL '7 days'
              )
          )
        )::int AS count
    `),
    db.execute<{ latestUpdatedAt: string | null }>(sql`
      SELECT MAX(${collarDevices.updatedAt})::text AS "latestUpdatedAt"
      FROM ${collarDevices}
      WHERE ${collarDevices.battery} IS NOT NULL
        AND ${collarDevices.battery} <= 20
    `),
    db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM ${collarDevices}
      WHERE ${collarDevices.battery} IS NOT NULL
        AND ${collarDevices.battery} <= 20
    `),
    db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM ${petAvatars}
      WHERE (${petAvatars.reviewedAt} AT TIME ZONE ${ADMIN_TIME_ZONE})::date = ${today}::date
        AND ${petAvatars.status} IN ('approved', 'processing', 'done')
    `),
    db.execute<{ latestUpdatedAt: string | null }>(sql`
      SELECT MAX(${petAvatars.reviewedAt})::text AS "latestUpdatedAt"
      FROM ${petAvatars}
      WHERE (${petAvatars.reviewedAt} AT TIME ZONE ${ADMIN_TIME_ZONE})::date = ${today}::date
        AND ${petAvatars.status} IN ('approved', 'processing', 'done')
    `),
    db.execute<{ ok: number }>(sql`SELECT 1::int AS ok`),
    db.execute<{ ok: number }>(sql`SELECT 1::int AS ok`),
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

  const collarTotal = Number(collarTotalsRow?.total ?? 0);
  const desktopTotal = Number(desktopTotalsRow?.total ?? 0);
  const onlineDevices = Number(onlineDevicesRow?.count ?? 0);
  const weeklyActiveDevices = Number(weeklyActiveDevicesRow?.count ?? 0);
  const onlineRate =
    weeklyActiveDevices > 0
      ? Number(((onlineDevices / weeklyActiveDevices) * 100).toFixed(1))
      : 0;
  const todayInteractions = Number(todayInteractionsRow?.count ?? 0);
  const yesterdayInteractions = Number(yesterdayInteractionsRow?.count ?? 0);
  const localStorageBytes = await getDirectorySizeBytes(localStoragePath);

  return c.json({
    users: {
      total: Number(userTotalsRow?.total ?? 0),
      todayAdded: Number(todayUsersRow?.count ?? 0),
      withDevice: Number(withDeviceRow?.count ?? 0),
      withCustomization: Number(withCustomizationRow?.count ?? 0),
      withCollar: Number(withCollarRow?.count ?? 0),
    },
    pets: {
      total: Number(petTotalsRow?.total ?? 0),
    },
    devices: {
      collars: {
        total: collarTotal,
        online: Number(collarTotalsRow?.online ?? 0),
        offline: Number(collarTotalsRow?.offline ?? 0),
        todayAdded: Number(todayCollarsRow?.count ?? 0),
      },
      desktops: {
        total: desktopTotal,
        online: Number(desktopTotalsRow?.online ?? 0),
        offline: Number(desktopTotalsRow?.offline ?? 0),
        todayAdded: Number(todayDesktopsRow?.count ?? 0),
      },
    },
    activeDevices: {
      total: weeklyActiveDevices,
      onlineCount: onlineDevices,
      onlineRate,
    },
    interactions: {
      todayTotal: todayInteractions,
      yesterdayTotal: yesterdayInteractions,
      changePercent: calcPercentChange(todayInteractions, yesterdayInteractions),
    },
    weeklyActiveDevices,
    todayInteractions,
    deviceActivity: {
      high: Number(deviceActivityRow?.high ?? 0),
      medium: Number(deviceActivityRow?.medium ?? 0),
      low: Number(deviceActivityRow?.low ?? 0),
    },
    avatars: avatarCounts,
    todayNewAvatars: Number(todayNewAvatarsRow?.count ?? 0),
    realtimeDynamics: {
      newDeviceOnline: {
        value: Number(newDeviceOnlineRow?.count ?? 0),
        latestUpdatedAt: sanitizeTimestamp(newDeviceOnlineUpdatedRow?.latestUpdatedAt),
      },
      newImageReview: {
        value: Number(newImageReviewRow?.count ?? 0),
        latestUpdatedAt: sanitizeTimestamp(newImageReviewUpdatedRow?.latestUpdatedAt),
      },
      batteryWarnings: {
        value: Number(batteryWarningRow?.count ?? 0),
        latestUpdatedAt: sanitizeTimestamp(batteryWarningUpdatedRow?.latestUpdatedAt),
      },
      longOfflineDevices: {
        value: Number(longOfflineDevicesRow?.count ?? 0),
        latestUpdatedAt: maxDateString([new Date()]),
      },
      newCustomization: {
        value: Number(newCustomizationRow?.count ?? 0),
        latestUpdatedAt: sanitizeTimestamp(newCustomizationUpdatedRow?.latestUpdatedAt),
      },
    },
    systemHealth: {
      server: {
        label: "服务器状态",
        value: "运行中",
        detail: `在线设备 ${onlineDevices} 台`,
        status: "healthy",
      },
      api: {
        label: "API 响应",
        value: Number(apiHeartbeatRow?.ok ?? 0) === 1 ? "正常" : "异常",
        detail: "管理接口请求可达",
        status: Number(apiHeartbeatRow?.ok ?? 0) === 1 ? "healthy" : "warning",
      },
      database: {
        label: "数据库",
        value: Number(dbHeartbeatRow?.ok ?? 0) === 1 ? "正常" : "异常",
        detail: "PostgreSQL 连接正常",
        status: Number(dbHeartbeatRow?.ok ?? 0) === 1 ? "healthy" : "warning",
      },
      storage: {
        label: "存储空间",
        value: "可用",
        detail: `当前占用 ${formatBytes(localStorageBytes)}`,
        status: "healthy",
      },
    },
  });
});

export default statsRoute;
