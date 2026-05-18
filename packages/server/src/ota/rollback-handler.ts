import { sql } from "drizzle-orm";
import { db } from "../db";
import { otaRollbacks } from "../db/schema";
import { clearRetainedOtaCommand } from "./mqtt-client";
import { transitionTo } from "./state-machine";

export type RollbackHandlerOptions = {
  clearRetained?: (chipId: string) => Promise<void>;
  quarantine?: (
    versionOrId: string,
    newState: "quarantine",
    ctx: Parameters<typeof transitionTo>[2],
  ) => Promise<unknown>;
};

export async function handleRollback(
  chipId: string,
  version: string,
  code?: string,
  reason?: string,
  options: RollbackHandlerOptions = {},
) {
  const clearRetained = options.clearRetained ?? clearRetainedOtaCommand;
  const quarantine = options.quarantine ?? transitionTo;

  await clearRetained(chipId);

  const now = new Date();
  const inserted = await db
    .insert(otaRollbacks)
    .values({
      chipId,
      version,
      code,
      reason,
      firstSeenAt: now,
      lastSeenAt: now,
      seenCount: 1,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted.length === 0) {
    await db
      .update(otaRollbacks)
      .set({
        lastSeenAt: now,
        seenCount: sql`${otaRollbacks.seenCount} + 1`,
        code,
        reason,
      })
      .where(
        sql`${otaRollbacks.chipId} = ${chipId} AND ${otaRollbacks.version} = ${version}`,
      );
    return { firstSeen: false as const };
  }

  const quarantineReason =
    reason ?? code ?? `rolled_back reported by device ${chipId}`;
  await quarantine(version, "quarantine", {
    triggeredBy: chipId,
    reason: quarantineReason,
  });

  console.warn("[ota:rollback] firmware quarantined after rollback", {
    chipId,
    version,
    code,
    reason,
  });

  return { firstSeen: true as const };
}
