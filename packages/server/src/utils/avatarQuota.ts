import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { desktopDevices, petAvatars, pets } from "../db/schema";

const COUNTED_AVATAR_STATUSES = ["pending", "processing", "approved", "done"] as const;

function parseCount(value: unknown) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

export interface AvatarQuotaSummary {
  purchasedQuota: number;
  desktopQuota: number;
  usedQuota: number;
  totalQuota: number;
  remainingQuota: number;
}

export async function getUserAvatarQuotaSummary(userId: string, purchasedQuotaRaw: number): Promise<AvatarQuotaSummary> {
  const purchasedQuota = Math.max(0, Number(purchasedQuotaRaw || 0));

  const [desktopCountRows, usedCountRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(desktopDevices)
      .where(eq(desktopDevices.userId, userId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(petAvatars)
      .leftJoin(pets, eq(pets.id, petAvatars.petId))
      .where(
        and(
          eq(pets.userId, userId),
          inArray(petAvatars.status, [...COUNTED_AVATAR_STATUSES]),
        ),
      ),
  ]);

  const desktopQuota = parseCount(desktopCountRows[0]?.count);
  const usedQuota = parseCount(usedCountRows[0]?.count);
  const totalQuota = desktopQuota + purchasedQuota;
  const remainingQuota = Math.max(0, totalQuota - usedQuota);

  return {
    purchasedQuota,
    desktopQuota,
    usedQuota,
    totalQuota,
    remainingQuota,
  };
}

export function attachAvatarQuotaSummary<T extends { id: string; avatarQuota: number }>(
  user: T,
  summary: AvatarQuotaSummary,
) {
  return {
    ...user,
    avatarQuota: summary.remainingQuota,
    avatarQuotaPurchased: summary.purchasedQuota,
    avatarQuotaFromDesktops: summary.desktopQuota,
    avatarQuotaUsed: summary.usedQuota,
    avatarQuotaTotal: summary.totalQuota,
    avatarQuotaRemaining: summary.remainingQuota,
  };
}
