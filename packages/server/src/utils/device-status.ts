import type { DeviceStatus, DeviceType } from "shared";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { desktopDevices } from "../db/schema";
import { normalizeMac } from "./mac";

export const DEVICE_ONLINE_TIMEOUT_MS = 60 * 1000;

export function getUsageDurationIncrementMinutes(
  previousLastOnlineAt: Date | string | null | undefined,
  now: Date,
) {
  if (!previousLastOnlineAt) return 0;

  const previousTime = new Date(previousLastOnlineAt).getTime();
  if (Number.isNaN(previousTime)) return 0;

  const diffMs = now.getTime() - previousTime;
  if (diffMs <= 0 || diffMs > DEVICE_ONLINE_TIMEOUT_MS) return 0;

  return Math.max(1, Math.floor(diffMs / (60 * 1000)));
}

export function getEffectiveDeviceStatus(options: {
  type: DeviceType;
  status: DeviceStatus;
  lastOnlineAt: Date | string | null | undefined;
  now?: Date;
}): DeviceStatus {
  if (options.type !== "desktop" || options.status !== "online") {
    return options.status;
  }

  if (!options.lastOnlineAt) {
    return "offline";
  }

  const lastOnlineTime = new Date(options.lastOnlineAt).getTime();
  if (Number.isNaN(lastOnlineTime)) {
    return "offline";
  }

  const nowTime = options.now?.getTime() ?? Date.now();
  return nowTime - lastOnlineTime > DEVICE_ONLINE_TIMEOUT_MS ? "offline" : "online";
}

export function normalizeDeviceChipId(value: string | null | undefined) {
  return (value || "").trim().replace(/[^a-fA-F0-9]/g, "").toLowerCase();
}

export async function markDesktopOnlineByChipId(
  chipId: string | null | undefined,
  options: { firmwareVersion?: string | null; now?: Date } = {},
) {
  const normalizedChipId = normalizeMac(normalizeDeviceChipId(chipId));
  if (!normalizedChipId) return null;

  const now = options.now ?? new Date();
  const nowSql = now.toISOString();
  const timeoutMs = DEVICE_ONLINE_TIMEOUT_MS;

  const updatePayload: Record<string, unknown> = {
    status: "online",
    lastOnlineAt: now,
    updatedAt: now,
    usageDurationMinutes: sql`${desktopDevices.usageDurationMinutes} + CASE
      WHEN ${desktopDevices.lastOnlineAt} IS NOT NULL
        AND EXTRACT(EPOCH FROM (${nowSql}::timestamptz - ${desktopDevices.lastOnlineAt})) * 1000 > 0
        AND EXTRACT(EPOCH FROM (${nowSql}::timestamptz - ${desktopDevices.lastOnlineAt})) * 1000 <= ${timeoutMs}
      THEN GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (${nowSql}::timestamptz - ${desktopDevices.lastOnlineAt})) / 60))
      ELSE 0
    END`,
  };

  if (options.firmwareVersion) {
    updatePayload.firmwareVersion = options.firmwareVersion;
  }

  const [desktop] = await db
    .update(desktopDevices)
    .set(updatePayload)
    .where(
      eq(
        sql<string>`UPPER(REPLACE(${desktopDevices.chipId}, ':', ''))`,
        normalizedChipId,
      ),
    )
    .returning();

  return desktop ?? null;
}
