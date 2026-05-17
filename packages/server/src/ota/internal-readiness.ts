import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { dispatchJobs, otaProgress } from "../db/schema";

export type InternalReadinessResult =
  | { ok: true; checkedChipIds: string[] }
  | {
      ok: false;
      checkedChipIds: string[];
      missingVerified: string[];
      recentFailures: string[];
    };

const BLOCKING_STAGES = ["rolled_back", "failed"] as const;
const RELEASE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function checkInternalReadyForRelease(
  version: string,
): Promise<InternalReadinessResult> {
  const jobs = await db
    .select()
    .from(dispatchJobs)
    .where(eq(dispatchJobs.version, version));

  const checkedChipIds = Array.from(
    new Set(jobs.flatMap((job) => job.chipIds ?? [])),
  ).sort();

  if (checkedChipIds.length === 0) {
    return {
      ok: false,
      checkedChipIds,
      missingVerified: [],
      recentFailures: [],
    };
  }

  const progressRows = await db
    .select()
    .from(otaProgress)
    .where(
      and(
        eq(otaProgress.version, version),
        inArray(otaProgress.chipId, checkedChipIds),
      ),
    );

  const verified = new Set(
    progressRows
      .filter((row) => row.stage === "verified")
      .map((row) => row.chipId),
  );
  const since = Date.now() - RELEASE_WINDOW_MS;
  const recentFailures = Array.from(
    new Set(
      progressRows
        .filter(
          (row) =>
            BLOCKING_STAGES.includes(row.stage as (typeof BLOCKING_STAGES)[number]) &&
            row.receivedAt.getTime() >= since,
        )
        .map((row) => row.chipId),
    ),
  ).sort();
  const missingVerified = checkedChipIds
    .filter((chipId) => !verified.has(chipId))
    .sort();

  if (missingVerified.length > 0 || recentFailures.length > 0) {
    return {
      ok: false,
      checkedChipIds,
      missingVerified,
      recentFailures,
    };
  }

  return { ok: true, checkedChipIds };
}
