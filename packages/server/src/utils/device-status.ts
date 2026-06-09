import type { DeviceStatus, DeviceType } from "shared";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { desktopDevices } from "../db/schema";
import { normalizeMac } from "./mac";

export const DEVICE_ONLINE_TIMEOUT_MS = 10 * 60 * 1000;

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
  const updatePayload: Partial<typeof desktopDevices.$inferInsert> = {
    status: "online",
    lastOnlineAt: now,
    updatedAt: now,
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
